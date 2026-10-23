//! Image analysis for "Find similar" and search by colour: a 64-bit difference hash and a few dominant colours per
//! image, computed in the background from the cached thumbnail (or the file shrunk to thumbnail size) and kept until
//! the file changes. Source files are only read.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::SeqCst};
use std::time::{Duration, Instant};

use image::{GrayImage, Luma, RgbaImage, imageops::FilterType};
use rusqlite::{Connection, OptionalExtension, Result, params};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;
use crate::db::abs_path;
use crate::kind::DECODABLE;
use crate::thumbs;

/// Features of one version (size, mtime) of an image. dhash and colors are NULL when it couldn't be decoded, so it isn't
/// retried until the file changes.
pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS image_features (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  dhash INTEGER,
  colors TEXT
);
";

/// r, g, b and the share of the image's opaque pixels in percent.
pub type Swatch = [u8; 4];

pub struct Features {
    pub dhash: u64,
    pub colors: Vec<Swatch>,
}

/// 64-bit difference hash: the image as 9×8 lightness, one bit per horizontal neighbour pair (set when it gets
/// brighter). Lightness is HSL's (max + min) / 2, which a hue shift doesn't change, so recoloured copies stay close.
/// Transparent pixels count as black, so a sprite keeps its outline against the background.
pub fn dhash(img: &RgbaImage) -> u64 {
    let gray = GrayImage::from_fn(img.width(), img.height(), |x, y| {
        let [r, g, b, a] = img.get_pixel(x, y).0;
        let l = (r.max(g).max(b) as u32 + r.min(g).min(b) as u32) * a as u32 / 510;
        Luma([l as u8])
    });
    let small = image::imageops::resize(&gray, 9, 8, FilterType::Triangle);
    let mut h = 0u64;
    for y in 0..8 {
        for x in 0..8 {
            h = h << 1 | u64::from(small.get_pixel(x, y).0[0] < small.get_pixel(x + 1, y).0[0]);
        }
    }
    h
}

fn linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// sRGB (0–255) to OKLab, where Euclidean distance follows perceived colour difference.
pub fn oklab(rgb: [f32; 3]) -> [f32; 3] {
    let [r, g, b] = rgb.map(|c| linear(c / 255.0));
    let l = (0.412_221_46 * r + 0.536_332_55 * g + 0.051_445_995 * b).cbrt();
    let m = (0.211_903_5 * r + 0.680_699_5 * g + 0.107_396_96 * b).cbrt();
    let s = (0.088_302_46 * r + 0.281_718_85 * g + 0.629_978_7 * b).cbrt();
    [
        0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s,
        1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s,
        0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s,
    ]
}

fn dist2(a: [f32; 3], b: [f32; 3]) -> f32 {
    (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)
}

const COLORS: usize = 5;

/// Up to [`COLORS`] dominant colours, heaviest first: k-means in OKLab over a 4-bit-per-channel histogram of the
/// opaque pixels (alpha ≥ 128). Colours under 3% of those pixels are dropped.
pub fn dominant_colors(img: &RgbaImage) -> Vec<Swatch> {
    // Per bin: pixel count and sRGB sums.
    let mut bins = vec![(0u32, [0f32; 3]); 4096];
    for p in img.pixels() {
        let [r, g, b, a] = p.0;
        if a < 128 {
            continue;
        }
        let bin = &mut bins[(r as usize >> 4) << 8 | (g as usize >> 4) << 4 | b as usize >> 4];
        bin.0 += 1;
        bin.1[0] += r as f32;
        bin.1[1] += g as f32;
        bin.1[2] += b as f32;
    }
    // (weight, mean sRGB, OKLab), heaviest first.
    let mut points: Vec<(f32, [f32; 3], [f32; 3])> = bins
        .iter()
        .filter(|b| b.0 > 0)
        .map(|&(n, s)| {
            let rgb = s.map(|c| c / n as f32);
            (n as f32, rgb, oklab(rgb))
        })
        .collect();
    let total: f32 = points.iter().map(|p| p.0).sum();
    if total == 0.0 {
        return vec![];
    }
    points.sort_by(|a, b| b.0.total_cmp(&a.0));
    // Start from the heaviest bins that differ visibly from the ones already picked.
    let mut centers: Vec<[f32; 3]> = Vec::new();
    for p in &points {
        if centers.len() == COLORS {
            break;
        }
        if centers.iter().all(|c| dist2(*c, p.2) > 0.08 * 0.08) {
            centers.push(p.2);
        }
    }
    let mut sums = vec![(0f32, [0f32; 3], [0f32; 3]); centers.len()];
    for _ in 0..8 {
        sums.iter_mut().for_each(|s| *s = (0.0, [0.0; 3], [0.0; 3]));
        for (w, rgb, lab) in &points {
            let k = (0..centers.len())
                .min_by(|&i, &j| dist2(centers[i], *lab).total_cmp(&dist2(centers[j], *lab)))
                .unwrap();
            let s = &mut sums[k];
            s.0 += w;
            for c in 0..3 {
                s.1[c] += w * rgb[c];
                s.2[c] += w * lab[c];
            }
        }
        for (c, s) in centers.iter_mut().zip(&sums) {
            if s.0 > 0.0 {
                *c = s.2.map(|v| v / s.0);
            }
        }
    }
    let mut out: Vec<Swatch> = sums
        .iter()
        .filter(|s| s.0 / total >= 0.03)
        .map(|s| {
            let [r, g, b] = s.1.map(|v| (v / s.0).round().clamp(0.0, 255.0) as u8);
            [r, g, b, (100.0 * s.0 / total).round() as u8]
        })
        .collect();
    out.sort_by(|a, b| b[3].cmp(&a[3]));
    out
}

