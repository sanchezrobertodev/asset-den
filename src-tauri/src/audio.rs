//! Audio details (length, sample rate, channels, bit depth) read from file headers with Symphonia. Nothing is decoded.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, Result, params};
use symphonia::core::codecs::CodecParameters;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

use crate::db::abs_path;

/// What a file's header says; a field is None when the format doesn't tell (bit depth of MP3) or can't be read (Opus).
#[derive(Default, Debug, PartialEq)]
pub struct AudioInfo {
    pub duration_ms: Option<i64>,
    pub sample_rate: Option<i64>,
    pub channels: Option<i64>,
    pub bits: Option<i64>,
}

/// Packets read to add up a length: about 20 minutes of MP3. Longer files keep the header's length, if any.
const MAX_PACKETS: usize = 50_000;

pub fn read_info(path: &Path, ext: &str) -> Option<AudioInfo> {
    let file = std::fs::File::open(path).ok()?;
    let mut hint = Hint::new();
    hint.with_extension(ext);
    let mut reader = symphonia::default::get_probe()
        .probe(
            &hint,
            MediaSourceStream::new(Box::new(file), Default::default()),
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .ok()?;
    let track = reader.default_track(TrackType::Audio)?.clone();
    let Some(CodecParameters::Audio(p)) = &track.codec_params else {
        return None;
    };
    let mut ticks = track.duration.map(|d| d.get());
    // An MP3 without a Xing/VBRI header only gets a guess from the first frame's bitrate, wrong for VBR: count frames.
    // Demuxing reads the file but decodes nothing.
    if ticks.is_none() || ext == "mp3" {
        let mut total = 0;
        for _ in 0..MAX_PACKETS {
            match reader.next_packet() {
                Ok(Some(pkt)) if pkt.track_id == track.id => total += pkt.dur.get(),
                Ok(Some(_)) => {}
                Ok(None) => {
                    ticks = Some(total);
                    break;
                }
                Err(_) => break,
            }
        }
    }
    let duration_ms = ticks
        .zip(track.time_base)
        .map(|(t, tb)| (u128::from(t) * u128::from(tb.numer.get()) * 1000 / u128::from(tb.denom.get())) as i64);
    Some(AudioInfo {
        duration_ms: duration_ms.filter(|ms| *ms > 0),
        sample_rate: p.sample_rate.map(i64::from),
        channels: p.channels.as_ref().map(|c| c.count() as i64),
        bits: p.bits_per_sample.map(i64::from),
    })
}

/// Stores what was read from version `size`/`mtime` of the file; a row that doesn't match the asset anymore is stale.
/// Does nothing if the asset is gone or has changed since (its newer version may already be stored).
pub fn store(conn: &Connection, id: i64, size: i64, mtime: i64, i: &AudioInfo) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO audio_info (asset_id, size, mtime, duration_ms, sample_rate, channels, bits)
         SELECT id, ?2, ?3, ?4, ?5, ?6, ?7 FROM assets WHERE id = ?1 AND size = ?2 AND mtime = ?3",
        params![id, size, mtime, i.duration_ms, i.sample_rate, i.channels, i.bits],
    )
    .map(|_| ())
}

const BATCH: usize = 500;

