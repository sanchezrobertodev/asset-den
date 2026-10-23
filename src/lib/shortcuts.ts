// Every keyboard shortcut in one table. The shortcuts dialog (?), the library hint bar and the full-screen legend all
// read it. The keys themselves are handled in App.tsx (onKey), Palette.tsx, AssetBrowser.tsx and Viewers.tsx: when
// adding a binding there, add its row here.

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl ";

export const GROUPS = ["Navigate", "Preview", "Organize", "Search"] as const;

export interface Shortcut {
  id: string;
  group: (typeof GROUPS)[number];
  /** As shown in one key cap. */
  keys: string;
  label: string;
  /** Short lowercase label for the hint bar and the full-screen legend. */
  hint?: string;
}

export const SHORTCUTS: Shortcut[] = [
  { id: "move", group: "Navigate", keys: "← →", label: "Previous or next asset (↑ ↓ too)", hint: "move" },
  { id: "parent", group: "Navigate", keys: isMac ? "⌥↑" : "Alt ↑", label: "Up to the parent folder" },
  { id: "back", group: "Navigate", keys: "Esc", label: "Close full screen, then the side panel, then clear the selection" },
  { id: "help", group: "Navigate", keys: "?", label: "Show these shortcuts" },

  { id: "peek", group: "Preview", keys: "Space", label: "Quick view in the side panel", hint: "quick view" },
  { id: "full", group: "Preview", keys: "↵", label: "Full screen", hint: "full screen" },
  { id: "full-back", group: "Preview", keys: "Esc", label: "Back to the side panel from full screen", hint: "back to side panel" },
  { id: "zoom", group: "Preview", keys: "Scroll", label: "Zoom an image in full screen (drag to pan, double-click to reset)" },

  { id: "favorite", group: "Organize", keys: "F", label: "Favorite or unfavorite the selection", hint: "favorite" },
  { id: "rate", group: "Organize", keys: "1–5", label: "Rate the selection 1 to 5 stars", hint: "rate" },
  { id: "unrate", group: "Organize", keys: "0", label: "Clear the selection's rating", hint: "clear rating" },
  { id: "select-all", group: "Organize", keys: `${mod}A`, label: "Select every asset shown" },
  { id: "toggle", group: "Organize", keys: isMac ? "⌘ click" : "Ctrl click", label: "Add to or remove from the selection" },
  { id: "range", group: "Organize", keys: "Shift click", label: "Select a range" },

  { id: "search", group: "Search", keys: `${mod}K`, label: "Search assets, folders and actions", hint: "search" },
  { id: "search-slash", group: "Search", keys: "/", label: "Search" },
  { id: "results", group: "Search", keys: "↑ ↓", label: "Move through the results" },
  { id: "run", group: "Search", keys: "↵", label: "Open the highlighted result" },
  { id: "close", group: "Search", keys: "Esc", label: "Close search" },
];

export const shortcut = (id: string) => SHORTCUTS.find((s) => s.id === id)!;
