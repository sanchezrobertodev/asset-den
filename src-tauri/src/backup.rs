//! Copies of the library database: backups the user saves, one automatic backup a day, and restoring from either.
//! Restoring is staged and applied on the next launch, before anything else opens the database.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, MAIN_DB, OpenFlags, backup::Progress};

/// Automatic backups kept, newest first. Copies saved before a restore aren't counted or pruned.
const KEEP: usize = 5;
const AUTO: &str = "auto-";

fn read_only(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Couldn't open {}: {e}", path.display()))
}

/// Local date and time as `2026-11-02-153012`, which sorts by age.
fn stamp(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%d-%H%M%S', 'now', 'localtime')", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}

/// A consistent copy of `conn`'s database at `dest`, which must not exist yet (SQLite refuses to overwrite it).
fn vacuum_into(conn: &Connection, dest: &Path) -> Result<(), String> {
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy()])
        .map(|_| ())
        .map_err(|e| format!("Couldn't write {}: {e}", dest.display()))
}

/// Saves a copy of the library at `db` into `dir`, next to anything already there. Returns the new file.
pub fn backup_to(db: &Path, dir: &Path) -> Result<PathBuf, String> {
    let conn = read_only(db)?;
    let dest = crate::free_path(dir, &format!("Asset Den backup {}.db", stamp(&conn)?));
    vacuum_into(&conn, &dest)?;
    Ok(dest)
}

/// The day's automatic backup, if there isn't one yet, then prunes all but the newest `KEEP`.
pub fn auto(db: &Path, dir: &Path) -> Result<(), String> {
    let conn = read_only(db)?;
    let now = stamp(&conn)?;
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| n.starts_with(AUTO) && n.ends_with(".db"))
        .collect();
    names.sort_unstable_by(|a, b| b.cmp(a));
    if !names.first().is_some_and(|n| n[AUTO.len()..].starts_with(&now[..10])) {
        let name = format!("{AUTO}{now}.db");
        vacuum_into(&conn, &dir.join(&name))?;
        names.insert(0, name);
    }
    for old in names.iter().skip(KEEP) {
        let _ = std::fs::remove_file(dir.join(old));
    }
    Ok(())
}

/// Checks `src` is an Asset Den library and copies it to `pending`, to replace the library on the next launch.
/// `src` is only read.
pub fn stage(src: &Path, pending: &Path) -> Result<(), String> {
    let conn = read_only(src).map_err(|_| "That file isn't an Asset Den backup.".to_string())?;
    let ok = conn
        .query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))
        .is_ok_and(|r| r == "ok");
    let tables: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('roots', 'assets', 'asset_tags')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if !ok || tables != 3 {
        return Err("That file isn't an Asset Den backup, or it's damaged.".into());
    }
    let _ = std::fs::remove_file(pending);
    vacuum_into(&conn, pending)
}

/// Replaces the library at `db` with a staged backup, after saving the current one into `dir`. Returns whether there
/// was one. The staged copy is removed either way, so a backup that can't be applied isn't retried on every launch.
pub fn apply_pending(db: &Path, pending: &Path, dir: &Path) -> Result<bool, String> {
    if !pending.exists() {
        return Ok(false);
    }
    let result = (|| {
        let mut conn = Connection::open(db).map_err(|e| e.to_string())?;
        vacuum_into(&conn, &dir.join(format!("before-restore-{}.db", stamp(&conn)?)))?;
        conn.restore(MAIN_DB, pending, None::<fn(Progress)>)
            .map_err(|e| format!("Couldn't restore the backup: {e}. Your library wasn't changed."))
    })();
    let _ = std::fs::remove_file(pending);
    result.map(|()| true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn library(path: &Path, folder: &str) {
        let conn = db::open(path).unwrap();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [folder]).unwrap();
    }

    fn folders(path: &Path) -> Vec<String> {
        let conn = Connection::open(path).unwrap();
        let mut stmt = conn.prepare("SELECT path FROM roots").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    }

    #[test]
    fn restores_a_backup_and_keeps_the_library_it_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let (live, backups) = (dir.path().join("asset-den.db"), dir.path().join("backups"));
        std::fs::create_dir_all(&backups).unwrap();
        library(&live, "C:/old");
        let saved = backup_to(&live, dir.path()).unwrap();
        // A second backup in the same second gets its own name instead of failing.
        assert_ne!(backup_to(&live, dir.path()).unwrap(), saved);

        Connection::open(&live)
            .unwrap()
            .execute("UPDATE roots SET path = 'C:/new'", [])
            .unwrap();
        let pending = dir.path().join("restore.db");
        stage(&saved, &pending).unwrap();
        assert!(apply_pending(&live, &pending, &backups).unwrap());
        assert_eq!(folders(&live), ["C:/old"]);
        assert!(!pending.exists());
        let before: Vec<_> = std::fs::read_dir(&backups)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(before.len(), 1);
        assert_eq!(folders(&before[0]), ["C:/new"]);
        assert!(!apply_pending(&live, &pending, &backups).unwrap());
    }

    #[test]
    fn refuses_files_that_arent_libraries() {
        let dir = tempfile::tempdir().unwrap();
        let pending = dir.path().join("restore.db");
        let text = dir.path().join("notes.db");
        std::fs::write(&text, "not a database").unwrap();
        assert!(stage(&text, &pending).is_err());
        let other = dir.path().join("other.db");
        Connection::open(&other)
            .unwrap()
            .execute("CREATE TABLE t (x)", [])
            .unwrap();
        assert!(stage(&other, &pending).is_err());
        assert!(!pending.exists());
    }

    #[test]
    fn automatic_backups_run_once_a_day_and_keep_the_newest() {
        let dir = tempfile::tempdir().unwrap();
        let live = dir.path().join("asset-den.db");
        let backups = dir.path().join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        library(&live, "C:/assets");
        for day in 1..=6 {
            std::fs::write(backups.join(format!("auto-2000-01-0{day}-120000.db")), "").unwrap();
        }
        std::fs::write(backups.join("before-restore-2000-01-01-120000.db"), "").unwrap();
        auto(&live, &backups).unwrap();
        auto(&live, &backups).unwrap();
        let mut names: Vec<_> = std::fs::read_dir(&backups)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names.len(), KEEP + 1, "{names:?}");
        assert!(names.contains(&"before-restore-2000-01-01-120000.db".to_string()));
        assert!(!names.contains(&"auto-2000-01-02-120000.db".to_string()));
        let today = names
            .iter()
            .find(|n| !n.starts_with("auto-2000") && n.starts_with(AUTO))
            .unwrap();
        assert_eq!(folders(&backups.join(today)), ["C:/assets"]);
    }
}
