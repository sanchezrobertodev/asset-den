// Run with `node --experimental-strip-types src/lib/delta.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { applyDeltas, deltasAfter, type AssetsDelta } from "./delta.ts";

const asset = (id: number, relPath: string, size = 10): Asset => ({
  id,
  rootId: 1,
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
const delta = (seq: number, upserted: Asset[] = [], removed: number[] = []): AssetsDelta => ({ seq, upserted, removed });
const all = [asset(1, "a.png"), asset(2, "b.png"), asset(3, "c.png")];

// Changed rows keep their place, new rows go last, removed rows drop out.
{
  const { assets, gone } = applyDeltas(all, [delta(1, [asset(2, "sub/b.png", 99), asset(4, "d.png")], [3])]);
  assert.deepEqual(
    assets.map((a) => [a.id, a.relPath, a.size]),
    [
      [1, "a.png", 10],
      [2, "sub/b.png", 99],
      [4, "d.png", 10],
    ],
  );
  assert.deepEqual([...gone], [3]);
  assert.equal(all.length, 3, "input is not mutated");
}

// Later deltas win: added then removed is gone; a removed id reused for a new file comes back as a new row, and
// still counts as gone so the old file's selection and settings are cleared.
{
  const { assets, gone } = applyDeltas(all, [delta(1, [asset(5, "e.png")]), delta(2, [], [5, 1]), delta(3, [asset(1, "again.png")])]);
  assert.deepEqual(
    assets.map((a) => a.relPath),
    ["b.png", "c.png", "again.png"],
  );
  assert.deepEqual([...gone], [5, 1]);
}

// Nothing to do keeps the same array, so memoized views don't recompute.
assert.equal(applyDeltas(all, [delta(1)]).assets, all);
assert.equal(applyDeltas(all, []).assets, all);

// Ordering against a snapshot: older deltas are dropped, the rest sorted, a missing one means reload.
assert.deepEqual(
  deltasAfter(5, [delta(7), delta(4), delta(6), delta(5)])?.map((d) => d.seq),
  [6, 7],
);
assert.deepEqual(deltasAfter(5, [delta(3)]), []);
// The same delta received twice (two listeners) is applied once.
assert.deepEqual(
  deltasAfter(5, [delta(6), delta(6), delta(7), delta(7)])?.map((d) => d.seq),
  [6, 7],
);
assert.equal(deltasAfter(5, [delta(6), delta(8)]), null);
assert.equal(deltasAfter(5, [delta(7)]), null);

console.log("delta tests passed");
