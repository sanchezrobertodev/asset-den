#!/usr/bin/env node
// Builds, signs and publishes Asset Den for Windows, plus the update feed the in-app updater reads.
//
//   node scripts/release.mjs              build + sign + publish a GitHub release in asset-den-releases
//   node scripts/release.mjs --dry-run    build + sign + write release/v<version>/, upload nothing
//   node scripts/release.mjs --build-only signed installers for this OS (unsigned, with a warning, if no key)
//
// The signing key defaults to ~/.tauri/asset-den.key (override with TAURI_SIGNING_PRIVATE_KEY, a path or the key
// itself, and TAURI_SIGNING_PRIVATE_KEY_PASSWORD). Keep it out of the repo: installed copies only accept updates
// signed with it.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASES_REPO = "sanchezrobertodev/asset-den-releases";
const root = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const buildOnly = args.has("--build-only");

const read = (p) => readFileSync(join(root, p), "utf8");
const version = JSON.parse(read("src-tauri/tauri.conf.json")).version;
const pkgVersion = JSON.parse(read("package.json")).version;
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(read("src-tauri/Cargo.toml"))?.[1];
if (pkgVersion !== version || cargoVersion !== version)
  fail(`Versions differ: tauri.conf.json ${version}, package.json ${pkgVersion}, Cargo.toml ${cargoVersion}. Make them match.`);

const keyDefault = join(homedir(), ".tauri", "asset-den.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(keyDefault)) env.TAURI_SIGNING_PRIVATE_KEY = keyDefault;
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";
const signed = !!env.TAURI_SIGNING_PRIVATE_KEY;

if (buildOnly) {
  if (!signed) console.warn(`No signing key at ${keyDefault}: building without updater artifacts.`);
  run("npx", ["tauri", "build", ...(signed ? [] : ["--config", "src-tauri/tauri.no-updater.conf.json"])]);
  process.exit(0);
}

if (process.platform !== "win32") fail("make release builds the Windows installer, so run it on Windows.");
if (!signed) fail(`No signing key. Expected ${keyDefault}, or set TAURI_SIGNING_PRIVATE_KEY.`);
const notes = changelogSection(version);
const tag = `v${version}`;
if (!dryRun) {
  run("gh", ["auth", "status"], { quiet: true });
  if (spawnSync("gh", ["release", "view", tag, "--repo", RELEASES_REPO], { stdio: "ignore" }).status === 0)
    fail(`${RELEASES_REPO} already has ${tag}. Bump the version (tauri.conf.json, package.json, Cargo.toml) and add a CHANGELOG section first.`);
}

console.log(`Building Asset Den ${version} (NSIS installer, signed)…`);
run("npx", ["tauri", "build", "--bundles", "nsis"]);

const bundle = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const built = join(bundle, `Asset Den_${version}_x64-setup.exe`);
if (!existsSync(built) || !existsSync(`${built}.sig`)) fail(`Expected ${built} and its .sig after the build.`);

// GitHub turns spaces in asset names into dots, so publish under a name without them.
const installer = `AssetDen_${version}_x64-setup.exe`;
const out = join(root, "release", tag);
mkdirSync(out, { recursive: true });
copyFileSync(built, join(out, installer));
const url = `https://github.com/${RELEASES_REPO}/releases/download/${tag}/${installer}`;
const platform = { signature: readFileSync(`${built}.sig`, "utf8").trim(), url };
const feed = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  // The updater looks for "<os>-<arch>-<installer>" first, then "<os>-<arch>".
  platforms: { "windows-x86_64-nsis": platform, "windows-x86_64": platform },
};
writeFileSync(join(out, "latest.json"), `${JSON.stringify(feed, null, 2)}\n`);
writeFileSync(join(out, "notes.md"), `${notes}\n`);
console.log(`Wrote ${join(out, installer)} and latest.json.`);

if (dryRun) {
  console.log("Dry run: nothing uploaded.");
  process.exit(0);
}
run("gh", [
  "release", "create", tag,
  "--repo", RELEASES_REPO,
  "--title", `Asset Den ${version}`,
  "--notes-file", join(out, "notes.md"),
  "--latest",
  join(out, installer),
  join(out, "latest.json"),
]);
console.log(`Published ${tag}: https://github.com/${RELEASES_REPO}/releases/tag/${tag}`);

/** The "## [x.y.z]" section of CHANGELOG.md; it becomes the release notes and the in-app "What's new". */
function changelogSection(v) {
  const lines = read("CHANGELOG.md").split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) fail(`CHANGELOG.md has no "## [${v}]" section. Move the Unreleased notes under it first.`);
  let end = lines.findIndex((l, i) => i > start && (l.startsWith("## ") || /^\[[^\]]+\]: /.test(l)));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (!body) fail(`The CHANGELOG.md section for ${v} is empty.`);
  return body;
}

function run(cmd, argv, opts = {}) {
  // npx is a .cmd script on Windows and needs a shell; gh is a real executable and gets its arguments verbatim.
  const shell = process.platform === "win32" && cmd === "npx";
  const r = spawnSync(cmd, argv, { cwd: root, env, stdio: opts.quiet ? "ignore" : "inherit", shell });
  if (r.status !== 0) fail(`${cmd} ${argv.slice(0, 2).join(" ")} failed (exit ${r.status}).`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

