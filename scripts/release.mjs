#!/usr/bin/env node
// Builds, signs and publishes Asset Den, plus the update feed the in-app updater reads.
//
//   node scripts/release.mjs              build + sign the Windows installer, publish it to the repo's releases
//   node scripts/release.mjs --dry-run    build + sign + write release/v<version>/, upload nothing
//   node scripts/release.mjs --build-only signed installers for this OS (unsigned, with a warning, if no key)
//   node scripts/release.mjs --add-platforms <dir>
//                                         publish the signed macOS and Linux bundles the Release workflow built
//
// One release holds every OS. Windows (make release) and macOS/Linux (the Release workflow) publish in either order:
// the first creates the release, the second adds its files and merges its entries into latest.json. The workflow
// creates it as a draft, so the feed never announces a version Windows can't install yet; make release publishes it.
//
// The signing key defaults to ~/.tauri/asset-den.key (override with TAURI_SIGNING_PRIVATE_KEY, a path or the key
// itself, and TAURI_SIGNING_PRIVATE_KEY_PASSWORD). Keep it out of the repo: installed copies only accept updates
// signed with it.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeFeed } from "./feed.mjs";

const RELEASES_REPO = "sanchezrobertodev/asset-den";
const root = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const args = new Set(argv);
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

const notes = changelogSection(version);
const tag = `v${version}`;
const out = join(root, "release", tag);
mkdirSync(out, { recursive: true });
const assetUrl = (name) => `https://github.com/${RELEASES_REPO}/releases/download/${tag}/${name}`;
// GitHub turns spaces in asset names into dots, so files are published under names without them.
const stage = (from, name) => {
  copyFileSync(from, join(out, name));
  return join(out, name);
};

if (args.has("--add-platforms")) {
  const dir = argv[argv.indexOf("--add-platforms") + 1];
  if (!dir || !existsSync(dir)) fail("--add-platforms needs the folder holding the workflow's bundles.");
  // Built and signed by the workflow already; this renames, uploads and merges the feed.
  const found = readdirSync(dir, { recursive: true }).map((f) => join(dir, f));
  const one = (suffix) => {
    const hits = found.filter((f) => f.endsWith(suffix));
    if (hits.length !== 1) fail(`Expected one *${suffix} in ${dir}, found ${hits.length}.`);
    return hits[0];
  };
  const sig = (suffix) => readFileSync(one(suffix), "utf8").trim();
  const mac = `AssetDen_${version}_universal.app.tar.gz`;
  const appImage = `AssetDen_${version}_amd64.AppImage`;
  const files = [
    stage(one(".app.tar.gz"), mac),
    stage(one(".dmg"), `AssetDen_${version}_universal.dmg`),
    stage(one(".AppImage"), appImage),
    stage(one(".deb"), `AssetDen_${version}_amd64.deb`),
  ];
  const macPlatform = { signature: sig(".app.tar.gz.sig"), url: assetUrl(mac) };
  const platforms = {
    // One universal build serves both Mac architectures.
    "darwin-aarch64": macPlatform,
    "darwin-x86_64": macPlatform,
    // Only the AppImage can replace itself; .deb installs never check (app_updates_supported).
    "linux-x86_64": { signature: sig(".AppImage.sig"), url: assetUrl(appImage) },
  };
  if (dryRun) {
    writeFeed(feedFor(platforms));
    console.log(`Wrote ${out}. Dry run: nothing uploaded.`);
    process.exit(0);
  }
  run("gh", ["auth", "status"], { quiet: true });
  publish(files, platforms, { draft: true });
  process.exit(0);
}

if (process.platform !== "win32") fail("make release builds the Windows installer, so run it on Windows.");
if (!signed) fail(`No signing key. Expected ${keyDefault}, or set TAURI_SIGNING_PRIVATE_KEY.`);
const installer = `AssetDen_${version}_x64-setup.exe`;
if (!dryRun) {
  run("gh", ["auth", "status"], { quiet: true });
  buildCommit(); // fail before the build, not after it
  if (releaseAssets()?.includes(installer))
    fail(`${RELEASES_REPO} already has ${tag} with ${installer}. Bump the version (tauri.conf.json, package.json, Cargo.toml) and add a CHANGELOG section first.`);
}

