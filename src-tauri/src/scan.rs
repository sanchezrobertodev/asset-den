//! Keeps the `assets` table in step with the files under a root. Only ever reads the files.

use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::{Connection, OptionalExtension, Result, params};
use walkdir::WalkDir;

use crate::kind::{ignored_name, ignored_rel, kind_of};

/// `path` relative to `root`, with `/` separators. None when it's outside the root or ignored.
pub fn rel_of(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    if parts.is_empty() {
        return None;
    }
    let rel = parts.join("/");
    (!ignored_rel(&rel)).then_some(rel)
}

fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

/// Width and height from the file header, without decoding pixels.
fn dimensions(path: &Path, ext: &str) -> Option<(u32, u32)> {
    match ext {
        // PSD header: signature(4) version(2) reserved(6) channels(2) height(4) width(4)
        "psd" => {
            let mut h = [0u8; 22];
            std::fs::File::open(path).ok()?.read_exact(&mut h).ok()?;
            (&h[..4] == b"8BPS").then(|| {
                let be = |b: &[u8]| u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
                (be(&h[18..22]), be(&h[14..18]))
            })
        }
        e if crate::kind::decodable(e) => image::image_dimensions(path).ok(),
        _ => None,
    }
}

/// Inserts or refreshes one file's row; returns false if it isn't an indexable file.
/// Unchanged files keep their hash and skip the header read.
pub fn upsert_file(conn: &Connection, root_id: i64, root: &Path, path: &Path, seen: i64) -> Result<bool> {
    let Some(rel) = rel_of(root, path) else {
        return Ok(false);
    };
    let Ok(meta) = std::fs::metadata(path) else {
        return Ok(false);
    };
    if !meta.is_file() {
        return Ok(false);
    }
    let size = meta.len() as i64;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64);

    let prev: Option<(i64, i64)> = conn
        .query_row(
            "SELECT size, mtime FROM assets WHERE root_id = ?1 AND rel_path = ?2",
            params![root_id, rel],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if prev == Some((size, mtime)) {
        conn.execute(
            "UPDATE assets SET seen = ?3 WHERE root_id = ?1 AND rel_path = ?2",
            params![root_id, rel, seen],
        )?;
        return Ok(true);
    }

    let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
    let ext = ext_of(&name);
    let kind = kind_of(&ext);
    let dims = if kind == "image" { dimensions(path, &ext) } else { None };
    conn.execute(
        "INSERT INTO assets (root_id, rel_path, name, ext, kind, size, mtime, width, height, seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT (root_id, rel_path) DO UPDATE SET
           name = excluded.name, ext = excluded.ext, kind = excluded.kind, size = excluded.size,
           mtime = excluded.mtime, width = excluded.width, height = excluded.height, seen = excluded.seen,
           hash = NULL",
        params![
            root_id,
            rel,
            name,
            ext,
            kind,
            size,
            mtime,
            dims.map(|d| d.0),
            dims.map(|d| d.1),
            seen
        ],
    )?;
    Ok(true)
}

fn walk(dir: &Path) -> impl Iterator<Item = std::path::PathBuf> {
    WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !ignored_name(&e.file_name().to_string_lossy()))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
}

/// Full rescan of a root: upserts every file, then drops rows for files that are gone.
pub fn scan_root(conn: &mut Connection, root_id: i64, root: &Path, mut progress: impl FnMut(usize)) -> Result<usize> {
    let seen = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(1, |d| d.as_nanos() as i64);
    let tx = conn.transaction()?;
    let mut count = 0;
    for path in walk(root) {
        if upsert_file(&tx, root_id, root, &path, seen)? {
            count += 1;
            if count % 500 == 0 {
                progress(count);
            }
        }
    }
    tx.execute(
        "DELETE FROM assets WHERE root_id = ?1 AND seen != ?2",
        params![root_id, seen],
    )?;
    tx.commit()?;
    progress(count);
    Ok(count)
}

/// Syncs one path after a change event: a file, a whole folder, or something that's gone.
pub fn refresh_path(conn: &Connection, root_id: i64, root: &Path, path: &Path) -> Result<()> {
    let Some(rel) = rel_of(root, path) else { return Ok(()) };
    if path.is_dir() {
        for f in walk(path) {
            upsert_file(conn, root_id, root, &f, 0)?;
        }
    } else if path.is_file() {
        upsert_file(conn, root_id, root, path, 0)?;
    } else {
        conn.execute(
            "DELETE FROM assets WHERE root_id = ?1 AND (rel_path = ?2 OR substr(rel_path, 1, length(?2) + 1) = ?2 || '/')",
            params![root_id, rel],
        )?;
    }
    Ok(())
}

