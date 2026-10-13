mod db;
pub mod queries;

pub use db::Db;

use std::path::{Path, PathBuf};

/// Joins a project root with a forward-slash relative path using native separators.
pub fn abs_path(root: &str, rel_path: &str) -> PathBuf {
    let mut p = PathBuf::from(root);
    for part in rel_path.split('/').filter(|s| !s.is_empty()) {
        p.push(part);
    }
    p
}

/// Forward-slash relative path of `path` under `root`, or `None` if it is outside.
pub fn rel_path(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<_> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
