export type Kind = "image" | "audio" | "model" | "font" | "video" | "text" | "other";

export const KINDS: Kind[] = ["image", "audio", "model", "font", "video", "text", "other"];

export interface Asset {
  id: number;
  rootId: number;
  relPath: string;
  /** Absolute path with the OS separator. */
  path: string;
  name: string;
  ext: string;
  kind: Kind;
  size: number;
  /** Milliseconds since the epoch. */
  mtime: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  tags: string[];
}

/** How an image is sliced into animation frames, remembered per asset. */
export interface SpriteSheet {
  cols: number;
  rows: number;
  fps: number;
}

export interface Root {
  id: number;
  path: string;
}

export interface Collection {
  id: number;
  name: string;
  assetIds: number[];
}

export interface DupGroup {
  hash: string;
  ids: number[];
}

export interface ScanProgress {
  rootId: number;
  count: number;
  done: boolean;
}

export interface TextPreview {
  text: string;
  truncated: boolean;
}

export type ViewName = "library" | "favorites" | "collections" | "duplicates" | "insights";

/** Limits the library to one folder: a whole root (path "") or a folder inside it. */
export interface FolderFilter {
  rootId: number;
  path: string;
}