/// Pixels to analyse: the cached thumbnail when there is one, otherwise the file decoded and shrunk the same way.
fn pixels(src: &Path, ext: &str, thumb: &Path) -> std::result::Result<RgbaImage, String> {
    if let Ok(img) = image::open(thumb) {
        return Ok(img.into_rgba8());
    }
    // shortcut: the shrunk copy isn't written to the thumbnail cache, so 91k images don't fill the disk with thumbnails
    // nobody looked at; write it here if scrolling unvisited folders after a pass ever feels slow.
    let img = thumbs::decode(src, ext)?;
    let max = thumbs::THUMB_SIZE;
    let img = if img.width() > max || img.height() > max {
        img.thumbnail(max, max)
    } else {
        img
    };
    Ok(img.into_rgba8())
}

pub fn features(src: &Path, ext: &str, thumb: &Path) -> std::result::Result<Features, String> {
    let img = pixels(src, ext, thumb)?;
    Ok(Features {
        dhash: dhash(&img),
        colors: dominant_colors(&img),
    })
}

/// An image whose features are missing or out of date.
pub struct Todo {
    pub id: i64,
    pub path: PathBuf,
    pub ext: String,
    pub size: i64,
    pub mtime: i64,
}

impl Todo {
    fn thumb(&self, thumbs_dir: &Path) -> PathBuf {
        thumbs_dir.join(thumbs::cache_name(
            &self.path.display().to_string(),
            self.size,
            self.mtime,
        ))
    }
}

fn stale_sql(select: &str) -> String {
    let exts = DECODABLE.iter().map(|e| format!("'{e}'")).collect::<Vec<_>>().join(",");
    format!(
        "SELECT {select} FROM assets a JOIN roots r ON r.id = a.root_id
         LEFT JOIN image_features f ON f.asset_id = a.id
         WHERE a.kind = 'image' AND a.ext IN ({exts})
           AND (f.asset_id IS NULL OR f.size != a.size OR f.mtime != a.mtime)"
    )
}

pub fn stale(conn: &Connection) -> Result<Vec<Todo>> {
    let mut stmt = conn.prepare(&stale_sql("a.id, r.path, a.rel_path, a.ext, a.size, a.mtime"))?;
    stmt.query_map([], |r| {
        let root: String = r.get(1)?;
        let rel: String = r.get(2)?;
        Ok(Todo {
            id: r.get(0)?,
            path: abs_path(&root, &rel),
            ext: r.get(3)?,
            size: r.get(4)?,
            mtime: r.get(5)?,
        })
    })?
    .collect()
}

/// How many images still wait for analysis.
pub fn pending(conn: &Connection) -> Result<usize> {
    conn.query_row(&stale_sql("count(*)"), [], |r| r.get::<_, i64>(0))
        .map(|n| n as usize)
}

/// Stores features for the file versions they were computed from. Skipped when the asset is gone or has changed since.
pub fn store(conn: &Connection, rows: &[(i64, i64, i64, Option<Features>)]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO image_features (asset_id, size, mtime, dhash, colors)
         SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM assets WHERE id = ?1 AND size = ?2 AND mtime = ?3)
         ON CONFLICT (asset_id) DO UPDATE SET
           size = excluded.size, mtime = excluded.mtime, dhash = excluded.dhash, colors = excluded.colors",
    )?;
    for (id, size, mtime, f) in rows {
        let colors = f.as_ref().map(|f| serde_json::to_string(&f.colors).unwrap_or_default());
        stmt.execute(params![id, size, mtime, f.as_ref().map(|f| f.dhash as i64), colors])?;
    }
    Ok(())
}

