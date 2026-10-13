use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, Runtime};
use tauri_specta::Event;

use crate::error::{Error, Result};
use crate::events::{BlendState, BlendStatus};
use crate::index::queries::{self, AssetRow};
use crate::settings::Settings;
use crate::state::AppState;
use crate::thumbs::cache;

const EXPORT_TIMEOUT: Duration = Duration::from_secs(240);

const EXPORT_SCRIPT: &str = include_str!("blend_export.py");

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlenderInfo {
    pub path: Option<String>,
    pub from_settings: bool,
}

pub struct BlendQueue {
    tx: Mutex<Option<Sender<i64>>>,
    states: Mutex<HashMap<i64, (BlendState, Option<String>)>>,
}

impl BlendQueue {
    pub fn new() -> Self {
        Self {
            tx: Mutex::new(None),
            states: Mutex::new(HashMap::new()),
        }
    }
}

/// Finds Blender in settings, then on PATH, then in the default Windows install folder.
pub fn find_blender(settings: &Settings) -> BlenderInfo {
    if let Some(p) = settings
        .blender_path
        .as_deref()
        .filter(|p| Path::new(p).is_file())
    {
        return BlenderInfo {
            path: Some(p.to_string()),
            from_settings: true,
        };
    }
    let exe = if cfg!(windows) {
        "blender.exe"
    } else {
        "blender"
    };
    let on_path = std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|d| d.join(exe))
            .find(|p| p.is_file())
    });
    let installed = || -> Option<PathBuf> {
        let base = std::env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"))
            .join("Blender Foundation");
        let mut dirs: Vec<_> = std::fs::read_dir(base)
            .ok()?
            .flatten()
            .map(|e| e.path().join(exe))
            .filter(|p| p.is_file())
            .collect();
        dirs.sort();
        dirs.pop()
    };
    BlenderInfo {
        path: on_path
            .or_else(installed)
            .map(|p| p.to_string_lossy().into_owned()),
        from_settings: false,
    }
}

pub fn glb_path(cache_dir: &Path, row: &AssetRow) -> PathBuf {
    cache::derived_path(cache_dir, &cache::key(row, "glb"), "glb")
}

pub fn status<R: Runtime>(app: &AppHandle<R>, row: &AssetRow) -> BlendStatus {
    let state = app.state::<AppState>();
    if glb_path(&state.cache_dir, row).exists() {
        return BlendStatus {
            asset_id: row.id,
            state: BlendState::Ready,
            message: None,
        };
    }
    let (st, message) = match state.blend.states.lock().unwrap().get(&row.id).cloned() {
        // The GLB was cleared from the cache or the source changed since the export.
        Some((BlendState::Ready, _)) | None => (BlendState::Idle, None),
        Some(other) => other,
    };
    BlendStatus {
        asset_id: row.id,
        state: st,
        message,
    }
}

fn set_state<R: Runtime>(app: &AppHandle<R>, id: i64, st: BlendState, message: Option<String>) {
    let state = app.state::<AppState>();
    state
        .blend
        .states
        .lock()
        .unwrap()
        .insert(id, (st, message.clone()));
    let _ = BlendStatus {
        asset_id: id,
        state: st,
        message,
    }
    .emit(app);
}

pub fn request<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<BlendStatus> {
    let state = app.state::<AppState>();
    let row = {
        let conn = state.db.get()?;
        queries::get_asset_row(&conn, id)?
    };
    let current = status(app, &row);
    if matches!(
        current.state,
        BlendState::Ready | BlendState::Queued | BlendState::Running
    ) {
        return Ok(current);
    }
    if find_blender(&state.settings()).path.is_none() {
        set_state(
            app,
            id,
            BlendState::NoBlender,
            Some("Blender not found".into()),
        );
        return Ok(status(app, &row));
    }

    let mut tx = state.blend.tx.lock().unwrap();
    if tx.is_none() {
        *tx = Some(spawn_worker(app.clone()));
    }
    set_state(app, id, BlendState::Queued, None);
    tx.as_ref()
        .unwrap()
        .send(id)
        .map_err(|_| Error::msg("blend worker stopped"))?;
    Ok(status(app, &row))
}

fn spawn_worker<R: Runtime>(app: AppHandle<R>) -> Sender<i64> {
    let (tx, rx) = channel::<i64>();
    std::thread::spawn(move || {
        while let Ok(id) = rx.recv() {
            set_state(&app, id, BlendState::Running, None);
            match export(&app, id) {
                Ok(()) => set_state(&app, id, BlendState::Ready, None),
                Err(e) => {
                    log::warn!("blend export {id} failed: {e}");
                    set_state(&app, id, BlendState::Failed, Some(e.to_string()));
                }
            }
        }
    });
    tx
}

fn export<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<()> {
    let state = app.state::<AppState>();
    let row = {
        let conn = state.db.get()?;
        queries::get_asset_row(&conn, id)?
    };
    let blender = find_blender(&state.settings())
        .path
        .ok_or_else(|| Error::msg("Blender not found"))?;
    let out = glb_path(&state.cache_dir, &row);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = out.with_extension("tmp.glb");

    let mut cmd = Command::new(&blender);
    cmd.arg("-b")
        .arg(row.path())
        .arg("--factory-startup")
        .arg("--python-expr")
        .arg(EXPORT_SCRIPT)
        .arg("--")
        .arg(&tmp)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn()?;
    let stderr = child.stderr.take().map(|mut s| {
        std::thread::spawn(move || {
            use std::io::Read;
            let mut err = String::new();
            let _ = s.read_to_string(&mut err);
            err
        })
    });
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            if !status.success() || !tmp.exists() {
                let err = stderr.and_then(|h| h.join().ok()).unwrap_or_default();
                let tail: String = err.lines().rev().take(4).collect::<Vec<_>>().join(" | ");
                return Err(Error::msg(format!("Blender exited with {status}: {tail}")));
            }
            break;
        }
        if started.elapsed() > EXPORT_TIMEOUT {
            let _ = child.kill();
            return Err(Error::msg("Blender export timed out"));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    std::fs::rename(&tmp, &out)?;
    Ok(())
}
