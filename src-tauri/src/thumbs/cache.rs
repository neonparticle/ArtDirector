use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};

use super::pipeline::RENDER_REV;
use crate::error::Result;
use crate::index::queries::AssetRow;

/// Cache key for a specific version of a file. Any edit changes size or mtime,
/// which yields a fresh key and leaves the stale entry to be pruned.
pub fn key(row: &AssetRow, salt: &str) -> String {
    let mut h = blake3::Hasher::new();
    h.update(row.path().to_string_lossy().as_bytes());
    h.update(&row.size.to_le_bytes());
    h.update(&row.mtime.to_le_bytes());
    h.update(salt.as_bytes());
    h.finalize().to_hex()[..32].to_string()
}

pub fn thumb_path(cache_dir: &Path, key: &str) -> PathBuf {
    cache_dir
        .join("thumbs")
        .join(&key[..2])
        .join(format!("{key}.webp"))
}

pub fn derived_path(cache_dir: &Path, key: &str, ext: &str) -> PathBuf {
    cache_dir
        .join("derived")
        .join(&key[..2])
        .join(format!("{key}.{ext}"))
}

/// Writes through a temp file so a concurrent reader never sees a partial image.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).or_else(|e| {
        let _ = std::fs::remove_file(&tmp);
        if path.exists() {
            Ok(())
        } else {
            Err(e)
        }
    })?;
    Ok(())
}

/// Drops cached GLB exports and 3D thumbnails made by an older render pipeline.
pub fn invalidate_stale_renders(conn: &Connection, cache_dir: &Path) -> Result<()> {
    let current = RENDER_REV.to_string();
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'render_rev'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if stored.as_deref() == Some(current.as_str()) {
        return Ok(());
    }
    let derived = cache_dir.join("derived");
    if derived.exists() {
        std::fs::remove_dir_all(&derived)?;
    }
    conn.execute("UPDATE assets SET ext_thumb = NULL", [])?;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES ('render_rev', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [current],
    )?;
    Ok(())
}

pub fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_size(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}
