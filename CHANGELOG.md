# Changelog

All notable changes to Asset Den are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- macOS and Linux builds are published with each release: a universal macOS `.dmg` (Apple Silicon and Intel), a Linux
  AppImage and a `.deb`. The macOS app and the AppImage update themselves like the Windows app; a `.deb` install
  updates by installing the next `.deb`. The macOS app isn't notarized, so macOS asks for confirmation the first time
  it opens.
- A welcome screen on first run says what Asset Den does, imports your first folder and shows three tips (drag cards
  into your engine, Space to preview, Ctrl/⌘ K to search). It repeats that your files are only read, never changed.
- **Keyboard shortcuts**: press `?` (or the keyboard button in the sidebar footer, or search for "Keyboard shortcuts")
  for every shortcut, grouped into Navigate, Preview, Organize and Search. The hint bar and the full-screen legend now
  come from the same list.
- **Settings** (the gear in the sidebar footer, or "Settings" in search):
  - Appearance: theme (System, Dark, Light), thumbnail size and pixel-art scaling.
  - Library: folder names to ignore in every library folder, such as `Backup` or `_old`, on top of the built-in ones
    (hidden folders, `node_modules`, `.meta` files). Only folders match; a file with the same name stays. The list is
    saved with the library, file changes in those folders are ignored at once, and **Rescan now** drops what's already
    indexed under them. Files stay on disk.
  - Storage: the size of the thumbnail and preview cache, and **Clear thumbnail cache**. Only the app's own cache is
    deleted; thumbnails are rebuilt as you browse.
  - Updates: turn off the update check on launch (shown where the app updates itself).
  - About: version, license, and a link to the releases page.
- A preview that fails shows "Couldn't preview this file" with the reason, **Open** and **Show in folder**, in the side
  panel and in full screen. That covers files that can't be decoded or played (images, video, audio, fonts, models,
  text) and viewers that crash or can't load, which used to leave a blank player or break the panel. The next asset
  previews normally.
- **Ratings**: give assets 1 to 5 stars from the side panel, full screen, a multi-selection, or the keys
  <kbd>1</kbd>–<kbd>5</kbd> (<kbd>0</kbd> clears). Filter by rating in **More filters** or search with `rating:>=4`,
  `rating:3` or `rating:<2`.
- **Notes**: a free-text note per asset in the side panel (saved as you type), shown in full screen. Search them with
  `note:word`.
- **Smart collections**: **Save as smart collection** next to the filters keeps the current search, type chips and
  filters as a collection whose assets update as the library changes. Open one as a search, replace its search with
  the current one, rename, copy or delete it like any collection.
- Removing duplicates also keeps the higher rating and both notes on the kept file.
- Audio files show their length, sample rate, channels and bit depth ("0:03.2 · 44.1 kHz · stereo · 16-bit") in the
  side panel and full screen, and their length in the list view and on grid cards. They're read from the file headers
  of WAV, OGG, MP3, FLAC, M4A, AAC and Opus files in the background after a scan (MP3s are counted frame by frame, so
  VBR files without a Xing header get the right length); bit depth is only known for WAV and FLAC.
- Filter audio by length: **Audio length** (min and max seconds) in the Filters panel, or `dur:<2s` / `dur:>30s` in
  search (`ms`, `s` or `m`; seconds by default). Files whose length isn't known never match a length limit.
- **Loop** in the audio player plays the file again from the start when it ends. The setting is remembered.
- **Export frames…** in the full-screen sprite view saves each frame of the sheet as its own PNG (`walk_000.png`,
  `walk_001.png`…) in a folder you pick, cut from the original image at the saved grid. Fully transparent frames can be
  skipped. Existing files are never replaced: a taken name gets " (2)", and the sheet itself is only read.
- **Find similar** in the side panel shows the images that look like the open one, closest first: resized, recoloured
  (hue-shifted) and lightly cropped copies included. A "Similar to …" chip above the grid has a Strict–Loose slider and
  clears the search. Works for PNG, JPEG, GIF, WebP, BMP, TGA, PSD, TIFF and ICO.
- **Search by colour**: a Colour group in the Filters panel (twelve named swatches and a custom colour), and
  `color:red` or `color:#ff8800` in search. An image matches when one of its main colours is that colour; smart collections
  can save a colour too.
- Both use a background pass after each scan that reads every image once (from its cached thumbnail when there is
  one) and keeps a small fingerprint and its five main colours until the file changes. It uses at most half the
  thumbnail workers and waits while folders are scanned. Files are only read.

### Changed

- The app starts with a third of the code it loaded before: the 3D viewer, model thumbnails and the audio waveform
  load their libraries (three.js, wavesurfer.js) the first time they're needed.
- New app icon: a fanned stack of cards (an image card in front of blue and amber ones) on a warm dark tile, also
  shown next to the name in the sidebar. `app-icon.svg` is the source; `npx tauri icon app-icon.svg` regenerates
  `src-tauri/icons`.

