// Run with `node --experimental-strip-types src/lib/scheduler.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { createScheduler } from "./scheduler.ts";

const started: number[] = [];
const finish = new Map<number, (v: string) => void>();
const s = createScheduler((n: number) => {
  started.push(n);
  return new Promise<string>((res) => finish.set(n, res));
}, 2);
const tick = () => new Promise((r) => setTimeout(r, 0));
const got: string[] = [];
const req = (n: number) => s.request(String(n), n, (v) => got.push(v));

// A fast scroll: 20 cards request, then 0..15 leave the screen before their turn.
const withdraw = Array.from({ length: 20 }, (_, n) => req(n));
assert.deepEqual(started, [0, 1], "the first two start at once (nothing else is waiting yet)");
for (let n = 2; n < 16; n++) withdraw[n]();
finish.get(0)!("t0");
finish.get(1)!("t1");
await tick();
assert.deepEqual(started, [0, 1, 19, 18], "newest waiting requests go next");
// Re-requesting a waiting item puts it on top.
req(16);
finish.get(19)!("t19");
await tick();
assert.equal(started.at(-1), 16, "a re-requested card jumps the queue");
finish.get(18)!("t18");
await tick();
finish.get(16)!("t16");
await tick();
finish.get(17)!("t17");
await tick();
assert.deepEqual([...started].sort((a, b) => a - b), [0, 1, 16, 17, 18, 19], "withdrawn requests never run");
assert.deepEqual(s.stats(), { waiting: 0, running: 0, done: 6 });

// Two cards showing the same file share one job; a finished result comes from the cache at once.
const before = started.length;
const shared: string[] = [];
s.request("x", 99, (v) => shared.push(`a:${v}`));
s.request("x", 99, (v) => shared.push(`b:${v}`));
assert.equal(started.length, before + 1);
finish.get(99)!("tx");
await tick();
assert.deepEqual(shared, ["a:tx", "b:tx"]);
s.request("x", 99, (v) => shared.push(`c:${v}`));
assert.deepEqual(shared.at(-1), "c:tx");
assert.equal(started.length, before + 1, "cached: no second run");
console.log("scheduler tests passed");
