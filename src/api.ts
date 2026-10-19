import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { Asset, Collection, Root, ScanProgress, TextPreview } from "./types";

export const api = {
  listRoots: () => invoke<Root[]>("list_roots"),
  addRoot: (path: string) => invoke<Root>("add_root", { path }),
  removeRoot: (id: number) => invoke<void>("remove_root", { id }),
  rescan: (id: number) => invoke<void>("rescan", { id }),
  listAssets: () => invoke<Asset[]>("list_assets"),
  thumbnail: (id: number) => invoke<string | null>("thumbnail", { id }),
  saveThumbnail: (id: number, png: Uint8Array) => invoke<string>("save_thumbnail", { id, png: Array.from(png) }),
  preview: (id: number) => invoke<string>("preview", { id }),
  readText: (id: number) => invoke<TextPreview>("read_text", { id }),
  setFavorite: (ids: number[], favorite: boolean) => invoke<void>("set_favorite", { ids, favorite }),
  addTag: (ids: number[], tag: string) => invoke<string>("add_tag", { ids, tag }),
  removeTag: (ids: number[], tag: string) => invoke<void>("remove_tag", { ids, tag }),
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) => invoke<number>("create_collection", { name }),
  deleteCollection: (id: number) => invoke<void>("delete_collection", { id }),
  setInCollection: (collection: number, ids: number[], member: boolean) =>
    invoke<void>("set_in_collection", { collection, ids, member }),
  findDuplicates: () => invoke<number[][]>("find_duplicates"),
  reveal: (id: number) => invoke<void>("reveal", { id }),
  openDefault: (id: number) => invoke<void>("open_default", { id }),
  dragIcon: () => invoke<string>("drag_icon"),
  pickFolder: async () => {
    const picked = await open({ directory: true, multiple: false, title: "Add an asset folder" });
    return typeof picked === "string" ? picked : null;
  },
  onAssetsChanged: (cb: () => void): Promise<UnlistenFn> => listen("assets-changed", () => cb()),
  onScanProgress: (cb: (p: ScanProgress) => void): Promise<UnlistenFn> =>
    listen<ScanProgress>("scan-progress", (e) => cb(e.payload)),
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