const FRESH: &str =
    "FROM image_features f JOIN assets a ON a.id = f.asset_id AND a.size = f.size AND a.mtime = f.mtime";

/// Dominant colours of every analysed image.
pub fn colors(conn: &Connection) -> Result<Vec<(i64, Vec<Swatch>)>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT f.asset_id, f.colors {FRESH} WHERE f.colors IS NOT NULL"
    ))?;
    stmt.query_map([], |r| {
        let json: String = r.get(1)?;
        Ok((r.get(0)?, serde_json::from_str(&json).unwrap_or_default()))
    })?
    .collect()
}

/// The image's hash, if it's analysed and up to date.
pub fn dhash_of(conn: &Connection, id: i64) -> Result<Option<u64>> {
    conn.query_row(
        &format!("SELECT f.dhash {FRESH} WHERE f.asset_id = ?1 AND f.dhash IS NOT NULL"),
        [id],
        |r| r.get::<_, i64>(0),
    )
    .optional()
    .map(|h| h.map(|h| h as u64))
}

/// Other images within `max` differing bits of `hash`, closest first.
pub fn similar(conn: &Connection, id: i64, hash: u64, max: u32) -> Result<Vec<i64>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT f.asset_id, f.dhash {FRESH} WHERE f.dhash IS NOT NULL AND f.asset_id != ?1"
    ))?;
    let mut hits = Vec::new();
    for row in stmt.query_map([id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (other, h) = row?;
        let d = (h as u64 ^ hash).count_ones();
        if d <= max {
            hits.push((d, other));
        }
    }
    hits.sort_unstable();
    Ok(hits.into_iter().map(|(_, other)| other).collect())
}

const BATCH: usize = 500;

/// Analyses `todo` [`BATCH`] images at a time on `workers` threads and stores each batch in one transaction, so the lock
/// is only held for the write. `gate()` runs before each image and its result (a decode permit) is held while that
/// image is read. `after(conn, colours, left)` runs after each commit with the lock held.
pub fn analyse_and_store<G>(
    db: &Mutex<Connection>,
    todo: &[Todo],
    workers: usize,
    thumbs_dir: &Path,
    gate: impl Fn() -> G + Sync,
    mut after: impl FnMut(&Connection, Vec<(i64, Vec<Swatch>)>, usize),
) -> Result<()> {
    let mut left = todo.len();
    for batch in todo.chunks(BATCH) {
        let next = AtomicUsize::new(0);
        let rows: Vec<_> = std::thread::scope(|s| {
            let handles: Vec<_> = (0..workers.max(1))
                .map(|_| {
                    s.spawn(|| {
                        let mut out = Vec::new();
                        while let Some(t) = batch.get(next.fetch_add(1, SeqCst)) {
                            let _permit = gate();
                            let f = features(&t.path, &t.ext, &t.thumb(thumbs_dir)).ok();
                            out.push((t.id, t.size, t.mtime, f));
                        }
                        out
                    })
                })
                .collect();
            handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
        });
        left -= batch.len();
        let colours = rows
            .iter()
            .filter_map(|(id, _, _, f)| f.as_ref().map(|f| (*id, f.colors.clone())))
            .collect();
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        store(&tx, &rows)?;
        tx.commit()?;
        after(&conn, colours, left);
        drop(conn);
        // The mutex isn't fair: without a pause the next batch can re-lock before a waiting command.
        std::thread::sleep(Duration::from_millis(1));
    }
    Ok(())
}

/// Sent after every stored batch: the new colours, and how many images are left.
#[derive(Serialize, Clone)]
struct Progress {
    left: usize,
    colors: Vec<(i64, Vec<Swatch>)>,
}

static RUNNING: AtomicBool = AtomicBool::new(false);
static AGAIN: AtomicBool = AtomicBool::new(false);

/// Brings image features up to date on a background thread. A call while a pass runs makes it go once more after.
pub fn request(app: &AppHandle) {
    AGAIN.store(true, SeqCst);
    if RUNNING.swap(true, SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            AGAIN.store(false, SeqCst);
            if let Err(e) = run(&app) {
                eprintln!("analysis: {e}");
            }
            RUNNING.store(false, SeqCst);
            if !AGAIN.load(SeqCst) || RUNNING.swap(true, SeqCst) {
                break;
            }
        }
    });
}

