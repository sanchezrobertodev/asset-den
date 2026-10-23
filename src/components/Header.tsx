import clsx from "clsx";
import { Check, ChevronDown, Folder, Grid3x3, Search, Sparkles, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { activeFilterCount } from "../lib/filter";
import { pathTo, treeFor, type FolderNode } from "../lib/folders";
import { baseName, kindLabel } from "../lib/format";
import type { SortKey } from "../lib/prefs";
import { useStore } from "../store";
import { KINDS, type Asset } from "../types";
import { FilterButton } from "./FilterPanel";
import { Button, IconButton, KindDot, Kbd, Segmented } from "./ui";

const titles = { library: "Library", favorites: "Favorites", collections: "Collections", duplicates: "Duplicates", insights: "Insights" };
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function Header() {
  const { view, query, folder, setPalette, importFolder } = useStore();
  return (
    <div className="flex h-[60px] flex-none items-center gap-3.5 border-b border-line-soft px-7">
      {(view === "library" || view === "favorites") && folder ? (
        <div className="flex min-w-0 flex-none items-center gap-1.5">
          {view === "favorites" && (
            <>
              <h1 className="text-[17px] font-semibold tracking-[-.01em]">Favorites</h1>
              <span className="text-muted">in</span>
            </>
          )}
          <Breadcrumbs />
        </div>
      ) : (
        <h1 className="flex-none text-[17px] font-semibold tracking-[-.01em]">{titles[view]}</h1>
      )}
      <button
        type="button"
        onClick={() => setPalette(true)}
        className="ml-auto flex h-9 max-w-[380px] min-w-0 flex-[1_1_auto] items-center gap-2.5 overflow-hidden rounded-[9px] border border-line-strong bg-field px-3 text-left whitespace-nowrap text-muted hover:border-line-x"
      >
        <Search aria-hidden className="size-3.5 flex-none" />
        <span className={clsx("min-w-0 flex-1 truncate", query && "text-fg")}>{query || "Search assets, #tags, type:audio"}</span>
        <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>
      <Button variant="accent" className="h-9 px-4" onClick={() => void importFolder()}>
        Import
      </Button>
    </div>
  );
}

const sortLabels: Record<SortKey, string> = { name: "Name", kind: "Type", size: "Size", mtime: "Modified", folder: "Folder" };

/** Type chips, active-scope chips and the view controls above the library grid. */
export function BrowseBar({ count, folders, scopeAssets }: { count: number; folders: number; scopeAssets: Asset[] }) {
  const s = useStore();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of scopeAssets) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    return m;
  }, [scopeAssets]);
  const node = useMemo(() => (s.folder ? (pathTo(treeFor(s.assets, s.roots), s.folder).at(-1) ?? null) : null), [s.assets, s.roots, s.folder]);
  const exact = node && node.path === s.folder!.path ? node : null;

  const chip = (on: boolean) =>
    clsx(
      "flex h-[30px] flex-none items-center gap-[7px] rounded-[15px] border px-3 text-[12.5px] font-medium whitespace-nowrap",
      on ? "border-invert-bg bg-invert-bg text-invert-fg" : "border-line-strong text-fg-2 hover:border-line-x",
    );

  return (
    <>
      <div className="flex flex-none flex-wrap items-center gap-1.5 px-7 pt-3.5 pb-1">
        <button type="button" aria-pressed={!s.kinds.length} className={chip(!s.kinds.length)} onClick={() => s.toggleKind("all")}>
          <span aria-hidden className="size-[7px] rounded-full bg-muted" />
          All
          <span className="font-mono text-[11px] opacity-65">{scopeAssets.length.toLocaleString()}</span>
        </button>
        {KINDS.filter((k) => counts.get(k)).map((k) => (
          <button key={k} type="button" aria-pressed={s.kinds.includes(k)} className={chip(s.kinds.includes(k))} onClick={() => s.toggleKind(k)}>
            <KindDot kind={k} />
            {kindLabel[k]}
            <span className="font-mono text-[11px] opacity-65">{counts.get(k)!.toLocaleString()}</span>
          </button>
        ))}
        {s.folder && (
          <button
            type="button"
            role="switch"
            aria-checked={s.subfolders}
            onClick={() => s.setSubfolders(!s.subfolders)}
            className={clsx(
              "flex h-[30px] flex-none items-center gap-2 rounded-[15px] border px-3 text-[12.5px] font-medium whitespace-nowrap",
              s.subfolders ? "border-accent bg-accent/15 text-fg" : "border-line-strong text-fg-2 hover:border-line-x",
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "flex size-3 items-center justify-center rounded-[3px] text-[10px] font-bold",
                s.subfolders ? "bg-accent text-accent-fg" : "border border-line-x",
              )}
            >
              {s.subfolders ? "✓" : ""}
            </span>
            Include subfolders
          </button>
        )}
        {s.query && (
          <button type="button" className={clsx(chip(true), "pr-2")} onClick={() => s.setQuery("")} aria-label="Clear search">
            “{s.query}”
            <X aria-hidden className="size-3.5 opacity-55" />
          </button>
        )}
        <FilterButton />
        {(s.query.trim() || s.kinds.length > 0 || activeFilterCount(s.filters) > 0) && <SaveSmart />}
      </div>
      {exact && exact.children.length > 0 && (
        <div className="flex flex-none flex-wrap items-center gap-1.5 px-7 pt-2.5">
          <span className="mr-1 text-muted">Subfolders</span>
          {exact.children.slice(0, 12).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => s.setFolder({ rootId: c.rootId, path: c.path })}
              className="flex h-[30px] flex-none items-center gap-[7px] rounded-[15px] border border-line-strong px-3 text-[12.5px] font-medium whitespace-nowrap text-fg-2 hover:border-line-x hover:text-fg"
            >
              <Folder aria-hidden className="size-3.5 text-muted" />
              {c.name}
              <span className="font-mono text-[11px] opacity-65">{c.count.toLocaleString()}</span>
            </button>
          ))}
          {exact.children.length > 12 && <span className="text-faint">+{exact.children.length - 12} more in the folder menu</span>}
        </div>
      )}
      <div className="flex flex-none flex-wrap items-center gap-2 px-7 pt-2.5 pb-3 whitespace-nowrap">
        <span className="mr-auto text-muted" aria-live="polite">
          {count.toLocaleString()} {count === 1 ? "asset" : "assets"}
          {s.grouped && folders > 1 && ` in ${folders.toLocaleString()} folders`}
        </span>
        <label className="flex items-center gap-1.5 text-muted">
          Sort
          <select
            value={s.sort.key}
            onChange={(e) => s.setSort(e.target.value as SortKey)}
            className="h-[30px] rounded-lg border border-line-strong bg-field px-1.5 text-fg"
          >
            {Object.entries(sortLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <IconButton
          label={s.sort.desc ? "Descending (click for ascending)" : "Ascending (click for descending)"}
          className="size-[30px] border border-line-strong"
          onClick={() => s.setSort(s.sort.key)}
        >
          <span aria-hidden className="font-mono text-xs">{s.sort.desc ? "↓" : "↑"}</span>
        </IconButton>
        <Segmented
          label="Grouping"
          value={s.grouped ? "folder" : "none"}
          onChange={(v) => s.setGrouped(v === "folder")}
          options={[
            { value: "folder", label: "By folder" },
            { value: "none", label: "All together" },
          ]}
        />
        <Segmented
          label="Layout"
          value={s.layout}
          onChange={s.setLayout}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
        />
        {s.layout === "grid" && (
          <input
            type="range"
            aria-label="Thumbnail size"
            title="Thumbnail size"
            min={110}
            max={320}
            step={10}
            value={s.thumbSize}
            onChange={(e) => s.setThumbSize(Number(e.target.value))}
            className="w-24 accent-[var(--accent)]"
          />
        )}
        <IconButton
          label={s.pixelated ? "Pixel-art scaling on" : "Pixel-art scaling off"}
          aria-pressed={s.pixelated}
          className={clsx("size-[30px] border border-line-strong", s.pixelated && "bg-active text-fg")}
          onClick={() => s.setPixelated(!s.pixelated)}
        >
          <Grid3x3 className="size-4" />
        </IconButton>
      </div>
    </>
  );
}

