// Run with `node --experimental-strip-types src/lib/themes.test.ts` (part of `make check`).
// Reads the palettes in src/index.css and checks WCAG contrast for every theme × accent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCENTS, THEMES } from "./themes.ts";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Tokens = Record<string, string>;
const decls = (body: string): Tokens =>
  Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const blocks = (attr: string): Record<string, Tokens> =>
  Object.fromEntries([...css.matchAll(new RegExp(`(?:^|\\n)\\[${attr}="([\\w-]+)"\\]\\s*\\{([^}]*)\\}`, "g"))].map((m) => [m[1], decls(m[2])]));
const schemes = blocks("data-scheme");
const themes = blocks("data-theme");
const root = decls(css.match(/:root\s*\{([^}]*)\}/)![1]);

// --- colour maths: sRGB channels 0–1, gamma-encoded ---
type RGB = [number, number, number];
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklchLinear(L: number, C: number, h: number): RGB {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (lin: RGB) => lin.every((v) => v >= -1e-3 && v <= 1 + 1e-3);
const clip = (v: number) => Math.min(1, Math.max(0, v));

/** A colour and its alpha. Out-of-gamut oklch is clipped per channel, as Chromium draws it. */
function parse(value: string): { rgb: RGB; alpha: number; inGamut: boolean } {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], alpha: 1, inGamut: true };
  }
  const ok = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  assert.ok(ok, `can't read colour ${value}`);
  const lin = oklchLinear(+ok[1], +ok[2], +ok[3]);
  return { rgb: lin.map((c) => fromLinear(clip(c))) as RGB, alpha: ok[4] ? +ok[4] : 1, inGamut: inGamut(lin) };
}
const over = (top: { rgb: RGB; alpha: number }, under: RGB): RGB =>
  top.rgb.map((c, i) => c * top.alpha + under[i] * (1 - top.alpha)) as RGB;
const luminance = (c: RGB) => 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// The maths, against known WCAG values.
assert.equal(contrast([1, 1, 1], [0, 0, 0]).toFixed(1), "21.0");
assert.equal(contrast(parse("#767676").rgb, [1, 1, 1]).toFixed(2), "4.54");
assert.ok(!parse("oklch(0.48 0.15 152)").inGamut && parse("oklch(0.48 0.11 152)").inGamut);

// --- every theme block is a known theme, and every theme besides the two bases has one ---
for (const id of Object.keys(themes)) assert.ok(THEMES.some((t) => t.id === id), `index.css has a block for unknown theme ${id}`);
for (const t of THEMES) {
  assert.ok(schemes[t.scheme], `no [data-scheme="${t.scheme}"] block`);
  if (t.id !== t.scheme) assert.ok(themes[t.id], `no [data-theme="${t.id}"] block`);
}
// The CSS default (before applyTheme runs) is the first accent.
assert.equal(+root["--accent-h"], ACCENTS[0].h);
assert.equal(+root["--accent-c-light"], ACCENTS[0].light);
assert.equal(+root["--accent-c-dark"], ACCENTS[0].dark);

const KIND_HUES = [250, 75, 152, 300, 25, 200];
const SURFACES = ["--bg", "--panel", "--card", "--field"];
const TEXT = ["--fg", "--fg-2", "--muted", "--faint"];
const failures: string[] = [];

for (const theme of THEMES) {
  const strict = theme.id.startsWith("hc-");
  const text = strict ? 7 : 4.5; // WCAG AAA for the high-contrast themes, AA otherwise
  for (const accent of ACCENTS) {
    const t: Tokens = {
      ...schemes[theme.scheme],
      ...themes[theme.id],
      "--accent-h": String(accent.h),
      "--accent-c-light": String(accent.light),
      "--accent-c-dark": String(accent.dark),
    };
    const sub = (v: string): string => {
      const out = v.replace(/var\((--[\w-]+)\)/g, (_, n) => {
        assert.ok(n in t, `${theme.id}: ${n} isn't defined`);
        return t[n];
      });
      return out === v ? out : sub(out);
    };
    t["--accent"] = `oklch(${sub("var(--accent-l)")} ${sub("var(--accent-c)")} ${accent.h})`;
    t["--sel-row"] = `oklch(${sub("var(--sel-l)")} ${sub("var(--sel-c)")} ${accent.h})`;
    const col = (name: string) => parse(sub(t[name] ?? name));
    const where = `${theme.id} × ${accent.id}`;
    const check = (fg: string, fgRGB: RGB, bg: string, bgRGB: RGB, min: number) => {
      const r = contrast(fgRGB, bgRGB);
      if (r < min) failures.push(`${where}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    };

    for (const name of ["--accent", "--sel-row"]) if (!col(name).inGamut) failures.push(`${where}: ${name} ${t[name]} is outside sRGB`);
    const bg = col("--bg").rgb;
    for (const s of SURFACES) {
      const surface = col(s).rgb;
      for (const f of TEXT) check(f, col(f).rgb, s, surface, text);
      check("--accent", col("--accent").rgb, s, surface, text); // accent is used for text and icons
      check("--danger", col("--danger").rgb, s, surface, text);
      check("--star", col("--star").rgb, s, surface, 3); // an icon, not text
    }
    check("--accent-fg", col("--accent-fg").rgb, "--accent", col("--accent").rgb, text);
    check("--fg", col("--fg").rgb, "--sel-row", col("--sel-row").rgb, text);
    // The highlighted row in Ctrl+K and the folder menu is --active, under every text colour.
    for (const f of TEXT) check(f, col(f).rgb, "--active", col("--active").rgb, text);
    // A selected list row's accent ring, against the row's fill and a hovered neighbour (WCAG 1.4.11; --bg is checked above).
    for (const s of ["--sel-row", "--hover"]) check("--accent ring", col("--accent").rgb, s, col(s).rgb, 3);
    check("--invert-fg", col("--invert-fg").rgb, "--invert-bg", col("--invert-bg").rgb, text);
    check("--warn-fg", over(col("--warn-fg"), bg), "--warn-bg", over(col("--warn-bg"), bg), text);
    for (const [label, h, fgT, bgT] of [
      ...KIND_HUES.map((h) => [`kind ${h}`, String(h), "--k-pill-fg", "--k-pill-bg"]),
      ["kind other", "0", "--ko-pill-fg", "--ko-pill-bg"],
    ]) {
      const pill = (n: string) => parse(`oklch(${sub(t[n])} ${h})`).rgb;
      check(`${label} pill text`, pill(fgT), "its pill", pill(bgT), text);
    }
    for (const line of ["--line", "--line-x"]) assert.match(t[line], /^#[0-9a-f]{6}$/i, `${theme.id}: ${line} must be hex (three.js reads it)`);
  }
}

assert.deepEqual(failures, [], `\n${failures.join("\n")}`);
console.log(`themes: ${THEMES.length} themes × ${ACCENTS.length} accents pass`);
