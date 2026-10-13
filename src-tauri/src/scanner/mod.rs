mod classify;
pub mod walk;

pub use classify::{is_supported, AssetKind};

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant, UNIX_EPOCH};

use rayon::prelude::*;
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, Manager, Runtime};
use tauri_specta::Event;

use crate::error::Result;
use crate::events::{AssetsChanged, ScanPhase, ScanProgress};
use crate::formats::{aseprite, image as img, spritesheet};
use crate::index::{self, queries, queries::SheetMeta};
use crate::state::AppState;

struct Existing {
    id: i64,
    size: i64,
    mtime: i64,
    hashed: bool,
    kind: AssetKind,
}

struct Entry {
    rel_path: String,
    dir: String,
    name: String,
    ext: String,
    kind: AssetKind,
    size: i64,
    mtime: i64,
    width: Option<i64>,
    height: Option<i64>,
    frame_count: Option<i64>,
    hash: Option<String>,
    sheet: Option<SheetMeta>,
}

enum Outcome {
    Unchanged(String),
    /// File metadata unchanged, but a sibling spritesheet JSON appeared.
    SheetOnly(i64, SheetMeta),
    Changed(Box<Entry>),
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ScanStats {
    pub added: u32,
    pub updated: u32,
    pub removed: u32,
}

/// Queues a scan for `project_id` on a background thread. If one is already running,
/// it is marked to run again when it finishes so no file change is lost.
pub fn request_scan<R: Runtime>(app: &AppHandle<R>, project_id: i64) {
    let state = app.state::<AppState>();
    {
        let mut scans = state.scans.lock().unwrap();
        if let Some(pending) = scans.get_mut(&project_id) {
            *pending = true;
            return;
        }
        scans.insert(project_id, false);
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        let state = app.state::<AppState>();
        let result = scan_project(&app, &state, project_id);
        match result {
            Ok(stats) => {
                let _ = AssetsChanged {
                    project_id,
                    added: stats.added,
                    updated: stats.updated,
                    removed: stats.removed,
                }
                .emit(&app);
            }
            Err(e) => {
                log::error!("scan {project_id} failed: {e}");
                emit(
                    &app,
                    project_id,
                    ScanPhase::Failed,
                    0,
                    0,
                    Some(e.to_string()),
                );
            }
        }
        let mut scans = state.scans.lock().unwrap();
        match scans.get_mut(&project_id) {
            Some(pending) if *pending => *pending = false,
            _ => {
                scans.remove(&project_id);
                break;
            }
        }
    });
}

fn emit<R: Runtime>(
    app: &AppHandle<R>,
    project_id: i64,
    phase: ScanPhase,
    done: u32,
    total: u32,
    message: Option<String>,
) {
    let _ = ScanProgress {
        project_id,
        phase,
        done,
        total,
        message,
    }
    .emit(app);
}

fn file_meta(path: &Path) -> Option<(i64, i64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as i64;
    Some((meta.len() as i64, mtime))
}

fn hash_file(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    hasher.update_reader(file).ok()?;
    Some(hasher.finalize().to_hex()[..32].to_string())
}

fn sheet_json_for(path: &Path, json: &HashSet<PathBuf>) -> Option<PathBuf> {
    let candidate = path.with_extension("json");
    json.contains(&candidate).then_some(candidate)
}

pub fn scan_project<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    project_id: i64,
) -> Result<ScanStats> {
    let settings = state.settings();
    let project = {
        let conn = state.db.get()?;
        queries::get_project(&conn, project_id)?
    };
    let root = PathBuf::from(&project.root);
    if !root.is_dir() {
        return Err(crate::error::Error::msg(format!(
            "folder not found: {}",
            project.root
        )));
    }

    emit(app, project_id, ScanPhase::Walking, 0, 0, None);
    let excludes = if project.excludes.is_empty() {
        settings.default_excludes.clone()
    } else {
        project.excludes.clone()
    };
    let walked = walk::walk(&root, &excludes, settings.respect_gitignore);
    let total = walked.files.len() as u32;

    let existing: HashMap<String, Existing> = {
        let conn = state.db.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, rel_path, size, mtime, hash IS NOT NULL, kind FROM assets WHERE project_id = ?1",
        )?;
        let rows = stmt.query_map([project_id], |r| {
            Ok((
                r.get::<_, String>(1)?,
                Existing {
                    id: r.get(0)?,
                    size: r.get(2)?,
                    mtime: r.get(3)?,
                    hashed: r.get(4)?,
                    kind: AssetKind::parse(&r.get::<_, String>(5)?),
                },
            ))
        })?;
        rows.collect::<rusqlite::Result<_>>()?
    };

    emit(app, project_id, ScanPhase::Indexing, 0, total, None);
    let done = AtomicU32::new(0);
    let last_emit = std::sync::Mutex::new(Instant::now());

    let outcomes: Vec<Outcome> = walked
        .files
        .par_iter()
        .filter_map(|path| {
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            if let Ok(mut last) = last_emit.try_lock() {
                if last.elapsed() > Duration::from_millis(120) {
                    *last = Instant::now();
                    emit(app, project_id, ScanPhase::Indexing, n, total, None);
                }
            }
            index_file(&root, path, &existing, &walked.json)
        })
        .collect();

    emit(app, project_id, ScanPhase::Writing, total, total, None);
    let stats = write_outcomes(state, project_id, &existing, outcomes)?;
    emit(app, project_id, ScanPhase::Done, total, total, None);
    Ok(stats)
}