/** Names the current search and saves it as a smart collection. */
function SaveSmart() {
  const s = useStore();
  const [name, setName] = useState<string | null>(null);
  if (name === null)
    return (
      <button
        type="button"
        onClick={() => setName(s.query.trim().slice(0, 80))}
        className="flex h-[30px] flex-none items-center gap-[7px] rounded-[15px] border border-dashed border-line-x px-3 text-[12.5px] font-medium whitespace-nowrap text-fg-2 hover:text-fg"
      >
        <Sparkles aria-hidden className="size-3.5" />
        Save as smart collection
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void s.saveSmartCollection(name).then((ok) => ok && setName(null));
      }}
      className="flex h-[30px] flex-none items-center gap-1.5 rounded-[15px] border border-accent pr-1 pl-3"
    >
      <Sparkles aria-hidden className="size-3.5 flex-none text-muted" />
      <input
        aria-label="Smart collection name"
        autoFocus
        value={name}
        maxLength={80}
        placeholder="Collection name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setName(null);
        }}
        className="w-44 border-0 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-muted"
      />
      <button type="submit" className="h-[22px] rounded-[11px] bg-accent px-2.5 text-xs font-semibold text-accent-fg">
        Save
      </button>
      <IconButton label="Cancel" className="size-[22px]" onClick={() => setName(null)}>
        <X className="size-3.5" />
      </IconButton>
    </form>
  );
}