console.log(`Building Asset Den ${version} (NSIS installer, signed)…`);
run("npx", ["tauri", "build", "--bundles", "nsis"]);

const bundle = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const built = join(bundle, `Asset Den_${version}_x64-setup.exe`);
if (!existsSync(built) || !existsSync(`${built}.sig`)) fail(`Expected ${built} and its .sig after the build.`);
const files = [stage(built, installer)];
const platform = { signature: readFileSync(`${built}.sig`, "utf8").trim(), url: assetUrl(installer) };
// The updater looks for "<os>-<arch>-<installer>" first, then "<os>-<arch>".
const platforms = { "windows-x86_64-nsis": platform, "windows-x86_64": platform };

if (dryRun) {
  writeFeed(feedFor(platforms));
  console.log(`Wrote ${files[0]} and latest.json. Dry run: nothing uploaded.`);
  process.exit(0);
}
publish(files, platforms, { draft: false });

function feedFor(platforms) {
  return { version, notes, pub_date: new Date().toISOString(), platforms };
}

function writeFeed(feed) {
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(feed, null, 2)}\n`);
  writeFileSync(join(out, "notes.md"), `${notes}\n`);
  return join(out, "latest.json");
}

/**
 * Uploads `files` and latest.json, merged with the one already published for this version, creating the release if
 * there is none: as a draft when `draft`, otherwise published and marked latest (which also publishes a draft).
 */
function publish(files, platforms, { draft }) {
  const existing = releaseAssets();
  let feed = feedFor(platforms);
  if (existing?.includes("latest.json")) {
    const dir = join(out, "published");
    run("gh", ["release", "download", tag, "--repo", RELEASES_REPO, "--pattern", "latest.json", "--dir", dir, "--clobber"]);
    feed = mergeFeed(JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")), feed);
  }
  const feedFile = writeFeed(feed);
  if (!existing) {
    run("gh", [
      "release", "create", tag,
      "--repo", RELEASES_REPO,
      // Tags the commit these files were built from, not wherever the default branch is now.
      "--target", buildCommit(),
      "--title", `Asset Den ${version}`,
      "--notes-file", join(out, "notes.md"),
      draft ? "--draft" : "--latest",
      ...files,
      feedFile,
    ]);
  } else {
    run("gh", ["release", "upload", tag, "--repo", RELEASES_REPO, "--clobber", ...files, feedFile]);
    if (!draft) run("gh", ["release", "edit", tag, "--repo", RELEASES_REPO, "--draft=false", "--latest"]);
  }
  const state = draft && !existing ? "Created draft" : existing ? "Updated" : "Published";
  console.log(`${state} ${tag}: https://github.com/${RELEASES_REPO}/releases/tag/${tag}`);
  console.log(`Feed platforms: ${Object.keys(feed.platforms).join(", ")}`);
}

/** Asset names of this version's release (drafts too), or null when there is none yet. */
function releaseAssets() {
  const r = spawnSync(
    "gh",
    ["release", "view", tag, "--repo", RELEASES_REPO, "--json", "assets", "--jq", ".assets[].name"],
    { cwd: root, env, encoding: "utf8" },
  );
  if (r.status === 0) return r.stdout.split(/\r?\n/).filter(Boolean);
  if (/not found/i.test(r.stderr)) return null;
  fail(`gh release view ${tag} failed: ${r.stderr.trim()}`);
}

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

/** The checked-out commit, which the build used; refuses uncommitted changes, which the tag wouldn't contain. */
function buildCommit() {
  const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
  if (git("status", "--porcelain", "--untracked-files=no"))
    fail("The working tree has uncommitted changes, so the release's tag wouldn't match the build. Commit or stash them.");
  return git("rev-parse", "HEAD");
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
