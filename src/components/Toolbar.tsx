import clsx from "clsx";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Grid2x2, Grid3x3, List, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { RefObject } from "react";
import type { SortKey, Theme } from "../lib/prefs";
import { useStore } from "../store";
import { FilterButton } from "./FilterPanel";
import { IconButton, Kbd } from "./ui";

const sortLabels: Record<SortKey, string> = {
  name: "Name",
  kind: "Kind",
  size: "Size",
  mtime: "Modified",
  folder: "Folder",
};

const nextTheme: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };

export function Toolbar({ count, searchRef }: { count: number; searchRef: RefObject<HTMLInputElement | null> }) {
  const s = useStore();
  const ThemeIcon = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : Monitor;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <div className="relative w-full max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search assets"
          placeholder="Search names, folders, #tags"
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              s.setQuery("");
              e.currentTarget.blur();
            }
          }}
          className="h-8 w-full rounded-md border border-border-strong bg-bg pr-14 pl-8 text-[13px] placeholder:text-muted"
        />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {s.query ? (
            <IconButton label="Clear search" onClick={() => s.setQuery("")} className="size-6">
              <X className="size-3.5" />
            </IconButton>
          ) : (
            <Kbd>/</Kbd>
          )}
        </span>
      </div>
      <FilterButton />
      <span className="font-mono text-xs whitespace-nowrap text-muted" aria-live="polite">
        {count.toLocaleString()} {count === 1 ? "asset" : "assets"}
      </span>
      {s.kinds.length > 0 && (
        <button
          type="button"
          onClick={() => s.kinds.forEach((k) => s.toggleKind(k))}
          className="flex h-6 items-center gap-1 rounded-full border border-border-strong px-2 text-xs text-muted hover:text-fg"
        >
          {s.kinds.length} type filter{s.kinds.length > 1 ? "s" : ""}
          <X aria-hidden className="size-3" />
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Sort
          <select
            value={s.sort.key}
            onChange={(e) => s.setSort(e.target.value as SortKey)}
            className="h-8 rounded-md border border-border-strong bg-bg px-1.5 text-[13px] text-fg"
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
          onClick={() => s.setSort(s.sort.key)}
        >
          {s.sort.desc ? <ArrowDownWideNarrow className="size-4" /> : <ArrowUpNarrowWide className="size-4" />}
        </IconButton>

        <div className="mx-1 h-5 w-px bg-border" />
        {s.layout === "grid" && (
          <input
            type="range"
            aria-label="Thumbnail size"
            title="Thumbnail size"
            min={96}
            max={320}
            step={8}
            value={s.thumbSize}
            onChange={(e) => s.setThumbSize(Number(e.target.value))}
            className="w-24 accent-[var(--accent)]"
          />
        )}
        <IconButton
          label={s.pixelated ? "Pixel-art scaling on" : "Pixel-art scaling off"}
          aria-pressed={s.pixelated}
          onClick={() => s.setPixelated(!s.pixelated)}
          className={clsx(s.pixelated && "bg-accent/15 text-fg")}
        >
          <Grid3x3 className="size-4" />
        </IconButton>
        <div role="group" aria-label="Layout" className="flex rounded-md border border-border-strong">
          <IconButton
            label="Grid"
            aria-pressed={s.layout === "grid"}
            onClick={() => s.setLayout("grid")}
            className={clsx("size-8 rounded-r-none", s.layout === "grid" && "bg-surface-hover text-fg")}
          >
            <Grid2x2 className="size-4" />
          </IconButton>
          <IconButton
            label="List"
            aria-pressed={s.layout === "list"}
            onClick={() => s.setLayout("list")}
            className={clsx("size-8 rounded-l-none", s.layout === "list" && "bg-surface-hover text-fg")}
          >
            <List className="size-4" />
          </IconButton>
        </div>
        <IconButton label={`Theme: ${s.theme} (click to change)`} onClick={() => s.setTheme(nextTheme[s.theme])}>
          <ThemeIcon className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}
