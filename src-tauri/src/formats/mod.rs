pub mod aseprite;
pub mod blend;
pub mod image;
pub mod model;
pub mod spritesheet;

pub fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "tga" => "image/x-tga",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "json" => "application/json",
        "obj" | "mtl" => "text/plain",
        "ktx2" => "image/ktx2",
        _ => "application/octet-stream",
    }
}