fn index_file(
    root: &Path,
    path: &Path,
    existing: &HashMap<String, Existing>,
    json: &HashSet<PathBuf>,
) -> Option<Outcome> {
    let rel_path = index::rel_path(root, path)?;
    let (size, mtime) = file_meta(path)?;
    let ext = classify::ext_of(path)?;
    let mut kind = AssetKind::from_ext(&ext)?;
    let sheet_json = (kind == AssetKind::Image && ext == "png")
        .then(|| sheet_json_for(path, json))
        .flatten();

    if let Some(prev) = existing.get(&rel_path) {
        if prev.size == size && prev.mtime == mtime && prev.hashed {
            if prev.kind != AssetKind::Sheet {
                if let Some(meta) = sheet_json.and_then(|j| detect_sheet(root, &j)) {
                    return Some(Outcome::SheetOnly(prev.id, meta));
                }
            }
            return Some(Outcome::Unchanged(rel_path));
        }
    }

    let (mut width, mut height, mut frame_count) = (None, None, None);
    match kind {
        AssetKind::Image => {
            if let Some((w, h)) = img::dimensions(path, &ext) {
                width = Some(w as i64);
                height = Some(h as i64);
            }
        }
        AssetKind::Aseprite => {
            if let Ok((w, h, frames)) = aseprite::summary(path) {
                width = Some(w as i64);
                height = Some(h as i64);
                frame_count = Some(frames as i64);
            }
        }
        _ => {}
    }

    let sheet = sheet_json.and_then(|j| detect_sheet(root, &j));
    if sheet.is_some() {
        kind = AssetKind::Sheet;
    }
    if let (Some(meta), true) = (&sheet, frame_count.is_none()) {
        frame_count = meta.cols.zip(meta.rows).map(|(c, r)| c * r);
    }

    let (dir, name) = match rel_path.rsplit_once('/') {
        Some((d, n)) => (d.to_string(), n.to_string()),
        None => (String::new(), rel_path.clone()),
    };

    Some(Outcome::Changed(Box::new(Entry {
        hash: hash_file(path),
        rel_path,
        dir,
        name,
        ext,
        kind,
        size,
        mtime,
        width,
        height,
        frame_count,
        sheet,
    })))
}

fn detect_sheet(root: &Path, json_path: &Path) -> Option<SheetMeta> {
    let mut meta = spritesheet::detect(json_path)?;
    meta.source_json = index::rel_path(root, json_path);
    Some(meta)
}

fn write_outcomes(
    state: &AppState,
    project_id: i64,
    existing: &HashMap<String, Existing>,
    outcomes: Vec<Outcome>,
) -> Result<ScanStats> {
    let mut stats = ScanStats::default();
    let mut seen: HashSet<String> = HashSet::with_capacity(outcomes.len());
    let mut conn = state.db.get()?;
    let tx = conn.transaction()?;
    {
        let mut upsert = tx.prepare(
            "INSERT INTO assets (project_id, rel_path, dir, name, ext, kind, size, mtime, width, height, frame_count, hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(project_id, rel_path) DO UPDATE SET
               dir = excluded.dir, name = excluded.name, ext = excluded.ext,
               kind = CASE WHEN assets.kind = 'sheet' AND excluded.kind = 'image' THEN 'sheet' ELSE excluded.kind END,
               size = excluded.size, mtime = excluded.mtime, width = excluded.width,
               height = excluded.height, frame_count = excluded.frame_count, hash = excluded.hash
             RETURNING id",
        )?;
        let mut has_sheet = tx.prepare("SELECT 1 FROM sheet_meta WHERE asset_id = ?1")?;

        for outcome in outcomes {
            match outcome {
                Outcome::Unchanged(rel) => {
                    seen.insert(rel);
                }
                Outcome::SheetOnly(id, meta) => {
                    queries::upsert_sheet(&tx, id, &meta)?;
                    stats.updated += 1;
                }
                Outcome::Changed(e) => {
                    let id: i64 = upsert.query_row(
                        params![
                            project_id,
                            e.rel_path,
                            e.dir,
                            e.name,
                            e.ext,
                            e.kind.as_str(),
                            e.size,
                            e.mtime,
                            e.width,
                            e.height,
                            e.frame_count,
                            e.hash
                        ],
                        |r| r.get(0),
                    )?;
                    if let Some(meta) = &e.sheet {
                        let present = has_sheet.query_row([id], |_| Ok(())).optional()?.is_some();
                        if !present {
                            queries::upsert_sheet(&tx, id, meta)?;
                        }
                    }
                    if existing.contains_key(&e.rel_path) {
                        stats.updated += 1;
                    } else {
                        stats.added += 1;
                    }
                    seen.insert(e.rel_path);
                }
            }
        }

        let mut delete = tx.prepare("DELETE FROM assets WHERE id = ?1")?;
        for (rel, prev) in existing {
            if !seen.contains(rel) {
                delete.execute([prev.id])?;
                stats.removed += 1;
            }
        }
    }

    tx.execute(
        "UPDATE projects SET last_scan_at = ?2,
           cover_asset_id = CASE
             WHEN cover_asset_id IS NOT NULL AND EXISTS (SELECT 1 FROM assets WHERE id = cover_asset_id)
               THEN cover_asset_id
             ELSE (SELECT id FROM assets
                   WHERE project_id = ?1 AND kind IN ('image', 'sheet', 'aseprite') AND width >= 48
                     AND width <= 4096 AND height <= 4096
                   ORDER BY (width * height) DESC LIMIT 1)
           END
         WHERE id = ?1",
        params![project_id, index::now_ms()],
    )?;
    tx.commit()?;
    Ok(stats)
}
