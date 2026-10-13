use std::path::PathBuf;

use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::codecs::webp::WebPEncoder;
use image::{DynamicImage, ExtendedColorType, RgbaImage};

use super::cache;
use crate::error::{Error, Result};
use crate::formats::{aseprite, image as img};
use crate::index::queries::AssetRow;
use crate::scanner::AssetKind;

/// Images at or below this size are treated as pixel art and scaled up by whole
/// multiples with nearest-neighbor so the tiles stay crisp.
const PIXEL_ART_MAX: u32 = 256;

pub const EXT_THUMB_SALT: &str = "ext";

/// Bump whenever `formats/blend_export.py`, the frontend `loadModel.ts`, or the
/// `ThumbCapturer` renderer changes output: cached GLBs and 3D thumbnails are keyed by
/// source file only, so they are dropped at startup when this differs from the stored rev.
pub const RENDER_REV: u32 = 1;

pub enum Thumb {
    File(PathBuf),
    /// The original file is directly displayable (SVG).
    Original,
    Unavailable,
}

pub fn thumb_for(cache_dir: &std::path::Path, row: &AssetRow, size: u32) -> Result<Thumb> {
    match row.kind {
        AssetKind::Image | AssetKind::Sheet if row.ext == "svg" => Ok(Thumb::Original),
        AssetKind::Image | AssetKind::Sheet | AssetKind::Aseprite => {
            let key = cache::key(row, &format!("t{size}"));
            let path = cache::thumb_path(cache_dir, &key);
            if !path.exists() {
                let source = match row.kind {
                    AssetKind::Aseprite => aseprite::first_frame(&row.path())?,
                    _ => img::load(&row.path())?.into_rgba8(),
                };
                let bytes = encode_webp(&fit(source, size)?)?;
                cache::write_atomic(&path, &bytes)?;
            }
            Ok(Thumb::File(path))
        }
        AssetKind::Model | AssetKind::Blend => {
            let path = cache::thumb_path(cache_dir, &cache::key(row, EXT_THUMB_SALT));
            Ok(if path.exists() {
                Thumb::File(path)
            } else {
                Thumb::Unavailable
            })
        }
        AssetKind::Source => Ok(Thumb::Unavailable),
    }
}

pub fn fit(src: RgbaImage, max: u32) -> Result<RgbaImage> {
    let (w, h) = src.dimensions();
    let longest = w.max(h).max(1);

    let (dw, dh, alg) = if longest <= max {
        let factor = max / longest;
        if longest > PIXEL_ART_MAX || factor < 2 {
            return Ok(src);
        }
        (w * factor, h * factor, ResizeAlg::Nearest)
    } else {
        let scale = max as f64 / longest as f64;
        (
            ((w as f64 * scale).round() as u32).max(1),
            ((h as f64 * scale).round() as u32).max(1),
            ResizeAlg::Convolution(FilterType::Lanczos3),
        )
    };

    let src = DynamicImage::ImageRgba8(src);
    let mut dst = Image::new(dw, dh, PixelType::U8x4);
    Resizer::new()
        .resize(&src, &mut dst, &ResizeOptions::new().resize_alg(alg))
        .map_err(|e| Error::msg(format!("resize: {e}")))?;
    RgbaImage::from_raw(dw, dh, dst.into_vec()).ok_or_else(|| Error::msg("resize buffer mismatch"))
}

pub fn encode_webp(img: &RgbaImage) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    WebPEncoder::new_lossless(&mut buf).encode(
        img.as_raw(),
        img.width(),
        img.height(),
        ExtendedColorType::Rgba8,
    )?;
    Ok(buf)
}

pub fn encode_png(img: &RgbaImage) -> Result<Vec<u8>> {
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png)?;
    Ok(buf.into_inner())
}
