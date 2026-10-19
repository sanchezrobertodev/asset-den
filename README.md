# Asset Den

A desktop asset browser for game developers on Windows, macOS and Linux. Point it at your asset folders and it
indexes every sprite, sound, model, font, video and data file so you can find, preview, tag and drag them into your
engine.

**Your files are only ever read.** Asset Den never renames, moves, edits or deletes anything in your folders. Tags,
favorites and collections live in the app's own database. Removing a folder from the library only forgets it.

## Features

- **Library**: add one or more folders. A fast scan indexes them and a live watcher picks up added, renamed and
  deleted files. Renames keep their tags. Engine sidecars (`.meta`, `.import`, `.uid`), hidden folders and
  `node_modules` are skipped.
- **Browse**: virtualized grid with adjustable thumbnails, or a sortable list. Search by name, folder or `#tag`,
  filter by type, and sort by name, kind, size, date or folder.
- **Quick view** (<kbd>Space</kbd>, arrows to step through):
  - images: zoom and pan, pixel-art scaling, checkerboard for transparency (PNG, JPG, GIF, WebP, BMP, SVG, plus
    TGA/PSD/TIFF via a decoded preview)
  - audio: waveform and playback (WAV, OGG, MP3, FLAC…), plus play-on-hover in the grid
  - 3D models: orbit viewer with wireframe, triangle counts and the first animation playing (GLB/glTF, FBX, OBJ, STL),
    plus auto-rendered thumbnails
  - fonts: specimen at several sizes with editable sample text
  - video playback; JSON, shaders, scripts and other text
- **Tags, favorites, collections**: work on one asset or a whole selection.
- **Drag out**: drag one card or a selection into Unity, Godot, Unreal, Blender or a folder. It always copies.
- **Duplicates**: finds identical files across folders (hashes only same-size files) and shows the space they waste.
- **Stats**: disk usage by type, extension and top-level folder.

Keyboard: <kbd>/</kbd> search · arrows move · <kbd>Shift</kbd>/<kbd>Ctrl</kbd>-click select · <kbd>Ctrl+A</kbd> select
all · <kbd>Space</kbd> quick view · <kbd>Enter</kbd> open in default app · <kbd>F</kbd> favorite · <kbd>Esc</kbd> close.

## Develop

Requires Node 22+, Rust stable and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev
```

`make check` runs the typecheck, Rust tests, clippy and rustfmt, the same checks as CI. `npm run tauri build` makes
installers for the current OS. CI (`.github/workflows/release.yml`) builds Windows, macOS (universal) and Linux
bundles.

## Where things live

| What | Where |
|---|---|
| Index, tags, favorites, collections | `asset-den.db` (SQLite) in the app data folder |
| Thumbnails and decoded previews | `thumbs/` and `previews/` in the app cache folder (safe to delete) |
| UI preferences | browser storage in the app's webview |

## Known limits

- PSD previews use the flattened composite. Some layered or 16-bit files fall back to an icon.
- OBJ files are shown without their `.mtl` materials. FBX textures with absolute paths from another machine won't load.
- Which audio and video formats play depends on the OS webview. Windows (WebView2) plays the most; on Linux, install
  the GStreamer plugins for MP4/H.264.
- A file renamed while the app is closed shows up as a new file on the next scan, so its tags don't follow it.
- Video thumbnails, sprite-sheet slicing and syntax highlighting are not in v1.
