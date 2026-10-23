// Per-viewer UI preferences. Storage can be unavailable, so every access is guarded.

export type Theme = "system" | "light" | "dark";
export type SortKey = "name" | "kind" | "size" | "mtime" | "folder";
export type Layout = "grid" | "list";

export interface Prefs {
  theme: Theme;
  sort: { key: SortKey; desc: boolean };
  layout: Layout;
  thumbSize: number;
  pixelated: boolean;
  /** Group the library by folder, as in the design. */
  grouped: boolean;
  /** With a folder open, also show its subfolders' files. */
  subfolders: boolean;
  /** Look for a new version of Asset Den shortly after launch. */
  checkUpdates: boolean;
  /** Audio previews start again when they end. */
  audioLoop: boolean;
}

const defaults: Prefs = {
  theme: "system",
  sort: { key: "name", desc: false },
  layout: "grid",
  thumbSize: 160,
  pixelated: false,
  grouped: true,
  subfolders: true,
  checkUpdates: true,
  audioLoop: false,
};

const KEY = "assetden.prefs.v2";

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
  } catch {
    return defaults;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && !!media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function onSystemThemeChange(cb: () => void) {
  media?.addEventListener("change", cb);
  return () => media?.removeEventListener("change", cb);
}
