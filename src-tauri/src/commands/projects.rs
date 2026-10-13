use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::error::{Error, Result};
use crate::index::queries::{self, Project};
use crate::scanner;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>> {
    queries::list_projects(&*state.db.get()?)
}

#[tauri::command]
#[specta::specta]
pub async fn add_project(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<Project> {
    let root = PathBuf::from(path.trim());
    if !root.is_dir() {
        return Err(Error::msg(format!("not a folder: {}", root.display())));
    }
    let root = std::fs::canonicalize(&root)?;
    let root_str = root.to_string_lossy();
    let root_str = root_str
        .strip_prefix(r"\\?\")
        .unwrap_or(&root_str)
        .to_string();
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root_str.clone());

    let id = {
        let conn = state.db.get()?;
        match queries::find_project_by_root(&conn, &root_str)? {
            Some(id) => id,
            None => queries::insert_project(&conn, &name, &root_str, &[])?,
        }
    };
    super::sync_watcher(&app);
    scanner::request_scan(&app, id);
    queries::get_project(&*state.db.get()?, id)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_project(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<()> {
    queries::delete_project(&*state.db.get()?, id)?;
    super::sync_watcher(&app);
    Ok(())
}

/// Updates the display name and exclude list. An empty exclude list means "use the defaults".
#[tauri::command]
#[specta::specta]
pub async fn update_project(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    name: String,
    excludes: Vec<String>,
) -> Result<Project> {
    let excludes: Vec<String> = excludes
        .into_iter()
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty())
        .collect();
    let project = {
        let conn = state.db.get()?;
        let before = queries::get_project(&conn, id)?;
        queries::update_project(&conn, id, name.trim(), &excludes)?;
        if before.excludes != excludes {
            scanner::request_scan(&app, id);
        }
        queries::get_project(&conn, id)?
    };
    super::sync_watcher(&app);
    Ok(project)
}

#[tauri::command]
#[specta::specta]
pub async fn rescan_project(app: AppHandle, id: i64) -> Result<()> {
    scanner::request_scan(&app, id);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_project_cover(
    state: State<'_, AppState>,
    project_id: i64,
    asset_id: i64,
) -> Result<()> {
    state.db.get()?.execute(
        "UPDATE projects SET cover_asset_id = ?2 WHERE id = ?1",
        [project_id, asset_id],
    )?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn scanning_projects(state: State<'_, AppState>) -> Result<Vec<i64>> {
    Ok(state.scans.lock().unwrap().keys().copied().collect())
}
