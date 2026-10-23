// Search by colour: named colours, and matching against the dominant colours the backend extracts per image.

/** r, g, b (0–255) and the share of the image's opaque pixels in percent, as the backend sends them. */
export type Swatch = [number, number, number, number];
/** OKLab L, a, b, the share in percent, and the index of the nearest named colour; ready to compare. */
export type LabSwatch = [number, number, number, number, number];

/** Each name with the shade its swatch shows, then other shades that belong to it. */
const NAMED: [string, string[]][] = [
  ["red", ["e53935", "ff0000", "b71c1c", "8b0000"]],
  ["orange", ["fb8c00", "ff6d00", "e65100"]],
  ["yellow", ["fdd835", "ffff00"]],
  ["green", ["43a047", "00ff00", "1b5e20", "8bc34a", "2e7d32"]],
  ["teal", ["00897b", "00e5ff", "26c6da"]],
  ["blue", ["1e88e5", "0000ff", "0d47a1", "1a237e", "90caf9"]],
  ["purple", ["8e24aa", "6a1b9a", "4a148c", "b39ddb"]],
  ["pink", ["ec407a", "ff00ff", "f8bbd0", "f06292"]],
  ["brown", ["795548", "8b4513", "a1887f", "4e342e", "c19a6b"]],
  ["white", ["f5f5f5", "ffffff"]],
  ["gray", ["9e9e9e", "616161", "bdbdbd", "808080"]],
  ["black", ["1a1a1a", "000000"]],
];

/** The swatches of the Filters panel, by name. `color:<name>` takes these names, or the start of one. */
export const NAMED_COLORS: Record<string, string> = Object.fromEntries(NAMED.map(([n, shades]) => [n, `#${shades[0]}`]));

/** How far (OKLab ΔE) an image colour may be from a hex colour searched for. */
const MAX_DELTA = 0.12;
/** Colours covering less of the image than this (percent) don't count. */
const MIN_WEIGHT = 8;

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0–255) to OKLab, where distance follows perceived colour difference. */
export function oklab(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map((c) => linear(c / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const hexLab = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return oklab(n >> 16, (n >> 8) & 255, n & 255);
};
const dist2 = (x: number[], y: number[]) => (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
const shades = NAMED.flatMap(([, hs], i) => hs.map((h) => [i, hexLab(h)] as const));

/** Index into the named colours of the shade closest to `lab`, so every colour has exactly one name. */
function nameIndex(lab: number[]): number {
  let best = 0;
  let bd = Infinity;
  for (const [i, s] of shades) {
    const d = dist2(lab, s);
    if (d < bd) [best, bd] = [i, d];
  }
  return best;
}

export const toLab = (swatches: Swatch[]): LabSwatch[] =>
  swatches.map(([r, g, b, w]) => {
    const lab = oklab(r, g, b);
    return [...lab, w, nameIndex(lab)];
  });

/** A colour name (or the start of one) as that name, or a hex code (#rgb or #rrggbb, # optional) as "#rrggbb". null if neither. */
export function parseColor(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/^grey/, "gray");
  const name = t && NAMED.find(([n]) => n.startsWith(t));
  if (name) return name[0];
  const m = t.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  return `#${m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]}`;
}

const targets = new Map<string, number[]>();

/**
 * Whether one of an image's main colours is `color`: a name from NAMED_COLORS (the image colour's nearest name) or a
 * "#rrggbb" (within MAX_DELTA of it). False for images not analysed yet.
 */
export function hasColor(palette: LabSwatch[] | undefined, color: string): boolean {
  if (!palette) return false;
  if (!color.startsWith("#")) {
    const i = NAMED.findIndex(([n]) => n === color);
    return palette.some((s) => s[3] >= MIN_WEIGHT && s[4] === i);
  }
  let lab = targets.get(color);
  if (!lab) targets.set(color, (lab = hexLab(color)));
  return palette.some((s) => s[3] >= MIN_WEIGHT && dist2(s, lab) <= MAX_DELTA ** 2);
}
