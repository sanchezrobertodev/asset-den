// Run with `node --experimental-strip-types src/lib/news.test.ts` (part of `make check`).
import assert from "node:assert/strict";
import { notesSince } from "./news.ts";

const log = `# Changelog

Intro.

## [Unreleased]

- Next

## [0.6.0] - 2026-11-05

### Added

- Home

## [0.5.1] - 2026-11-04

- Fix

## [0.5.0] - 2026-11-03

- Languages
`;

// Only the new version when the old one isn't known (first update with this feature).
assert.equal(notesSince(log, null, "0.6.0"), "## 0.6.0 - 2026-11-05\n\n### Added\n\n- Home");
// Every version skipped since the last one seen, newest first, without the one already seen.
assert.equal(notesSince(log, "0.5.0", "0.6.0"), "## 0.6.0 - 2026-11-05\n\n### Added\n\n- Home\n\n## 0.5.1 - 2026-11-04\n\n- Fix");
// A downgrade, or a version the log doesn't list, shows just this version's notes.
assert.equal(notesSince(log, "0.6.0", "0.5.0"), "## 0.5.0 - 2026-11-03\n\n- Languages");
assert.equal(notesSince(log, "0.4.2", "0.5.1"), "## 0.5.1 - 2026-11-04\n\n- Fix");
// No section for this version (a dev build): nothing to show.
assert.equal(notesSince(log, null, "0.7.0"), "");
// 0.5.1 must not match 0.5.10.
assert.equal(notesSince("## [0.5.10] - x\n\n- A\n", null, "0.5.1"), "");

console.log("news: ok");
