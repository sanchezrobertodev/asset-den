use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OptionalExtension, Result, params};
use serde::{Deserialize, Serialize};

const SCHEMA: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS roots (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  hash TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL DEFAULT 0,
  UNIQUE (root_id, rel_path)
);
CREATE INDEX IF NOT EXISTS assets_size ON assets(size);
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag)
);
CREATE TABLE IF NOT EXISTS collections (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS ignored_dups (hash TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS collection_assets (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, asset_id)
);
CREATE TABLE IF NOT EXISTS sprite_sheets (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  cols INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  fps INTEGER NOT NULL
);
";

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_memory() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(SCHEMA).unwrap();
    conn
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    pub id: i64,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: i64,
    pub root_id: i64,
    pub rel_path: String,
    pub path: String,
    pub name: String,
    pub ext: String,
    pub kind: String,
    pub size: i64,
    pub mtime: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub favorite: bool,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub asset_ids: Vec<i64>,
}

/// `rel` always uses `/`; join it component by component so paths use the OS separator.
pub fn abs_path(root: &str, rel: &str) -> PathBuf {
    rel.split('/').fold(PathBuf::from(root), |p, c| p.join(c))
}

pub fn roots(conn: &Connection) -> Result<Vec<Root>> {
    let mut stmt = conn.prepare("SELECT id, path FROM roots ORDER BY path")?;
    stmt.query_map([], |r| {
        Ok(Root {
            id: r.get(0)?,
            path: r.get(1)?,
        })
    })?
    .collect()
}

pub fn root(conn: &Connection, id: i64) -> Result<Root> {
    conn.query_row("SELECT id, path FROM roots WHERE id = ?1", [id], |r| {
        Ok(Root {
            id: r.get(0)?,
            path: r.get(1)?,
        })
    })
}

const TAG_SEP: char = '\u{1f}';

pub fn assets(conn: &Connection, only: Option<i64>) -> Result<Vec<Asset>> {
    let roots: HashMap<i64, String> = roots(conn)?.into_iter().map(|r| (r.id, r.path)).collect();
    let mut stmt = conn.prepare(
        "SELECT a.id, a.root_id, a.rel_path, a.name, a.ext, a.kind, a.size, a.mtime, a.width, a.height, a.favorite,
                (SELECT group_concat(tag, char(31)) FROM asset_tags t WHERE t.asset_id = a.id)
         FROM assets a WHERE ?1 IS NULL OR a.id = ?1",
    )?;
    stmt.query_map([only], |r| {
        let root_id: i64 = r.get(1)?;
        let rel_path: String = r.get(2)?;
        let tags: Option<String> = r.get(11)?;
        Ok(Asset {
            id: r.get(0)?,
            root_id,
            path: abs_path(roots.get(&root_id).map(String::as_str).unwrap_or_default(), &rel_path)
                .display()
                .to_string(),
            rel_path,
            name: r.get(3)?,
            ext: r.get(4)?,
            kind: r.get(5)?,
            size: r.get(6)?,
            mtime: r.get(7)?,
            width: r.get(8)?,
            height: r.get(9)?,
            favorite: r.get(10)?,
            tags: tags
                .map(|t| t.split(TAG_SEP).map(String::from).collect())
                .unwrap_or_default(),
        })
    })?
    .collect()
}

pub fn asset(conn: &Connection, id: i64) -> std::result::Result<Asset, String> {
    assets(conn, Some(id))
        .map_err(|e| e.to_string())?
        .pop()
        .ok_or_else(|| "That asset is no longer in the library. It may have been moved or deleted.".into())
}

pub fn set_favorite(conn: &Connection, ids: &[i64], favorite: bool) -> Result<()> {
    for id in ids {
        conn.execute("UPDATE assets SET favorite = ?2 WHERE id = ?1", params![id, favorite])?;
    }
    Ok(())
}

