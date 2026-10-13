use tauri::{AppHandle, State};

use crate::error::{Error, Result};
use crate::events::BlendStatus;
use crate::formats::{aseprite, blend, model, spritesheet};
use crate::index::queries::{SheetMeta, SheetMode};
use crate::index::{abs_path, queries};
use crate::scanner::AssetKind;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn aseprite_info(state: State<'_, AppState>, id: i64) -> Result<aseprite::AsepriteInfo> {
    let row = queries::get_asset_row(&*state.db.get()?, id)?;
    if row.kind != AssetKind::Aseprite {
        return Err(Error::msg("not an Aseprite file"));
    }
    tauri::async_runtime::spawn_blocking(move || aseprite::info(&row.path()))
        .await
        .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
#[specta::specta]
pub async fn sheet_info(state: State<'_, AppState>, id: i64) -> Result<spritesheet::SheetInfo> {
    let conn = state.db.get()?;
    let row = queries::get_asset_row(&conn, id)?;
    let meta = queries::get_sheet(&conn, id)?;
    let (w, h): (Option<i64>, Option<i64>) = conn.query_row(
        "SELECT width, height FROM assets WHERE id = ?1",
        [id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let json = meta
        .as_ref()
        .filter(|m| m.mode != SheetMode::Grid)
        .and_then(|m| m.source_json.as_deref())
        .map(|rel| abs_path(&row.root, rel));
    spritesheet::info(
        json.as_deref(),
        meta,
        w.unwrap_or(0) as u32,
        h.unwrap_or(0) as u32,
    )
}

#[tauri::command]
#[specta::specta]
pub async fn save_sheet(state: State<'_, AppState>, id: i64, meta: SheetMeta) -> Result<()> {
    queries::upsert_sheet(&*state.db.get()?, id, &meta)
}

#[tauri::command]
#[specta::specta]
pub async fn clear_sheet(state: State<'_, AppState>, id: i64) -> Result<()> {
    queries::clear_sheet(&*state.db.get()?, id)
}

#[tauri::command]
#[specta::specta]
pub async fn save_model_thumb(state: State<'_, AppState>, id: i64, data_url: String) -> Result<()> {
    let conn = state.db.get()?;
    let row = queries::get_asset_row(&conn, id)?;
    let size = state.settings().thumb_size();
    model::save_client_thumb(&state.cache_dir, &row, &data_url, size)?;
    queries::set_ext_thumb(&conn, id, row.mtime)
}

#[tauri::command]
#[specta::specta]
pub async fn blend_status(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<BlendStatus> {
    let row = queries::get_asset_row(&*state.db.get()?, id)?;
    Ok(blend::status(&app, &row))
}

#[tauri::command]
#[specta::specta]
pub async fn request_blend_export(app: AppHandle, id: i64) -> Result<BlendStatus> {
    blend::request(&app, id)
}
