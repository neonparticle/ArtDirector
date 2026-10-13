use serde::{Deserialize, Serialize};
use specta::Type;

pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "tga"];
pub const ASEPRITE_EXTS: &[&str] = &["ase", "aseprite"];
pub const MODEL_EXTS: &[&str] = &["glb", "gltf", "obj", "fbx"];
pub const BLEND_EXTS: &[&str] = &["blend"];
pub const SOURCE_EXTS: &[&str] = &["psd", "afphoto", "kra", "xcf"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    Image,
    Aseprite,
    Sheet,
    Model,
    Blend,
    Source,
}

impl AssetKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Aseprite => "aseprite",
            Self::Sheet => "sheet",
            Self::Model => "model",
            Self::Blend => "blend",
            Self::Source => "source",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "aseprite" => Self::Aseprite,
            "sheet" => Self::Sheet,
            "model" => Self::Model,
            "blend" => Self::Blend,
            "source" => Self::Source,
            _ => Self::Image,
        }
    }

    pub fn from_ext(ext: &str) -> Option<Self> {
        let ext = ext.to_ascii_lowercase();
        let e = ext.as_str();
        if IMAGE_EXTS.contains(&e) {
            Some(Self::Image)
        } else if ASEPRITE_EXTS.contains(&e) {
            Some(Self::Aseprite)
        } else if MODEL_EXTS.contains(&e) {
            Some(Self::Model)
        } else if BLEND_EXTS.contains(&e) {
            Some(Self::Blend)
        } else if SOURCE_EXTS.contains(&e) {
            Some(Self::Source)
        } else {
            None
        }
    }

    /// Whether `/thumb/<id>` will produce an image. Raster kinds are generated on demand;
    /// 3D kinds need a thumbnail captured by the frontend for the current file version.
    pub fn thumb_ready(self, mtime: i64, ext_thumb: Option<i64>) -> bool {
        match self {
            Self::Image | Self::Sheet | Self::Aseprite => true,
            Self::Model | Self::Blend => ext_thumb == Some(mtime),
            Self::Source => false,
        }
    }
}

pub fn ext_of(path: &std::path::Path) -> Option<String> {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
}

pub fn is_supported(path: &std::path::Path) -> bool {
    ext_of(path).is_some_and(|e| AssetKind::from_ext(&e).is_some())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn maps_extensions_to_kinds() {
        assert_eq!(AssetKind::from_ext("PNG"), Some(AssetKind::Image));
        assert_eq!(AssetKind::from_ext("tga"), Some(AssetKind::Image));
        assert_eq!(AssetKind::from_ext("aseprite"), Some(AssetKind::Aseprite));
        assert_eq!(AssetKind::from_ext("glb"), Some(AssetKind::Model));
        assert_eq!(AssetKind::from_ext("blend"), Some(AssetKind::Blend));
        assert_eq!(AssetKind::from_ext("psd"), Some(AssetKind::Source));
        assert_eq!(AssetKind::from_ext("json"), None);
        assert_eq!(AssetKind::from_ext("blend1"), None);
    }

    #[test]
    fn detects_supported_paths() {
        assert!(is_supported(Path::new("art/Hero.Walk.PNG")));
        assert!(!is_supported(Path::new("art/hero.json")));
        assert!(!is_supported(Path::new("art/README")));
    }

    #[test]
    fn kind_round_trips_through_strings() {
        for kind in [
            AssetKind::Image,
            AssetKind::Aseprite,
            AssetKind::Sheet,
            AssetKind::Model,
            AssetKind::Blend,
            AssetKind::Source,
        ] {
            assert_eq!(AssetKind::parse(kind.as_str()), kind);
        }
    }

    #[test]
    fn thumb_ready_requires_capture_for_current_version_of_3d_files() {
        assert!(AssetKind::Image.thumb_ready(5, None));
        assert!(AssetKind::Aseprite.thumb_ready(5, None));
        assert!(!AssetKind::Model.thumb_ready(5, None));
        assert!(!AssetKind::Blend.thumb_ready(5, Some(4)));
        assert!(AssetKind::Blend.thumb_ready(5, Some(5)));
        assert!(!AssetKind::Source.thumb_ready(5, Some(5)));
    }
}
