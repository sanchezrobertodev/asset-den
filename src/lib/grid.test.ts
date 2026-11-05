// Run with `node --experimental-strip-types src/lib/grid.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { rowStep } from "./grid.ts";

// 10 cards in rows of 4: 0–3, 4–7, 8–9.
assert.equal(rowStep([10], 4, 1, 1), 5);
assert.equal(rowStep([10], 4, 7, 1), 9, "a shorter last row: its last card");
assert.equal(rowStep([10], 4, 9, -1), 5);
assert.equal(rowStep([10], 4, 2, -1), 2, "the first row stays put");
assert.equal(rowStep([10], 4, 8, 1), 8, "the last row stays put");

// Folder groups of 5 and 3 in rows of 4: 0–3, 4 | 5–7.
assert.equal(rowStep([5, 3], 4, 2, 1), 4);
assert.equal(rowStep([5, 3], 4, 4, 1), 5, "into the next group");
assert.equal(rowStep([5, 3], 4, 7, -1), 4, "back up into the short row");
assert.equal(rowStep([5, 3], 4, 0, -1), 0);

// One column (the list view): a plain step.
assert.equal(rowStep([3], 1, 1, 1), 2);
assert.equal(rowStep([3], 1, 1, -1), 0);
assert.equal(rowStep([3], 1, 9, 1), 9, "not in the grid: unchanged");

console.log("grid: ok");
