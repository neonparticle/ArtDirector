pub mod assets;
pub mod projects;
pub mod settings;
pub mod viewer;

use tauri::{AppHandle, Manager, Runtime};

use crate::index::queries;
use crate::state::AppState;
use crate::watcher::ProjectWatcher;

/// Brings the file watcher in line with the current project list and settings.
pub fn sync_watcher<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let mut slot = state.watcher.lock().unwrap();
    if !settings.watch_projects {
        *slot = None;
        return;
    }
    let projects = match state.db.get().and_then(|c| queries::list_projects(&c)) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("watcher sync: {e}");
            return;
        }
    };
    if slot.is_none() {
        *slot = ProjectWatcher::start(app.clone());
    }
    if let Some(w) = slot.as_mut() {
        w.sync(&projects, &settings.default_excludes);
    }
}
