//! `ad://` URI scheme. Routes:
//!   /thumb/<id>            cached thumbnail (generated on demand)
//!   /file/<id>             original file bytes
//!   /rel/<id>/<path...>    a file relative to the asset's folder (glTF buffers, textures)
//!   /derived/<id>/strip    Aseprite frame strip (PNG)
//!   /derived/<id>/glb      `.blend` exported to GLB

use std::path::{Component, Path, PathBuf};

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::error::{Error, Result};
use crate::formats::{self, aseprite, blend};
use crate::index::{abs_path, queries};
use crate::state::AppState;
use crate::thumbs::{cache, pipeline};

pub const SCHEME: &str = "ad";

type Resp = Response<Vec<u8>>;

/// Routes that decode or resize images run on the bounded thumbnail pool;
/// plain file reads can go straight to the blocking runtime.
pub fn is_heavy(req: &Request<Vec<u8>>) -> bool {
    let p = req.uri().path();
    p.starts_with("/thumb/") || p.starts_with("/derived/")
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, req: &Request<Vec<u8>>) -> Resp {
    match route(app, req) {
        Ok(resp) => resp,
        Err(Error::NotFound(m)) => text(StatusCode::NOT_FOUND, &m),
        Err(e) => {
            log::warn!("{} -> {e}", req.uri());
            text(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
        }
    }
}

fn route<R: Runtime>(app: &AppHandle<R>, req: &Request<Vec<u8>>) -> Result<Resp> {
    let state = app.state::<AppState>();
    let path = percent_decode(req.uri().path());
    let mut parts = path.trim_start_matches('/').splitn(3, '/');
    let route = parts.next().unwrap_or_default();
    let id: i64 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| Error::NotFound("missing asset id".into()))?;
    let rest = parts.next().unwrap_or_default();

    let row = {
        let conn = state.db.get()?;
        queries::get_asset_row(&conn, id)?
    };

    match route {
        "thumb" => {
            let size = state.settings().thumb_size();
            match pipeline::thumb_for(&state.cache_dir, &row, size)? {
                pipeline::Thumb::File(p) => serve(&p, "image/webp"),
                pipeline::Thumb::Original => serve(&row.path(), formats::mime_for_ext(&row.ext)),
                pipeline::Thumb::Unavailable => Err(Error::NotFound("no thumbnail".into())),
            }
        }
        "file" => serve(&row.path(), formats::mime_for_ext(&row.ext)),
        "rel" => {
            let root = PathBuf::from(&row.root);
            let base = row
                .path()
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| root.clone());
            let target = safe_join(&base, rest)?;
            let canon_root = dunce(&root)?;
            let canon = dunce(&target)?;
            if !canon.starts_with(&canon_root) {
                return Err(Error::NotFound("outside project".into()));
            }
            let ext = target
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            serve(&canon, formats::mime_for_ext(&ext))
        }
        "derived" => match rest {
            "strip" => {
                let key = cache::key(&row, "strip");
                let out = cache::derived_path(&state.cache_dir, &key, "png");
                if !out.exists() {
                    let strip = aseprite::render_strip(&row.path())?;
                    cache::write_atomic(&out, &pipeline::encode_png(&strip)?)?;
                }
                serve(&out, "image/png")
            }
            "glb" => {
                let out = blend::glb_path(&state.cache_dir, &row);
                if !out.exists() {
                    return Err(Error::NotFound("not exported yet".into()));
                }
                serve(&out, "model/gltf-binary")
            }
            other => Err(Error::NotFound(format!("unknown derived kind {other}"))),
        },
        other => Err(Error::NotFound(format!("unknown route {other}"))),
    }
}

fn safe_join(base: &Path, rel: &str) -> Result<PathBuf> {
    let rel = Path::new(rel);
    if rel
        .components()
        .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(Error::NotFound("invalid relative path".into()));
    }
    Ok(abs_path(
        &base.to_string_lossy(),
        &rel.to_string_lossy().replace('\\', "/"),
    ))
}

/// Canonicalizes without the Windows `\\?\` prefix so prefix checks stay comparable.
fn dunce(p: &Path) -> Result<PathBuf> {
    let c = std::fs::canonicalize(p).map_err(|_| Error::NotFound(p.display().to_string()))?;
    let s = c.to_string_lossy();
    Ok(match s.strip_prefix(r"\\?\") {
        Some(stripped) if !stripped.starts_with("UNC") => PathBuf::from(stripped),
        _ => c,
    })
}

fn serve(path: &Path, mime: &str) -> Result<Resp> {
    let bytes = std::fs::read(path).map_err(|_| Error::NotFound(path.display().to_string()))?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(bytes)
        .expect("valid response"))
}

fn text(status: StatusCode, msg: &str) -> Resp {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(msg.as_bytes().to_vec())
        .expect("valid response")
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_nested_relative_paths() {
        let base = Path::new(r"C:\proj\models");
        assert_eq!(
            safe_join(base, "scene.bin").unwrap(),
            base.join("scene.bin")
        );
        assert_eq!(
            safe_join(base, "textures/wood.png").unwrap(),
            base.join("textures").join("wood.png")
        );
        assert_eq!(safe_join(base, "./a.png").unwrap(), base.join("a.png"));
    }

    #[test]
    fn safe_join_rejects_escapes() {
        let base = Path::new(r"C:\proj\models");
        for rel in [
            "../secret.txt",
            "textures/../../x",
            r"..\x",
            "/etc/passwd",
            r"C:\Windows\win.ini",
            "C:/x",
        ] {
            assert!(safe_join(base, rel).is_err(), "{rel} should be rejected");
        }
    }

    #[test]
    fn percent_decode_handles_escapes_and_garbage() {
        assert_eq!(percent_decode("my%20model.gltf"), "my model.gltf");
        assert_eq!(percent_decode("caf%C3%A9.png"), "café.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz.png"), "%zz.png");
        assert_eq!(percent_decode("a%2"), "a%2");
    }
}
