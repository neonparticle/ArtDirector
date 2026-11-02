//! Folders of numbered frames (`0.png`, `1.png`, ...) are indexed as one `anim` asset
//! whose `rel_path` is the folder. The frames keep their own rows; queries hide them
//! behind the animation when frames are grouped.

use std::collections::{BTreeMap, HashMap};

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::Result;
use crate::formats::sequence::frame_index;

/// Bump when detection rules change so existing indexes are rebuilt at startup.
pub const SEQUENCE_REV: u32 = 1;

#[derive(Debug, Clone)]
pub struct FrameRow {
    pub dir: String,
    pub name: String,
    pub kind: String,
    pub size: i64,
    pub mtime: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Sequence {
    pub rel_path: String,
    pub dir: String,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub mtime: i64,
    pub width: i64,
    pub height: i64,
    pub frame_count: i64,
    pub hash: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SequenceStats {
    pub added: u32,
    pub updated: u32,
    pub removed: u32,
}

/// A folder is a sequence when it holds at least two images, every one of them named
/// only by digits, sharing one extension and one size. Folders that mix in other
/// images (`_0.gen.png`, `0-still.png`) are left alone: those tend to be variants or
/// growth stages rather than animation frames.
pub fn detect(rows: &[FrameRow]) -> Vec<Sequence> {
    let mut by_dir: BTreeMap<&str, Vec<&FrameRow>> = BTreeMap::new();
    for r in rows {
        by_dir.entry(&r.dir).or_default().push(r);
    }
    by_dir
        .into_iter()
        .filter(|(dir, _)| !dir.is_empty())
        .filter_map(|(dir, frames)| sequence_of(dir, frames))
        .collect()
}

fn sequence_of(dir: &str, mut frames: Vec<&FrameRow>) -> Option<Sequence> {
    if frames.len() < 2 || frames.iter().any(|f| f.kind != "image") {
        return None;
    }
    let mut indexed = Vec::with_capacity(frames.len());
    for f in frames.drain(..) {
        indexed.push((frame_index(&f.name)?, f));
    }
    indexed.sort_by_key(|(i, _)| *i);

    let first = indexed[0].1;
    let ext = first.name.rsplit_once('.')?.1.to_ascii_lowercase();
    let (width, height) = (first.width?, first.height?);
    let uniform = indexed.iter().all(|(_, f)| {
        f.width == Some(width)
            && f.height == Some(height)
            && f.name
                .rsplit_once('.')
                .is_some_and(|(_, x)| x.eq_ignore_ascii_case(&ext))
    });
    if !uniform {
        return None;
    }

    let hash = indexed
        .iter()
        .try_fold(blake3::Hasher::new(), |mut h, (_, f)| {
            h.update(f.hash.as_ref()?.as_bytes());
            h.update(b"\n");
            Some(h)
        })
        .map(|h| h.finalize().to_hex()[..32].to_string());
    let (parent, name) = match dir.rsplit_once('/') {
        Some((p, n)) => (p.to_string(), n.to_string()),
        None => (String::new(), dir.to_string()),
    };
    Some(Sequence {
        rel_path: dir.to_string(),
        dir: parent,
        name,
        ext,
        size: indexed.iter().map(|(_, f)| f.size).sum(),
        mtime: indexed.iter().map(|(_, f)| f.mtime).max()?,
        width,
        height,
        frame_count: indexed.len() as i64,
        hash,
    })
}

/// Recomputes a project's animations from its indexed images. Rows are upserted by
/// folder path, so an animation keeps its id (and its favorite, tags and frame rate)
/// across rescans.
pub fn rebuild(conn: &Connection, project_id: i64) -> Result<SequenceStats> {
    let rows: Vec<FrameRow> = {
        let mut stmt = conn.prepare(
            "SELECT dir, name, kind, size, mtime, width, height, hash FROM assets
             WHERE project_id = ?1 AND kind IN ('image', 'sheet')",
        )?;
        let rows = stmt.query_map([project_id], |r| {
            Ok(FrameRow {
                dir: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                size: r.get(3)?,
                mtime: r.get(4)?,
                width: r.get(5)?,
                height: r.get(6)?,
                hash: r.get(7)?,
            })
        })?;
        rows.collect::<rusqlite::Result<_>>()?
    };

    let mut existing: HashMap<String, Sequence> = {
        let mut stmt = conn.prepare(
            "SELECT rel_path, dir, name, ext, size, mtime, width, height, frame_count, hash
             FROM assets WHERE project_id = ?1 AND kind = 'anim'",
        )?;
        let rows = stmt.query_map([project_id], |r| {
            Ok(Sequence {
                rel_path: r.get(0)?,
                dir: r.get(1)?,
                name: r.get(2)?,
                ext: r.get(3)?,
                size: r.get(4)?,
                mtime: r.get(5)?,
                width: r.get::<_, Option<i64>>(6)?.unwrap_or(0),
                height: r.get::<_, Option<i64>>(7)?.unwrap_or(0),
                frame_count: r.get::<_, Option<i64>>(8)?.unwrap_or(0),
                hash: r.get(9)?,
            })
        })?;
        rows.map(|s| s.map(|s| (s.rel_path.clone(), s)))
            .collect::<rusqlite::Result<_>>()?
    };

    let mut stats = SequenceStats::default();
    let mut upsert = conn.prepare(
        "INSERT INTO assets (project_id, rel_path, dir, name, ext, kind, size, mtime, width, height, frame_count, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, 'anim', ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(project_id, rel_path) DO UPDATE SET
           dir = excluded.dir, name = excluded.name, ext = excluded.ext, kind = 'anim',
           size = excluded.size, mtime = excluded.mtime, width = excluded.width,
           height = excluded.height, frame_count = excluded.frame_count, hash = excluded.hash",
    )?;
    for seq in detect(&rows) {
        match existing.remove(&seq.rel_path) {
            Some(prev) if prev == seq => continue,
            Some(_) => stats.updated += 1,
            None => stats.added += 1,
        }
        upsert.execute(params![
            project_id,
            seq.rel_path,
            seq.dir,
            seq.name,
            seq.ext,
            seq.size,
            seq.mtime,
            seq.width,
            seq.height,
            seq.frame_count,
            seq.hash
        ])?;
    }

    let mut delete = conn
        .prepare("DELETE FROM assets WHERE project_id = ?1 AND rel_path = ?2 AND kind = 'anim'")?;
    for rel in existing.keys() {
        delete.execute(params![project_id, rel])?;
        stats.removed += 1;
    }
    Ok(stats)
}

/// Builds animations for every project once per [`SEQUENCE_REV`], so indexes made
/// before detection existed (or under older rules) pick them up without a rescan.
pub fn rebuild_all_if_stale(conn: &mut Connection) -> Result<()> {
    let current = SEQUENCE_REV.to_string();
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'sequence_rev'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if stored.as_deref() == Some(current.as_str()) {
        return Ok(());
    }
    let tx = conn.transaction()?;
    let ids: Vec<i64> = {
        let mut stmt = tx.prepare("SELECT id FROM projects")?;
        let ids = stmt.query_map([], |r| r.get(0))?;
        ids.collect::<rusqlite::Result<_>>()?
    };
    for id in ids {
        rebuild(&tx, id)?;
    }
    tx.execute(
        "INSERT INTO app_meta (key, value) VALUES ('sequence_rev', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [current],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(dir: &str, name: &str) -> FrameRow {
        FrameRow {
            dir: dir.into(),
            name: name.into(),
            kind: "image".into(),
            size: 10,
            mtime: 100,
            width: Some(56),
            height: Some(56),
            hash: Some(format!("{dir}/{name}")),
        }
    }

    #[test]
    fn groups_numbered_frames_by_folder() {
        let mut rows: Vec<_> = (0..6)
            .map(|i| frame("sprites/ankou/attack/east", &format!("{i}.png")))
            .collect();
        rows[4].mtime = 900;
        rows.push(frame("sprites/ankou/attack", "preview.png"));

        let seqs = detect(&rows);
        assert_eq!(seqs.len(), 1);
        let s = &seqs[0];
        assert_eq!(s.rel_path, "sprites/ankou/attack/east");
        assert_eq!(
            (s.dir.as_str(), s.name.as_str()),
            ("sprites/ankou/attack", "east")
        );
        assert_eq!((s.width, s.height, s.frame_count), (56, 56, 6));
        assert_eq!((s.size, s.mtime), (60, 900));
        assert_eq!(s.ext, "png");
        assert!(s.hash.is_some());
    }

    #[test]
    fn identical_copies_share_a_hash() {
        let a: Vec<_> = (0..3)
            .map(|i| frame("public/walk", &format!("{i}.png")))
            .collect();
        let b: Vec<_> = a
            .iter()
            .map(|f| FrameRow {
                dir: "dist/walk".into(),
                ..f.clone()
            })
            .collect();
        let seqs = detect(&[a, b].concat());
        assert_eq!(seqs.len(), 2);
        assert_eq!(seqs[0].hash, seqs[1].hash);

        let mut unhashed: Vec<_> = (0..3).map(|i| frame("x", &format!("{i}.png"))).collect();
        unhashed[1].hash = None;
        assert_eq!(detect(&unhashed)[0].hash, None);
    }

    #[test]
    fn rejects_folders_that_are_not_clean_sequences() {
        let single = vec![frame("a", "0.png")];
        let mixed = vec![
            frame("b", "0.png"),
            frame("b", "1.png"),
            frame("b", "_0.gen.png"),
        ];
        let mut sized = vec![frame("c", "0.png"), frame("c", "1.png")];
        sized[1].width = Some(32);
        let exts = vec![frame("d", "0.png"), frame("d", "1.webp")];
        let mut sheet = vec![frame("e", "0.png"), frame("e", "1.png")];
        sheet[0].kind = "sheet".into();
        let root = vec![frame("", "0.png"), frame("", "1.png")];
        let mut dimless = vec![frame("f", "0.png"), frame("f", "1.png")];
        dimless[0].width = None;
        dimless[1].width = None;

        for rows in [single, mixed, sized, exts, sheet, root, dimless] {
            assert!(detect(&rows).is_empty(), "{:?}", rows[0].dir);
        }
    }

    #[test]
    fn rebuild_keeps_ids_and_drops_stale_sequences() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../index/schema.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root, added_at) VALUES (1, 'p', '/p', 0)",
            [],
        )
        .unwrap();
        let add = |conn: &Connection, rel: &str| {
            let (dir, name) = rel.rsplit_once('/').unwrap();
            conn.execute(
                "INSERT INTO assets (project_id, rel_path, dir, name, ext, kind, size, mtime, width, height, hash)
                 VALUES (1, ?1, ?2, ?3, 'png', 'image', 10, 100, 8, 8, ?1)",
                params![rel, dir, name],
            )
            .unwrap();
        };
        for rel in ["walk/0.png", "walk/1.png", "idle/0.png", "idle/1.png"] {
            add(&conn, rel);
        }

        let first = rebuild(&conn, 1).unwrap();
        assert_eq!((first.added, first.updated, first.removed), (2, 0, 0));
        let walk_id: i64 = conn
            .query_row("SELECT id FROM assets WHERE rel_path = 'walk'", [], |r| {
                r.get(0)
            })
            .unwrap();

        add(&conn, "walk/2.png");
        conn.execute("DELETE FROM assets WHERE rel_path = 'idle/1.png'", [])
            .unwrap();
        let second = rebuild(&conn, 1).unwrap();
        assert_eq!((second.added, second.updated, second.removed), (0, 1, 1));
        let (id, frames): (i64, i64) = conn
            .query_row(
                "SELECT id, frame_count FROM assets WHERE rel_path = 'walk' AND kind = 'anim'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((id, frames), (walk_id, 3));

        let unchanged = rebuild(&conn, 1).unwrap();
        assert_eq!(
            (unchanged.added, unchanged.updated, unchanged.removed),
            (0, 0, 0)
        );

        conn.execute("DELETE FROM app_meta", []).unwrap();
        rebuild_all_if_stale(&mut conn).unwrap();
        let rev: String = conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'sequence_rev'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rev, SEQUENCE_REV.to_string());
    }
}
