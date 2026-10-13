use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

use crate::error::Result;
use crate::formats::blend::{self, BlenderInfo};
use crate::settings::{Settings, DEFAULT_EXCLUDES};
use crate::state::AppState;
use crate::thumbs::cache;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo {
    pub path: String,
    pub bytes: f64,
}

#[tauri::command]
#[specta::specta]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    Ok(state.settings())
}

#[tauri::command]
#[specta::specta]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings> {
    let mut settings = settings;
    settings.blender_path = settings.blender_path.filter(|p| !p.trim().is_empty());
    settings.aseprite_path = settings.aseprite_path.filter(|p| !p.trim().is_empty());
    if settings.default_excludes.is_empty() {
        settings.default_excludes = DEFAULT_EXCLUDES.iter().map(|s| s.to_string()).collect();
    }
    settings.save(&app)?;
    *state.settings.write().unwrap() = settings.clone();
    super::sync_watcher(&app);
    Ok(settings)
}

#[tauri::command]
#[specta::specta]
pub async fn blender_info(state: State<'_, AppState>) -> Result<BlenderInfo> {
    Ok(blend::find_blender(&state.settings()))
}

#[tauri::command]
#[specta::specta]
pub async fn cache_info(state: State<'_, AppState>) -> Result<CacheInfo> {
    let dir = state.cache_dir.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || cache::dir_size(&dir))
        .await
        .unwrap_or(0);
    Ok(CacheInfo {
        path: state.cache_dir.to_string_lossy().into_owned(),
        bytes: bytes as f64,
    })
}

/// Drops all generated thumbnails and derived files; 3D thumbnails are re-captured on demand.
#[tauri::command]
#[specta::specta]
pub async fn clear_cache(state: State<'_, AppState>) -> Result<()> {
    for sub in ["thumbs", "derived"] {
        let dir = state.cache_dir.join(sub);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
    }
    state
        .db
        .get()?
        .execute("UPDATE assets SET ext_thumb = NULL", [])?;
    Ok(())
}