fn run(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let todo = stale(&state.db.lock().unwrap())?;
    if todo.is_empty() {
        return Ok(());
    }
    let started = Instant::now();
    // At most half the thumbnail permits, so thumbnails for what's on screen always have the other half.
    let workers = (std::thread::available_parallelism().map_or(4, |n| n.get().clamp(2, 8)) / 2).max(1);
    let gate = || {
        // Scans go first: they hold the lock often and the UI is waiting for them.
        while !state.scanning.lock().unwrap().is_empty() {
            std::thread::sleep(Duration::from_millis(200));
        }
        loop {
            if let Ok(permit) = state.thumb_permits.try_acquire() {
                return permit;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    };
    analyse_and_store(&state.db, &todo, workers, &state.thumbs_dir, gate, |_, colors, left| {
        let _ = app.emit("image-features", Progress { left, colors });
    })?;
    let secs = started.elapsed().as_secs_f32();
    eprintln!(
        "analysis: {} images in {secs:.1}s ({:.0}/s, {workers} workers)",
        todo.len(),
        todo.len() as f32 / secs
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, scan};
    use image::{Rgba, imageops};

    /// A picture with structure: a diagonal gradient, a disc and two bars.
    fn scene(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| {
            let (u, v) = (x as f32 / w as f32, y as f32 / h as f32);
            if (u - 0.35).powi(2) + (v - 0.45).powi(2) < 0.04 {
                Rgba([220, 60, 40, 255])
            } else if (0.6..0.7).contains(&u) || (0.75..0.85).contains(&v) {
                Rgba([30, 40, 160, 255])
            } else {
                let g = (255.0 * (u + v) / 2.0) as u8;
                Rgba([g, g / 2 + 60, 255 - g, 255])
            }
        })
    }

    /// A different picture: checkerboard of large cells.
    fn other(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| {
            if (x * 5 / w + y * 3 / h).is_multiple_of(2) {
                Rgba([240, 240, 240, 255])
            } else {
                Rgba([20, 20, 20, 255])
            }
        })
    }

    fn d(a: &RgbaImage, b: &RgbaImage) -> u32 {
        (dhash(a) ^ dhash(b)).count_ones()
    }

    #[test]
    fn dhash_is_close_for_edits_and_far_for_other_images() {
        let a = scene(240, 180);
        assert_eq!(d(&a, &a.clone()), 0);
        assert!(d(&a, &scene(96, 72)) <= 3, "resized: {}", d(&a, &scene(96, 72)));
        assert!(d(&a, &imageops::resize(&a, 600, 450, FilterType::Lanczos3)) <= 3);
        // Recoloured: a hue shift (channels rotated) keeps lightness, so the hash; a strong tint moves it some.
        let recolor = |f: fn([u8; 4]) -> [u8; 4]| RgbaImage::from_fn(240, 180, |x, y| Rgba(f(a.get_pixel(x, y).0)));
        assert_eq!(d(&a, &recolor(|[r, g, b, al]| [g, b, r, al])), 0);
        let tinted = recolor(|[r, g, b, al]| [r / 2 + 100, g, b / 2, al]);
        assert!(d(&a, &tinted) <= 12, "tinted: {}", d(&a, &tinted));
        let cropped = imageops::crop_imm(&a, 8, 6, 224, 168).to_image();
        assert!(d(&a, &cropped) <= 10, "cropped: {}", d(&a, &cropped));
        assert!(d(&a, &other(240, 180)) >= 24, "different: {}", d(&a, &other(240, 180)));
    }

    #[test]
    fn dhash_keeps_a_recoloured_sprite_close() {
        // A ring on a transparent background, in red and in green.
        let sprite = |c: [u8; 3]| {
            RgbaImage::from_fn(64, 64, |x, y| {
                let r = ((x as f32 - 31.5).powi(2) + (y as f32 - 31.5).powi(2)).sqrt();
                if (14.0..26.0).contains(&r) {
                    Rgba([c[0], c[1], c[2], 255])
                } else {
                    Rgba([0, 0, 0, 0])
                }
            })
        };
        let (red, green) = (sprite([220, 30, 30]), sprite([40, 200, 60]));
        assert!(d(&red, &green) <= 4, "{}", d(&red, &green));
    }

    #[test]
    fn colours_of_solid_two_tone_and_transparent_images() {
        let solid = RgbaImage::from_pixel(32, 32, Rgba([255, 0, 0, 255]));
        assert_eq!(dominant_colors(&solid), vec![[255, 0, 0, 100]]);

        let two = RgbaImage::from_fn(100, 10, |x, _| {
            if x < 70 {
                Rgba([20, 60, 200, 255])
            } else {
                Rgba([250, 220, 30, 255])
            }
        });
        assert_eq!(dominant_colors(&two), vec![[20, 60, 200, 70], [250, 220, 30, 30]]);

        // Transparent pixels don't count, whatever their colour.
        let half = RgbaImage::from_fn(10, 10, |x, _| {
            if x < 5 {
                Rgba([255, 255, 255, 0])
            } else {
                Rgba([0, 180, 0, 255])
            }
        });
        assert_eq!(dominant_colors(&half), vec![[0, 180, 0, 100]]);
        assert!(dominant_colors(&RgbaImage::new(4, 4)).is_empty());

        // A busy picture still gives at most five colours, heaviest first, weights adding up to about 100.
        let c = dominant_colors(&scene(120, 90));
        assert!((2..=COLORS).contains(&c.len()));
        assert!(c.windows(2).all(|w| w[0][3] >= w[1][3]));
        let sum: u32 = c.iter().map(|s| s[3] as u32).sum();
        assert!((90..=102).contains(&sum), "{c:?}");
    }

    #[test]
    fn pass_stores_features_and_finds_near_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let (r, thumbs_dir) = (dir.path().join("lib"), dir.path().join("thumbs"));
        std::fs::create_dir_all(&r).unwrap();
        std::fs::create_dir_all(&thumbs_dir).unwrap();
        scene(480, 360).save(r.join("hero.png")).unwrap();
        scene(120, 90).save(r.join("hero-small.png")).unwrap();
        other(240, 180).save(r.join("checker.png")).unwrap();
        RgbaImage::from_pixel(16, 16, Rgba([255, 0, 0, 255]))
            .save(r.join("red.png"))
            .unwrap();
        std::fs::write(r.join("broken.png"), "not a png").unwrap();
        std::fs::write(r.join("icon.svg"), "<svg/>").unwrap();
        let mut conn = db::open_memory();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, &r);
        let id = |name: &str| -> i64 {
            conn.query_row("SELECT id FROM assets WHERE name = ?1", [name], |r| r.get(0))
                .unwrap()
        };
        let (hero, small, checker, red) = (id("hero.png"), id("hero-small.png"), id("checker.png"), id("red.png"));

        // The red square has a cached thumbnail that is blue: the thumbnail is what gets analysed.
        let todo = stale(&conn).unwrap();
        assert_eq!(todo.len(), 5); // not the SVG
        let red_todo = todo.iter().find(|t| t.id == red).unwrap();
        RgbaImage::from_pixel(16, 16, Rgba([0, 0, 255, 255]))
            .save(red_todo.thumb(&thumbs_dir))
            .unwrap();

        let db = Mutex::new(conn);
        let mut reported = Vec::new();
        analyse_and_store(
            &db,
            &todo,
            2,
            &thumbs_dir,
            || (),
            |_, colors, left| reported.push((colors.len(), left)),
        )
        .unwrap();
        assert_eq!(reported, vec![(4, 0)]); // the broken file has no colours
        let conn = db.into_inner().unwrap();
        assert_eq!(pending(&conn).unwrap(), 0);
        let colors = colors(&conn).unwrap();
        assert_eq!(colors.iter().find(|c| c.0 == red).unwrap().1, vec![[0, 0, 255, 100]]);

        let h = dhash_of(&conn, hero).unwrap().unwrap();
        assert_eq!(similar(&conn, hero, h, 10).unwrap(), vec![small]);
        assert!(similar(&conn, hero, h, 64).unwrap().contains(&checker));

        // A changed file is stale until analysed again, and its old hash isn't used.
        conn.execute("UPDATE assets SET mtime = mtime + 1 WHERE id = ?1", [small])
            .unwrap();
        assert_eq!(pending(&conn).unwrap(), 1);
        assert!(dhash_of(&conn, small).unwrap().is_none());
        assert!(similar(&conn, hero, h, 10).unwrap().is_empty());
        // Results for a version that's gone, or an asset that's gone, aren't stored.
        let f = || Some(features(&r.join("hero.png"), "png", Path::new("")).unwrap());
        store(&conn, &[(small, 0, 0, f()), (9999, 0, 0, f())]).unwrap();
        assert_eq!(pending(&conn).unwrap(), 1);
        assert!(dhash_of(&conn, 9999).unwrap().is_none());
    }
}
