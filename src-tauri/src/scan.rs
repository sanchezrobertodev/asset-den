//! Keeps the `assets` table in step with the files under a root. Only ever reads the files.

use std::fs::Metadata;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use rusqlite::{Connection, OptionalExtension, Result, params};
use walkdir::WalkDir;

use crate::db::abs_path;
use crate::kind::{DECODABLE, ignored_name, ignored_rel, kind_of};

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
        e if DECODABLE.contains(&e) => image::image_dimensions(path).ok(),
        _ => None,
    }
}

/// Inserts or refreshes one file's row; returns false if it isn't an indexable file. Adds the row's id to `touched`
/// when it was added or changed. Unchanged files keep their hash and dimensions. With `with_dims` false, changed images get their dimensions
/// later from [`fill_dimensions`], so a big scan isn't slowed down by opening every image.
#[allow(clippy::too_many_arguments)]
pub fn upsert_file(
    conn: &Connection,
    root_id: i64,
    root: &Path,
    path: &Path,
    meta: &Metadata,
    seen: i64,
    with_dims: bool,
    touched: &mut Vec<i64>,
) -> Result<bool> {
    let Some(rel) = rel_of(root, path) else {
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
    let dims = if with_dims && kind == "image" {
        Some(dimensions(path, &ext).unwrap_or((0, 0)))
    } else {
        None
    };
    let id = conn.query_row(
        "INSERT INTO assets (root_id, rel_path, name, ext, kind, size, mtime, width, height, seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT (root_id, rel_path) DO UPDATE SET
           name = excluded.name, ext = excluded.ext, kind = excluded.kind, size = excluded.size,
           mtime = excluded.mtime, width = excluded.width, height = excluded.height, seen = excluded.seen,
           hash = NULL
         RETURNING id",
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
        |r| r.get(0),
    )?;
    if with_dims && kind == "audio" {
        crate::audio::store(
            conn,
            id,
            size,
            mtime,
            &crate::audio::read_info(path, &ext).unwrap_or_default(),
        )?;
    }
    touched.push(id);
    Ok(true)
}

/// Files under `dir`, with the metadata the directory listing already provides (no extra stat on Windows).
fn walk(dir: &Path) -> impl Iterator<Item = (PathBuf, Metadata)> {
    WalkDir::new(dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !ignored_name(&e.file_name().to_string_lossy()))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok().map(|m| (e.into_path(), m)))
}

const BATCH: usize = 500;

