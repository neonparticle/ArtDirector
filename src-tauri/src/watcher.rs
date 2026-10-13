use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use notify_debouncer_full::notify::{EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use tauri::{AppHandle, Runtime};

use crate::index::queries::Project;
use crate::scanner::{self, walk};

struct Watched {
    root: PathBuf,
    excludes: HashSet<String>,
}

/// Watches every project root and turns relevant file changes into incremental rescans.
/// Rescans are cheap for unchanged files (metadata compare only), so a debounced
/// full walk is simpler and more robust than patching individual rows.
pub struct ProjectWatcher {
    debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
    watched: Arc<RwLock<HashMap<i64, Watched>>>,
}

impl ProjectWatcher {
    pub fn start<R: Runtime>(app: AppHandle<R>) -> Option<Self> {
        let watched: Arc<RwLock<HashMap<i64, Watched>>> = Arc::default();
        let lookup = watched.clone();
        let debouncer = new_debouncer(
            Duration::from_millis(1500),
            None,
            move |result: DebounceEventResult| {
                let Ok(events) = result else { return };
                let mut dirty = HashSet::new();
                let projects = lookup.read().unwrap();
                for event in &events {
                    if matches!(event.kind, EventKind::Access(_)) {
                        continue;
                    }
                    for path in &event.paths {
                        if let Some(id) = owning_project(&projects, path) {
                            dirty.insert(id);
                        }
                    }
                }
                drop(projects);
                for id in dirty {
                    scanner::request_scan(&app, id);
                }
            },
        )
        .map_err(|e| log::warn!("file watcher unavailable: {e}"))
        .ok()?;
        Some(Self { debouncer, watched })
    }

    pub fn sync(&mut self, projects: &[Project], default_excludes: &[String]) {
        let mut watched = self.watched.write().unwrap();
        let wanted: HashSet<i64> = projects.iter().map(|p| p.id).collect();
        let stale: Vec<i64> = watched
            .keys()
            .filter(|id| !wanted.contains(id))
            .copied()
            .collect();
        for id in stale {
            if let Some(w) = watched.remove(&id) {
                let _ = self.debouncer.unwatch(&w.root);
            }
        }
        for p in projects {
            let excludes = walk::exclude_set(if p.excludes.is_empty() {
                default_excludes
            } else {
                &p.excludes
            });
            if let Some(w) = watched.get_mut(&p.id) {
                w.excludes = excludes;
                continue;
            }
            let root = PathBuf::from(&p.root);
            match self.debouncer.watch(&root, RecursiveMode::Recursive) {
                Ok(()) => {
                    watched.insert(p.id, Watched { root, excludes });
                }
                Err(e) => log::warn!("cannot watch {}: {e}", p.root),
            }
        }
    }
}

fn owning_project(projects: &HashMap<i64, Watched>, path: &Path) -> Option<i64> {
    let (id, w) = projects.iter().find(|(_, w)| path.starts_with(&w.root))?;
    let rel = path.strip_prefix(&w.root).ok()?;
    let mut comps: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    let file = comps.pop()?;
    if comps
        .iter()
        .any(|c| c.starts_with('.') || walk::is_excluded_name(c, &w.excludes))
    {
        return None;
    }
    let relevant = scanner::is_supported(path)
        || file.ends_with(".json")
        || (Path::new(&file).extension().is_none() && !walk::is_excluded_name(&file, &w.excludes));
    relevant.then_some(*id)
}
