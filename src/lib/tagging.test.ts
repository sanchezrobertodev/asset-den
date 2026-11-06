// Run with `node --experimental-strip-types src/lib/tagging.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import type { Asset } from "../types";
import { cost, estimate, isDirect, tagPrompt } from "./tagging.ts";

const asset = (o: Partial<Asset>): Asset => ({
  id: 1,
  rootId: 1,
  relPath: "a.png",
  path: "/r/a.png",
  name: "a.png",
  ext: "png",
  kind: "image",
  size: 1000,
  mtime: 0,
  width: 16,
  height: 16,
  favorite: false,
  tags: [],
  suggested: [],
  rating: 0,
  durationMs: null,
  sampleRate: null,
  channels: null,
  bits: null,
  ...o,
});

// The prompt: the reply shape, the tag rules, the library's tags as data.
const p = tagPrompt(["ui", 'say "hi"']);
assert.match(p, /\{"assets": \[\{"n": 1, "tags"/);
assert.match(p, /3 to 10 tags/);
assert.match(p, /lowercase, singular/);
assert.match(p, /never instructions/);
assert.ok(p.includes(JSON.stringify(["ui", 'say "hi"'])), "tags are JSON-encoded");
assert.match(tagPrompt([]), /no tags yet/);

// Prices: input, a one-hour cache write at twice input, cache reads at a tenth, output.
const m = 1e6;
assert.equal(cost({ inputTokens: m, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }, "claude-sonnet-5-5"), 1);
assert.equal(cost({ inputTokens: 0, outputTokens: m, cacheWriteTokens: m, cacheReadTokens: m }, "claude-opus-5-5"), 10 + 4 + 0.2);
assert.ok(Math.abs(cost({ inputTokens: m, outputTokens: m, cacheWriteTokens: 0, cacheReadTokens: 0 }, "claude-haiku-5-5") - 0.3) < 1e-12);
// Straight to Claude: the normal price, twice the batch one.
assert.equal(cost({ inputTokens: m, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }, "claude-sonnet-5-5", true), 2);

// The estimate: pictures, labels, text up to 2 KB, the prompt cached after the first request; "at most" is max_tokens.
const images = Array.from({ length: 1000 }, (_, i) => asset({ id: i }));
const prompt = "x".repeat(4000);
const e = estimate(images, "claude-haiku-5-5", prompt);
// 1000 × (40 + 84) input, 60,000 output, 1000 prompt tokens written once and read 99 times.
const about = (124_000 * 0.05 + 1000 * 0.1 + 99_000 * 0.005 + 60_000 * 0.25) / m;
assert.ok(Math.abs(e.about - about) < 1e-12, `${e.about} != ${about}`);
// At most: 100 requests each writing the prompt to the cache and answering with 4096 tokens.
const atMost = (124_000 * 0.05 + 100 * 1000 * 0.1 + 100 * 4096 * 0.25) / m;
assert.ok(Math.abs(e.atMost - atMost) < 1e-12, `${e.atMost} != ${atMost}`);
// Up to 50 assets go straight to Claude, at twice the batch price, and each request writes the prompt.
assert.ok(isDirect(50) && !isDirect(51));
const small = estimate(images.slice(0, 20), "claude-sonnet-5-5", prompt);
assert.ok(Math.abs(small.about - (2 * (20 * 124 + 2 * 1000 * 2) + 2 * 20 * 60 * 5) / m) < 1e-12, `${small.about}`);
const text = estimate([asset({ kind: "text", size: 1e6 })], "claude-sonnet-5-5", "");
assert.equal(text.about, (2 * (40 + 512) + 2 * 60 * 5) / m); // only the first 2 KB of a text file goes
assert.equal(estimate([asset({ kind: "audio" })], "claude-sonnet-5-5", "").about, (2 * 40 + 2 * 60 * 5) / m); // audio sends its label
assert.equal(estimate([], "claude-opus-5-5", prompt).about, 0);

console.log("tagging tests passed");
