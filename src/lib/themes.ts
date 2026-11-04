// Built-in themes and accent colours. The palettes are in src/index.css; themes.test.ts checks their contrast.

export type Scheme = "light" | "dark";
export type ThemeId = "light" | "dark" | "black" | "midnight" | "sepia" | "hc-dark" | "hc-light";

export const THEMES: { id: ThemeId; name: string; scheme: Scheme }[] = [
  { id: "light", name: "Light", scheme: "light" },
  { id: "dark", name: "Dark", scheme: "dark" },
  { id: "black", name: "Black", scheme: "dark" },
  { id: "midnight", name: "Midnight", scheme: "dark" },
  { id: "sepia", name: "Sepia", scheme: "light" },
  { id: "hc-dark", name: "High contrast dark", scheme: "dark" },
  { id: "hc-light", name: "High contrast light", scheme: "light" },
];

export type AccentId = "green" | "teal" | "blue" | "violet" | "pink" | "red" | "orange" | "amber";

/**
 * Hue, and oklch chroma per scheme. Each chroma is the most the hue takes inside sRGB at that scheme's accent
 * lightness (0.44–0.48 light, 0.8 dark), so no swatch gets clipped. Green comes first: the default.
 */
export const ACCENTS: { id: AccentId; name: string; h: number; light: number; dark: number }[] = [
  { id: "green", name: "Green", h: 152, light: 0.11, dark: 0.17 },
  { id: "teal", name: "Teal", h: 190, light: 0.073, dark: 0.133 },
  { id: "blue", name: "Blue", h: 250, light: 0.12, dark: 0.1 },
  { id: "violet", name: "Violet", h: 295, light: 0.16, dark: 0.108 },
  { id: "pink", name: "Pink", h: 350, light: 0.16, dark: 0.131 },
  { id: "red", name: "Red", h: 25, light: 0.16, dark: 0.11 },
  { id: "orange", name: "Orange", h: 55, light: 0.104, dark: 0.128 },
  { id: "amber", name: "Amber", h: 85, light: 0.087, dark: 0.159 },
];

export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const themeName = (id: ThemeId | "system") => (id === "system" ? "System" : themeById(id).name);
export const accentById = (id: AccentId) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
