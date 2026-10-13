use std::path::Path;

use asefile::{AnimationDirection, AsepriteFile};
use image::RgbaImage;
use serde::Serialize;
use specta::Type;

use crate::error::{Error, Result};

/// Upper bound on strip width so the webview can decode it as a single image.
const MAX_STRIP_WIDTH: u32 = 8192;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnimTag {
    pub name: String,
    pub from: u32,
    pub to: u32,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AsepriteInfo {
    pub width: u32,
    pub height: u32,
    /// Per-frame duration in milliseconds.
    pub durations: Vec<u32>,
    pub tags: Vec<AnimTag>,
    pub layers: Vec<String>,
    /// Layout of the frame strip served at `/derived/<id>/strip`.
    pub cols: u32,
    pub rows: u32,
}

fn read(path: &Path) -> Result<AsepriteFile> {
    Ok(AsepriteFile::read_file(path)?)
}

fn frame_image(ase: &AsepriteFile, index: u32) -> Result<RgbaImage> {
    let img = ase.frame(index).image();
    let (w, h) = (img.width(), img.height());
    RgbaImage::from_raw(w, h, img.into_raw()).ok_or_else(|| Error::msg("bad aseprite frame buffer"))
}

fn strip_layout(width: u32, frames: u32) -> (u32, u32) {
    let cols = (MAX_STRIP_WIDTH / width.max(1)).clamp(1, frames.max(1));
    let rows = frames.max(1).div_ceil(cols);
    (cols, rows)
}

pub fn summary(path: &Path) -> Result<(u32, u32, u32)> {
    let ase = read(path)?;
    Ok((ase.width() as u32, ase.height() as u32, ase.num_frames()))
}

pub fn info(path: &Path) -> Result<AsepriteInfo> {
    let ase = read(path)?;
    let (width, height, frames) = (ase.width() as u32, ase.height() as u32, ase.num_frames());
    let (cols, rows) = strip_layout(width, frames);
    let tags = (0..ase.num_tags())
        .map(|i| {
            let t = ase.tag(i);
            AnimTag {
                name: t.name().to_string(),
                from: t.from_frame(),
                to: t.to_frame(),
                direction: match t.animation_direction() {
                    AnimationDirection::Forward => "forward",
                    AnimationDirection::Reverse => "reverse",
                    AnimationDirection::PingPong => "pingpong",
                }
                .to_string(),
            }
        })
        .collect();
    Ok(AsepriteInfo {
        width,
        height,
        durations: (0..frames).map(|i| ase.frame(i).duration()).collect(),
        tags,
        layers: ase.layers().map(|l| l.name().to_string()).collect(),
        cols,
        rows,
    })
}

pub fn first_frame(path: &Path) -> Result<RgbaImage> {
    let ase = read(path)?;
    frame_image(&ase, 0)
}

/// Renders every composited frame into a grid strip, row-major.
pub fn render_strip(path: &Path) -> Result<RgbaImage> {
    let ase = read(path)?;
    let (w, h, frames) = (ase.width() as u32, ase.height() as u32, ase.num_frames());
    let (cols, rows) = strip_layout(w, frames);
    let mut strip = RgbaImage::new(w * cols, h * rows);
    for i in 0..frames {
        let frame = frame_image(&ase, i)?;
        let (x, y) = ((i % cols) * w, (i / cols) * h);
        image::imageops::replace(&mut strip, &frame, x as i64, y as i64);
    }
    Ok(strip)
}
