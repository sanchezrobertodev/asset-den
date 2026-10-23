import clsx from "clsx";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { openUpdates, useAppUpdate } from "../appUpdate";
import { matchesQuery, parseQuery } from "../lib/filter";
import { baseName, bytes, folderOf } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Thumb } from "./Thumb";
import { KindPill, Kbd } from "./ui";

interface Item {
  key: string;
  label: string;
  sub?: string;
  right?: string;
  asset?: Asset;
  run: () => void;
}

const TOKENS = ["type:image", "type:audio", "type:3d", "#", "in:", "size:>1mb", "rating:>=4", "note:"];
const tokenLabel: Record<string, string> = { "#": "#tag", "in:": "in:folder", "note:": "note:word" };

export function Palette() {
  const s = useStore();
  const [q, setQ] = useState(s.query);
  const [pi, setPi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const sections = useMemo(() => {
    const out: { title: string; items: Item[] }[] = [];
    const parsed = parseQuery(q);
    const hasQuery = q.trim().length > 0;
    const close = { palette: false };
    if (hasQuery) {
      const matches = s.assets.filter((a) => matchesQuery(a, parsed, s.notes));
      const items: Item[] = [
        {
          key: "all",
          label: matches.length ? `Show all ${matches.length.toLocaleString()} matches in the library` : "No assets match",
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
      out.push({ title: `Assets · ${matches.length.toLocaleString()}`, items });
    }
    if (parsed.text.length) {
      const seen = new Map<string, { rootId: number; path: string; n: number }>();
      for (const a of s.assets) {
        const f = folderOf(a.relPath);
        if (!f || !parsed.text.every((t) => f.toLowerCase().includes(t))) continue;
        const k = `${a.rootId}:${f}`;
        const e = seen.get(k) ?? { rootId: a.rootId, path: f, n: 0 };
        e.n++;
        seen.set(k, e);
      }
      const rootName = (id: number) => baseName(s.roots.find((r) => r.id === id)?.path ?? "");
      const folders = [...seen.values()].slice(0, 6);
      if (folders.length)
        out.push({
          title: "Folders",
          items: folders.map((f) => ({
            key: `f${f.rootId}:${f.path}`,
            label: `${rootName(f.rootId)}/${f.path}`,
            right: `${f.n.toLocaleString()} files`,
            run: () => s.go("library", { folder: { rootId: f.rootId, path: f.path }, query: "", kinds: [] }),
          })),
        });
    }
    const actions: [string, () => void][] = [
      ["Review duplicates", () => s.go("duplicates")],
      ["Open Insights", () => s.go("insights")],
      ["New collection", () => void s.newCollection()],
      ["Show favorites", () => s.go("favorites", { kinds: [] })],
      ["Import a folder", () => {
        useStore.setState(close);
        void s.importFolder();
      }],
      ["Switch to list view", () => {
        s.setLayout("list");
        s.go("library");
      }],
      ["Switch to grid view", () => {
        s.setLayout("grid");
        s.go("library");
      }],
      ["Clear search and filters", () => {
        s.clearFilters();
        s.go("library");
      }],
      ["Settings", () => s.setModal("settings")],
      ["Keyboard shortcuts", () => s.setModal("shortcuts")],
    ];
    if (useAppUpdate.getState().supported) actions.splice(actions.length - 1, 0, ["Check for updates", openUpdates]);
    const words = parsed.text;
    const onlyText =
      hasQuery && !parsed.types && !parsed.folder && !parsed.tags.length && !parsed.notes.length && parsed.minRating === 0 && parsed.maxRating === 5;
    const acts = !hasQuery ? actions : onlyText ? actions.filter(([l]) => words.every((w) => l.toLowerCase().includes(w))) : [];
    if (acts.length) out.push({ title: "Actions", items: acts.map(([label, run]) => ({ key: `x${label}`, label, run })) });
    return out;
  }, [q, s]);

  const flat = sections.flatMap((sec) => sec.items);
  const run = (item?: Item) => {
    if (!item) return;
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
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(e) => e.stopPropagation()}
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
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={flat[pi] ? `pal-${flat[pi].key}` : undefined}
            placeholder="Search assets, folders, actions"
            className="flex-1 border-0 bg-transparent text-base text-fg outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-[18px] py-2.5 text-xs text-faint">
          <span className="mr-1">Filters</span>
          {TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setQ((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t) + (t.endsWith(":") || t === "#" ? "" : " "));
                input.current?.focus();
              }}
              className="rounded-md bg-active px-2 py-[3px] font-mono text-fg-2 hover:bg-line-strong"
            >
              {tokenLabel[t] ?? t}
            </button>
          ))}
        </div>
        <div ref={listRef} id="palette-results" role="listbox" className="overflow-auto p-2">
          {sections.map((sec) => (
            <div key={sec.title}>
              <div className="px-2.5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[.06em] text-faint uppercase">{sec.title}</div>
              {sec.items.map((r) => {
                const my = idx++;
                return (
                  <div
                    key={r.key}
                    id={`pal-${r.key}`}
                    data-i={my}
                    role="option"
                    aria-selected={my === pi}
                    onMouseEnter={() => setPi(my)}
                    onClick={() => run(r)}
                    className={clsx("flex min-h-11 cursor-pointer items-center gap-3 rounded-[9px] px-2.5", my === pi && "bg-line")}
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
          {!sections.length && <div className="px-2.5 py-9 text-center text-muted">Nothing matches. Try type:image, #player, {"rating:>=4"} or in:audio.</div>}
        </div>
        <div className="flex gap-4 border-t border-line px-[18px] py-2.5 text-xs text-faint">
          <span>↑↓ move</span>
          <span>↵ select</span>
          <span className="ml-auto">Esc close</span>
        </div>
      </div>
    </div>
  );
}
