// Run with `node --experimental-strip-types src/lib/sprites.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { frameSize, gridFor, guessGrid } from "./sprites.ts";

// Strips of square frames.
assert.deepEqual(guessGrid(256, 64), { cols: 4, rows: 1 });
assert.deepEqual(guessGrid(768, 128), { cols: 6, rows: 1 });
assert.deepEqual(guessGrid(32, 256), { cols: 1, rows: 8 });
// Grids of square cells, frame count nearest 16.
assert.deepEqual(guessGrid(256, 256), { cols: 4, rows: 4 });
assert.deepEqual(guessGrid(384, 256), { cols: 6, rows: 4 });
assert.deepEqual(guessGrid(192, 128), { cols: 6, rows: 4 });
// Nothing tiles: one frame.
assert.deepEqual(guessGrid(257, 100), { cols: 1, rows: 1 });
assert.deepEqual(guessGrid(0, 0), { cols: 1, rows: 1 });

assert.deepEqual(frameSize(256, 64, { cols: 4, rows: 1 }), { w: 64, h: 64 });
assert.deepEqual(frameSize(100, 50, { cols: 3, rows: 1 }), { w: 33, h: 50 });
assert.deepEqual(gridFor(256, 64, 32, 32), { cols: 8, rows: 2 });
assert.deepEqual(gridFor(256, 64, 0, 999), { cols: 256, rows: 1 });

console.log("sprites: ok");
