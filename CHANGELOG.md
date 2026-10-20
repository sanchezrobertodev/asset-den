# Changelog

All notable changes to Asset Den are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-19

### Changed

- New look and layout from the Claude Design redesign: warm dark palette with a matching light theme, Geist fonts,
  navigation for Library, Favorites, Collections, Duplicates and Insights, type chips, folder grouping, and colored
  type labels on every card.
- <kbd>Space</kbd> now opens a side panel and <kbd>Enter</kbd> a full-screen view with a filmstrip. Open in the
  default app moved to the **Open** button.
- Stats became **Insights**, with totals, untagged and duplicate counts, and clickable breakdowns.

### Added

- In-app updates: **Check for updates** in the sidebar (and the search palette) looks for a new version, shows what's new
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
