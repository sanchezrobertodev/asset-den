/// What kind of asset a file is, decided by its extension alone.
pub fn kind_of(ext: &str) -> &'static str {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tga" | "psd" | "tif" | "tiff" | "ico" | "svg" => "image",
        "wav" | "ogg" | "mp3" | "flac" | "m4a" | "aac" | "opus" => "audio",
        "glb" | "gltf" | "obj" | "fbx" | "stl" => "model",
        "ttf" | "otf" | "woff" | "woff2" => "font",
        "mp4" | "webm" | "mov" | "m4v" => "video",
        "txt" | "md" | "json" | "csv" | "xml" | "yaml" | "yml" | "toml" | "ini" | "cfg" | "glsl" | "hlsl" | "frag"
        | "vert" | "shader" | "gdshader" | "wgsl" | "lua" | "cs" | "gd" | "tres" | "tscn" | "mtl" | "atlas" | "tmx"
        | "tsx" => "text",
        _ => "other",
    }
}

/// Image formats the backend decodes itself (for thumbnails, and for previews of formats the webview can't show).
pub fn decodable(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "tga" | "psd" | "tif" | "tiff" | "ico"
    )
}

/// Engine sidecar files, OS junk, hidden files and dependency folders are never indexed.
pub fn ignored_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.starts_with('.')
        || n.ends_with(".meta")
        || n.ends_with(".import")
        || n.ends_with(".uid")
        || matches!(n.as_str(), "thumbs.db" | "desktop.ini" | "node_modules")
}

/// True when any component of a `/`-separated relative path is ignored.
pub fn ignored_rel(rel: &str) -> bool {
    rel.split('/').any(ignored_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds() {
        assert_eq!(kind_of("png"), "image");
        assert_eq!(kind_of("ogg"), "audio");
        assert_eq!(kind_of("fbx"), "model");
        assert_eq!(kind_of("woff2"), "font");
        assert_eq!(kind_of("webm"), "video");
        assert_eq!(kind_of("gdshader"), "text");
        assert_eq!(kind_of("blend"), "other");
        assert!(decodable("tga") && decodable("psd") && !decodable("svg"));
    }

    #[test]
    fn ignores_sidecars_and_hidden() {
        assert!(ignored_name("hero.png.meta"));
        assert!(ignored_name("icon.svg.import"));
        assert!(ignored_name(".git"));
        assert!(ignored_name("Thumbs.db"));
        assert!(!ignored_name("hero.png"));
        assert!(ignored_rel("art/.cache/a.png"));
        assert!(!ignored_rel("art/sprites/a.png"));
    }
}
