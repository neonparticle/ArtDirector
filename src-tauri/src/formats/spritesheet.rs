use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use specta::Type;

use crate::error::Result;
use crate::index::queries::{SheetMeta, SheetMode};

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetFrame {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    /// Where the (possibly trimmed) rect sits inside the untrimmed source frame.
    pub offset_x: u32,
    pub offset_y: u32,
    pub source_w: u32,
    pub source_h: u32,
    pub duration: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetTag {
    pub name: String,
    pub from: u32,
    pub to: u32,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SheetInfo {
    pub meta: Option<SheetMeta>,
    pub frames: Vec<SheetFrame>,
    pub tags: Vec<SheetTag>,
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Recognizes Aseprite "Export Sprite Sheet" JSON, TexturePacker-style atlases, and
/// compact atlases whose frames are `[x, y, w, h, offsetX?, offsetY?]` arrays.
pub fn detect(json_path: &Path) -> Option<SheetMeta> {
    let json = read_json(json_path)?;
    let (frames, _) = parse(&json);
    let first = frames.first()?;
    let app = json
        .pointer("/meta/app")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mode = if app.contains("aseprite") {
        SheetMode::AsepriteJson
    } else {
        SheetMode::TexturepackerJson
    };
    Some(SheetMeta {
        mode,
        cols: None,
        rows: None,
        frame_w: Some(first.source_w as i64),
        frame_h: Some(first.source_h as i64),
        fps: 8.0,
        source_json: None,
    })
}

fn canvas_size(json: &Value) -> Option<(u32, u32)> {
    let canvas = json.get("canvas")?;
    if let Some(s) = canvas.as_u64() {
        return Some((s as u32, s as u32));
    }
    let n = |k: &str| canvas.get(k).and_then(Value::as_u64).map(|x| x as u32);
    Some((n("w")?, n("h")?))
}

fn parse_frame(v: &Value, canvas: Option<(u32, u32)>) -> Option<SheetFrame> {
    if let Value::Array(a) = v {
        let n: Vec<u32> = a
            .iter()
            .map(|x| x.as_u64().map(|x| x as u32))
            .collect::<Option<_>>()?;
        let [x, y, w, h, ..] = n[..] else { return None };
        let offset_x = n.get(4).copied().unwrap_or(0);
        let offset_y = n.get(5).copied().unwrap_or(0);
        let (source_w, source_h) = canvas.unwrap_or((offset_x + w, offset_y + h));
        return Some(SheetFrame {
            x,
            y,
            w,
            h,
            offset_x,
            offset_y,
            source_w,
            source_h,
            duration: None,
        });
    }

    let n = |o: Option<&Value>, k: &str| o?.get(k).and_then(Value::as_u64).map(|x| x as u32);
    let rect = v.get("frame");
    let (w, h) = (n(rect, "w")?, n(rect, "h")?);
    let trim = v.get("spriteSourceSize");
    let source = v.get("sourceSize");
    Some(SheetFrame {
        x: n(rect, "x")?,
        y: n(rect, "y")?,
        w,
        h,
        offset_x: n(trim, "x").unwrap_or(0),
        offset_y: n(trim, "y").unwrap_or(0),
        source_w: n(source, "w").unwrap_or(w),
        source_h: n(source, "h").unwrap_or(h),
        duration: v.get("duration").and_then(Value::as_u64).map(|d| d as u32),
    })
}

/// Splits a frame name into its animation and frame index: the last run of digits is the
/// index, the rest (minus extension and dangling separators) names the animation.
/// `walk/e/3` -> (`walk/e`, 3), `death/e/0/front` -> (`death/e/front`, 0), `run_12.png` -> (`run`, 12).
fn split_name(name: &str) -> (String, Option<u32>) {
    let stem = match name.rsplit_once('.') {
        Some((stem, ext)) if !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphabetic()) => {
            stem
        }
        _ => name,
    };
    let bytes = stem.as_bytes();
    let Some(end) = bytes.iter().rposition(u8::is_ascii_digit).map(|i| i + 1) else {
        return (stem.to_string(), None);
    };
    let start = bytes[..end]
        .iter()
        .rposition(|b| !b.is_ascii_digit())
        .map_or(0, |i| i + 1);
    let index = stem[start..end].parse().ok();
    let is_sep = |c: char| matches!(c, '/' | '_' | '-' | ' ' | '.');
    let head = stem[..start].trim_end_matches(is_sep);
    let tail = stem[end..].trim_start_matches(is_sep);
    let tag = match (head.is_empty(), tail.is_empty()) {
        (false, false) => format!("{head}/{tail}"),
        (false, true) => head.to_string(),
        _ => tail.to_string(),
    };
    (tag, index)
}

fn parse(json: &Value) -> (Vec<SheetFrame>, Vec<SheetTag>) {
    let canvas = canvas_size(json);
    let named: Vec<(String, SheetFrame)> = match json.get("frames") {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|v| {
                let name = v
                    .get("filename")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                Some((name.to_string(), parse_frame(v, canvas)?))
            })
            .collect(),
        Some(Value::Object(m)) => m
            .iter()
            .filter_map(|(k, v)| Some((k.clone(), parse_frame(v, canvas)?)))
            .collect(),
        _ => Vec::new(),
    };

    if let Some(tags) = json.pointer("/meta/frameTags").and_then(Value::as_array) {
        let tags = tags
            .iter()
            .filter_map(|t| {
                Some(SheetTag {
                    name: t.get("name")?.as_str()?.to_string(),
                    from: t.get("from")?.as_u64()? as u32,
                    to: t.get("to")?.as_u64()? as u32,
                    direction: t
                        .get("direction")
                        .and_then(Value::as_str)
                        .unwrap_or("forward")
                        .to_string(),
                })
            })
            .collect();
        return (named.into_iter().map(|(_, f)| f).collect(), tags);
    }

    let mut keyed: Vec<(String, Option<u32>, SheetFrame)> = named
        .into_iter()
        .map(|(name, f)| {
            let (tag, index) = split_name(&name);
            (tag, index, f)
        })
        .collect();
    keyed.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    // Compact atlases list playback rates per animation, keyed by the first name segment.
    let fps_of = |tag: &str| {
        let anim = tag.split('/').next()?;
        json.pointer(&format!("/anims/{anim}/fps"))?
            .as_f64()
            .filter(|f| *f > 0.0)
    };

    let mut tags: Vec<SheetTag> = Vec::new();
    let mut frames = Vec::with_capacity(keyed.len());
    for (i, (tag, _, mut frame)) in keyed.into_iter().enumerate() {
        if frame.duration.is_none() {
            frame.duration = fps_of(&tag).map(|fps| (1000.0 / fps).round() as u32);
        }
        frames.push(frame);
        let i = i as u32;
        match tags.last_mut() {
            Some(last) if last.name == tag => last.to = i,
            _ => tags.push(SheetTag {
                name: tag,
                from: i,
                to: i,
                direction: "forward".into(),
            }),
        }
    }
    if tags.len() == frames.len() {
        tags.clear();
    }
    (frames, tags)
}

pub fn info(
    json_path: Option<&Path>,
    meta: Option<SheetMeta>,
    image_w: u32,
    image_h: u32,
) -> Result<SheetInfo> {
    if let Some(json) = json_path.and_then(read_json) {
        let (frames, tags) = parse(&json);
        return Ok(SheetInfo { meta, frames, tags });
    }

    let frames = match &meta {
        Some(m) => grid_frames(m, image_w, image_h),
        None => Vec::new(),
    };
    Ok(SheetInfo {
        meta,
        frames,
        tags: Vec::new(),
    })
}

fn grid_frames(m: &SheetMeta, image_w: u32, image_h: u32) -> Vec<SheetFrame> {
    let (fw, fh, cols, rows) = match (m.frame_w, m.frame_h, m.cols, m.rows) {
        (Some(fw), Some(fh), _, _) if fw > 0 && fh > 0 => (
            fw as u32,
            fh as u32,
            image_w / fw as u32,
            image_h / fh as u32,
        ),
        (_, _, Some(c), Some(r)) if c > 0 && r > 0 => {
            (image_w / c as u32, image_h / r as u32, c as u32, r as u32)
        }
        _ => return Vec::new(),
    };
    let mut frames = Vec::with_capacity((cols * rows) as usize);
    for r in 0..rows {
        for c in 0..cols {
            frames.push(SheetFrame {
                x: c * fw,
                y: r * fh,
                w: fw,
                h: fh,
                offset_x: 0,
                offset_y: 0,
                source_w: fw,
                source_h: fh,
                duration: None,
            });
        }
    }
    frames
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn splits_frame_names() {
        assert_eq!(split_name("walk/e/3"), ("walk/e".into(), Some(3)));
        assert_eq!(
            split_name("death/e/0/front"),
            ("death/e/front".into(), Some(0))
        );
        assert_eq!(split_name("run_12.png"), ("run".into(), Some(12)));
        assert_eq!(split_name("hero 7.aseprite"), ("hero".into(), Some(7)));
        assert_eq!(split_name("idle"), ("idle".into(), None));
    }

    #[test]
    fn parses_compact_atlas() {
        let json = json!({
            "canvas": 128,
            "anims": { "walk": { "frames": 3, "fps": 10 }, "idle": { "frames": 1, "fps": 4 } },
            "frames": {
                "walk/e/10": [30, 0, 10, 20, 50, 40],
                "walk/e/2": [20, 0, 10, 20, 51, 41],
                "walk/e/0": [0, 0, 10, 20, 52, 42],
                "idle/e/0": [40, 0, 12, 22]
            }
        });
        let (frames, tags) = parse(&json);
        let names: Vec<_> = tags
            .iter()
            .map(|t| (t.name.as_str(), t.from, t.to))
            .collect();
        assert_eq!(names, [("idle/e", 0, 0), ("walk/e", 1, 3)]);

        let walk: Vec<_> = frames[1..].iter().map(|f| f.x).collect();
        assert_eq!(
            walk,
            [0, 20, 30],
            "frames sort by numeric index, not lexically"
        );

        let f = &frames[1];
        assert_eq!(
            (f.offset_x, f.offset_y, f.source_w, f.source_h),
            (52, 42, 128, 128)
        );
        assert_eq!(f.duration, Some(100));
        assert_eq!(frames[0].duration, Some(250));
        assert_eq!((frames[0].offset_x, frames[0].offset_y), (0, 0));
    }

    #[test]
    fn groups_layered_frames_by_suffix() {
        let json = json!({
            "canvas": 64,
            "frames": {
                "slash/e/0/back": [0, 0, 4, 4],
                "slash/e/0/front": [4, 0, 4, 4],
                "slash/e/1/back": [8, 0, 4, 4],
                "slash/e/1/front": [12, 0, 4, 4]
            }
        });
        let (_, tags) = parse(&json);
        let names: Vec<_> = tags
            .iter()
            .map(|t| (t.name.as_str(), t.from, t.to))
            .collect();
        assert_eq!(names, [("slash/e/back", 0, 1), ("slash/e/front", 2, 3)]);
    }

    #[test]
    fn parses_texturepacker_trimmed_frames() {
        let json = json!({
            "frames": [
                {
                    "filename": "run_1.png",
                    "frame": { "x": 32, "y": 0, "w": 20, "h": 30 },
                    "spriteSourceSize": { "x": 6, "y": 2, "w": 20, "h": 30 },
                    "sourceSize": { "w": 32, "h": 32 }
                },
                {
                    "filename": "run_0.png",
                    "frame": { "x": 0, "y": 0, "w": 32, "h": 32 },
                    "duration": 80
                }
            ],
            "meta": { "app": "https://www.codeandweb.com/texturepacker" }
        });
        let (frames, tags) = parse(&json);
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].duration, Some(80));
        assert_eq!((frames[0].source_w, frames[0].source_h), (32, 32));
        let trimmed = &frames[1];
        assert_eq!((trimmed.offset_x, trimmed.offset_y), (6, 2));
        assert_eq!((trimmed.source_w, trimmed.source_h), (32, 32));
        assert_eq!(tags.len(), 1);
        assert_eq!(
            (tags[0].name.as_str(), tags[0].from, tags[0].to),
            ("run", 0, 1)
        );
    }

    #[test]
    fn keeps_aseprite_order_and_tags() {
        let json = json!({
            "frames": [
                { "filename": "b 1", "frame": { "x": 16, "y": 0, "w": 16, "h": 16 }, "duration": 100 },
                { "filename": "a 0", "frame": { "x": 0, "y": 0, "w": 16, "h": 16 }, "duration": 100 }
            ],
            "meta": {
                "app": "https://www.aseprite.org/",
                "frameTags": [{ "name": "Idle", "from": 0, "to": 1, "direction": "pingpong" }]
            }
        });
        let (frames, tags) = parse(&json);
        assert_eq!(frames[0].x, 16, "frameTags index the exported order");
        assert_eq!(tags[0].name, "Idle");
        assert_eq!(tags[0].direction, "pingpong");
    }

    #[test]
    fn rejects_json_without_parseable_frames() {
        let dir = std::env::temp_dir().join(format!("ad-sheet-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("props.json");
        std::fs::write(&path, r#"{"frames": {"a": "nope"}, "birch": [1, 2]}"#).unwrap();
        assert!(detect(&path).is_none());
        std::fs::write(&path, r#"{"canvas": 64, "frames": {"a/0": [0, 0, 8, 8]}}"#).unwrap();
        let meta = detect(&path).expect("compact atlas detected");
        assert_eq!((meta.frame_w, meta.frame_h), (Some(64), Some(64)));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
