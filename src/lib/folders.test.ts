// Run with `node --experimental-strip-types src/lib/folders.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { groupByFolder, noFilters, visibleAssets, type Scope } from "./filter.ts";
import { ancestorKeys, buildTree, findNode, parentOf, pathTo } from "./folders.ts";

const asset = (id: number, relPath: string, size = 10, rootId = 1): Asset => ({
  id,
  rootId,
  relPath,
  path: `/r/${relPath}`,
  name: relPath.split("/").pop()!,
  ext: "png",
  kind: "image",
  size,
  mtime: 0,
  width: null,
  height: null,
  favorite: false,
  tags: [],
  rating: 0,
});
const roots = [
  { id: 1, path: "C:\\games\\game-assets" },
  { id: 2, path: "/home/me/sample-lib" },
];
const all = [
  asset(1, "characters/hero/idle/a.png"),
  asset(2, "characters/hero/idle/b.png"),
  asset(3, "characters/hero/run/c.png"),
  asset(4, "characters/hero/palette.png"),
  asset(5, "characters/enemies/slime.png"),
  asset(6, "readme.png"),
  asset(7, "x.png", 10, 2),
];

const tree = buildTree(all, roots);
assert.deepEqual(tree.map((t) => [t.name, t.count]), [["game-assets", 6], ["sample-lib", 1]]);
const hero = findNode(tree, { rootId: 1, path: "characters/hero" })!;
assert.equal(hero.count, 4);
assert.equal(hero.bytes, 40);
assert.deepEqual(hero.children.map((c) => [c.name, c.count]), [["idle", 2], ["run", 1]]);
assert.deepEqual(tree[0].children.map((c) => c.name), ["characters"]);
assert.equal(findNode(tree, { rootId: 1, path: "nope" }), null);
assert.deepEqual(pathTo(tree, { rootId: 1, path: "characters/hero/run" }).map((n) => n.name), ["game-assets", "characters", "hero", "run"]);
assert.deepEqual(ancestorKeys({ rootId: 1, path: "characters/hero" }), ["1:", "1:characters", "1:characters/hero"]);
assert.deepEqual(parentOf({ rootId: 1, path: "characters/hero" }), { rootId: 1, path: "characters" });
assert.deepEqual(parentOf({ rootId: 1, path: "characters" }), { rootId: 1, path: "" });

// Include subfolders on and off
const scope = (o: Partial<Scope>): Scope => ({ view: "library", kinds: [], folder: null, subfolders: true, query: "", filters: noFilters, collection: null, ...o });
const ids = (o: Partial<Scope>) => visibleAssets(all, scope(o), { key: "name", desc: false }).map((a) => a.id);
assert.deepEqual(ids({ folder: { rootId: 1, path: "characters/hero" } }), [1, 2, 3, 4]);
assert.deepEqual(ids({ folder: { rootId: 1, path: "characters/hero" }, subfolders: false }), [4]);
assert.deepEqual(ids({ folder: { rootId: 1, path: "" }, subfolders: false }), [6]);
assert.deepEqual(ids({ folder: { rootId: 2, path: "" } }), [7]);

// Group labels start at the open folder's name
const base = { rootId: 1, path: "characters/hero" };
const groups = groupByFolder(visibleAssets(all, scope({ folder: base }), { key: "name", desc: false }), roots, base);
assert.deepEqual(groups.map((g) => g.label), ["hero", "hero/idle", "hero/run"]);
console.log("folder tests passed");
