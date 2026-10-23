// Run with `node --experimental-strip-types src/lib/filter.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { activeFilterCount, groupByFolder, matchesFilters, matchesQuery, noFilters, parseQuery, ruleMatcher, visibleAssets, type Scope } from "./filter.ts";

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
  rating: 0,
  durationMs: null,
  sampleRate: null,
  channels: null,
  bits: null,
  ...o,
});

const sprite = asset({ relPath: "pack/sprites/a.png", favorite: true, tags: ["player"], rating: 5 });
const texture = asset({ id: 2, name: "t.tga", relPath: "tex/t.tga", ext: "tga", width: 2048, height: 1024, size: 8e6, mtime: now - 40 * day, tags: ["env"], rating: 3 });
const sound = asset({ id: 3, name: "s.ogg", relPath: "audio/s.ogg", ext: "ogg", kind: "audio", width: null, height: null, tags: ["sfx", "ui"], durationMs: 1500 });
const music = asset({ id: 4, name: "m.mp3", relPath: "audio/m.mp3", ext: "mp3", kind: "audio", width: null, height: null, durationMs: 95_000 });
const unread = asset({ id: 5, name: "u.opus", relPath: "audio/u.opus", ext: "opus", kind: "audio", width: null, height: null });
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
assert.deepEqual(ids({ minRating: 3 }), [1, 2]);
assert.deepEqual(ids({ minRating: 5 }), [1]);
assert.equal(activeFilterCount(f({ minW: 1, maxW: 2, square: true, untagged: true })), 2);
assert.equal(activeFilterCount(f({ minRating: 1 })), 1);
// Audio length: only files with a known length match once a limit is set.
const durIds = (o: Partial<typeof noFilters>) => [...all, music, unread].filter((a) => matchesFilters(a, f(o), now)).map((a) => a.id);
assert.deepEqual(durIds({ maxMs: 2000 }), [3]);
assert.deepEqual(durIds({ minMs: 30_000 }), [4]);
assert.deepEqual(durIds({ minMs: 1500, maxMs: 95_000 }), [3, 4]); // limits are inclusive
assert.deepEqual(durIds({ minMs: 0 }), [3, 4]);
assert.equal(activeFilterCount(f({ minMs: 1000 })), 1);

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
assert.deepEqual(q("rating:3"), [2]);
assert.deepEqual(q("rating:>=3"), [1, 2]);
assert.deepEqual(q("rating:>3"), [1]);
assert.deepEqual(q("rating:<3"), [3]);
assert.deepEqual(q("rating:<=3 type:image"), [2]);
assert.deepEqual(q("rating:0"), [3]); // unrated
assert.deepEqual(q("rating:9"), [1, 2, 3]); // not a rating: ignored, like a bad size:
const notes = { 2: "Needs a 2x version", 3: "Too loud, REDO" };
const qn = (s: string) => all.filter((a) => matchesQuery(a, parseQuery(s), notes)).map((a) => a.id);
assert.deepEqual(qn("note:redo"), [3]);
assert.deepEqual(qn("note:2x note:version"), [2]);
assert.deepEqual(qn("note:missing"), []);
assert.deepEqual(qn("note:"), [1, 2, 3]); // an empty note: is ignored, like in:
assert.deepEqual(q("note:redo"), []); // no notes given
const qa = (s: string) => [...all, music, unread].filter((a) => matchesQuery(a, parseQuery(s))).map((a) => a.id);
assert.deepEqual(qa("dur:<2s"), [3]);
assert.deepEqual(qa("dur:>30s"), [4]);
assert.deepEqual(qa("dur:90"), [4]); // seconds by default, no operator = at least
assert.deepEqual(qa("dur:>1m dur:<2m"), [4]);
assert.deepEqual(qa("dur:<1500ms"), [3]);
assert.deepEqual(qa("dur:>0s type:audio"), [3, 4]); // unknown lengths never match a dur: limit
assert.deepEqual(parseQuery("dur:abc").text, []); // malformed tokens are ignored, as with size:
assert.deepEqual([parseQuery("dur:<2.5s").maxMs, parseQuery("dur:2.5s").minMs], [2500, 2500]);

// Views, sorting, grouping
const scope = (o: Partial<Scope>): Scope => ({ view: "library", kinds: [], folder: null, subfolders: true, query: "", filters: noFilters, collection: null, notes: {}, ...o });
assert.deepEqual(visibleAssets(all, scope({ view: "favorites" }), { key: "name", desc: false }).map((a) => a.id), [1]);
assert.deepEqual(visibleAssets(all, scope({ folder: { rootId: 1, path: "pack" } }), { key: "name", desc: false }).map((a) => a.id), [1]);
assert.deepEqual(visibleAssets(all, scope({ view: "collections", collection: { id: 1, name: "c", assetIds: [3, 2], rule: null } }), { key: "name", desc: false }).map((a) => a.id), [3, 2]);
// Smart collections: members are whatever matches the saved search now, regardless of the current search and filters.
const smart = (query: string, filters = {}) => ({ id: 2, name: "s", assetIds: [], rule: { query, filters } });
const members = (c: ReturnType<typeof smart>, o: Partial<Scope> = {}) =>
  visibleAssets(all, scope({ view: "collections", collection: c, query: "type:audio", filters: f({ untagged: true }), ...o }), null).map((a) => a.id);
assert.deepEqual(members(smart("rating:>=3")), [1, 2]);
assert.deepEqual(members(smart("", { minRating: 5 })), [1]);
assert.deepEqual(members(smart("type:image", { exts: ["tga"] })), [2]);
assert.deepEqual(members(smart("note:loud"), { notes }), [3]);
assert.deepEqual(members(smart("", {})), [1, 2, 3]); // missing filter fields mean "any"
assert.deepEqual(all.filter(ruleMatcher(smart("#env").rule, {}, now)).map((a) => a.id), [2]);
const sorted = visibleAssets([sound, texture, sprite], scope({}), { key: "size", desc: true });
assert.deepEqual(sorted.map((a) => a.id), [2, 3, 1]); // ties keep input order
assert.deepEqual(groupByFolder(sorted, [{ id: 1, path: "/games/lib" }]).map((g) => [g.label, g.items.length]), [["audio", 1], ["pack/sprites", 1], ["tex", 1]]);
console.log("filter tests passed");
