# Changelog

All notable changes to Asset Den are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.9] - 2026-11-02

### Changed

- Removing a folder from the library asks first, and says how many assets it forgets.
- Folders named `$RECYCLE.BIN` and `System Volume Information` are skipped, and so is Asset Den's own data folder.
  Adding a folder that holds it, or sits inside it, is refused.
- Tagging, favoriting or collecting a big selection is faster.

### Fixed

- **Move to Trash** on the Duplicates page no longer trashes a "copy" that is really the same file reached another
  way (a hard link, or the same folder through a mapped drive), which could have left no copy at all.
- A file saved while Asset Den was checking it for duplicates could keep the old file's fingerprint and show as a
  duplicate of something it no longer matched.
- Files added while a folder was rescanning could disappear from the library until the next rescan.
- An image the decoder chokes on (some damaged PSD files) shows "couldn't read this image" instead of closing the app.
  The same goes for damaged audio files.
- Images on a drive that's unplugged during **Analyse images** wait until it's back, instead of being marked
  unreadable.
- Full screen no longer plays a sound or video twice, and closes when its file is deleted.
- If the library failed to load at startup, changes from the folder watcher now load it once it can, instead of
  waiting for a restart.
- A folder removal or a duplicate ignore that fails to save no longer looks done.
- The Duplicates page keeps the default copy selected when the copy you picked earlier is gone.
- A font file edited while the app is open shows its new glyphs.

## [0.3.8] - 2026-11-01

### Added

- Library backups: **Settings → Backups** saves your folders, tags, ratings, notes, collections and sprite grids to a
  file wherever you like, and restores one (Asset Den restarts to finish). Asset Den also makes a backup each day it
  opens and keeps the last 5. Restoring saves the current library first, so you can switch back. Your asset files are
  never part of a backup.

## [0.3.7] - 2026-11-01

### Added

