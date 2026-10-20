mod db;
mod dupes;
mod kind;
mod scan;
mod thumbs;
mod watch;

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use db::{Asset, Collection, Root};

pub struct AppState {
    pub db: Mutex<Connection>,
    thumbs_dir: PathBuf,
    previews_dir: PathBuf,
    drag_icon: PathBuf,
    thumb_permits: tokio::sync::Semaphore,
    watchers: Mutex<HashMap<i64, watch::Watcher>>,
    scanning: Mutex<HashSet<i64>>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn with_db<T>(state: &AppState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    f(&state.db.lock().unwrap()).map_err(err)
}

fn asset(state: &AppState, id: i64) -> Result<Asset, String> {
    db::asset(&state.db.lock().unwrap(), id)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    root_id: i64,
    count: usize,
    done: bool,
}

/// Rescans a root on a worker thread, reporting progress. Skips if that root is already being scanned.
fn spawn_scan(app: AppHandle, root: Root) {
    if !app.state::<AppState>().scanning.lock().unwrap().insert(root.id) {
        return;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let progress = |count, done| {
            let _ = app.emit(
                "scan-progress",
                ScanProgress {
                    root_id: root.id,
                    count,
                    done,
                },
            );
        };
        // Commits in batches, so the UI can list and thumbnail assets while the scan runs.
        let result = scan::scan_root(&state.db, root.id, Path::new(&root.path), |n| progress(n, false));
        state.scanning.lock().unwrap().remove(&root.id);
        if let Err(e) = &result {
            eprintln!("scan {}: {e}", root.path);
        }
        progress(result.unwrap_or(0), true);
        let _ = app.emit("assets-changed", root.id);
    });
}

/// Lets the webview load files under `path`, and watches it for changes.
fn activate_root(app: &AppHandle, root: &Root) {
    if let Err(e) = app.asset_protocol_scope().allow_directory(&root.path, true) {
        eprintln!("asset scope {}: {e}", root.path);
    }
    // Starting a watcher walks the whole tree (file-ID cache), which takes seconds on big folders: do it off-thread.
    let (app, root) = (app.clone(), root.clone());
    tauri::async_runtime::spawn_blocking(
        move || match watch::start(app.clone(), root.id, PathBuf::from(&root.path)) {
            Ok(w) => {
                let state = app.state::<AppState>();
                // The folder may have been removed while the watcher was starting.
                if with_db(&state, |c| db::root(c, root.id)).is_ok() {
                    state.watchers.lock().unwrap().insert(root.id, w);
                }
            }
            Err(e) => eprintln!("watch {}: {e}", root.path),
        },
    );
}

/// Lowercased on Windows and macOS, where paths are usually case-insensitive.
fn path_key(p: &str) -> PathBuf {
    let p = p.trim_end_matches(['/', '\\']);
    if cfg!(any(windows, target_os = "macos")) {
        PathBuf::from(p.to_lowercase())
    } else {
        PathBuf::from(p)
    }
}

#[tauri::command]
fn list_roots(state: State<'_, AppState>) -> Result<Vec<Root>, String> {
    with_db(&state, db::roots)
}

