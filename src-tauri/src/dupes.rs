//! Duplicate detection: only files whose size collides get hashed, and hashes are kept until the file changes.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{Connection, Result, params};

use crate::db::{self, abs_path};

const SAME_SIZE: &str = "SELECT size FROM assets WHERE size > 0 GROUP BY size HAVING count(*) > 1";

/// Same-size files that still need a hash.
pub fn unhashed(conn: &Connection) -> Result<Vec<(i64, PathBuf)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT a.id, r.path, a.rel_path FROM assets a JOIN roots r ON r.id = a.root_id
         WHERE a.hash IS NULL AND a.size IN ({SAME_SIZE})"
    ))?;
    stmt.query_map([], |r| {
        let root: String = r.get(1)?;
        let rel: String = r.get(2)?;
        Ok((r.get(0)?, abs_path(&root, &rel)))
    })?
    .collect()
}

pub fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut h = blake3::Hasher::new();
    h.update_reader(std::fs::File::open(path)?)?;
    Ok(h.finalize().to_hex().to_string())
}

pub fn store(conn: &Connection, hashes: &[(i64, String)]) -> Result<()> {
    for (id, hash) in hashes {
        conn.execute("UPDATE assets SET hash = ?2 WHERE id = ?1", params![id, hash])?;
    }
    Ok(())
}

const BATCH: usize = 500;

/// Hashes `todo` [`BATCH`] files at a time and stores each batch in one transaction. The lock is only held
/// while a batch is written, so scans and UI commands get in between. Unreadable files are skipped.
pub fn hash_and_store(db: &Mutex<Connection>, todo: &[(i64, PathBuf)]) -> Result<()> {
    for batch in todo.chunks(BATCH) {
        let hashes: Vec<_> = batch
            .iter()
            .filter_map(|(id, p)| hash_file(p).ok().map(|h| (*id, h)))
            .collect();
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        store(&tx, &hashes)?;
        tx.commit()?;
        drop(conn);
        // The mutex isn't fair: without a pause the next batch can re-lock before a waiting command.
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    Ok(())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DupGroup {
    pub hash: String,
    pub ids: Vec<i64>,
}

/// Groups of identical files, biggest wasted space first, without the ones marked "not duplicates".
pub fn groups(conn: &Connection) -> Result<Vec<DupGroup>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT hash, group_concat(id) FROM assets
         WHERE hash IS NOT NULL AND size IN ({SAME_SIZE}) AND hash NOT IN (SELECT hash FROM ignored_dups)
         GROUP BY size, hash HAVING count(*) > 1 ORDER BY size * (count(*) - 1) DESC"
    ))?;
    stmt.query_map([], |r| {
        let ids: String = r.get(1)?;
        Ok(DupGroup {
            hash: r.get(0)?,
            ids: ids.split(',').filter_map(|i| i.parse().ok()).collect(),
        })
    })?
    .collect()
}

pub fn set_ignored(conn: &Connection, hash: &str, ignored: bool) -> Result<()> {
    let sql = if ignored {
        "INSERT OR IGNORE INTO ignored_dups (hash) VALUES (?1)"
    } else {
        "DELETE FROM ignored_dups WHERE hash = ?1"
    };
    conn.execute(sql, [hash]).map(|_| ())
}

