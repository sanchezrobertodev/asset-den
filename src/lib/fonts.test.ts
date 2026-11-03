// Run with `node --experimental-strip-types src/lib/fonts.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types.ts";
import { FONT_LIMIT, holdFont } from "./fonts.ts";

// Stand-ins for the browser's FontFace and document.fonts.
const loaded = new Set<string>();
class Face {
  family: string;
  constructor(family: string) {
    this.family = family;
  }
  load = () => (this.family.endsWith("-bad") ? Promise.reject(new Error("bad font")) : Promise.resolve(this));
}
Object.assign(globalThis, {
  FontFace: Face,
  document: { fonts: { add: (f: Face) => loaded.add(f.family), delete: (f: Face) => loaded.delete(f.family) } },
});
const font = (id: number, mtime: number | string = 1) => ({ id, mtime }) as unknown as Asset;
const tick = () => new Promise((r) => setTimeout(r, 0));

// The side panel holds one font while cards for many others scroll past.
const panel: (string | null)[] = [];
const release = holdFont(font(0), "u", (f) => panel.push(f));
for (let id = 1; id <= FONT_LIMIT + 50; id++) holdFont(font(id), "u", () => {})();
await tick();
assert.deepEqual(panel, ["asset-font-0-1"]);
assert.ok(loaded.has("asset-font-0-1"), "a font that's shown stays loaded");
assert.equal(loaded.size, FONT_LIMIT, "the oldest fonts nobody shows are unloaded");
assert.ok(!loaded.has("asset-font-1-1") && loaded.has(`asset-font-${FONT_LIMIT + 50}-1`));

// Released, it can go like any other.
release();
for (let id = 1000; id < 1000 + FONT_LIMIT; id++) holdFont(font(id), "u", () => {})();
await tick();
assert.ok(!loaded.has("asset-font-0-1"));

// A font that fails to load reports null, and nothing arrives once its card has let go.
const bad: (string | null)[] = [];
holdFont(font(5, "x-bad"), "u", (f) => bad.push(f));
holdFont(font(6, "x-bad"), "u", (f) => bad.push(f))();
await tick();
assert.deepEqual(bad, [null]);
console.log("font tests passed");