/// Moves rows in place so a renamed file or folder keeps its tags, favorite and collections.
pub fn rename_path(conn: &Connection, root_id: i64, root: &Path, from: &Path, to: &Path) -> Result<()> {
    let (Some(from_rel), Some(to_rel)) = (rel_of(root, from), rel_of(root, to)) else {
        // Moved in or out of the root (or to/from an ignored place): treat as delete + add.
        refresh_path(conn, root_id, root, from)?;
        return refresh_path(conn, root_id, root, to);
    };
    // Anything the move overwrote is replaced.
    conn.execute(
        "DELETE FROM assets WHERE root_id = ?1 AND (rel_path = ?2 OR substr(rel_path, 1, length(?2) + 1) = ?2 || '/')",
        params![root_id, to_rel],
    )?;
    conn.execute(
        "UPDATE assets SET rel_path = ?3 || substr(rel_path, length(?2) + 1)
         WHERE root_id = ?1 AND (rel_path = ?2 OR substr(rel_path, 1, length(?2) + 1) = ?2 || '/')",
        params![root_id, from_rel, to_rel],
    )?;
    // Names, extensions and kinds of the moved rows.
    let mut stmt = conn.prepare(
        "SELECT id, rel_path FROM assets WHERE root_id = ?1 AND (rel_path = ?2 OR substr(rel_path, 1, length(?2) + 1) = ?2 || '/')",
    )?;
    let moved: Vec<(i64, String)> = stmt
        .query_map(params![root_id, to_rel], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_>>()?;
    for (id, rel) in moved {
        let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
        let ext = ext_of(&name);
        conn.execute(
            "UPDATE assets SET name = ?2, ext = ?3, kind = ?4 WHERE id = ?1",
            params![id, name, ext, kind_of(&ext)],
        )?;
    }
    // Picks up content changes and anything the rows didn't cover.
    refresh_path(conn, root_id, root, to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::fs;

    fn setup() -> (tempfile::TempDir, Connection, i64) {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open_memory();
        conn.execute(
            "INSERT INTO roots (path) VALUES (?1)",
            [dir.path().display().to_string()],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        (dir, conn, id)
    }

    fn rels(conn: &Connection) -> Vec<String> {
        let mut v: Vec<String> = db::assets(conn, None)
            .unwrap()
            .into_iter()
            .map(|a| a.rel_path)
            .collect();
        v.sort();
        v
    }

    fn png(path: &Path, w: u32, h: u32) {
        image::RgbaImage::new(w, h).save(path).unwrap();
    }

    #[test]
    fn scan_upserts_and_sweeps() {
        let (dir, mut conn, root) = setup();
        let r = dir.path();
        fs::create_dir_all(r.join("sprites/.hidden")).unwrap();
        png(&r.join("sprites/hero.png"), 32, 16);
        fs::write(r.join("sprites/hero.png.meta"), "x").unwrap();
        fs::write(r.join("sprites/.hidden/x.png"), "x").unwrap();
        fs::write(r.join("jump.wav"), "RIFF").unwrap();

        assert_eq!(scan_root(&mut conn, root, r, |_| {}).unwrap(), 2);
        assert_eq!(rels(&conn), ["jump.wav", "sprites/hero.png"]);
        let hero = db::assets(&conn, None)
            .unwrap()
            .into_iter()
            .find(|a| a.name == "hero.png")
            .unwrap();
        assert_eq!(
            (hero.kind.as_str(), hero.width, hero.height),
            ("image", Some(32), Some(16))
        );
        assert!(
            hero.path
                .ends_with(&format!("sprites{}hero.png", std::path::MAIN_SEPARATOR))
        );

        // Tags survive a rescan; deleted files drop out.
        db::add_tag(&conn, &[hero.id], "player").unwrap();
        fs::remove_file(r.join("jump.wav")).unwrap();
        scan_root(&mut conn, root, r, |_| {}).unwrap();
        let all = db::assets(&conn, None).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!((all[0].id, all[0].tags.clone()), (hero.id, vec!["player".to_string()]));
    }

    #[test]
    fn rename_keeps_tags() {
        let (dir, mut conn, root) = setup();
        let r = dir.path();
        fs::create_dir_all(r.join("old")).unwrap();
        fs::write(r.join("old/a.png"), "x").unwrap();
        fs::write(r.join("b.ogg"), "x").unwrap();
        scan_root(&mut conn, root, r, |_| {}).unwrap();
        let ids: Vec<i64> = db::assets(&conn, None).unwrap().iter().map(|a| a.id).collect();
        db::add_tag(&conn, &ids, "keep").unwrap();

        // File rename that changes the kind.
        fs::rename(r.join("b.ogg"), r.join("b.txt")).unwrap();
        rename_path(&conn, root, r, &r.join("b.ogg"), &r.join("b.txt")).unwrap();
        // Folder rename.
        fs::rename(r.join("old"), r.join("new")).unwrap();
        rename_path(&conn, root, r, &r.join("old"), &r.join("new")).unwrap();

        let all = db::assets(&conn, None).unwrap();
        assert_eq!(rels(&conn), ["b.txt", "new/a.png"]);
        assert!(all.iter().all(|a| a.tags == ["keep"]));
        assert_eq!(all.iter().find(|a| a.name == "b.txt").unwrap().kind, "text");
    }

    #[test]
    fn refresh_adds_and_removes() {
        let (dir, conn, root) = setup();
        let r = dir.path();
        fs::create_dir_all(r.join("pack/sub")).unwrap();
        fs::write(r.join("pack/sub/a.glb"), "x").unwrap();
        refresh_path(&conn, root, r, &r.join("pack")).unwrap();
        assert_eq!(rels(&conn), ["pack/sub/a.glb"]);
        fs::remove_dir_all(r.join("pack")).unwrap();
        refresh_path(&conn, root, r, &r.join("pack")).unwrap();
        assert!(rels(&conn).is_empty());
        // Ignored paths are never added.
        fs::write(r.join("x.png.meta"), "x").unwrap();
        refresh_path(&conn, root, r, &r.join("x.png.meta")).unwrap();
        assert!(rels(&conn).is_empty());
    }
}
