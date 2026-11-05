import clsx from "clsx";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openUpdates, useAppUpdate } from "../appUpdate";
import { matchesFilters, matchesQuery, parseQuery, ruleMatcher } from "../lib/filter";
import { baseName, folderOf } from "../lib/format";
import { bytes } from "../lib/fmt";
import { t } from "../lib/i18n";
import { shortcut } from "../lib/shortcuts";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Thumb } from "./Thumb";
import { focusAssets, KindPill, Kbd, trapTab } from "./ui";

interface Item {
  key: string;
  label: string;
  sub?: string;
  right?: string;
  asset?: Asset;
  run: () => void;
}

const TOKENS = ["type:image", "type:audio", "type:3d", "#", "in:", "size:>1mb", "dur:<2s", "rating:>=4", "note:", "color:red"];
const tokenLabel: Record<string, string> = {
  "#": t("palette.tokens.tag", { token: "#" }),
  "in:": t("palette.tokens.folder", { token: "in:" }),
  "note:": t("palette.tokens.word", { token: "note:" }),
};

export function Palette() {
  const s = useStore();
  const [q, setQ] = useState(s.query);
  const [pi, setPi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const box = dialog.current;
    input.current?.focus();
    input.current?.select();
    // Running a result lands on the assets it shows (the chosen one active); closing search goes back to where it opened.
    return () => {
      const at = document.activeElement;
      if (ran.current) focusAssets();
      else if (!at || at === document.body || box?.contains(at)) prev?.focus();
    };
  }, []);
  const wantsColors = parseQuery(q).colors.length > 0;
  useEffect(() => {
    if (wantsColors) void useStore.getState().loadPalettes();
  }, [wantsColors]);

  const sections = useMemo(() => {
    const out: { title: string; items: Item[] }[] = [];
    const parsed = parseQuery(q);
    const hasQuery = q.trim().length > 0;
    const close = { palette: false };
    if (hasQuery) {
      // The library keeps the Filters panel, so the counts and results do too.
      const now = Date.now();
      const matches = s.assets.filter((a) => matchesQuery(a, parsed, s.notes, s.palettes) && matchesFilters(a, s.filters, now, s.palettes));
      // With a collection open, the first result searches inside it.
      const col = s.view === "collections" ? (s.collections.find((c) => c.id === s.colSel) ?? null) : null;
      const inCol = col
        ? matches.filter(col.rule ? ruleMatcher(col.rule, s.notes, undefined, s.palettes) : ((ids) => (a: Asset) => ids.has(a.id))(new Set(col.assetIds)))
        : [];
      // In Duplicates, it keeps the groups that have a matching copy.
      const hits = s.view === "duplicates" && s.dups ? new Set(matches.map((a) => a.id)) : null;
      const inDups = hits ? s.dups!.filter((g) => g.ids.some((id) => hits.has(id))).length : 0;
      const items: Item[] = [
        ...(col
          ? [
              {
                key: "collection",
                label: t("palette.inCollection", { count: inCol.length, name: col.name }),
                sub: q.trim(),
                run: () => useStore.setState({ query: q.trim(), ...close }),
              },
            ]
          : []),
        ...(hits
          ? [
              {
                key: "duplicates",
                label: t("palette.duplicates", { count: inDups }),
                sub: q.trim(),
                run: () => useStore.setState({ query: q.trim(), ...close }),
              },
            ]
          : []),
        {
          key: "all",
          label: matches.length === 1 ? t("palette.showMatch") : t("palette.showAll", { count: matches.length }),
          sub: q.trim(),
          run: () => {
            s.go("library", { query: q.trim(), kinds: [], folder: null });
            useStore.setState(close);
          },
        },
        ...matches.slice(0, 8).map((a) => ({
          key: `a${a.id}`,
          label: a.name,
          sub: folderOf(a.relPath) || "/",
          right: bytes(a.size),
          asset: a,
          run: () => {
            s.go("library", { query: "", kinds: [], folder: null });
            s.select(a.id);
            s.setPeek(true);
          },
        })),
      ];
      out.push({ title: t("palette.assets", { count: matches.length }), items });
    }
    if (parsed.text.length) {
      const seen = new Map<string, { rootId: number; path: string; n: number }>();
      for (const a of s.assets) {
        const f = folderOf(a.relPath);
        if (!f || !parsed.text.every((w) => f.toLowerCase().includes(w))) continue;
        const k = `${a.rootId}:${f}`;
        const e = seen.get(k) ?? { rootId: a.rootId, path: f, n: 0 };
        e.n++;
        seen.set(k, e);
      }
      const rootName = (id: number) => baseName(s.roots.find((r) => r.id === id)?.path ?? "");
      const folders = [...seen.values()].slice(0, 6);
      if (folders.length)
        out.push({
          title: t("palette.folders"),
          items: folders.map((f) => ({
            key: `f${f.rootId}:${f.path}`,
            label: `${rootName(f.rootId)}/${f.path}`,
            right: t("palette.files", { count: f.n }),
            run: () => s.go("library", { folder: { rootId: f.rootId, path: f.path }, query: "", kinds: [] }),
          })),
        });
    }
    const actions: [string, () => void][] = [
      [t("palette.actions.home"), () => s.go("home")],
      [t("palette.actions.duplicates"), () => s.go("duplicates")],
      [t("palette.actions.insights"), () => s.go("insights")],
      [t("palette.actions.newCollection"), () => void s.newCollection()],
      [t("palette.actions.favorites"), () => s.go("favorites", { kinds: [] })],
      [t("palette.actions.import"), () => {
        useStore.setState(close);
        void s.importFolder();
      }],
      [t("palette.actions.listView"), () => {
        s.setLayout("list");
        s.go("library");
      }],
      [t("palette.actions.gridView"), () => {
        s.setLayout("grid");
        s.go("library");
      }],
      [t("palette.actions.clearFilters"), () => {
        s.clearFilters();
        s.go("library");
      }],
      [t("palette.actions.settings"), () => s.setModal("settings")],
      [t("palette.actions.shortcuts"), () => s.setModal("shortcuts")],
    ];
    if (useAppUpdate.getState().supported) actions.splice(actions.length - 1, 0, [t("palette.actions.updates"), openUpdates]);
    const words = parsed.text;
    const onlyText =
      hasQuery &&
      !parsed.types &&
      !parsed.folder &&
      !parsed.tags.length &&
      !parsed.notes.length &&
      !parsed.colors.length &&
      parsed.minRating === 0 &&
      parsed.maxRating === 5 &&
      parsed.minMs === null &&
      parsed.maxMs === null;
    const acts = !hasQuery ? actions : onlyText ? actions.filter(([l]) => words.every((w) => l.toLowerCase().includes(w))) : [];
    if (acts.length) out.push({ title: t("palette.actions.title"), items: acts.map(([label, run]) => ({ key: `x${label}`, label, run })) });
    return out;
    // Only what it reads: the whole store changes on every scan tick, and this searches every asset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, s.assets, s.notes, s.palettes, s.filters, s.view, s.collections, s.colSel, s.dups, s.roots]);

  const flat = sections.flatMap((sec) => sec.items);
  const run = (item?: Item) => {
    if (!item) return;
    ran.current = true;
    item.run();
    useStore.setState({ palette: false });
  };

  useEffect(() => setPi(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${pi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pi]);

  let idx = 0;
  return (
    <div className="absolute inset-0 z-[60] flex justify-center bg-scrim pt-[10vh]" onMouseDown={() => s.setPalette(false)}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.dialog")}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => trapTab(e, dialog.current)}
        className="flex h-max max-h-[76vh] w-[min(700px,90%)] flex-col overflow-hidden rounded-2xl border border-line-x bg-field shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]"
      >
        <div className="flex h-[58px] flex-none items-center gap-3 border-b border-line-strong px-[18px]">
          <Search aria-hidden className="size-4 flex-none text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPi((p) => Math.min(flat.length - 1, p + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setPi((p) => Math.max(0, p - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(flat[pi]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                s.setPalette(false);
              }
              e.stopPropagation();
            }}
            role="combobox"
            aria-label={t("palette.input")}
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={flat[pi] ? `pal-${pi}` : undefined}
            placeholder={t("palette.placeholder")}
            className="flex-1 border-0 bg-transparent text-base text-fg outline-none"
          />
          <Kbd>{shortcut("close").keys}</Kbd>
        </div>
        <div role="group" aria-labelledby="palette-tokens" className="flex flex-wrap items-center gap-1.5 border-b border-line px-[18px] py-2.5 text-xs text-faint">
          <span id="palette-tokens" className="mr-1">
            {t("palette.filters")}
          </span>
          {TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => {
                setQ((cur) => (cur.trim() ? `${cur.trim()} ${token}` : token) + (token.endsWith(":") || token === "#" ? "" : " "));
                input.current?.focus();
              }}
              className="rounded-md bg-active px-2 py-[3px] font-mono text-fg-2 hover:inset-ring-1 hover:inset-ring-line-x"
            >
              {tokenLabel[token] ?? token}
            </button>
          ))}
        </div>
        <div ref={listRef} id="palette-results" role="listbox" aria-label={t("palette.results")} className="overflow-auto p-2">
          {sections.map((sec, si) => (
            <div key={sec.title} role="group" aria-labelledby={`pal-sec-${si}`}>
              <div id={`pal-sec-${si}`} className="px-2.5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[.06em] text-faint uppercase">
                {sec.title}
              </div>
              {sec.items.map((r) => {
                const my = idx++;
                return (
                  <div
                    key={r.key}
                    id={`pal-${my}`}
                    data-i={my}
                    role="option"
                    aria-selected={my === pi}
                    onMouseEnter={() => setPi(my)}
                    onClick={() => run(r)}
                    className={clsx("flex min-h-11 cursor-pointer items-center gap-3 rounded-[9px] px-2.5", my === pi && "bg-active inset-ring-1 inset-ring-line-x")}
                  >
                    {r.asset && <Thumb asset={r.asset} size="row" className="size-8 flex-none rounded-[7px]" />}
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate font-medium">{r.label}</span>
                      {r.sub && <span className="truncate text-xs text-faint">{r.sub}</span>}
                    </span>
                    {r.asset && <KindPill kind={r.asset.kind} className="px-[7px] py-0.5 text-[11px]" />}
                    {r.right && <span className="min-w-[52px] text-right font-mono text-[11px] text-muted">{r.right}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {!sections.length && (
            <div className="px-2.5 py-9 text-center text-muted">
              {t("palette.noResults", { type: "type:image", tag: "#player", rating: "rating:>=4", folder: "in:audio", color: "color:blue" })}
            </div>
          )}
        </div>
        <div className="flex gap-4 border-t border-line px-[18px] py-2.5 text-xs text-faint">
          <span>{t("palette.keys.move", { keys: "↑↓" })}</span>
          <span>{t("palette.keys.select", { keys: shortcut("run").keys })}</span>
          <span className="ml-auto">{t("palette.keys.close", { keys: shortcut("close").keys })}</span>
        </div>
      </div>
    </div>
  );
}
