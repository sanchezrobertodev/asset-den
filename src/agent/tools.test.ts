// node --experimental-strip-types src/agent/tools.test.ts (part of `make check`).
// src-tauri/agent-tools.json is the relay's copy of TOOLS, so `mimikit mcp` can list the tools while Mimikit is closed.
// After changing a tool, rewrite it with: UPDATE_TOOLS=1 node --experimental-strip-types src/agent/tools.test.ts
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { TOOLS } from "./tools.ts";

const file = new URL("../../src-tauri/agent-tools.json", import.meta.url);
const current = `${JSON.stringify(TOOLS, null, 2)}\n`;
if (process.env.UPDATE_TOOLS) writeFileSync(file, current);
assert.equal(
  readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
  current,
  "src-tauri/agent-tools.json is out of date: run UPDATE_TOOLS=1 node --experimental-strip-types src/agent/tools.test.ts",
);

assert.deepEqual(
  TOOLS.map((t) => t.name),
  ["overview", "search", "get_assets", "similar", "view", "list_tags", "list_collections", "read_text", "show"],
);
for (const t of TOOLS) {
  assert.ok(t.description.length > 40, `${t.name} has a description`);
  assert.equal(t.inputSchema.type, "object", `${t.name} takes an object`);
  assert.equal(t.inputSchema.additionalProperties, false, `${t.name} refuses unknown fields`);
  // M1 only reads: a tool that changes the library needs "Allow changes" first (M2).
  assert.equal(t.annotations.readOnlyHint, true, `${t.name} only reads`);
}
console.log(`tools: ${TOOLS.length} tools, agent-tools.json up to date`);
