import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Star } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { api, errorText, fileUrl } from "../api";
import { bytes, date, folderOf, kindLabel } from "../lib/format";
import type { SortKey } from "../lib/prefs";
import { thumbnailFor } from "../lib/thumbs";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Thumb } from "./Thumb";

const GAP = 12;
const PAD = 16;
const CAPTION = 46;
const ROW = 36;

let dragIcon: Promise<string> | null = null;

/** Native drag of the file(s) out to Explorer/Finder or an engine; copies, never moves. */
async function dragOut(e: DragEvent, asset: Asset, all: Asset[]) {
  e.preventDefault();
  const { selected } = useStore.getState();
  const items = selected.has(asset.id) ? all.filter((a) => selected.has(a.id)) : [asset];
  dragIcon ??= api.dragIcon();
  const icon = (await thumbnailFor(asset)) ?? (await dragIcon);
  try {
    await api.drag(
      items.map((a) => a.path),
      icon,
    );
  } catch (err) {
    useStore.getState().setError(`Couldn't start the drag: ${errorText(err)}`);
  }
}

// One shared player for hover previews of audio.
const hoverAudio = typeof Audio !== "undefined" ? new Audio() : null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
function hoverPlay(a: Asset | null) {
  if (hoverTimer) clearTimeout(hoverTimer);
  if (!hoverAudio) return;
  hoverAudio.pause();
  if (!a) return;
  hoverTimer = setTimeout(() => {
    hoverAudio.src = fileUrl(a.path);
    hoverAudio.volume = 0.6;
    void hoverAudio.play().catch(() => {});
  }, 350);
}

function useClickHandlers(assets: Asset[]) {
  const select = useStore((s) => s.select);
  const setQuickView = useStore((s) => s.setQuickView);
  return (a: Asset) => ({
    onClick: (e: MouseEvent) =>
      select(
        a.id,
        e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "replace",
        assets.map((x) => x.id),
      ),
    onDoubleClick: () => {
      select(a.id);
      setQuickView(true);
    },
    onDragStart: (e: DragEvent) => void dragOut(e, a, assets),
    onMouseEnter: a.kind === "audio" ? () => hoverPlay(a) : undefined,
    onMouseLeave: a.kind === "audio" ? () => hoverPlay(null) : undefined,
  });
}

export function AssetBrowser({ assets }: { assets: Asset[] }) {
  const layout = useStore((s) => s.layout);
  useEffect(() => () => hoverPlay(null), []);
  return layout === "grid" ? <Grid assets={assets} /> : <List assets={assets} />;
}

function Grid({ assets }: { assets: Asset[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { thumbSize, selected, activeId, pixelated, setCols } = useStore();
  const handlers = useClickHandlers(assets);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (thumbSize + GAP)));
  const rowH = thumbSize + CAPTION + GAP;
  useEffect(() => setCols(cols), [cols, setCols]);

  const v = useVirtualizer({
    count: Math.ceil(assets.length / cols),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
    paddingStart: PAD,
    paddingEnd: PAD,
  });
  useEffect(() => v.measure(), [rowH, v]);

  useEffect(() => {
    const i = assets.findIndex((a) => a.id === activeId);
    if (i >= 0) v.scrollToIndex(Math.floor(i / cols), { align: "auto" });
  }, [activeId, cols, assets, v]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" role="listbox" aria-multiselectable aria-label="Assets">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 flex w-full"
            style={{ top: row.start, gap: GAP, paddingLeft: PAD, paddingRight: PAD }}
          >
            {assets.slice(row.index * cols, row.index * cols + cols).map((a) => {
              const isSel = selected.has(a.id);
              return (
                <div
                  key={a.id}
                  role="option"
                  aria-selected={isSel}
                  draggable
                  title={a.relPath}
                  {...handlers(a)}
                  style={{ width: thumbSize }}
                  className={clsx(
                    "group relative flex cursor-pointer flex-col rounded-lg border bg-surface p-1.5 transition-colors duration-150 select-none",
                    isSel ? "border-ring outline-2 outline-ring" : "border-border hover:border-border-strong",
                    a.id === activeId && !isSel && "border-border-strong",
                  )}
                >
                  <Thumb asset={a} pixelated={pixelated} className="aspect-square w-full rounded-md" />
                  <div className="mt-1.5 min-w-0 px-0.5">
                    <div className="truncate text-[13px] font-medium">{a.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                      {bytes(a.size)}
                    </div>
                  </div>
                  {a.favorite && (
                    <Star
                      aria-label="Favorite"
                      className="absolute top-2.5 right-2.5 size-4 fill-warn text-warn drop-shadow"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const columns: { key: SortKey; label: string; className: string }[] = [
  { key: "name", label: "Name", className: "flex-1 min-w-0" },
  { key: "kind", label: "Kind", className: "w-28" },
  { key: "size", label: "Size", className: "w-24 text-right" },
  { key: "mtime", label: "Modified", className: "w-44" },
  { key: "folder", label: "Folder", className: "w-64 min-w-0" },
];

function List({ assets }: { assets: Asset[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { selected, activeId, sort, setSort, pixelated } = useStore();
  const handlers = useClickHandlers(assets);
  const v = useVirtualizer({
    count: assets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 10,
  });

  useEffect(() => {
    const i = assets.findIndex((a) => a.id === activeId);
    if (i >= 0) v.scrollToIndex(i, { align: "auto" });
  }, [activeId, assets, v]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-1.5 text-xs font-medium text-muted">
        <span className="w-7" />
        {columns.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSort(c.key)}
            className={clsx("flex items-center gap-1 hover:text-fg", c.className, c.key === "size" && "justify-end")}
            aria-label={`Sort by ${c.label}`}
          >
            {c.label}
            {sort.key === c.key &&
              (sort.desc ? <ArrowDown aria-hidden className="size-3" /> : <ArrowUp aria-hidden className="size-3" />)}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto" role="listbox" aria-multiselectable aria-label="Assets">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((row) => {
            const a = assets[row.index];
            const isSel = selected.has(a.id);
            return (
              <div
                key={a.id}
                role="option"
                aria-selected={isSel}
                draggable
                {...handlers(a)}
                style={{ top: row.start, height: ROW }}
                className={clsx(
                  "absolute left-0 flex w-full cursor-pointer items-center gap-3 px-4 text-[13px] select-none",
                  isSel ? "bg-accent/15" : "hover:bg-surface-hover",
                )}
              >
                <Thumb asset={a} small pixelated={pixelated} className="size-7 shrink-0 rounded" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-medium">{a.name}</span>
                  {a.favorite && <Star aria-label="Favorite" className="size-3.5 shrink-0 fill-warn text-warn" />}
                </span>
                <span className="w-28 truncate text-muted">{kindLabel[a.kind]}</span>
                <span className="w-24 text-right font-mono text-xs text-muted">{bytes(a.size)}</span>
                <span className="w-44 truncate text-muted">{date(a.mtime)}</span>
                <span className="w-64 truncate font-mono text-xs text-muted" title={folderOf(a.relPath)}>
                  {folderOf(a.relPath) || "/"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
