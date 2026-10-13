use std::path::PathBuf;
use std::process::Command;

use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{Error, Result};
use crate::formats::{aseprite, blend, image as img};
use crate::index::queries::{
    self, AssetDetail, AssetQuery, AssetSummary, FolderCount, KindCount, TagCount,
};
use crate::scanner::AssetKind;
use crate::state::AppState;
use crate::thumbs::pipeline::{self, Thumb};

#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum OpenWith {
    Default,
    Aseprite,
    Blender,
}

#[tauri::command]
#[specta::specta]
pub async fn query_assets(
    state: State<'_, AppState>,
    query: AssetQuery,
) -> Result<Vec<AssetSummary>> {
    queries::query_assets(&*state.db.get()?, &query)
}

#[tauri::command]
#[specta::specta]
pub async fn get_asset(state: State<'_, AppState>, id: i64) -> Result<AssetDetail> {
    queries::asset_detail(&*state.db.get()?, id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_folders(state: State<'_, AppState>, project_id: i64) -> Result<Vec<FolderCount>> {
    queries::list_folders(&*state.db.get()?, project_id)
}

#[tauri::command]
#[specta::specta]
pub async fn kind_counts(
    state: State<'_, AppState>,
    project_id: Option<i64>,
) -> Result<Vec<KindCount>> {
    queries::kind_counts(&*state.db.get()?, project_id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_tags(
    state: State<'_, AppState>,
    project_id: Option<i64>,
) -> Result<Vec<TagCount>> {
    queries::list_tags(&*state.db.get()?, project_id)
}

#[tauri::command]
#[specta::specta]
pub async fn set_favorite(state: State<'_, AppState>, id: i64, favorite: bool) -> Result<()> {
    queries::set_favorite(&*state.db.get()?, id, favorite)
}

#[tauri::command]
#[specta::specta]
pub async fn add_tag(state: State<'_, AppState>, id: i64, tag: String) -> Result<()> {
    let tag = tag.trim().to_lowercase();
    if tag.is_empty() {
        return Err(Error::msg("empty tag"));
    }
    queries::add_tag(&*state.db.get()?, id, &tag)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_tag(state: State<'_, AppState>, id: i64, tag: String) -> Result<()> {
    queries::remove_tag(&*state.db.get()?, id, &tag)
}

#[tauri::command]
#[specta::specta]
pub async fn reveal_asset(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<()> {
    let row = queries::get_asset_row(&*state.db.get()?, id)?;
    app.opener()
        .reveal_item_in_dir(row.path())
        .map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn open_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    app_kind: OpenWith,
) -> Result<()> {
    let row = queries::get_asset_row(&*state.db.get()?, id)?;
    let path = row.path();
    let settings = state.settings();
    let program = match app_kind {
        OpenWith::Default => {
            return app
                .opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(|e| Error::msg(e.to_string()));
        }
        OpenWith::Aseprite => settings
            .aseprite_path
            .clone()
            .map(PathBuf::from)
            .filter(|p| p.is_file())
            .or_else(find_aseprite)
            .ok_or_else(|| Error::msg("Aseprite not found; set its path in Settings"))?,
        OpenWith::Blender => blend::find_blender(&settings)
            .path
            .map(PathBuf::from)
            .ok_or_else(|| Error::msg("Blender not found; set its path in Settings"))?,
    };
    Command::new(program).arg(path).spawn()?;
    Ok(())
}

/// Puts an asset's pixels on the system clipboard. `data_url` carries what an open
/// viewer is showing (current frame, live 3D view); without it the whole image, the
/// first Aseprite frame, or a model's rendered thumbnail is copied.
#[tauri::command]
#[specta::specta]
pub async fn copy_image(
    state: State<'_, AppState>,
    id: i64,
    data_url: Option<String>,
) -> Result<()> {
    let (row, thumb_ready) = {
        let conn = state.db.get()?;
        let ready = queries::asset_detail(&conn, id)?.asset.thumb_ready;
        (queries::get_asset_row(&conn, id)?, ready)
    };
    let cache_dir = state.cache_dir.clone();
    let size = state.settings().thumb_size();
    tauri::async_runtime::spawn_blocking(move || {
        let image = match data_url {
            Some(url) => img::decode_data_url(&url)?,
            None => match row.kind {
                AssetKind::Image | AssetKind::Sheet => img::load(&row.path())?.into_rgba8(),
                AssetKind::Aseprite => aseprite::first_frame(&row.path())?,
                AssetKind::Model | AssetKind::Blend => {
                    match pipeline::thumb_for(&cache_dir, &row, size)? {
                        Thumb::File(p) if thumb_ready => img::load(&p)?.into_rgba8(),
                        _ => return Err(Error::msg("no preview rendered yet")),
                    }
                }
                AssetKind::Source => return Err(Error::msg("not an image")),
            },
        };
        let (width, height) = image.dimensions();
        arboard::Clipboard::new()
            .and_then(|mut c| {
                c.set_image(arboard::ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: image.into_raw().into(),
                })
            })
            .map_err(|e| Error::msg(format!("clipboard: {e}")))
    })
    .await
    .map_err(|e| Error::msg(e.to_string()))?
}

fn find_aseprite() -> Option<PathBuf> {
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let pf86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from);
    [
        pf.as_ref().map(|p| p.join(r"Aseprite\Aseprite.exe")),
        pf86.as_ref()
            .map(|p| p.join(r"Steam\steamapps\common\Aseprite\Aseprite.exe")),
        pf.as_ref()
            .map(|p| p.join(r"Steam\steamapps\common\Aseprite\Aseprite.exe")),
    ]
    .into_iter()
    .flatten()
    .find(|p| p.is_file())
}
