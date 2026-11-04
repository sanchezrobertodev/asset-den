// Built-in themes and accent colours. The palettes are in src/index.css; themes.test.ts checks their contrast.
import { t } from "./i18n.ts";

export type Scheme = "light" | "dark";
export type ThemeId = "light" | "dark" | "black" | "midnight" | "sepia" | "hc-dark" | "hc-light";

export const THEMES: { id: ThemeId; scheme: Scheme }[] = [
  { id: "light", scheme: "light" },
  { id: "dark", scheme: "dark" },
  { id: "black", scheme: "dark" },
  { id: "midnight", scheme: "dark" },
  { id: "sepia", scheme: "light" },
  { id: "hc-dark", scheme: "dark" },
  { id: "hc-light", scheme: "light" },
];

export type AccentId = "green" | "teal" | "blue" | "violet" | "pink" | "red" | "orange" | "amber";

/**
 * Hue, and oklch chroma per scheme. Each chroma is the most the hue takes inside sRGB at that scheme's accent
 * lightness (0.44–0.48 light, 0.8 dark), so no swatch gets clipped. Green comes first: the default.
 */
export const ACCENTS: { id: AccentId; h: number; light: number; dark: number }[] = [
  { id: "green", h: 152, light: 0.11, dark: 0.17 },
  { id: "teal", h: 190, light: 0.073, dark: 0.133 },
  { id: "blue", h: 250, light: 0.12, dark: 0.1 },
  { id: "violet", h: 295, light: 0.16, dark: 0.108 },
  { id: "pink", h: 350, light: 0.16, dark: 0.131 },
  { id: "red", h: 25, light: 0.16, dark: 0.11 },
  { id: "orange", h: 55, light: 0.104, dark: 0.128 },
  { id: "amber", h: 85, light: 0.087, dark: 0.159 },
];

export const themeById = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export const themeName = (id: ThemeId | "system") => t(`themes.${id}`);
export const accentName = (id: AccentId) => t(`themes.accents.${id}`);
export const accentById = (id: AccentId) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
