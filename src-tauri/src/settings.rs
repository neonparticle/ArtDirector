use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::error::{Error, Result};

const STORE_FILE: &str = "settings.json";
const STORE_KEY: &str = "settings";

pub const DEFAULT_EXCLUDES: &[&str] = &[
    "node_modules",
    ".git",
    "bin",
    "obj",
    "target",
    "dist",
    "build",
    "Library",
    "publish",
    "Release",
    ".idea",
    ".vs",
    ".vite",
];

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub blender_path: Option<String>,
    pub aseprite_path: Option<String>,
    pub default_excludes: Vec<String>,
    pub respect_gitignore: bool,
    pub thumb_size: u32,
    pub watch_projects: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            blender_path: None,
            aseprite_path: None,
            default_excludes: DEFAULT_EXCLUDES.iter().map(|s| s.to_string()).collect(),
            respect_gitignore: true,
            thumb_size: 256,
            watch_projects: true,
        }
    }
}

impl Settings {
    pub fn load<R: Runtime>(app: &AppHandle<R>) -> Self {
        app.store(STORE_FILE)
            .ok()
            .and_then(|s| s.get(STORE_KEY))
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    }

    pub fn save<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let store = app
            .store(STORE_FILE)
            .map_err(|e| Error::msg(e.to_string()))?;
        store.set(STORE_KEY, serde_json::to_value(self)?);
        store.save().map_err(|e| Error::msg(e.to_string()))
    }

    pub fn thumb_size(&self) -> u32 {
        self.thumb_size.clamp(96, 512)
    }
}
