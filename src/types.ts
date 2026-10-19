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

export interface Root {
  id: number;
  path: string;
}

export interface Collection {
  id: number;
  name: string;
  assetIds: number[];
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

export type View =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "root"; id: number }
  | { type: "tag"; tag: string }
  | { type: "collection"; id: number }
  | { type: "duplicates" }
  | { type: "stats" };
