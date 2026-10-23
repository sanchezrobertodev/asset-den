import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { AssetsDelta } from "./lib/delta";
import type { Asset, Collection, DupGroup, Root, ScanProgress, SpriteSheet, TextPreview } from "./types";

export interface AppUpdate {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

/** The update found by the last check, kept for installing. */
let pendingUpdate: Update | null = null;

export const api = {
  listRoots: () => invoke<Root[]>("list_roots"),
  addRoot: (path: string) => invoke<Root>("add_root", { path }),
  removeRoot: (id: number) => invoke<void>("remove_root", { id }),
  rescan: (id: number) => invoke<void>("rescan", { id }),
  /** Every asset, with the number of the last delta it includes. */
  listAssets: () => invoke<{ seq: number; assets: Asset[] }>("list_assets"),
  thumbnail: (id: number) => invoke<string | null>("thumbnail", { id }),
  /** Saves a thumbnail rendered from `a` as it was when rendering started; refused if the file has changed since. */
  saveThumbnail: (a: Asset, png: Uint8Array) =>
    invoke<string>("save_thumbnail", { id: a.id, size: a.size, mtime: a.mtime, png: Array.from(png) }),
  preview: (id: number) => invoke<string>("preview", { id }),
  readText: (id: number) => invoke<TextPreview>("read_text", { id }),
  setFavorite: (ids: number[], favorite: boolean) => invoke<void>("set_favorite", { ids, favorite }),
  addTag: (ids: number[], tag: string) => invoke<string>("add_tag", { ids, tag }),
  removeTag: (ids: number[], tag: string) => invoke<void>("remove_tag", { ids, tag }),
  getSpriteSheet: (id: number) => invoke<SpriteSheet | null>("get_sprite_sheet", { id }),
  setSpriteSheet: (id: number, sheet: SpriteSheet) => invoke<void>("set_sprite_sheet", { id, sheet }),
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) => invoke<number>("create_collection", { name }),
  deleteCollection: (id: number) => invoke<void>("delete_collection", { id }),
  setInCollection: (collection: number, ids: number[], member: boolean) =>
    invoke<void>("set_in_collection", { collection, ids, member }),
  renameCollection: (id: number, name: string) => invoke<string>("rename_collection", { id, name }),
  copyCollection: (id: number, dest: string) => invoke<{ copied: number; failed: string[] }>("copy_collection", { id, dest }),
  findDuplicates: () => invoke<DupGroup[]>("find_duplicates"),
  setDuplicateIgnored: (hash: string, ignored: boolean) => invoke<void>("set_duplicate_ignored", { hash, ignored }),
  trashDuplicates: (keep: number, remove: number[]) => invoke<number>("trash_duplicates", { keep, remove }),
  reveal: (id: number) => invoke<void>("reveal", { id }),
  openDefault: (id: number) => invoke<void>("open_default", { id }),
  dragIcon: () => invoke<string>("drag_icon"),
  /** Folder names skipped while scanning, on top of the built-in ones (hidden folders, node_modules, sidecars). */
  ignoredFolders: () => invoke<string[]>("ignored_folders"),
  /** Saves the list and returns it cleaned; takes effect on the next rescan. */
  setIgnoredFolders: (names: string[]) => invoke<string[]>("set_ignored_folders", { names }),
  /** Bytes used by the app's own thumbnail and preview caches. */
  cacheSize: () => invoke<number>("cache_size"),
  clearThumbnailCache: () => invoke<void>("clear_thumbnail_cache"),
  openReleases: () => invoke<void>("open_releases"),
  pickFolder: async (title = "Import an asset folder") => {
    const picked = await open({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  },
  /** A scan or a batch of file events finished; its changes came before as deltas. */
  onAssetsChanged: (cb: () => void): Promise<UnlistenFn> => listen("assets-changed", () => cb()),
  onAssetsDelta: (cb: (d: AssetsDelta) => void): Promise<UnlistenFn> => listen<AssetsDelta>("assets-delta", (e) => cb(e.payload)),
  onScanProgress: (cb: (p: ScanProgress) => void): Promise<UnlistenFn> =>
    listen<ScanProgress>("scan-progress", (e) => cb(e.payload)),
  /** False on platforms the release feed doesn't cover yet; the app then hides updates entirely. */
  appUpdatesSupported: () => invoke<boolean>("app_updates_supported"),
  /** Asks the release feed for a newer, signed version of Asset Den. null when up to date. */
  checkAppUpdate: async (): Promise<AppUpdate | null> => {
    const update = await check();
    void pendingUpdate?.close().catch(() => {});
    pendingUpdate = update;
    if (!update) return null;
    return { version: update.version, currentVersion: update.currentVersion, date: update.date ?? null, notes: update.body ?? null };
  },
  /** Downloads, verifies and installs the pending update, then restarts. On Windows the installer closes the app itself. */
  installAppUpdate: async (onProgress: (p: DownloadProgress) => void) => {
    if (!pendingUpdate) throw new Error("No update to install. Check for updates first.");
    const progress: DownloadProgress = { downloaded: 0, total: null };
    await pendingUpdate.downloadAndInstall((e) => {
      if (e.event === "Started") progress.total = e.data.contentLength ?? null;
      else if (e.event === "Progress") progress.downloaded += e.data.chunkLength;
      onProgress({ ...progress });
    });
    await relaunch();
  },
  /** Copy-mode drag, so dropping onto a folder never moves the original. */
  drag: (paths: string[], icon: string) => startDrag({ item: paths, icon, mode: "copy" }),
};

/**
 * Asset-protocol URL for a local file, keeping "/" between path segments so relative references inside the file
 * (glTF buffers, OBJ materials, FBX textures) resolve against its folder.
 */
export function fileUrl(path: string): string {
  const base = convertFileSrc("");
  const norm = path.replaceAll("\\", "/");
  const segments = norm.split("/").map(encodeURIComponent);
  // A leading "/" (macOS/Linux) must survive as %2F: the protocol drops the first "/" of the URL path.
  return norm.startsWith("/") ? base + "%2F" + segments.slice(1).join("/") : base + segments.join("/");
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}
