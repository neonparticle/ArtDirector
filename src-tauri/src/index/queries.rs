use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::abs_path;
use crate::error::{Error, Result};
use crate::scanner::AssetKind;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub root: String,
    pub added_at: i64,
    pub last_scan_at: Option<i64>,
    pub cover_asset_id: Option<i64>,
    pub cover_mtime: Option<i64>,
    pub asset_count: i64,
    pub excludes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetSummary {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub rel_path: String,
    pub dir: String,
    pub ext: String,
    pub kind: AssetKind,
    pub size: i64,
    pub mtime: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub frame_count: Option<i64>,
    pub favorite: bool,
    pub thumb_ready: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetail {
    pub asset: AssetSummary,
    pub abs_path: String,
    pub project_name: String,
    pub project_root: String,
    pub hash: Option<String>,
    pub tags: Vec<String>,
    pub sheet: Option<SheetMeta>,
    pub duplicates: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SheetMode {
    Grid,
    AsepriteJson,
    TexturepackerJson,
}

impl SheetMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Grid => "grid",
            Self::AsepriteJson => "aseprite-json",
            Self::TexturepackerJson => "texturepacker-json",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "aseprite-json" => Self::AsepriteJson,
            "texturepacker-json" => Self::TexturepackerJson,
            _ => Self::Grid,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetMeta {
    pub mode: SheetMode,
    pub cols: Option<i64>,
    pub rows: Option<i64>,
    pub frame_w: Option<i64>,
    pub frame_h: Option<i64>,
    pub fps: f64,
    pub source_json: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SortKey {
    #[default]
    Path,
    Name,
    Modified,
    Size,
    Dimensions,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct AssetQuery {
    pub project_id: Option<i64>,
    pub kinds: Vec<AssetKind>,
    pub folder: Option<String>,
    pub search: Option<String>,
    pub tag: Option<String>,
    pub favorites_only: bool,
    pub hide_duplicates: bool,
    pub hide_artifacts: bool,
    pub min_px: Option<i64>,
    pub sort: SortKey,
    pub desc: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderCount {
    pub dir: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KindCount {
    pub kind: AssetKind,
    pub count: i64,
}

/// Everything the protocol and format handlers need to locate an asset on disk.
#[derive(Debug, Clone)]
pub struct AssetRow {
    pub id: i64,
    pub root: String,
    pub rel_path: String,
    pub ext: String,
    pub kind: AssetKind,
    pub size: i64,
    pub mtime: i64,
}

impl AssetRow {
    pub fn path(&self) -> std::path::PathBuf {
        abs_path(&self.root, &self.rel_path)
    }
}

// ---------------------------------------------------------------- projects

const PROJECT_SELECT: &str = "
SELECT p.id, p.name, p.root, p.added_at, p.last_scan_at, p.cover_asset_id,
       (SELECT mtime FROM assets WHERE id = p.cover_asset_id),
       (SELECT COUNT(*) FROM assets WHERE project_id = p.id),
       p.excludes
FROM projects p";

fn project_from_row(r: &Row) -> rusqlite::Result<Project> {
    let excludes: String = r.get(8)?;
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        root: r.get(2)?,
        added_at: r.get(3)?,
        last_scan_at: r.get(4)?,
        cover_asset_id: r.get(5)?,
        cover_mtime: r.get(6)?,
        asset_count: r.get(7)?,
        excludes: serde_json::from_str(&excludes).unwrap_or_default(),
    })
}

pub fn list_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(&format!("{PROJECT_SELECT} ORDER BY p.name COLLATE NOCASE"))?;
    let rows = stmt.query_map([], project_from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn get_project(conn: &Connection, id: i64) -> Result<Project> {
    conn.query_row(
        &format!("{PROJECT_SELECT} WHERE p.id = ?1"),
        [id],
        project_from_row,
    )
    .optional()?
    .ok_or_else(|| Error::NotFound(format!("project {id}")))
}

pub fn find_project_by_root(conn: &Connection, root: &str) -> Result<Option<i64>> {
    Ok(conn
        .query_row("SELECT id FROM projects WHERE root = ?1", [root], |r| {
            r.get(0)
        })
        .optional()?)
}

pub fn insert_project(
    conn: &Connection,
    name: &str,
    root: &str,
    excludes: &[String],
) -> Result<i64> {
    conn.execute(
        "INSERT INTO projects (name, root, added_at, excludes) VALUES (?1, ?2, ?3, ?4)",
        params![
            name,
            root,
            super::now_ms(),
            serde_json::to_string(excludes)?
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_project(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn update_project(conn: &Connection, id: i64, name: &str, excludes: &[String]) -> Result<()> {
    conn.execute(
        "UPDATE projects SET name = ?2, excludes = ?3 WHERE id = ?1",
        params![id, name, serde_json::to_string(excludes)?],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- assets

const ASSET_COLUMNS: &str = "
a.id, a.project_id, a.name, a.rel_path, a.dir, a.ext, a.kind, a.size, a.mtime,
a.width, a.height, a.frame_count,
EXISTS (SELECT 1 FROM favorites f WHERE f.asset_id = a.id),
a.ext_thumb";

fn summary_from_row(r: &Row) -> rusqlite::Result<AssetSummary> {
    let kind = AssetKind::parse(&r.get::<_, String>(6)?);
    let ext: String = r.get(5)?;
    let mtime: i64 = r.get(8)?;
    let ext_thumb: Option<i64> = r.get(13)?;
    Ok(AssetSummary {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        rel_path: r.get(3)?,
        dir: r.get(4)?,
        thumb_ready: kind.thumb_ready(mtime, ext_thumb),
        ext,
        kind,
        size: r.get(7)?,
        mtime,
        width: r.get(9)?,
        height: r.get(10)?,
        frame_count: r.get(11)?,
        favorite: r.get(12)?,
    })
}

fn like_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('%');
    for ch in s.chars() {
        if matches!(ch, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(ch);
    }
    out.push('%');
    out
}

pub fn query_assets(conn: &Connection, q: &AssetQuery) -> Result<Vec<AssetSummary>> {
    let mut filters = String::from("a.hidden = 0");
    let mut args: Vec<Value> = Vec::new();

    if let Some(pid) = q.project_id {
        filters.push_str(" AND a.project_id = ?");
        args.push(pid.into());
    }
    if !q.kinds.is_empty() {
        let marks = vec!["?"; q.kinds.len()].join(",");
        filters.push_str(&format!(" AND a.kind IN ({marks})"));
        args.extend(q.kinds.iter().map(|k| Value::from(k.as_str().to_string())));
    }
    if let Some(folder) = q.folder.as_deref().filter(|f| !f.is_empty()) {
        filters.push_str(" AND (a.dir = ? OR substr(a.dir, 1, length(?) + 1) = ? || '/')");
        for _ in 0..3 {
            args.push(folder.to_string().into());
        }
    }
    if let Some(search) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let pat = like_escape(search);
        filters.push_str(
            " AND (a.rel_path LIKE ? ESCAPE '\\'
              OR EXISTS (SELECT 1 FROM tags t WHERE t.asset_id = a.id AND t.tag LIKE ? ESCAPE '\\'))",
        );
        args.push(pat.clone().into());
        args.push(pat.into());
    }
    if let Some(tag) = q.tag.as_deref().filter(|t| !t.is_empty()) {
        filters.push_str(" AND EXISTS (SELECT 1 FROM tags t WHERE t.asset_id = a.id AND t.tag = ?)");
        args.push(tag.to_string().into());
    }
    if q.favorites_only {
        filters.push_str(" AND EXISTS (SELECT 1 FROM favorites f WHERE f.asset_id = a.id)");
    }
    if q.hide_artifacts {
        filters.push_str(
            " AND a.rel_path NOT LIKE 'artifacts/%' AND a.rel_path NOT LIKE '%/artifacts/%'",
        );
    }
    if let Some(min) = q.min_px.filter(|m| *m > 0) {
        filters.push_str(" AND (a.width IS NULL OR max(a.width, a.height) >= ?)");
        args.push(min.into());
    }
    // Pick each hash's representative among the rows that already match, so a
    // folder never goes empty because its twin with a shorter path lives elsewhere.
    let mut sql = if q.hide_duplicates {
        format!(
            "SELECT {ASSET_COLUMNS} FROM (
               SELECT a.*, row_number() OVER (
                 PARTITION BY a.hash ORDER BY length(a.rel_path), a.id) AS dup_rank
               FROM assets a WHERE {filters}) a
             WHERE a.hash IS NULL OR a.dup_rank = 1"
        )
    } else {
        format!("SELECT {ASSET_COLUMNS} FROM assets a WHERE {filters}")
    };

    let order = match q.sort {
        SortKey::Path => "a.rel_path COLLATE NOCASE",
        SortKey::Name => "a.name COLLATE NOCASE",
        SortKey::Modified => "a.mtime",
        SortKey::Size => "a.size",
        SortKey::Dimensions => "(coalesce(a.width, 0) * coalesce(a.height, 0))",
    };
    let dir = if q.desc { "DESC" } else { "ASC" };
    sql.push_str(&format!(" ORDER BY {order} {dir}, a.id {dir} LIMIT 200000"));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(args), summary_from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn get_asset_row(conn: &Connection, id: i64) -> Result<AssetRow> {
    conn.query_row(
        "SELECT a.id, p.root, a.rel_path, a.ext, a.kind, a.size, a.mtime
         FROM assets a JOIN projects p ON p.id = a.project_id WHERE a.id = ?1",
        [id],
        |r| {
            Ok(AssetRow {
                id: r.get(0)?,
                root: r.get(1)?,
                rel_path: r.get(2)?,
                ext: r.get(3)?,
                kind: AssetKind::parse(&r.get::<_, String>(4)?),
                size: r.get(5)?,
                mtime: r.get(6)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| Error::NotFound(format!("asset {id}")))
}

pub fn asset_detail(conn: &Connection, id: i64) -> Result<AssetDetail> {
    let (asset, hash, project_name, project_root) = conn
        .query_row(
            &format!(
                "SELECT {ASSET_COLUMNS}, a.hash, p.name, p.root
                 FROM assets a JOIN projects p ON p.id = a.project_id WHERE a.id = ?1"
            ),
            [id],
            |r| {
                Ok((
                    summary_from_row(r)?,
                    r.get::<_, Option<String>>(14)?,
                    r.get::<_, String>(15)?,
                    r.get::<_, String>(16)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| Error::NotFound(format!("asset {id}")))?;

    let mut stmt = conn.prepare("SELECT tag FROM tags WHERE asset_id = ?1 ORDER BY tag")?;
    let tags = stmt
        .query_map([id], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;

    let duplicates = match &hash {
        Some(h) => conn.query_row(
            "SELECT COUNT(*) - 1 FROM assets WHERE hash = ?1",
            [h],
            |r| r.get(0),
        )?,
        None => 0,
    };

    Ok(AssetDetail {
        abs_path: abs_path(&project_root, &asset.rel_path)
            .to_string_lossy()
            .into_owned(),
        sheet: get_sheet(conn, id)?,
        asset,
        project_name,
        project_root,
        hash,
        tags,
        duplicates,
    })
}

pub fn list_folders(conn: &Connection, project_id: i64) -> Result<Vec<FolderCount>> {
    let mut stmt = conn.prepare(
        "SELECT dir, COUNT(*) FROM assets WHERE project_id = ?1 AND hidden = 0
         GROUP BY dir ORDER BY dir COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(FolderCount {
            dir: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn kind_counts(conn: &Connection, project_id: Option<i64>) -> Result<Vec<KindCount>> {
    let mut stmt = conn.prepare(
        "SELECT kind, COUNT(*) FROM assets
         WHERE hidden = 0 AND (?1 IS NULL OR project_id = ?1)
         GROUP BY kind",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(KindCount {
            kind: AssetKind::parse(&r.get::<_, String>(0)?),
            count: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn list_tags(conn: &Connection, project_id: Option<i64>) -> Result<Vec<TagCount>> {
    let mut stmt = conn.prepare(
        "SELECT t.tag, COUNT(*) FROM tags t JOIN assets a ON a.id = t.asset_id
         WHERE (?1 IS NULL OR a.project_id = ?1)
         GROUP BY t.tag ORDER BY COUNT(*) DESC, t.tag",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(TagCount {
            tag: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn set_favorite(conn: &Connection, id: i64, favorite: bool) -> Result<()> {
    if favorite {
        conn.execute(
            "INSERT OR IGNORE INTO favorites (asset_id) VALUES (?1)",
            [id],
        )?;
    } else {
        conn.execute("DELETE FROM favorites WHERE asset_id = ?1", [id])?;
    }
    Ok(())
}

pub fn add_tag(conn: &Connection, id: i64, tag: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO tags (asset_id, tag) VALUES (?1, ?2)",
        params![id, tag],
    )?;
    Ok(())
}

pub fn remove_tag(conn: &Connection, id: i64, tag: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM tags WHERE asset_id = ?1 AND tag = ?2",
        params![id, tag],
    )?;
    Ok(())
}

pub fn set_ext_thumb(conn: &Connection, id: i64, mtime: i64) -> Result<()> {
    conn.execute(
        "UPDATE assets SET ext_thumb = ?2 WHERE id = ?1",
        params![id, mtime],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- sprite sheets

pub fn get_sheet(conn: &Connection, id: i64) -> Result<Option<SheetMeta>> {
    Ok(conn
        .query_row(
            "SELECT mode, cols, rows, frame_w, frame_h, fps, source_json FROM sheet_meta WHERE asset_id = ?1",
            [id],
            |r| {
                Ok(SheetMeta {
                    mode: SheetMode::parse(&r.get::<_, String>(0)?),
                    cols: r.get(1)?,
                    rows: r.get(2)?,
                    frame_w: r.get(3)?,
                    frame_h: r.get(4)?,
                    fps: r.get(5)?,
                    source_json: r.get(6)?,
                })
            },
        )
        .optional()?)
}

pub fn upsert_sheet(conn: &Connection, id: i64, m: &SheetMeta) -> Result<()> {
    conn.execute(
        "INSERT INTO sheet_meta (asset_id, mode, cols, rows, frame_w, frame_h, fps, source_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(asset_id) DO UPDATE SET
           mode = excluded.mode, cols = excluded.cols, rows = excluded.rows,
           frame_w = excluded.frame_w, frame_h = excluded.frame_h,
           fps = excluded.fps, source_json = excluded.source_json",
        params![
            id,
            m.mode.as_str(),
            m.cols,
            m.rows,
            m.frame_w,
            m.frame_h,
            m.fps,
            m.source_json
        ],
    )?;
    conn.execute("UPDATE assets SET kind = 'sheet' WHERE id = ?1", [id])?;
    Ok(())
}

pub fn clear_sheet(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM sheet_meta WHERE asset_id = ?1", [id])?;
    conn.execute(
        "UPDATE assets SET kind = 'image' WHERE id = ?1 AND kind = 'sheet'",
        [id],
    )?;
    Ok(())
}
