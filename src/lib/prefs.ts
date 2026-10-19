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
}

const defaults: Prefs = {
  theme: "system",
  sort: { key: "name", desc: false },
  layout: "grid",
  thumbSize: 148,
  pixelated: false,
};

const KEY = "assetden.prefs.v1";

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