/// Trims a user-typed tag; rejects empty, overlong and control-character tags.
pub fn clean_tag(tag: &str) -> std::result::Result<String, String> {
    let t = tag.trim();
    if t.is_empty() || t.chars().count() > 64 || t.chars().any(char::is_control) {
        return Err("Tags must be 1 to 64 characters, without control characters.".into());
    }
    Ok(t.to_lowercase())
}

pub fn add_tag(conn: &Connection, ids: &[i64], tag: &str) -> Result<()> {
    for id in ids {
        conn.execute(
            "INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?1, ?2)",
            params![id, tag],
        )?;
    }
    Ok(())
}

pub fn remove_tag(conn: &Connection, ids: &[i64], tag: &str) -> Result<()> {
    for id in ids {
        conn.execute(
            "DELETE FROM asset_tags WHERE asset_id = ?1 AND tag = ?2",
            params![id, tag],
        )?;
    }
    Ok(())
}

pub fn collections(conn: &Connection) -> Result<Vec<Collection>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, (SELECT group_concat(asset_id) FROM collection_assets ca WHERE ca.collection_id = c.id)
         FROM collections c ORDER BY c.name COLLATE NOCASE",
    )?;
    stmt.query_map([], |r| {
        let ids: Option<String> = r.get(2)?;
        Ok(Collection {
            id: r.get(0)?,
            name: r.get(1)?,
            asset_ids: ids
                .map(|s| s.split(',').filter_map(|i| i.parse().ok()).collect())
                .unwrap_or_default(),
        })
    })?
    .collect()
}

fn collection_name(conn: &Connection, name: &str, except: Option<i64>) -> std::result::Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err("Collection names must be 1 to 80 characters.".into());
    }
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM collections WHERE name = ?1", [name], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if existing.is_some_and(|id| Some(id) != except) {
        return Err(format!("A collection named \"{name}\" already exists."));
    }
    Ok(name.to_string())
}

pub fn create_collection(conn: &Connection, name: &str) -> std::result::Result<i64, String> {
    let name = collection_name(conn, name, None)?;
    conn.execute("INSERT INTO collections (name) VALUES (?1)", [&name])
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn rename_collection(conn: &Connection, id: i64, name: &str) -> std::result::Result<String, String> {
    let name = collection_name(conn, name, Some(id))?;
    conn.execute("UPDATE collections SET name = ?2 WHERE id = ?1", params![id, name])
        .map_err(|e| e.to_string())?;
    Ok(name)
}

pub fn set_in_collection(conn: &Connection, collection: i64, ids: &[i64], member: bool) -> Result<()> {
    let sql = if member {
        "INSERT OR IGNORE INTO collection_assets (collection_id, asset_id) VALUES (?1, ?2)"
    } else {
        "DELETE FROM collection_assets WHERE collection_id = ?1 AND asset_id = ?2"
    };
    for id in ids {
        conn.execute(sql, params![collection, id])?;
    }
    Ok(())
}

/// How an image is sliced into animation frames. Keyed by asset id like tags, so it survives rescans and renames.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct SpriteSheet {
    pub cols: u32,
    pub rows: u32,
    pub fps: u32,
}

pub fn sprite_sheet(conn: &Connection, id: i64) -> Result<Option<SpriteSheet>> {
    conn.query_row(
        "SELECT cols, rows, fps FROM sprite_sheets WHERE asset_id = ?1",
        [id],
        |r| {
            Ok(SpriteSheet {
                cols: r.get(0)?,
                rows: r.get(1)?,
                fps: r.get(2)?,
            })
        },
    )
    .optional()
}

pub fn set_sprite_sheet(conn: &Connection, id: i64, s: SpriteSheet) -> std::result::Result<(), String> {
    if !(1..=1024).contains(&s.cols) || !(1..=1024).contains(&s.rows) || !(1..=60).contains(&s.fps) {
        return Err("Use 1 to 1024 columns and rows, and 1 to 60 fps.".into());
    }
    conn.execute(
        "INSERT INTO sprite_sheets (asset_id, cols, rows, fps) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (asset_id) DO UPDATE SET cols = ?2, rows = ?3, fps = ?4",
        params![id, s.cols, s.rows, s.fps],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