- Asset Den is open source: the code is at [github.com/sanchezrobertodev/asset-den](https://github.com/sanchezrobertodev/asset-den),
  under the MIT License. **Settings → About** links to it, and to Ko-fi if you'd like to support it.
- macOS and Linux builds are published with each release: a universal macOS `.dmg` (Apple Silicon and Intel), a Linux
  AppImage and a `.deb`. The macOS app and the AppImage update themselves like the Windows app; a `.deb` install
  updates by installing the next `.deb`. The macOS app isn't notarized, so macOS asks for confirmation the first time
  it opens.

### Changed

- Releases and updates now come from the main repo. This version still arrives through the old feed, and checks the
  new one from then on.

## [0.3.6] - 2026-11-01

### Added

- **Locate** a library folder that moved. A folder Asset Den can't reach shows a locate button in the sidebar: pick
  where it is now, and its assets keep their tags, ratings, notes, favorites and collections. If some of its files
  aren't in the new place, Asset Den says how many it found and asks before the rescan drops the rest.

## [0.3.5] - 2026-10-31

### Fixed

- A library folder that can't be reached when Asset Den scans it (an unplugged drive, a renamed or moved folder) no
  longer loses its assets. Before, the scan treated every file as deleted, and their tags, ratings, notes, favorites,
  collections and sprite sheet settings went with them. Now the assets stay as they were, the folder shows a warning
  icon in the sidebar, and a rescan once it's back picks up where it left off. A subfolder that can't be read keeps its
  assets the same way.

## [0.3.4] - 2026-10-24

### Added

- **Duplicates** can be sorted and filtered. Sort the groups by space freed, most copies, newest or name. The type
  chips, the search and **More filters** narrow the list to groups with a matching copy, and in Duplicates the search's
  first result does the same. The open group stays open when the sort or filters change.

### Fixed

- Some 3D model thumbnails were blank, though the model showed in the side panel and full screen. After about 20
  model previews, WebView2 shut down the renderer that draws thumbnails, and every thumbnail drawn after that was saved
  empty. Closed previews now free their renderer right away, the thumbnail renderer restarts if it's shut down anyway,
  and it never saves a frame it couldn't draw. Model thumbnails saved by earlier versions are drawn again once.

## [0.3.3] - 2026-10-24

### Added

- **Collections** browse like the library. An open collection has the type chips, search, **More filters**, sort,
  grouping by folder, grid or list and the thumbnail size, applied to its own assets. The library's open folder
  doesn't narrow it. With a collection open, the first search result is "Show N matches in <collection>".
- **Remove N assets** in a collection's header removes the selected assets you can see (with **Undo**). It replaces
  the Remove button on each card.

### Changed

- **Collections** stay quick when they're big. They use the library's grid and list, which draw only the cards on
  screen, so opening and scrolling a collection of thousands of assets no longer stalls.

## [0.3.2] - 2026-10-23

### Added

- **Duplicates**: each copy has a full-screen button (or double-click its preview). Full screen steps through the
  copies of that group with the arrow keys, and <kbd>Esc</kbd> comes back to the review.
- **Duplicates**: each copy shows its size and, for images, its dimensions. Groups with more than two copies show the
  count in the list.

### Changed

- **Duplicates** stays quick with thousands of groups. Only the groups on screen are drawn, and the view no longer
  redraws on unrelated changes; stepping through 3,700 groups went from about 300 ms per step (up to 770 ms) to about
  10 ms. The group list is one keyboard stop: <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>Page Up</kbd>/<kbd>Page Down</kbd>,
  <kbd>Home</kbd> and <kbd>End</kbd> move through it.

### Fixed

- In **Duplicates** on a wide window, the preview of a copy could grow out of its card and cover the heading.

## [0.3.1] - 2026-10-23

### Changed

- **Image analysis** (for Find similar and search by colour) no longer runs by itself after every scan, which on a big
  library kept several cores busy for minutes after launch. Images are now analysed:
  - as you browse, from the thumbnails on screen (cheap: they're small);
  - when you ask: **Analyse images** in **Settings → Library**, or **Analyse now** where results depend on it (Find
    similar, the Colour filter, `color:` searches), which also say how many images they cover. While it runs, the
    sidebar shows "Analysing images · 12,340 of 51,200" with **Pause** and **Cancel**; what's done is kept;
  - when files change, once **Keep new and changed images analysed** is on (Settings → Library). It turns on by itself
    after the first full analysis, and then only reads the files that were added or changed.
- Image analysis, duplicate hashing and audio header reading run at low OS priority, so the app and other programs
  stay responsive while they work.

## [0.3.0] - 2026-10-23

### Added

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
- **Accessibility**: everything works from the keyboard and with a screen reader.
  - The asset grid and list take focus as one list (arrows move, the focused asset has a ring); <kbd>Tab</kbd> from
    the top of the window offers **Skip to the assets**.
  - Every control shows a focus ring, including cards, chips, colour swatches and stars. Dialogs, search, the
    shortcuts overlay and full screen keep <kbd>Tab</kbd> inside and give focus back to where it was when they close;
    so do the Filters panel, the export menu and the smart-collection name field.
  - The star rating is a radio group: <kbd>←</kbd> <kbd>→</kbd> change it while it has focus. Duplicates pick the copy
    to keep the same way.
  - Icon buttons, stars, swatches, cards and the filmstrip have names; toggles say whether they're on; the current
    view, folder and breadcrumb are marked; thumbnails next to a name are skipped.
  - Toasts (with their Undo) and the start and end of a scan are announced.
  - With the system's "reduce motion" setting, sprite sheets and animated models start paused, audio and video don't
    start by themselves, hover previews of audio stay silent, and transitions are instant. Full screen gets an
    **Animate** toggle for animated models.
  - <kbd>Esc</kbd> in a text field goes back to the asset list. The `?` overlay and the hint bar list the rating keys
    (<kbd>1</kbd>–<kbd>5</kbd>, <kbd>0</kbd>), the star arrows and the tag field keys.

### Changed

- The app starts with a third of the code it loaded before: the 3D viewer, model thumbnails and the audio waveform
  load their libraries (three.js, wavesurfer.js) the first time they're needed.
- New app icon: a fanned stack of cards (an image card in front of blue and amber ones) on a warm dark tile, also
  shown next to the name in the sidebar.
- Small text (counts, labels, hints) is a little stronger in both themes, and the light theme's green and star are a
  little darker, so text reaches a 4.5:1 contrast and the stars 3:1.

### Fixed

- In the library, <kbd>Enter</kbd> or <kbd>Space</kbd> on a focused button (in the sidebar, the side panel or the bar
  above the grid) opened full screen or the side panel instead of pressing the button.
- <kbd>Esc</kbd> while renaming a collection saved the typed name instead of keeping the old one.
- Search said "Show all 1 matches" for a single match.

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
