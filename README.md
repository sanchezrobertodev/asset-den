# Asset Den

A desktop asset browser for game developers on Windows, macOS and Linux. Point it at your asset folders and it
indexes every sprite, sound, model, font, video and data file so you can find, preview, tag and drag them into your
engine.

![Asset Den browsing a sample library](docs/screenshot-grid.png)

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

![Quick view of an FBX model](docs/screenshot-quickview.png)

Keyboard: <kbd>/</kbd> search · arrows move · <kbd>Shift</kbd>/<kbd>Ctrl</kbd>-click select · <kbd>Ctrl+A</kbd> select
all · <kbd>Space</kbd> quick view · <kbd>Enter</kbd> open in default app · <kbd>F</kbd> favorite · <kbd>Esc</kbd> close.

## Install

There are no published releases yet, so build the installer on the OS you want it for. It needs Node 22+, Rust
stable and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for that OS.

```bash
make install
make build
```

The installers land in `src-tauri/target/release/bundle/`:

| OS | Installer | Notes |
|---|---|---|
| Windows | `nsis/Asset Den_<version>_x64-setup.exe` (per-user, no admin) or `msi/…_x64_en-US.msi` | The build isn't code-signed, so SmartScreen may warn: choose **More info → Run anyway**. |
| macOS | `dmg/Asset Den_<version>_<arch>.dmg` | Unsigned: the first time, right-click the app and choose **Open**. |
| Linux | `appimage/…AppImage`, `deb/…deb` or `rpm/…rpm` | Install the GStreamer plugins for MP4/H.264 video previews. |

To build all three OSes at once, run the **Build** workflow by hand from the repository's Actions tab.

## Develop

```bash
npm install
npm run tauri dev
```

Run `make check` before every push. It typechecks and bundles the frontend, then runs rustfmt, clippy (warnings are
errors) and the Rust tests. These local checks replace CI on push: the GitHub workflow only runs when started by hand,
to build installers for every OS.

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

## License

[MIT](LICENSE)
