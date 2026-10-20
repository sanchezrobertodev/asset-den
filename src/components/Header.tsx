import clsx from "clsx";
import { Grid3x3, Search, X } from "lucide-react";
import { useMemo } from "react";
import { baseName, kindLabel } from "../lib/format";
import type { SortKey } from "../lib/prefs";
import { useStore } from "../store";
import { KINDS, type Asset } from "../types";
import { FilterButton } from "./FilterPanel";
import { Button, IconButton, KindDot, Kbd, Segmented } from "./ui";

const titles = { library: "Library", favorites: "Favorites", collections: "Collections", duplicates: "Duplicates", insights: "Insights" };
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function Header() {
  const { view, query, setPalette, importFolder } = useStore();
  return (
    <div className="flex h-[60px] flex-none items-center gap-3.5 border-b border-line-soft px-7">
      <h1 className="flex-none text-[17px] font-semibold tracking-[-.01em]">{titles[view]}</h1>
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
export function BrowseBar({ count, scopeAssets }: { count: number; scopeAssets: Asset[] }) {
  const s = useStore();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of scopeAssets) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    return m;
  }, [scopeAssets]);
  const root = s.folder && s.roots.find((r) => r.id === s.folder!.rootId);
  const folderLabel = root ? [baseName(root.path), s.folder!.path].filter(Boolean).join("/") : null;

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
        {folderLabel && (
          <button type="button" className={clsx(chip(true), "pr-2")} onClick={() => s.setFolder(null)} aria-label={`Clear folder filter ${folderLabel}`}>
            in: {folderLabel}
            <X aria-hidden className="size-3.5 opacity-55" />
          </button>
        )}
        {s.query && (
          <button type="button" className={clsx(chip(true), "pr-2")} onClick={() => s.setQuery("")} aria-label="Clear search">
            “{s.query}”
            <X aria-hidden className="size-3.5 opacity-55" />
          </button>
        )}
        <FilterButton />
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2 px-7 pt-2.5 pb-3 whitespace-nowrap">
        <span className="mr-auto text-muted" aria-live="polite">
          {count.toLocaleString()} {count === 1 ? "asset" : "assets"}
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
