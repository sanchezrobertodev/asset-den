# Local checks. These replace GitHub Actions on every push; the workflow only runs when started by hand.
# Recipes are plain commands so they run under sh (macOS/Linux, Git Bash) and cmd.exe.

CARGO_MANIFEST := --manifest-path src-tauri/Cargo.toml

.PHONY: check install typecheck ui test lint fmt fmt-check dev build

## check: run before every push. Frontend typecheck + production bundle, rustfmt, clippy, Rust tests
check: ui fmt-check lint test

install:
	npm ci

typecheck:
	npm run typecheck

## ui: typecheck and production-bundle the frontend (what `tauri build` embeds)
ui:
	npm run build

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

## build: installers for the current OS (see README)
build:
	npm run tauri build
