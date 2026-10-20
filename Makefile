# Local checks. These replace GitHub Actions on every push; the workflow only runs when started by hand.
# Recipes are plain commands so they run under sh (macOS/Linux, Git Bash) and cmd.exe.

CARGO_MANIFEST := --manifest-path src-tauri/Cargo.toml

.PHONY: check install typecheck ui ui-test test lint fmt fmt-check dev build release release-dry

## check: run before every push. Frontend typecheck, bundle and tests, rustfmt, clippy, Rust tests
check: ui ui-test fmt-check lint test

install:
	npm ci

typecheck:
	npm run typecheck

## ui: typecheck and production-bundle the frontend (what `tauri build` embeds)
ui:
	npm run build

## ui-test: frontend logic tests (plain Node, no test framework)
ui-test:
	node --experimental-strip-types src/lib/filter.test.ts
	node --experimental-strip-types src/lib/folders.test.ts
	node --experimental-strip-types src/lib/scheduler.test.ts

test:
	cargo test $(CARGO_MANIFEST)

lint:
	cargo clippy $(CARGO_MANIFEST) --all-targets -- -D warnings

fmt:
	cargo fmt $(CARGO_MANIFEST)

fmt-check:
	cargo fmt $(CARGO_MANIFEST) -- --check

dev:
	npm run tauri dev

## build: installers for the current OS, signed for updates when ~/.tauri/asset-den.key exists (see README)
build:
	node scripts/release.mjs --build-only

## release: build, sign and publish the Windows installer and update feed to asset-den-releases
release:
	node scripts/release.mjs

## release-dry: the same build and feed in release/v<version>/, without uploading anything
release-dry:
	node scripts/release.mjs --dry-run