/// Full rescan of a root: upserts every file, then drops rows for files that are gone. Commits every
/// [`BATCH`] files and releases the lock in between, so the UI can show (and thumbnail) assets while it runs.
/// `report(conn, count, touched)` is called after every batch, including the sweep and the dimensions pass, with the
/// lock still held and the ids of the rows that batch added, changed or removed.
pub fn scan_root(
    db: &Mutex<Connection>,
    root_id: i64,
    root: &Path,
    mut report: impl FnMut(&Connection, usize, &[i64]),
) -> Result<usize> {
    let seen = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(1, |d| d.as_nanos() as i64);
    let mut count = 0;
    let mut files = walk(root).peekable();
    while files.peek().is_some() {
        let batch: Vec<_> = files.by_ref().take(BATCH).collect();
        let mut touched = Vec::new();
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        for (path, meta) in &batch {
            if upsert_file(&tx, root_id, root, path, meta, seen, false, &mut touched)? {
                count += 1;
            }
        }
        tx.commit()?;
        report(&conn, count, &touched);
        drop(conn);
        // The mutex isn't fair: without a pause this thread re-locks at once and UI commands starve until the end.
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    {
        let conn = db.lock().unwrap();
        let gone: Vec<i64> = conn
            .prepare("DELETE FROM assets WHERE root_id = ?1 AND seen != ?2 RETURNING id")?
            .query_map(params![root_id, seen], |r| r.get(0))?
            .collect::<Result<_>>()?;
        report(&conn, count, &gone);
    }
    fill_dimensions(db, root_id, root, |conn, ids| report(conn, count, ids))?;
    crate::audio::fill_audio(db, root_id, root, |conn, ids| report(conn, count, ids))?;
    Ok(count)
}

/// Reads image dimensions for rows that don't have them yet, from file headers, in parallel and in batches.
/// Unreadable files get 0x0 so they aren't retried every scan. `report(conn, ids)` gets each batch's ids, lock held.
pub fn fill_dimensions(
    db: &Mutex<Connection>,
    root_id: i64,
    root: &Path,
    mut report: impl FnMut(&Connection, &[i64]),
) -> Result<()> {
    let exts = DECODABLE.iter().map(|e| format!("'{e}'")).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, rel_path, ext FROM assets WHERE root_id = ?1 AND width IS NULL AND ext IN ({exts}) LIMIT {BATCH}"
    );
    let root_str = root.to_string_lossy();
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    loop {
        let todo: Vec<(i64, String, String)> = {
            let conn = db.lock().unwrap();
            let mut stmt = conn.prepare(&sql)?;
            stmt.query_map([root_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
                .collect::<Result<_>>()?
        };
        if todo.is_empty() {
            return Ok(());
        }
        let root_str = &root_str;
        let dims: Vec<(i64, (u32, u32))> = std::thread::scope(|s| {
            let handles: Vec<_> = todo
                .chunks(todo.len().div_ceil(workers))
                .map(|chunk| {
                    s.spawn(move || {
                        chunk
                            .iter()
                            .map(|(id, rel, ext)| (*id, dimensions(&abs_path(root_str, rel), ext).unwrap_or((0, 0))))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
        });
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        for (id, (w, h)) in &dims {
            tx.execute(
                "UPDATE assets SET width = ?2, height = ?3 WHERE id = ?1",
                params![id, w, h],
            )?;
        }
        tx.commit()?;
        report(&conn, &dims.iter().map(|(id, _)| *id).collect::<Vec<_>>());
        drop(conn);
        std::thread::sleep(std::time::Duration::from_millis(1)); // let waiting UI commands in, see scan_root
    }
}

/// Drops the rows for `rel` and everything under it, adding their ids to `touched`.
fn delete_under(conn: &Connection, root_id: i64, rel: &str, touched: &mut Vec<i64>) -> Result<()> {
    let mut stmt = conn.prepare(
        "DELETE FROM assets WHERE root_id = ?1 AND (rel_path = ?2 OR substr(rel_path, 1, length(?2) + 1) = ?2 || '/')
         RETURNING id",
    )?;
    for id in stmt.query_map(params![root_id, rel], |r| r.get(0))? {
        touched.push(id?);
    }
    Ok(())
}

/// Syncs one path after a change event: a file, a whole folder, or something that's gone. Adds the ids of rows it
/// added, changed or removed to `touched`.
pub fn refresh_path(conn: &Connection, root_id: i64, root: &Path, path: &Path, touched: &mut Vec<i64>) -> Result<()> {
    let Some(rel) = rel_of(root, path) else { return Ok(()) };
    if path.is_dir() {
        for (f, meta) in walk(path) {
            upsert_file(conn, root_id, root, &f, &meta, 0, true, touched)?;
        }
    } else if let Some(meta) = std::fs::metadata(path).ok().filter(|m| m.is_file()) {
        upsert_file(conn, root_id, root, path, &meta, 0, true, touched)?;
    } else {
        delete_under(conn, root_id, &rel, touched)?;
    }
    Ok(())
}

/// Moves rows in place so a renamed file or folder keeps its tags, favorite and collections.
pub fn rename_path(
    conn: &Connection,
    root_id: i64,
    root: &Path,
    from: &Path,
    to: &Path,
    touched: &mut Vec<i64>,
) -> Result<()> {
    let (Some(from_rel), Some(to_rel)) = (rel_of(root, from), rel_of(root, to)) else {
        // Moved in or out of the root (or to/from an ignored place): treat as delete + add.
        refresh_path(conn, root_id, root, from, touched)?;
        return refresh_path(conn, root_id, root, to, touched);
    };
    // Anything the move overwrote is replaced.
    delete_under(conn, root_id, &to_rel, touched)?;
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
        touched.push(id);
        let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
        let ext = ext_of(&name);
        conn.execute(
            "UPDATE assets SET name = ?2, ext = ?3, kind = ?4 WHERE id = ?1",
            params![id, name, ext, kind_of(&ext)],
        )?;
    }
    // Picks up content changes and anything the rows didn't cover.
    refresh_path(conn, root_id, root, to, touched)
}

#[cfg(test)]
pub mod tests {
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

    /// Runs a full scan on a plain connection (the app passes its shared Mutex). Returns the file count.
    pub fn scan(conn: &mut Connection, root: i64, r: &Path) -> usize {
        scan_touched(conn, root, r).0
    }

    /// A full scan, with every id its batches reported.
    fn scan_touched(conn: &mut Connection, root: i64, r: &Path) -> (usize, Vec<i64>) {
        let db = Mutex::new(std::mem::replace(conn, Connection::open_in_memory().unwrap()));
        let mut touched = Vec::new();
        let n = scan_root(&db, root, r, |_, _, ids| touched.extend_from_slice(ids)).unwrap();
        *conn = db.into_inner().unwrap();
        (n, touched)
    }

    /// The delta the UI would get for `touched`: (sorted upserted rel paths, removed ids).
    fn delta(conn: &Connection, touched: &[i64]) -> (Vec<String>, Vec<i64>) {
        let (rows, removed) = db::delta(conn, touched).unwrap();
        let mut rels: Vec<String> = rows.into_iter().map(|a| a.rel_path).collect();
        rels.sort();
        (rels, removed)
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

        assert_eq!(scan(&mut conn, root, r), 2);
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
        scan(&mut conn, root, r);
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
        scan(&mut conn, root, r);
        let ids: Vec<i64> = db::assets(&conn, None).unwrap().iter().map(|a| a.id).collect();
        db::add_tag(&conn, &ids, "keep").unwrap();

        // File rename that changes the kind.
        fs::rename(r.join("b.ogg"), r.join("b.txt")).unwrap();
        rename_path(&conn, root, r, &r.join("b.ogg"), &r.join("b.txt"), &mut vec![]).unwrap();
        // Folder rename.
        fs::rename(r.join("old"), r.join("new")).unwrap();
        rename_path(&conn, root, r, &r.join("old"), &r.join("new"), &mut vec![]).unwrap();

        let all = db::assets(&conn, None).unwrap();
        assert_eq!(rels(&conn), ["b.txt", "new/a.png"]);
        assert!(all.iter().all(|a| a.tags == ["keep"]));
        assert_eq!(all.iter().find(|a| a.name == "b.txt").unwrap().kind, "text");
    }

    #[test]
    fn scan_reports_changes_and_sweep() {
        let (dir, mut conn, root) = setup();
        let r = dir.path();
        fs::write(r.join("a.png"), "x").unwrap();
        fs::write(r.join("b.wav"), "x").unwrap();
        let (_, touched) = scan_touched(&mut conn, root, r);
        assert_eq!(delta(&conn, &touched), (vec!["a.png".into(), "b.wav".into()], vec![]));

        // A rescan with nothing changed reports nothing, so the UI does no work.
        assert!(scan_touched(&mut conn, root, r).1.is_empty());

        // The sweep reports deleted files; changed files come back as rows.
        let gone = db::assets(&conn, None)
            .unwrap()
            .into_iter()
            .find(|a| a.name == "b.wav")
            .unwrap()
            .id;
        fs::remove_file(r.join("b.wav")).unwrap();
        fs::write(r.join("a.png"), "longer").unwrap();
        let (_, touched) = scan_touched(&mut conn, root, r);
        assert_eq!(delta(&conn, &touched), (vec!["a.png".into()], vec![gone]));
    }

    #[test]
    fn watcher_reports_add_rename_and_remove() {
        use notify_debouncer_full::notify::event::{
            AccessKind, CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode,
        };
        let (dir, mut conn, root) = setup();
        let r = dir.path();
        fs::create_dir_all(r.join("old")).unwrap();
        fs::write(r.join("old/a.png"), "x").unwrap();
        scan(&mut conn, root, r);
        let a = db::assets(&conn, None).unwrap()[0].id;
        db::add_tag(&conn, &[a], "keep").unwrap();

        // Add.
        fs::write(r.join("new.png"), "x").unwrap();
        let t = crate::watch::apply(
            &conn,
            root,
            r,
            &EventKind::Create(CreateKind::File),
            &[r.join("new.png")],
        );
        assert_eq!(delta(&conn, &t), (vec!["new.png".into()], vec![]));
        let added = db::assets(&conn, None)
            .unwrap()
            .into_iter()
            .find(|x| x.name == "new.png")
            .unwrap()
            .id;

        // Folder rename: same id, new path, tags kept.
        fs::rename(r.join("old"), r.join("moved")).unwrap();
        let t = crate::watch::apply(
            &conn,
            root,
            r,
            &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            &[r.join("old"), r.join("moved")],
        );
        let (rows, removed) = db::delta(&conn, &t).unwrap();
        assert!(removed.is_empty());
        assert_eq!(
            rows.iter()
                .map(|x| (x.id, x.rel_path.as_str(), x.tags.clone()))
                .collect::<Vec<_>>(),
            [(a, "moved/a.png", vec!["keep".to_string()])]
        );

        // Remove.
        fs::remove_file(r.join("new.png")).unwrap();
        let t = crate::watch::apply(
            &conn,
            root,
            r,
            &EventKind::Remove(RemoveKind::File),
            &[r.join("new.png")],
        );
        assert_eq!(delta(&conn, &t), (vec![], vec![added]));

        // Access events touch nothing.
        let t = crate::watch::apply(
            &conn,
            root,
            r,
            &EventKind::Access(AccessKind::Any),
            &[r.join("moved/a.png")],
        );
        assert!(t.is_empty());
    }

    #[test]
    fn sprite_sheet_survives_rename_and_rescan() {
        let (dir, mut conn, root) = setup();
        let r = dir.path();
        png(&r.join("walk.png"), 256, 64);
        scan(&mut conn, root, r);
        let id = db::assets(&conn, None).unwrap()[0].id;
        assert_eq!(db::sprite_sheet(&conn, id).unwrap(), None);

        let sheet = db::SpriteSheet {
            cols: 4,
            rows: 1,
            fps: 12,
        };
        db::set_sprite_sheet(&conn, id, sheet).unwrap();
        let faster = db::SpriteSheet { fps: 24, ..sheet };
        db::set_sprite_sheet(&conn, id, faster).unwrap();
        assert!(db::set_sprite_sheet(&conn, id, db::SpriteSheet { cols: 0, ..sheet }).is_err());

        fs::rename(r.join("walk.png"), r.join("run.png")).unwrap();
        rename_path(&conn, root, r, &r.join("walk.png"), &r.join("run.png"), &mut vec![]).unwrap();
        scan(&mut conn, root, r);
        let all = db::assets(&conn, None).unwrap();
        assert_eq!((all.len(), all[0].id, all[0].name.as_str()), (1, id, "run.png"));
        assert_eq!(db::sprite_sheet(&conn, id).unwrap(), Some(faster));

        // Gone with the file.
        fs::remove_file(r.join("run.png")).unwrap();
        scan(&mut conn, root, r);
        let left: i64 = conn
            .query_row("SELECT count(*) FROM sprite_sheets", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn refresh_adds_and_removes() {
        let (dir, conn, root) = setup();
        let r = dir.path();
        fs::create_dir_all(r.join("pack/sub")).unwrap();
        fs::write(r.join("pack/sub/a.glb"), "x").unwrap();
        refresh_path(&conn, root, r, &r.join("pack"), &mut vec![]).unwrap();
        assert_eq!(rels(&conn), ["pack/sub/a.glb"]);
        fs::remove_dir_all(r.join("pack")).unwrap();
        refresh_path(&conn, root, r, &r.join("pack"), &mut vec![]).unwrap();
        assert!(rels(&conn).is_empty());
        // Ignored paths are never added.
        fs::write(r.join("x.png.meta"), "x").unwrap();
        refresh_path(&conn, root, r, &r.join("x.png.meta"), &mut vec![]).unwrap();
        assert!(rels(&conn).is_empty());
    }
}

#[cfg(test)]
mod bench {
    /// `BENCH_DIR=<folder> cargo test --release scan_bench -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_bench() {
        let dir = std::path::PathBuf::from(std::env::var("BENCH_DIR").unwrap());
        let tmp = tempfile::tempdir().unwrap();
        let conn = crate::db::open(&tmp.path().join("b.db")).unwrap();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [dir.display().to_string()])
            .unwrap();
        let db = std::sync::Mutex::new(conn);
        let t = std::time::Instant::now();
        let mut first = None;
        let n = super::scan_root(&db, 1, &dir, |_, _, _| {
            first.get_or_insert(t.elapsed());
        })
        .unwrap();
        println!(
            "cold scan: {n} files in {:?}, first batch visible after {:?}",
            t.elapsed(),
            first.unwrap()
        );
        let t = std::time::Instant::now();
        super::scan_root(&db, 1, &dir, |_, _, _| {}).unwrap();
        println!("rescan: {:?}", t.elapsed());
    }
}
