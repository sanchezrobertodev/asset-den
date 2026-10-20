import clsx from "clsx";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { bytes } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { DuplicateBanner, MetaRows, openAsset, revealAsset } from "./Peek";
import { Thumb } from "./Thumb";
import { Button, IconButton, KindPill, Kbd, Label } from "./ui";
import { Viewer } from "./Viewers";

/** How many filmstrip tiles to render on each side of the current one. */
const STRIP_SPAN = 40;

export function FullView({ list }: { list: Asset[] }) {
  const s = useStore();
  const a = s.assets.find((x) => x.id === s.activeId);
  const strip = useRef<HTMLDivElement>(null);
  const i = a ? list.findIndex((x) => x.id === a.id) : -1;

  useEffect(() => {
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [a?.id]);

  if (!a) return null;
  const step = (d: number) => list.length && s.select(list[(Math.max(i, 0) + d + list.length) % list.length].id);
  const from = Math.max(0, i - STRIP_SPAN);
  const tiles = list.slice(from, i + STRIP_SPAN + 1);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Full screen: ${a.name}`} className="absolute inset-0 z-40 grid grid-rows-[60px_minmax(0,1fr)_100px] bg-sunken">
      <div className="flex items-center gap-3 border-b border-line-soft px-[18px]">
        <Button size="sm" className="text-fg-2" onClick={() => s.setFull(false)} aria-label="Close full screen (Esc)">
          <X aria-hidden className="size-4" /> <span className="font-mono text-[11px]">Esc</span>
        </Button>
        <KindPill kind={a.kind} className="ml-1.5" />
        <span className="min-w-0 truncate text-[15px] font-semibold">{a.name}</span>
        <span className="text-muted">{bytes(a.size)}</span>
        <span className="ml-2 font-mono text-xs text-faint">{i >= 0 ? `${i + 1} of ${list.length.toLocaleString()}` : ""}</span>
        <IconButton
          label={a.favorite ? "Unfavorite (F)" : "Favorite (F)"}
          aria-pressed={a.favorite}
          bordered
          className={clsx("ml-auto size-[34px] text-[15px]", a.favorite ? "text-star" : "text-muted")}
          onClick={() => void s.setFavorite([a.id], !a.favorite)}
        >
          {a.favorite ? "★" : "☆"}
        </IconButton>
        <Button onClick={() => void revealAsset(a)}>Show in folder</Button>
        {a.kind !== "other" && (
          <Button variant="accent" onClick={() => void openAsset(a)}>
            Open
          </Button>
        )}
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]">
        <div className={clsx("relative flex min-w-0 items-center justify-center px-[90px] py-6", a.kind === "image" ? "checker" : "bg-sunken")}>
          <Viewer asset={a} pixelated={s.pixelated} full />
          <button
            type="button"
            aria-label="Previous (←)"
            onClick={() => step(-1)}
            className="absolute top-1/2 left-[18px] -mt-[22px] flex size-11 items-center justify-center rounded-full border border-line-strong bg-card text-fg hover:bg-active"
          >
            <ArrowLeft aria-hidden className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label="Next (→)"
            onClick={() => step(1)}
            className="absolute top-1/2 right-[18px] -mt-[22px] flex size-11 items-center justify-center rounded-full border border-line-strong bg-card text-fg hover:bg-active"
          >
            <ArrowRight aria-hidden className="size-[18px]" />
          </button>
        </div>
        <aside className="flex flex-col gap-5 overflow-auto border-l border-line-soft bg-panel px-5 py-[22px]">
          <MetaRows a={a} />
          <DuplicateBanner a={a} />
          <div className="flex flex-col gap-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {a.tags.map((t) => (
                <span key={t} className="rounded-md bg-active px-[9px] py-[3px] text-xs">
                  #{t}
                </span>
              ))}
              {!a.tags.length && <span className="text-faint">No tags</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Collections</Label>
            <div className="flex flex-wrap gap-1.5">
              {s.collections
                .filter((c) => c.assetIds.includes(a.id))
                .map((c) => (
                  <span key={c.id} className="rounded-md bg-active px-[9px] py-[3px] text-xs">
                    {c.name}
                  </span>
                ))}
              {!s.collections.some((c) => c.assetIds.includes(a.id)) && <span className="text-faint">Not in a collection</span>}
            </div>
          </div>
          <div className="mt-auto grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-muted">
            <Kbd>← →</Kbd>
            <span>Previous / next</span>
            <Kbd>F</Kbd>
            <span>Favorite</span>
            <Kbd>Esc</Kbd>
            <span>Back to side panel</span>
          </div>
        </aside>
      </div>

      <div ref={strip} className="flex items-center gap-2.5 overflow-x-auto border-t border-line-soft px-[18px]">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.name}
            aria-current={t.id === a.id}
            onClick={() => s.select(t.id)}
            className={clsx(
              "size-[66px] flex-none overflow-hidden rounded-[9px] outline-offset-2 hover:opacity-100",
              t.id === a.id ? "outline-2 outline-accent" : "opacity-55",
            )}
          >
            <Thumb asset={t} size="strip" pixelated={s.pixelated} className="h-full w-full" />
          </button>
        ))}
      </div>
    </div>
  );
}
