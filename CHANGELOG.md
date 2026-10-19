# Changelog

All notable changes to Asset Den are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