## [0.2.3] - 2026-10-21

### Added

- Video cards show a frame from the video (about 10% in, at most 1 second) instead of an icon. Frames are grabbed by
  the window two at a time, only for cards on screen, and cached like other thumbnails; a video the webview can't play
  keeps the icon.

### Fixed

- OBJ models show their materials and textures in the 3D viewer and in thumbnails, from the .mtl files their `mtllib`
  lines name or the .mtl with the same name next to them. A missing or broken .mtl falls back to the neutral grey material.
  Existing OBJ thumbnails are rendered again once, automatically.

## [0.2.2] - 2026-10-20

### Added

- **Animate** plays an image as a sprite sheet, in the side panel and in full screen. It guesses the grid from the
  image size (a 256×64 strip becomes 4 frames of 64×64) and lets you set columns and rows or the frame size, fps
  (12 by default), play and pause, step frame by frame, loop, and pixel-art scaling. The slicing is saved per asset in
  the app's database, so it survives rescans and renames, and an image you have animated opens animated next time.
  The image file itself is never changed.

### Changed

- Big libraries stay responsive while files change. Scans and file events now send only the files that changed
  instead of the whole library, so a rescan where nothing changed costs the UI nothing, a new file appears in about half
  a second, and importing a large folder no longer freezes the window.

### Fixed

- The first duplicate check after a big import no longer freezes scans and the window for minutes. Hashes are now
  saved in batches of 500, so on an 80,000-file library the check takes about 7 seconds instead of 3.5 minutes.

## [0.2.1] - 2026-10-20

### Fixed

- Thumbnails at the bottom of a big library load right away after a fast scroll. Only cards on screen ask for a
  thumbnail, the newest first, and cards that leave the screen withdraw their request. This also covers long lists
  that show every item at once (collections, duplicates, the filmstrip). Thumbnails use every CPU core.
- Tall images (portraits, character art) no longer stretch their grid card past its square.
- The full-screen 3D viewport and video fill the screen on large monitors instead of stopping at 820 px.
- Theme and **Check for updates** moved to their own bar at the bottom of the sidebar, next to the app version, so long
  library names have room.

## [0.2.0] - 2026-10-19

### Changed

- New look and layout from the Claude Design redesign: warm dark palette with a matching light theme, Geist fonts,
  navigation for Library, Favorites, Collections, Duplicates and Insights, type chips, folder grouping, and colored
  type labels on every card.
- <kbd>Space</kbd> now opens a side panel and <kbd>Enter</kbd> a full-screen view with a filmstrip. Open in the
  default app moved to the **Open** button.
- Stats became **Insights**, with totals, untagged and duplicate counts, and clickable breakdowns.

### Added

- In-app updates (Windows): **Check for updates** in the sidebar (and the search palette) looks for a new version, shows what's new
  and installs it with **Install & restart**. Asset Den also checks quietly on launch. Updates are signed and verified
  before they install.
- Folder navigation: an expandable folder tree in the sidebar, a header breadcrumb with jump menus (subfolders and
  recent folders), subfolder chips, an **Include subfolders** toggle, and <kbd>Alt+↑</kbd> for the parent folder.
- Search palette (<kbd>Ctrl/⌘ K</kbd>, <kbd>/</kbd>) for assets, folders and actions, with `type:`, `in:`, `#tag` and `size:` filters.
- Duplicates review: pick the copy to keep, mark groups as not duplicates, or move the copies to the Trash. Their tags,
  favorite and collections move to the kept file, and the files are re-checked for identical content first.
- Collections page with in-place rename and **Copy to folder…** (never overwrites existing files).
- Toasts with **Undo** for favorites, collection changes, deleting a collection and ignoring duplicates.
- **Filters** panel in the toolbar: extension, image size (presets, min/max width and height, square only), file size,
  modified date, untagged only, and any of several tags.

### Changed

- Assets appear while a folder is being scanned instead of after the whole scan. Scans commit in batches, image
  dimensions are read in a second, parallel pass, and the file watcher starts in the background. A 20,000-file folder
  now indexes in about 1 s instead of 13 s, and adding a folder no longer blocks the window.

## [0.1.0] - 2026-10-18

### Added

- Library of one or more asset folders, with a full scan on start and live watching for added, renamed and deleted
  files. Renames keep tags. Engine sidecars, hidden folders and `node_modules` are skipped.
- Virtualized grid and sortable list, search by name, folder or `#tag`, and type filters.
- Thumbnails for images (including TGA, PSD and TIFF), 3D models (rendered in the app) and fonts.
- Quick view for images (zoom, pan, pixel-art scaling), audio (waveform), 3D models (orbit, wireframe, stats, first
  animation), fonts (specimen), video and text.
- Tags, favorites and collections, for single assets or a whole selection.
- Copy-mode drag-out of one or more assets into engines, editors or folders.
- Duplicate finder and disk-usage stats by type, extension and folder.
- Dark and light themes, keyboard navigation.
