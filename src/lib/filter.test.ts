// Run with `node --experimental-strip-types src/lib/filter.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { activeFilterCount, groupByFolder, matchesFilters, matchesQuery, noFilters, parseQuery, visibleAssets, type Scope } from "./filter.ts";

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

const sprite = asset({ relPath: "pack/sprites/a.png", favorite: true, tags: ["player"] });
const texture = asset({ id: 2, name: "t.tga", relPath: "tex/t.tga", ext: "tga", width: 2048, height: 1024, size: 8e6, mtime: now - 40 * day, tags: ["env"] });
const sound = asset({ id: 3, name: "s.ogg", relPath: "audio/s.ogg", ext: "ogg", kind: "audio", width: null, height: null, tags: ["sfx", "ui"] });
const all = [sprite, texture, sound];

// Filters panel
const f = (o: Partial<typeof noFilters>) => ({ ...noFilters, ...o });
const ids = (o: Partial<typeof noFilters>) => all.filter((a) => matchesFilters(a, f(o), now)).map((a) => a.id);
assert.deepEqual(ids({}), [1, 2, 3]);
assert.deepEqual(ids({ exts: ["tga", "ogg"] }), [2, 3]);
assert.deepEqual(ids({ maxW: 64, maxH: 64 }), [1]);
assert.deepEqual(ids({ square: true }), [1]); // audio has no dimensions, so it's excluded
assert.deepEqual(ids({ minBytes: 5e6 }), [2]);
assert.deepEqual(ids({ days: 7 }), [1, 3]);
assert.deepEqual(ids({ untagged: true }), []);
assert.deepEqual(ids({ anyTags: ["ui", "env"] }), [2, 3]);
assert.equal(activeFilterCount(f({ minW: 1, maxW: 2, square: true, untagged: true })), 2);

// Search syntax shared by the search bar and the palette
const q = (s: string) => all.filter((a) => matchesQuery(a, parseQuery(s))).map((a) => a.id);
assert.deepEqual(q("type:audio"), [3]);
assert.deepEqual(q("type:3d"), []); // a type that matches no asset kind present
assert.deepEqual(parseQuery("type:3d").types, ["model"]);
assert.deepEqual(q("in:sprites"), [1]);
assert.deepEqual(q("#pla"), [1]);
assert.deepEqual(q("size:>1mb"), [2]);
assert.deepEqual(q("size:<2kb"), [1, 3]);
assert.deepEqual(q("tex t.tga"), [2]);
assert.deepEqual(q("sfx"), [3]); // an exact tag also matches as plain text

// Views, sorting, grouping
const scope = (o: Partial<Scope>): Scope => ({ view: "library", kinds: [], folder: null, query: "", filters: noFilters, collection: null, ...o });
assert.deepEqual(visibleAssets(all, scope({ view: "favorites" }), { key: "name", desc: false }).map((a) => a.id), [1]);
assert.deepEqual(visibleAssets(all, scope({ folder: { rootId: 1, path: "pack" } }), { key: "name", desc: false }).map((a) => a.id), [1]);
assert.deepEqual(visibleAssets(all, scope({ view: "collections", collection: { id: 1, name: "c", assetIds: [3, 2] } }), { key: "name", desc: false }).map((a) => a.id), [3, 2]);
const sorted = visibleAssets([sound, texture, sprite], scope({}), { key: "size", desc: true });
assert.deepEqual(sorted.map((a) => a.id), [2, 3, 1]); // ties keep input order
assert.deepEqual(groupByFolder(sorted, [{ id: 1, path: "/games/lib" }]).map((g) => [g.label, g.items.length]), [["audio", 1], ["pack/sprites", 1], ["tex", 1]]);
console.log("filter tests passed");
