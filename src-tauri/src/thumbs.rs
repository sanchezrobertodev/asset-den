//! Thumbnails and full-size previews, cached as PNGs in the app cache. Source files are only read.

use std::path::{Path, PathBuf};

use image::{DynamicImage, RgbaImage};

pub const THUMB_SIZE: u32 = 256;
const PREVIEW_MAX: u32 = 4096;

/// Cache file name for a given version of a file: changes when the file does.
pub fn cache_name(path: &str, size: i64, mtime: i64) -> String {
    let h = blake3::hash(format!("{path}|{size}|{mtime}").as_bytes());
    format!("{}.png", &h.to_hex()[..32])
}

fn decode(path: &Path, ext: &str) -> Result<DynamicImage, String> {
    if ext == "psd" {
        // shortcut: uses the flattened composite only, so some layered/16-bit files fail and show an icon instead.
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        let psd = psd::Psd::from_bytes(&bytes).map_err(|e| e.to_string())?;
        let img = RgbaImage::from_raw(psd.width(), psd.height(), psd.rgba()).ok_or("PSD has an unexpected size")?;
        return Ok(DynamicImage::ImageRgba8(img));
    }
    image::open(path).map_err(|e| e.to_string())
}

/// Writes a PNG of at most `max` px on its long side to `out`, unless it's already cached.
fn render(src: &Path, ext: &str, out: &Path, max: u32) -> Result<PathBuf, String> {
    if out.exists() {
        return Ok(out.to_path_buf());
    }
    let img = decode(src, ext)?;
    let img = if img.width() > max || img.height() > max {
        img.thumbnail(max, max)
    } else {
        img
    };
    // Write to a temp name first so a half-written file is never served.
    let tmp = out.with_extension("tmp");
    img.save_with_format(&tmp, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, out).map_err(|e| e.to_string())?;
    Ok(out.to_path_buf())
}

pub fn thumbnail(src: &Path, ext: &str, out: &Path) -> Result<PathBuf, String> {
    render(src, ext, out, THUMB_SIZE)
}

pub fn preview(src: &Path, ext: &str, out: &Path) -> Result<PathBuf, String> {
    render(src, ext, out, PREVIEW_MAX)
}

/// Stores a thumbnail rendered by the frontend (3D models), after checking it really is a small PNG.
pub fn save_png(bytes: &[u8], out: &Path) -> Result<(), String> {
    let img = image::load_from_memory_with_format(bytes, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    if img.width() > THUMB_SIZE * 2 || img.height() > THUMB_SIZE * 2 {
        return Err("Thumbnail is too large".into());
    }
    std::fs::write(out, bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnails_are_cached_and_bounded() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("big.tga");
        RgbaImage::new(1024, 512).save(&src).unwrap();
        let out = dir.path().join(cache_name("big.tga", 1, 2));
        thumbnail(&src, "tga", &out).unwrap();
        let t = image::open(&out).unwrap();
        assert_eq!((t.width(), t.height()), (256, 128));
        assert_ne!(cache_name("a", 1, 2), cache_name("a", 1, 3));
        assert!(save_png(b"not a png", &dir.path().join("x.png")).is_err());
    }
}
