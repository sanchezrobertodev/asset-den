import assert from "node:assert/strict";
import { mergeFeed } from "./feed.mjs";

const win = { "windows-x86_64-nsis": { url: "w", signature: "ws" }, "windows-x86_64": { url: "w", signature: "ws" } };
const mac = { "darwin-aarch64": { url: "m", signature: "ms" }, "darwin-x86_64": { url: "m", signature: "ms" } };
const linux = { "linux-x86_64": { url: "l", signature: "ls" } };
const feed = (version, platforms, pub_date = "t1") => ({ version, notes: "n", pub_date, platforms });

// Workflow first, then make release (and the reverse): both sets survive, in either order.
const both = { ...win, ...mac, ...linux };
assert.deepEqual(mergeFeed(feed("1.0.0", { ...mac, ...linux }), feed("1.0.0", win, "t2")), feed("1.0.0", both, "t2"));
assert.deepEqual(mergeFeed(feed("1.0.0", win), feed("1.0.0", { ...mac, ...linux }, "t2")).platforms, both);

// Nothing published yet.
assert.deepEqual(mergeFeed(null, feed("1.0.0", win)), feed("1.0.0", win));

// A re-run replaces its own entries and keeps the others.
const rebuilt = { "linux-x86_64": { url: "l2", signature: "ls2" } };
assert.deepEqual(mergeFeed(feed("1.0.0", { ...win, ...linux }), feed("1.0.0", rebuilt)).platforms, { ...win, ...rebuilt });

// Another version's entries never leak in: they would point at older builds.
assert.deepEqual(mergeFeed(feed("0.9.0", win), feed("1.0.0", linux)), feed("1.0.0", linux));

console.log("feed: ok");
