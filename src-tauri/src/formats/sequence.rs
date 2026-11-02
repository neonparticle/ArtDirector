use std::path::{Path, PathBuf};

use image::RgbaImage;

use crate::error::{Error, Result};
use crate::formats::image as img;
use crate::thumbs::pipeline;

/// Raster formats a frame sequence can be made of.
pub const FRAME_EXTS: &[&str] = &["png", "webp", "bmp", "tga", "jpg", "jpeg"];

/// Frame index of a file named only by digits: `12.png` -> 12, `007.png` -> 7.
pub fn frame_index(name: &str) -> Option<u32> {
    let (stem, ext) = name.rsplit_once('.')?;
    let ext = ext.to_ascii_lowercase();
    if stem.is_empty() || !stem.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if !FRAME_EXTS.contains(&ext.as_str()) {
        return None;
    }
    stem.parse().ok()
}

/// Grid used for frame strips: near-square, row-major. The frontend mirrors this in
/// `reelLayout` to find a frame inside `/derived/<id>/strip` and `/derived/<id>/reel`.
pub fn layout(frames: u32) -> (u32, u32) {
    let n = frames.max(1);
    let cols = (n as f64).sqrt().ceil() as u32;
    (cols, n.div_ceil(cols))
}

/// The frame files of a sequence folder in playback order.
pub fn frame_paths(dir: &Path, ext: &str) -> Result<Vec<PathBuf>> {
    let mut frames: Vec<(u32, PathBuf)> = std::fs::read_dir(dir)?
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let index = frame_index(&name)?;
            let same_ext = name
                .rsplit_once('.')
                .is_some_and(|(_, x)| x.eq_ignore_ascii_case(ext));
            same_ext.then(|| (index, e.path()))
        })
        .collect();
    if frames.is_empty() {
        return Err(Error::NotFound(format!("no frames in {}", dir.display())));
    }
    frames.sort();
    Ok(frames.into_iter().map(|(_, p)| p).collect())
}

pub fn first_frame(dir: &Path, ext: &str) -> Result<PathBuf> {
    Ok(frame_paths(dir, ext)?.swap_remove(0))
}

/// Packs every frame into one image laid out by [`layout`]. Frames larger than
/// `max_side` are scaled down; frames that differ from the first in size are clipped.
pub fn render_strip(dir: &Path, ext: &str, max_side: u32) -> Result<RgbaImage> {
    let paths = frame_paths(dir, ext)?;
    let (cols, rows) = layout(paths.len() as u32);
    let mut strip: Option<RgbaImage> = None;
    for (i, path) in paths.iter().enumerate() {
        let mut frame = img::load(path)?.into_rgba8();
        if frame.width().max(frame.height()) > max_side {
            frame = pipeline::fit(frame, max_side)?;
        }
        let strip = strip
            .get_or_insert_with(|| RgbaImage::new(frame.width() * cols, frame.height() * rows));
        let (w, h) = (strip.width() / cols, strip.height() / rows);
        let i = i as u32;
        image::imageops::replace(
            strip,
            &frame,
            ((i % cols) * w).into(),
            ((i / cols) * h).into(),
        );
    }
    strip.ok_or_else(|| Error::msg("empty frame sequence"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_frame_indices() {
        assert_eq!(frame_index("0.png"), Some(0));
        assert_eq!(frame_index("12.PNG"), Some(12));
        assert_eq!(frame_index("007.webp"), Some(7));
        assert_eq!(frame_index("walk_1.png"), None);
        assert_eq!(frame_index("0-still.png"), None);
        assert_eq!(frame_index("_0.gen.png"), None);
        assert_eq!(frame_index("3.gif"), None, "gifs animate on their own");
        assert_eq!(frame_index("3.svg"), None);
        assert_eq!(frame_index(".png"), None);
        assert_eq!(frame_index("12"), None);
    }

    #[test]
    fn lays_frames_out_near_square() {
        assert_eq!(layout(1), (1, 1));
        assert_eq!(layout(2), (2, 1));
        assert_eq!(layout(4), (2, 2));
        assert_eq!(layout(6), (3, 2));
        assert_eq!(layout(8), (3, 3));
        assert_eq!(layout(12), (4, 3));
        assert_eq!(layout(0), (1, 1));
    }

    #[test]
    fn lists_and_packs_frames_in_numeric_order() {
        let dir = std::env::temp_dir().join(format!("ad-seq-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for i in [0u8, 1, 2, 10] {
            RgbaImage::from_pixel(2, 3, image::Rgba([i, 0, 0, 255]))
                .save(dir.join(format!("{i}.png")))
                .unwrap();
        }
        std::fs::write(dir.join("notes.txt"), "x").unwrap();
        std::fs::write(dir.join("gen.json"), "{}").unwrap();

        let names: Vec<_> = frame_paths(&dir, "png")
            .unwrap()
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["0.png", "1.png", "2.png", "10.png"]);

        let strip = render_strip(&dir, "png", 1024).unwrap();
        assert_eq!(strip.dimensions(), (4, 6), "4 frames pack 2x2");
        assert_eq!(strip.get_pixel(2, 0)[0], 1);
        assert_eq!(strip.get_pixel(0, 3)[0], 2);
        assert_eq!(strip.get_pixel(2, 3)[0], 10);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
