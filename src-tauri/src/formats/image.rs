use std::path::Path;

use base64::Engine;
use image::{DynamicImage, ImageReader, RgbaImage};

use crate::error::{Error, Result};

/// Header-only dimension probe; never decodes pixel data.
pub fn dimensions(path: &Path, ext: &str) -> Option<(u32, u32)> {
    if ext == "svg" {
        return svg_dimensions(path);
    }
    ImageReader::open(path)
        .ok()?
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

pub fn load(path: &Path) -> Result<DynamicImage> {
    Ok(ImageReader::open(path)?.with_guessed_format()?.decode()?)
}

/// Decodes a `data:image/...;base64,` URL produced by a frontend canvas.
pub fn decode_data_url(data_url: &str) -> Result<RgbaImage> {
    let b64 = data_url
        .split_once(";base64,")
        .map(|(_, b)| b)
        .ok_or_else(|| Error::msg("expected a base64 data URL"))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| Error::msg(format!("base64: {e}")))?;
    Ok(image::load_from_memory(&bytes)?.into_rgba8())
}

fn svg_dimensions(path: &Path) -> Option<(u32, u32)> {
    let text = std::fs::read_to_string(path).ok()?;
    let start = text.find("<svg")?;
    let tag = &text[start..start + text[start..].find('>')?];
    let attr = |name: &str| -> Option<f64> {
        let needle = format!(" {name}=\"");
        let i = tag.find(&needle)? + needle.len();
        let val = &tag[i..i + tag[i..].find('"')?];
        val.trim_end_matches("px").parse().ok()
    };
    if let (Some(w), Some(h)) = (attr("width"), attr("height")) {
        return Some((w.round() as u32, h.round() as u32));
    }
    let needle = " viewBox=\"";
    let i = tag.find(needle)? + needle.len();
    let vb: Vec<f64> = tag[i..i + tag[i..].find('"')?]
        .split([' ', ','])
        .filter_map(|s| s.parse().ok())
        .collect();
    (vb.len() == 4).then(|| (vb[2].round() as u32, vb[3].round() as u32))
}
