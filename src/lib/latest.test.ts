// Run with `node --experimental-strip-types src/lib/latest.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { latestRequest } from "./latest.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r = latestRequest<number>(20);

// Only the newest request counts; cancelling drops the one in flight too.
const a = r.start(10);
const b = r.start(12);
assert.equal(a(), false);
assert.equal(b(), true);
r.cancel();
assert.equal(b(), false);

// again(): nothing to repeat after a cancel.
const ran: number[] = [];
r.again((x) => ran.push(x));
await sleep(40);
assert.deepEqual(ran, []);

// Repeats the latest arguments once per gap, however often it's asked.
r.start(5);
r.again((x) => ran.push(x));
r.again((x) => ran.push(x));
r.start(7);
await sleep(40);
assert.deepEqual(ran, [7]);
r.again((x) => ran.push(x));
await sleep(40);
assert.deepEqual(ran, [7, 7]);

// A cancel before the timer fires stops the repeat.
r.again((x) => ran.push(x));
r.cancel();
await sleep(40);
assert.deepEqual(ran, [7, 7]);
console.log("latest tests passed");