/// Moves a removed copy's tags, favorite, rating (the higher one), note (both, if they differ) and collection
/// memberships onto the copy that's kept, then drops its row.
pub fn merge_and_forget(conn: &Connection, keep: i64, remove: i64) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO asset_tags (asset_id, tag) SELECT ?1, tag FROM asset_tags WHERE asset_id = ?2",
        params![keep, remove],
    )?;
    conn.execute(
        "UPDATE assets SET favorite = 1 WHERE id = ?1 AND (SELECT favorite FROM assets WHERE id = ?2) = 1",
        params![keep, remove],
    )?;
    conn.execute(
        "INSERT INTO asset_meta (asset_id, rating, note) SELECT ?1, rating, note FROM asset_meta WHERE asset_id = ?2
         ON CONFLICT (asset_id) DO UPDATE SET
           rating = max(rating, excluded.rating),
           note = CASE WHEN note IS NULL OR note = excluded.note THEN excluded.note
                       WHEN excluded.note IS NULL THEN note
                       ELSE substr(note || char(10) || char(10) || excluded.note, 1, ?3) END",
        // Cut at the note limit (the kept note is never cut, it's at most that long), so it stays editable.
        params![keep, remove, db::NOTE_MAX as i64],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO collection_assets (collection_id, asset_id)
         SELECT collection_id, ?1 FROM collection_assets WHERE asset_id = ?2",
        params![keep, remove],
    )?;
    conn.execute("DELETE FROM assets WHERE id = ?1", [remove]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, scan};
    use std::fs;

    #[test]
    fn finds_identical_files_only() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        fs::write(r.join("a.png"), "same bytes").unwrap();
        fs::create_dir(r.join("copy")).unwrap();
        fs::write(r.join("copy/a.png"), "same bytes").unwrap();
        fs::write(r.join("b.png"), "diff bytes").unwrap(); // same size, other content
        fs::write(r.join("c.png"), "unique size here").unwrap();
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r);

        let todo = unhashed(&conn).unwrap();
        assert_eq!(todo.len(), 3);
        let hashes: Vec<_> = todo.iter().map(|(id, p)| (*id, hash_file(p).unwrap())).collect();
        store(&conn, &hashes).unwrap();
        assert!(unhashed(&conn).unwrap().is_empty());

        let g = groups(&conn).unwrap();
        assert_eq!(g.len(), 1);
        let names: Vec<String> = g[0]
            .ids
            .iter()
            .map(|id| db::asset(&conn, *id).unwrap().rel_path)
            .collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"a.png".into()) && names.contains(&"copy/a.png".into()));
    }

    #[test]
    fn ignore_and_merge() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        fs::write(r.join("a.png"), "same").unwrap();
        fs::write(r.join("b.png"), "same").unwrap();
        fs::write(r.join("c.png"), "same").unwrap();
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r);
        let hashes: Vec<_> = unhashed(&conn)
            .unwrap()
            .iter()
            .map(|(id, p)| (*id, hash_file(p).unwrap()))
            .collect();
        store(&conn, &hashes).unwrap();
        let g = groups(&conn).unwrap().remove(0);

        set_ignored(&conn, &g.hash, true).unwrap();
        assert!(groups(&conn).unwrap().is_empty());
        set_ignored(&conn, &g.hash, false).unwrap();
        assert_eq!(groups(&conn).unwrap().len(), 1);

        let (keep, remove, third) = (g.ids[0], g.ids[1], g.ids[2]);
        db::add_tag(&conn, &[keep], "a").unwrap();
        db::add_tag(&conn, &[remove], "b").unwrap();
        db::set_favorite(&conn, &[remove], true).unwrap();
        db::set_rating(&conn, &[keep], 2).unwrap();
        db::set_rating(&conn, &[remove], 4).unwrap();
        db::set_note(&conn, keep, "keep note").unwrap();
        db::set_note(&conn, remove, "copy note").unwrap();
        let c = db::create_collection(&conn, "Level", None).unwrap();
        db::set_in_collection(&conn, c, &[remove], true).unwrap();
        merge_and_forget(&conn, keep, remove).unwrap();

        let kept = db::asset(&conn, keep).unwrap();
        let mut tags = kept.tags.clone();
        tags.sort();
        assert_eq!((tags, kept.favorite), (vec!["a".to_string(), "b".to_string()], true));
        assert_eq!(kept.rating, 4);
        let merged = "keep note\n\ncopy note".to_string();
        assert_eq!(db::notes(&conn).unwrap(), [(keep, merged.clone())].into());
        assert_eq!(db::collections(&conn).unwrap()[0].asset_ids, vec![keep]);
        assert!(db::asset(&conn, remove).is_err());

        // The same note isn't repeated, and a lower rating doesn't lower the kept one.
        db::set_rating(&conn, &[third], 1).unwrap();
        db::set_note(&conn, third, &merged).unwrap();
        merge_and_forget(&conn, keep, third).unwrap();
        assert_eq!(db::asset(&conn, keep).unwrap().rating, 4);
        assert_eq!(db::notes(&conn).unwrap()[&keep], merged);
    }

    #[test]
    fn merged_notes_stay_editable() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        fs::write(r.join("a.png"), "same").unwrap();
        fs::write(r.join("b.png"), "same").unwrap();
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r);
        let ids: Vec<i64> = db::assets(&conn, None).unwrap().iter().map(|a| a.id).collect();
        let (keep, remove) = (ids[0], ids[1]);
        let kept_note = "k".repeat(db::NOTE_MAX - 10);
        db::set_note(&conn, keep, &kept_note).unwrap();
        db::set_note(&conn, remove, &"é".repeat(db::NOTE_MAX)).unwrap();
        merge_and_forget(&conn, keep, remove).unwrap();

        let merged = db::notes(&conn).unwrap().remove(&keep).unwrap();
        assert_eq!(merged.chars().count(), db::NOTE_MAX);
        assert!(merged.starts_with(&format!("{kept_note}\n\néééééééé")));
        db::set_note(&conn, keep, &merged).unwrap(); // still saves as is
    }

    #[test]
    fn hash_and_store_spans_batches() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        // All the same size, so all need a hash; one pair is identical.
        for i in 0..BATCH + 10 {
            fs::write(r.join(format!("{i}.png")), format!("{i:04}")).unwrap();
        }
        fs::write(r.join("copy.png"), "0007").unwrap();
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r);
        let todo = unhashed(&conn).unwrap();
        assert_eq!(todo.len(), BATCH + 11);
        fs::remove_file(r.join("3.png")).unwrap(); // gone since the scan: skipped, stays unhashed

        let db = Mutex::new(conn);
        hash_and_store(&db, &todo).unwrap();
        let conn = db.into_inner().unwrap();
        let left = unhashed(&conn).unwrap();
        assert_eq!(left.len(), 1);
        assert!(left[0].1.ends_with("3.png"));
        assert_eq!(groups(&conn).unwrap()[0].ids.len(), 2);
    }
}
