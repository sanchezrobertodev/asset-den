// Run with `node --experimental-strip-types src/lib/filter.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { activeFilterCount, matchesFilters, noFilters, visibleAssets } from "./filter.ts";

const now = Date.UTC(2026, 9, 19);
const day = 86_400_000;
const asset = (o: Partial<Asset>): Asset => ({
  id: 1,
  rootId: 1,
  relPath: "a.png",
  path: "/r/a.png",
  name: "a.png",
  ext: "png",
  kind: "image",
  size: 1000,
  mtime: now - day,
  width: 16,
  height: 16,
  favorite: false,
  tags: [],
  ...o,
});

const sprite = asset({});
const texture = asset({ id: 2, name: "t.tga", relPath: "tex/t.tga", ext: "tga", width: 2048, height: 1024, size: 8e6, mtime: now - 40 * day, tags: ["env"] });
const sound = asset({ id: 3, name: "s.ogg", relPath: "s.ogg", ext: "ogg", kind: "audio", width: null, height: null, tags: ["sfx", "ui"] });
const f = (o: Partial<typeof noFilters>) => ({ ...noFilters, ...o });
const ids = (o: Partial<typeof noFilters>) => [sprite, texture, sound].filter((a) => matchesFilters(a, f(o), now)).map((a) => a.id);

assert.deepEqual(ids({}), [1, 2, 3]);
assert.deepEqual(ids({ exts: ["tga", "ogg"] }), [2, 3]);
assert.deepEqual(ids({ maxW: 64, maxH: 64 }), [1]);
assert.deepEqual(ids({ minW: 1024 }), [2]);
assert.deepEqual(ids({ square: true }), [1]); // audio has no dimensions, so it's excluded
assert.deepEqual(ids({ minBytes: 5e6 }), [2]);
assert.deepEqual(ids({ maxBytes: 5e6 }), [1, 3]);
assert.deepEqual(ids({ days: 7 }), [1, 3]);
assert.deepEqual(ids({ untagged: true }), [1]);
assert.deepEqual(ids({ anyTags: ["ui", "env"] }), [2, 3]);
assert.equal(activeFilterCount(f({ minW: 1, maxW: 2, square: true, untagged: true })), 2);

const sorted = visibleAssets([sound, texture, sprite], { type: "all" }, "", [], f({ untagged: false }), [], { key: "size", desc: true });
assert.deepEqual(sorted.map((a) => a.id), [2, 3, 1]); // ties keep input order
console.log("filter tests passed");