/** "game-assets / characters / hero": each name opens that folder, each caret lists the folders inside it. */
function Breadcrumbs() {
  const s = useStore();
  const chain = pathTo(treeFor(s.assets, s.roots), s.folder!);
  const [menu, setMenu] = useState<string | null>(null);
  const close = useCallback(() => setMenu(null), []);
  useEffect(close, [s.folder, close]);

  return (
    <nav aria-label="Folder path" className="flex min-w-0 flex-none items-center gap-0.5 text-[17px] tracking-[-.01em]">
      {chain.map((n, i) => {
        const last = i === chain.length - 1;
        return (
          <Fragment key={n.key}>
            {i > 0 && (
              <span aria-hidden className="px-0.5 text-line-x">
                /
              </span>
            )}
            <div className="relative flex items-center">
              <button
                type="button"
                aria-current={last ? "location" : undefined}
                onClick={() => s.setFolder({ rootId: n.rootId, path: n.path })}
                className={clsx("max-w-[180px] truncate rounded-[7px] px-1.5 py-1 hover:bg-active", last ? "font-semibold text-fg" : "text-muted hover:text-fg")}
              >
                {n.name}
              </button>
              {n.children.length > 0 && (
                <button
                  type="button"
                  aria-label={`Folders in ${n.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === n.key}
                  onClick={() => setMenu(menu === n.key ? null : n.key)}
                  className={clsx("flex size-6 items-center justify-center rounded-md text-muted hover:bg-active hover:text-fg", menu === n.key && "bg-active text-fg")}
                >
                  <ChevronDown aria-hidden className="size-3.5" />
                </button>
              )}
              {menu === n.key && <JumpMenu node={n} current={chain[i + 1]?.key} onClose={close} />}
            </div>
          </Fragment>
        );
      })}
      <IconButton label="Show the whole library" className="ml-1 size-7" onClick={() => s.setFolder(null)}>
        <X className="size-4" />
      </IconButton>
    </nav>
  );
}

function JumpMenu({ node, current, onClose }: { node: FolderNode; current?: string; onClose: () => void }) {
  const s = useStore();
  const box = useRef<HTMLDivElement>(null);
  const rootName = (id: number) => baseName(s.roots.find((r) => r.id === id)?.path ?? "");
  const recent = s.recentFolders.filter((f) => !(f.rootId === s.folder?.rootId && f.path === s.folder?.path)).slice(0, 4);

  useEffect(() => {
    const el = box.current;
    (el?.querySelector<HTMLElement>('[aria-checked="true"]') ?? el?.querySelector<HTMLElement>("[role^=menuitem]"))?.focus();
    const onDown = (e: MouseEvent) => {
      if (!el?.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const onKey = (e: KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Escape") {
      onClose();
    } else if (e.key !== "Enter" && e.key !== " ") return;
    // Keep the app's own shortcuts (Space, Enter, arrows, Esc) from also firing.
    e.stopPropagation();
  };

  const open = (rootId: number, path: string) => {
    s.setFolder({ rootId, path });
    onClose();
  };

  return (
    <div
      ref={box}
      role="menu"
      aria-label={`Folders in ${node.name}`}
      onKeyDown={onKey}
      className="absolute top-full left-0 z-50 mt-1.5 flex w-[300px] flex-col overflow-hidden rounded-[14px] border border-line-x bg-field text-[13px] tracking-normal shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]"
    >
      <div className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[.06em] text-faint uppercase">In {node.name}</div>
      <div className="flex max-h-[45vh] flex-col overflow-auto px-1.5 pb-1.5">
        {node.children.map((c) => (
          <button
            key={c.key}
            type="button"
            role="menuitemradio"
            aria-checked={c.key === current}
            onClick={() => open(c.rootId, c.path)}
            className="flex h-[38px] flex-none items-center gap-2.5 rounded-[9px] px-2.5 text-left text-fg outline-none hover:bg-line focus:bg-line"
          >
            <Folder aria-hidden className={clsx("size-[15px] flex-none", c.key === current ? "text-accent" : "text-muted")} />
            <span className={clsx("min-w-0 flex-1 truncate", c.key === current && "font-semibold")}>{c.name}</span>
            <span className="font-mono text-[11px] text-muted">{c.count.toLocaleString()}</span>
            <span className="w-3.5 text-accent">{c.key === current && <Check aria-hidden className="size-3.5" />}</span>
          </button>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="border-t border-line px-3.5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[.06em] text-faint uppercase">Recent folders</div>
          <div className="flex flex-col px-1.5 pb-2">
            {recent.map((f) => (
              <button
                key={`${f.rootId}:${f.path}`}
                type="button"
                role="menuitem"
                onClick={() => open(f.rootId, f.path)}
                className="flex h-[34px] items-center rounded-[9px] px-2.5 text-left text-fg-2 outline-none hover:bg-line focus:bg-line"
              >
                <span className="truncate">{[s.roots.length > 1 || !f.path ? rootName(f.rootId) : "", f.path].filter(Boolean).join("/")}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-3.5 border-t border-line px-3.5 py-2 text-xs text-faint">
        <span>↑↓ move</span>
        <span>↵ open</span>
        <span className="ml-auto">Alt ↑ parent</span>
      </div>
    </div>
  );
}
