// Run with `node --experimental-strip-types src/lib/mtl.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { mtlCandidates } from "./mtl.ts";

const obj = "# exported\nmtllib chair.mtl\no Chair\nv 0 0 0\n";

// The mtllib file, then the OBJ's own base name.
assert.deepEqual(mtlCandidates("C:\\art\\props\\stool.obj", obj), ["C:\\art\\props\\chair.mtl", "C:\\art\\props\\stool.mtl"]);
assert.deepEqual(mtlCandidates("/home/a/stool.obj", obj), ["/home/a/chair.mtl", "/home/a/stool.mtl"]);
// No duplicate when they match (case-insensitively); CRLF and trailing spaces are trimmed.
assert.deepEqual(mtlCandidates("C:\\art\\Chair.OBJ", "mtllib chair.mtl  \r\nv 0 0 0"), ["C:\\art\\chair.mtl"]);
// No mtllib line: just the base name.
assert.deepEqual(mtlCandidates("C:\\art\\box.obj", "v 0 0 0\n"), ["C:\\art\\box.mtl"]);
// Relative subfolders follow the OBJ's separator; names may contain spaces.
assert.deepEqual(mtlCandidates("C:\\art\\box.obj", "mtllib mats/my box.mtl\n")[0], "C:\\art\\mats\\my box.mtl");
// Absolute paths from another machine: the file name next to the OBJ.
assert.deepEqual(mtlCandidates("C:\\art\\box.obj", "mtllib D:\\work\\out\\box_mat.mtl\n")[0], "C:\\art\\box_mat.mtl");
assert.deepEqual(mtlCandidates("/x/box.obj", "mtllib /Users/bob/box_mat.mtl\n")[0], "/x/box_mat.mtl");
// "mtllib" only counts at the start of a line.
assert.deepEqual(mtlCandidates("/x/box.obj", "# mtllib nope.mtl\n"), ["/x/box.mtl"]);

console.log("mtl tests passed");
