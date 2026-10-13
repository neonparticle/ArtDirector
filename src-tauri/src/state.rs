use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use crate::formats::blend::BlendQueue;
use crate::index::Db;
use crate::settings::Settings;
use crate::watcher::ProjectWatcher;

pub struct AppState {
    pub db: Db,
    pub cache_dir: PathBuf,
    pub settings: RwLock<Settings>,
    /// Projects with a scan in flight; `true` means another scan was requested meanwhile.
    pub scans: Mutex<HashMap<i64, bool>>,
    /// Bounded pool for CPU-heavy protocol work (decoding, resizing, encoding).
    pub thumb_pool: rayon::ThreadPool,
    pub blend: BlendQueue,
    pub watcher: Mutex<Option<ProjectWatcher>>,
}

impl AppState {
    pub fn settings(&self) -> Settings {
        self.settings.read().map(|s| s.clone()).unwrap_or_default()
    }
}