#[tauri::command]
fn add_root(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Root, String> {
    let dir = Path::new(&path);
    if !dir.is_absolute() || !dir.is_dir() {
        return Err(format!("{path} is not a folder."));
    }
    let key = path_key(&path);
    for r in with_db(&state, db::roots)? {
        let other = path_key(&r.path);
        if key.starts_with(&other) || other.starts_with(&key) {
            return Err(format!(
                "{path} overlaps a folder that's already in the library ({}).",
                r.path
            ));
        }
    }
    let path = path.trim_end_matches(['/', '\\']).to_string();
    let path = if path.ends_with(':') { format!("{path}\\") } else { path }; // keep drive roots valid
    let root = with_db(&state, |c| {
        c.execute("INSERT INTO roots (path) VALUES (?1)", [&path])?;
        Ok(Root {
            id: c.last_insert_rowid(),
            path: path.clone(),
        })
    })?;
    activate_root(&app, &root);
    spawn_scan(app, root.clone());
    Ok(root)
}

/// Forgets a folder. Only the library entry goes; the files are never touched.
#[tauri::command]
fn remove_root(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.watchers.lock().unwrap().remove(&id);
    with_db(&state, |c| {
        c.execute("DELETE FROM roots WHERE id = ?1", [id]).map(|_| ())
    })
}

#[tauri::command]
fn rescan(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let root = with_db(&state, |c| db::root(c, id))?;
    spawn_scan(app, root);
    Ok(())
}

#[tauri::command]
fn list_assets(state: State<'_, AppState>) -> Result<Vec<Asset>, String> {
    with_db(&state, |c| db::assets(c, None))
}

/// Cached thumbnail path, generated on first request. None for kinds the backend can't draw (the UI uses an icon,
/// or renders and saves one itself for 3D models).
#[tauri::command]
async fn thumbnail(state: State<'_, AppState>, id: i64) -> Result<Option<String>, String> {
    let a = asset(&state, id)?;
    let out = state.thumbs_dir.join(thumbs::cache_name(&a.path, a.size, a.mtime));
    if out.exists() {
        return Ok(Some(out.display().to_string()));
    }
    if a.kind != "image" || !kind::decodable(&a.ext) {
        return Ok(None);
    }
    let _permit = state.thumb_permits.acquire().await.map_err(err)?;
    let made = tauri::async_runtime::spawn_blocking(move || thumbs::thumbnail(Path::new(&a.path), &a.ext, &out))
        .await
        .map_err(err)??;
    Ok(Some(made.display().to_string()))
}

#[tauri::command]
fn save_thumbnail(state: State<'_, AppState>, id: i64, png: Vec<u8>) -> Result<String, String> {
    let a = asset(&state, id)?;
    let out = state.thumbs_dir.join(thumbs::cache_name(&a.path, a.size, a.mtime));
    thumbs::save_png(&png, &out)?;
    Ok(out.display().to_string())
}

/// Full-size PNG for image formats the webview can't display (TGA, PSD, TIFF).
#[tauri::command]
async fn preview(state: State<'_, AppState>, id: i64) -> Result<String, String> {
    let a = asset(&state, id)?;
    if !kind::decodable(&a.ext) {
        return Err("No preview for this file type".into());
    }
    let out = state.previews_dir.join(thumbs::cache_name(&a.path, a.size, a.mtime));
    let _permit = state.thumb_permits.acquire().await.map_err(err)?;
    let made = tauri::async_runtime::spawn_blocking(move || thumbs::preview(Path::new(&a.path), &a.ext, &out))
        .await
        .map_err(err)??;
    Ok(made.display().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextPreview {
    text: String,
    truncated: bool,
}

const TEXT_LIMIT: u64 = 1024 * 1024;

fn read_capped(path: &Path, limit: u64) -> Result<TextPreview, String> {
    let file = std::fs::File::open(path).map_err(err)?;
    let mut buf = Vec::new();
    file.take(limit + 1).read_to_end(&mut buf).map_err(err)?;
    let truncated = buf.len() as u64 > limit;
    buf.truncate(limit as usize);
    Ok(TextPreview {
        text: String::from_utf8_lossy(&buf).into_owned(),
        truncated,
    })
}

#[tauri::command]
fn read_text(state: State<'_, AppState>, id: i64) -> Result<TextPreview, String> {
    read_capped(Path::new(&asset(&state, id)?.path), TEXT_LIMIT)
}

#[tauri::command]
fn set_favorite(state: State<'_, AppState>, ids: Vec<i64>, favorite: bool) -> Result<(), String> {
    with_db(&state, |c| db::set_favorite(c, &ids, favorite))
}

#[tauri::command]
fn add_tag(state: State<'_, AppState>, ids: Vec<i64>, tag: String) -> Result<String, String> {
    let tag = db::clean_tag(&tag)?;
    with_db(&state, |c| db::add_tag(c, &ids, &tag))?;
    Ok(tag)
}

#[tauri::command]
fn remove_tag(state: State<'_, AppState>, ids: Vec<i64>, tag: String) -> Result<(), String> {
    with_db(&state, |c| db::remove_tag(c, &ids, &tag))
}

#[tauri::command]
fn get_sprite_sheet(state: State<'_, AppState>, id: i64) -> Result<Option<db::SpriteSheet>, String> {
    with_db(&state, |c| db::sprite_sheet(c, id))
}

#[tauri::command]
fn set_sprite_sheet(state: State<'_, AppState>, id: i64, sheet: db::SpriteSheet) -> Result<(), String> {
    db::set_sprite_sheet(&state.db.lock().unwrap(), id, sheet)
}

#[tauri::command]
fn list_collections(state: State<'_, AppState>) -> Result<Vec<Collection>, String> {
    with_db(&state, db::collections)
}

#[tauri::command]
fn create_collection(state: State<'_, AppState>, name: String) -> Result<i64, String> {
    db::create_collection(&state.db.lock().unwrap(), &name)
}

#[tauri::command]
fn delete_collection(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    with_db(&state, |c| {
        c.execute("DELETE FROM collections WHERE id = ?1", [id]).map(|_| ())
    })
}

#[tauri::command]
fn set_in_collection(state: State<'_, AppState>, collection: i64, ids: Vec<i64>, member: bool) -> Result<(), String> {
    with_db(&state, |c| db::set_in_collection(c, collection, &ids, member))
}

#[tauri::command]
async fn find_duplicates(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<dupes::DupGroup>, String> {
    let todo = with_db(&state, dupes::unhashed)?;
    // Hashes off the lock and stores in batches, so a big first check doesn't block scans and UI commands.
    tauri::async_runtime::spawn_blocking(move || dupes::hash_and_store(&app.state::<AppState>().db, &todo))
        .await
        .map_err(err)?
        .map_err(err)?;
    with_db(&state, dupes::groups)
}

/// "Not duplicates" / "Keep both": hides a group until it's un-ignored.
#[tauri::command]
fn set_duplicate_ignored(state: State<'_, AppState>, hash: String, ignored: bool) -> Result<(), String> {
    with_db(&state, |c| dupes::set_ignored(c, &hash, ignored))
}

/// The one command that changes files: moves copies of `keep` to the OS trash (restorable there), after
/// re-checking byte for byte that they are still identical, and moves their tags, favorite and collections to `keep`.
#[tauri::command]
async fn trash_duplicates(state: State<'_, AppState>, keep: i64, remove: Vec<i64>) -> Result<usize, String> {
    let kept = asset(&state, keep)?;
    let copies = remove
        .iter()
        .filter(|id| **id != keep)
        .map(|id| asset(&state, *id))
        .collect::<Result<Vec<_>, _>>()?;
    let paths: Vec<PathBuf> = copies.iter().map(|a| PathBuf::from(&a.path)).collect();
    let keep_path = PathBuf::from(&kept.path);
    let identical = tauri::async_runtime::spawn_blocking(move || {
        let want = dupes::hash_file(&keep_path).map_err(err)?;
        for p in &paths {
            if dupes::hash_file(p).map_err(err)? != want {
                return Err(format!("{} is no longer identical, so nothing was moved.", p.display()));
            }
        }
        Ok::<_, String>(())
    })
    .await
    .map_err(err)?;
    identical?;
    let mut done = 0;
    for copy in &copies {
        trash::delete(&copy.path).map_err(|e| format!("Couldn't move {} to the trash: {e}", copy.name))?;
        with_db(&state, |c| dupes::merge_and_forget(c, keep, copy.id))?;
        done += 1;
    }
    Ok(done)
}

#[tauri::command]
fn rename_collection(state: State<'_, AppState>, id: i64, name: String) -> Result<String, String> {
    db::rename_collection(&state.db.lock().unwrap(), id, &name)
}

/// `dir/name`, or `dir/stem (2).ext` and so on if that's taken, so copies never overwrite anything.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let p = Path::new(name);
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = p
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    (1..)
        .map(|n| {
            if n == 1 {
                dir.join(name)
            } else {
                dir.join(format!("{stem} ({n}){ext}"))
            }
        })
        .find(|c| !c.exists())
        .unwrap()
}

fn copy_into(files: &[Asset], dest: &Path) -> (usize, Vec<String>) {
    let mut failed = Vec::new();
    let mut copied = 0;
    for a in files {
        let target = free_path(dest, &a.name);
        let r = std::fs::File::open(&a.path).and_then(|mut src| {
            let mut out = std::fs::OpenOptions::new().write(true).create_new(true).open(&target)?;
            std::io::copy(&mut src, &mut out)
        });
        match r {
            Ok(_) => copied += 1,
            Err(e) => failed.push(format!("{}: {e}", a.name)),
        }
    }
    (copied, failed)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CopyResult {
    copied: usize,
    failed: Vec<String>,
}

/// Copies a collection's files into `dest`. Originals are only read; existing files in `dest` are never replaced.
#[tauri::command]
async fn copy_collection(state: State<'_, AppState>, id: i64, dest: String) -> Result<CopyResult, String> {
    let dest = PathBuf::from(dest);
    if !dest.is_dir() {
        return Err(format!("{} is not a folder.", dest.display()));
    }
    let files = with_db(&state, |c| {
        let ids = db::collections(c)?
            .into_iter()
            .find(|col| col.id == id)
            .map(|col| col.asset_ids)
            .unwrap_or_default();
        Ok(db::assets(c, None)?
            .into_iter()
            .filter(|a| ids.contains(&a.id))
            .collect::<Vec<_>>())
    })?;
    let (copied, failed) = tauri::async_runtime::spawn_blocking(move || copy_into(&files, &dest))
        .await
        .map_err(err)?;
    Ok(CopyResult { copied, failed })
}

#[tauri::command]
fn reveal(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<(), String> {
    app.opener().reveal_item_in_dir(asset(&state, id)?.path).map_err(err)
}

/// Opens in the default app. Refused for unknown file types, which could be programs or scripts.
#[tauri::command]
fn open_default(app: AppHandle, state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let a = asset(&state, id)?;
    if a.kind == "other" {
        return Err("Asset Den only opens known asset types. Use Show in folder instead.".into());
    }
    app.opener().open_path(a.path, None::<&str>).map_err(err)
}

/// Whether the update feed has entries for this platform. `make release` only publishes Windows builds, and a
/// platform missing from `latest.json` would get an error on every check, so other platforms don't check at all.
#[tauri::command]
fn app_updates_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "x86_64"))
}

#[tauri::command]
fn drag_icon(state: State<'_, AppState>) -> String {
    state.drag_icon.display().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            let cache = app.path().app_cache_dir()?;
            let thumbs_dir = cache.join("thumbs");
            let previews_dir = cache.join("previews");
            for d in [&data, &thumbs_dir, &previews_dir] {
                std::fs::create_dir_all(d)?;
            }
            let drag_icon = cache.join("drag-icon.png");
            if !drag_icon.exists() {
                image::RgbaImage::from_pixel(48, 48, image::Rgba([34, 197, 94, 255])).save(&drag_icon)?;
            }
            app.asset_protocol_scope().allow_directory(&cache, true)?;

            let conn = db::open(&data.join("asset-den.db"))?;
            let roots = db::roots(&conn)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                thumbs_dir,
                previews_dir,
                drag_icon,
                // One decode per core (2 to 8): the frontend only sends what's on screen, so use the CPU for it.
                thumb_permits: tokio::sync::Semaphore::new(
                    std::thread::available_parallelism().map_or(4, |n| n.get().clamp(2, 8)),
                ),
                watchers: Mutex::new(HashMap::new()),
                scanning: Mutex::new(HashSet::new()),
            });
            // Catch up on anything that changed while the app was closed.
            for root in roots {
                activate_root(app.handle(), &root);
                spawn_scan(app.handle().clone(), root);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_roots,
            add_root,
            remove_root,
            rescan,
            list_assets,
            thumbnail,
            save_thumbnail,
            preview,
            read_text,
            set_favorite,
            add_tag,
            remove_tag,
            get_sprite_sheet,
            set_sprite_sheet,
            list_collections,
            create_collection,
            delete_collection,
            set_in_collection,
            find_duplicates,
            set_duplicate_ignored,
            trash_duplicates,
            rename_collection,
            copy_collection,
            reveal,
            open_default,
            drag_icon,
            app_updates_supported
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn copies_never_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let (src, dest) = (dir.path().join("src"), dir.path().join("dest"));
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(src.join("hero.png"), "new").unwrap();
        std::fs::write(dest.join("hero.png"), "old").unwrap();
        let a = crate::db::Asset {
            id: 1,
            root_id: 1,
            rel_path: "hero.png".into(),
            path: src.join("hero.png").display().to_string(),
            name: "hero.png".into(),
            ext: "png".into(),
            kind: "image".into(),
            size: 3,
            mtime: 0,
            width: None,
            height: None,
            favorite: false,
            tags: vec![],
        };
        let (copied, failed) = super::copy_into(&[a.clone(), a], &dest);
        assert_eq!((copied, failed.len()), (2, 0));
        assert_eq!(std::fs::read_to_string(dest.join("hero.png")).unwrap(), "old");
        assert_eq!(std::fs::read_to_string(dest.join("hero (2).png")).unwrap(), "new");
        assert!(dest.join("hero (3).png").exists());
    }

    #[test]
    fn read_text_is_capped() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("big.json");
        std::fs::write(&p, "x".repeat(100)).unwrap();
        let t = super::read_capped(&p, 10).unwrap();
        assert_eq!((t.text.len(), t.truncated), (10, true));
        let t = super::read_capped(&p, 100).unwrap();
        assert_eq!((t.text.len(), t.truncated), (100, false));
    }
}
