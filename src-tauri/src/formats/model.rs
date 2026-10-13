use std::path::Path;

use base64::Engine;

use crate::error::{Error, Result};
use crate::index::queries::AssetRow;
use crate::thumbs::{cache, pipeline};

/// Stores a thumbnail rendered by the frontend's offscreen three.js renderer.
/// Accepts a `data:image/...;base64,` URL and normalizes it to the cache's WebP size.
pub fn save_client_thumb(
    cache_dir: &Path,
    row: &AssetRow,
    data_url: &str,
    size: u32,
) -> Result<()> {
    let b64 = data_url
        .split_once(";base64,")
        .map(|(_, b)| b)
        .ok_or_else(|| Error::msg("expected a base64 data URL"))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| Error::msg(format!("base64: {e}")))?;
    let decoded = image::load_from_memory(&bytes)?.into_rgba8();
    let webp = pipeline::encode_webp(&pipeline::fit(decoded, size)?)?;
    let path = cache::thumb_path(cache_dir, &cache::key(row, pipeline::EXT_THUMB_SALT));
    cache::write_atomic(&path, &webp)
}
