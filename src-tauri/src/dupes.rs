//! Duplicate detection: only files whose size collides get hashed, and hashes are kept until the file changes.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, Result, params};

use crate::db::abs_path;

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

/// Moves a removed copy's tags, favorite and collection memberships onto the copy that's kept, then drops its row.
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

        let (keep, remove) = (g.ids[0], g.ids[1]);
        db::add_tag(&conn, &[keep], "a").unwrap();
        db::add_tag(&conn, &[remove], "b").unwrap();
        db::set_favorite(&conn, &[remove], true).unwrap();
        let c = db::create_collection(&conn, "Level").unwrap();
        db::set_in_collection(&conn, c, &[remove], true).unwrap();
        merge_and_forget(&conn, keep, remove).unwrap();

        let kept = db::asset(&conn, keep).unwrap();
        let mut tags = kept.tags.clone();
        tags.sort();
        assert_eq!((tags, kept.favorite), (vec!["a".to_string(), "b".to_string()], true));
        assert_eq!(db::collections(&conn).unwrap()[0].asset_ids, vec![keep]);
        assert!(db::asset(&conn, remove).is_err());
    }
}
