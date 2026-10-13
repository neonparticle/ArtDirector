use std::path::Path;

use crate::error::Result;
use crate::formats::image::decode_data_url;
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
    let decoded = decode_data_url(data_url)?;
    let webp = pipeline::encode_webp(&pipeline::fit(decoded, size)?)?;
    let path = cache::thumb_path(cache_dir, &cache::key(row, pipeline::EXT_THUMB_SALT));
    cache::write_atomic(&path, &webp)
}