/// Reads audio details for a root's audio files that have none yet or changed since, [`BATCH`] files per transaction.
/// The to-do list is read under the lock, the files off it. Unreadable files get an empty row so they aren't retried
/// until they change; files under the scan's `unread` paths wait for the next one. `report(conn, ids)` gets each
/// batch's ids, lock held.
pub fn fill_audio(
    db: &Mutex<Connection>,
    root_id: i64,
    root: &Path,
    unread: &[String],
    mut report: impl FnMut(&Connection, &[i64]),
) -> Result<()> {
    let todo: Vec<(i64, String, String, i64, i64)> = {
        let conn = db.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT a.id, a.rel_path, a.ext, a.size, a.mtime FROM assets a
             LEFT JOIN audio_info i ON i.asset_id = a.id
             WHERE a.root_id = ?1 AND a.kind = 'audio' AND (i.asset_id IS NULL OR i.size != a.size OR i.mtime != a.mtime)",
        )?;
        stmt.query_map([root_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<_>>()?
    };
    let todo: Vec<_> = todo
        .into_iter()
        .filter(|(_, rel, ..)| !crate::scan::unreadable(rel, unread))
        .collect();
    let root = root.to_string_lossy();
    for batch in todo.chunks(BATCH) {
        // On a thread of its own at low priority (see low_priority); this one stores, with the lock.
        let infos: Vec<_> = std::thread::scope(|s| {
            s.spawn(|| {
                crate::low_priority();
                batch
                    .iter()
                    .map(|(id, rel, ext, size, mtime)| {
                        let info = read_info(&abs_path(&root, rel), ext).unwrap_or_default();
                        (*id, *size, *mtime, info)
                    })
                    .collect()
            })
            .join()
            .unwrap()
        });
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        for (id, size, mtime, info) in &infos {
            store(&tx, *id, *size, *mtime, info)?;
        }
        tx.commit()?;
        report(&conn, &infos.iter().map(|i| i.0).collect::<Vec<_>>());
        drop(conn);
        std::thread::sleep(std::time::Duration::from_millis(1)); // let waiting UI commands in, see scan_root
    }
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::{db, scan};
    use std::fs;

    /// A PCM WAV of `frames` silent frames, written by hand.
    pub fn wav(path: &Path, rate: u32, channels: u16, bits: u16, frames: u32) {
        let block = channels * bits / 8;
        let data = frames * u32::from(block);
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + data).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes()); // PCM
        b.extend_from_slice(&channels.to_le_bytes());
        b.extend_from_slice(&rate.to_le_bytes());
        b.extend_from_slice(&(rate * u32::from(block)).to_le_bytes());
        b.extend_from_slice(&block.to_le_bytes());
        b.extend_from_slice(&bits.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&data.to_le_bytes());
        b.resize(b.len() + data as usize, 0);
        fs::write(path, b).unwrap();
    }

    #[test]
    fn reads_wav_headers() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.wav");
        wav(&p, 44_100, 2, 16, 44_100 * 3 + 8_820);
        let want = |ms, rate, ch, bits| AudioInfo {
            duration_ms: Some(ms),
            sample_rate: Some(rate),
            channels: Some(ch),
            bits: Some(bits),
        };
        assert_eq!(read_info(&p, "wav"), Some(want(3200, 44_100, 2, 16)));
        wav(&p, 22_050, 1, 8, 11_025);
        assert_eq!(read_info(&p, "wav"), Some(want(500, 22_050, 1, 8)));
        fs::write(&p, b"not audio").unwrap();
        assert_eq!(read_info(&p, "wav"), None);
    }

    #[test]
    fn fills_and_refreshes_stale_rows() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        wav(&r.join("a.wav"), 8_000, 1, 16, 8_000);
        fs::write(r.join("b.ogg"), "garbage").unwrap();
        fs::write(r.join("c.png"), "x").unwrap();
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r); // scan_root runs fill_audio at the end
        let by_name = |conn: &Connection, n: &str| {
            db::assets(conn, None)
                .unwrap()
                .into_iter()
                .find(|a| a.name == n)
                .unwrap()
        };
        let a = by_name(&conn, "a.wav");
        assert_eq!(
            (a.duration_ms, a.sample_rate, a.channels, a.bits),
            (Some(1000), Some(8_000), Some(1), Some(16))
        );
        assert_eq!(by_name(&conn, "b.ogg").duration_ms, None);
        assert_eq!(by_name(&conn, "c.png").sample_rate, None);

        // Nothing left to do: every audio file has a row, the unreadable one an empty one.
        let db = Mutex::new(conn);
        let mut reported = Vec::new();
        fill_audio(&db, 1, r, &[], |_, ids| reported.extend_from_slice(ids)).unwrap();
        assert!(reported.is_empty());
        let mut conn = db.into_inner().unwrap();

        // Details read from another version of the file don't apply.
        conn.execute("UPDATE assets SET size = size + 1 WHERE name = 'a.wav'", [])
            .unwrap();
        assert_eq!(by_name(&conn, "a.wav").duration_ms, None);
        // The file changes: the next scan reads it again.
        wav(&r.join("a.wav"), 8_000, 1, 16, 16_000);
        scan::tests::scan(&mut conn, 1, r);
        assert_eq!(by_name(&conn, "a.wav").duration_ms, Some(2000));
    }

    #[test]
    fn ignores_stale_reads_and_non_audio() {
        let dir = tempfile::tempdir().unwrap();
        let r = dir.path();
        wav(&r.join("a.wav"), 8_000, 1, 16, 8_000);
        let mut conn = db::open_memory();
        conn.execute("INSERT INTO roots (path) VALUES (?1)", [r.display().to_string()])
            .unwrap();
        scan::tests::scan(&mut conn, 1, r);
        let a = db::assets(&conn, None).unwrap().remove(0);
        assert_eq!(a.duration_ms, Some(1000));

        // A read of an older version that finishes after the current one was stored doesn't replace it.
        let old = AudioInfo {
            duration_ms: Some(5),
            ..Default::default()
        };
        store(&conn, a.id, a.size - 1, a.mtime, &old).unwrap();
        assert_eq!(db::asset(&conn, a.id).unwrap().duration_ms, Some(1000));

        // Renamed to a non-audio extension: same bytes, size and mtime, but no audio details, even after a rescan.
        fs::rename(r.join("a.wav"), r.join("a.txt")).unwrap();
        scan::rename_path(&conn, 1, r, &r.join("a.wav"), &r.join("a.txt"), &mut Vec::new()).unwrap();
        let a = db::asset(&conn, a.id).unwrap();
        assert_eq!((a.kind.as_str(), a.duration_ms, a.sample_rate), ("text", None, None));
        scan::tests::scan(&mut conn, 1, r);
        assert_eq!(db::asset(&conn, a.id).unwrap().duration_ms, None);
    }
}
