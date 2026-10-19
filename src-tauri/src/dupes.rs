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

/// Groups of asset ids with identical content, biggest wasted space first.
pub fn groups(conn: &Connection) -> Result<Vec<Vec<i64>>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT group_concat(id) FROM assets WHERE hash IS NOT NULL AND size IN ({SAME_SIZE})
         GROUP BY size, hash HAVING count(*) > 1 ORDER BY size * (count(*) - 1) DESC"
    ))?;
    stmt.query_map([], |r| {
        let ids: String = r.get(0)?;
        Ok(ids.split(',').filter_map(|i| i.parse().ok()).collect())
    })?
    .collect()
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
        scan::scan_root(&mut conn, 1, r, |_| {}).unwrap();

        let todo = unhashed(&conn).unwrap();
        assert_eq!(todo.len(), 3);
        let hashes: Vec<_> = todo.iter().map(|(id, p)| (*id, hash_file(p).unwrap())).collect();
        store(&conn, &hashes).unwrap();
        assert!(unhashed(&conn).unwrap().is_empty());

        let g = groups(&conn).unwrap();
        assert_eq!(g.len(), 1);
        let names: Vec<String> = g[0].iter().map(|id| db::asset(&conn, *id).unwrap().rel_path).collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"a.png".into()) && names.contains(&"copy/a.png".into()));
    }
}
