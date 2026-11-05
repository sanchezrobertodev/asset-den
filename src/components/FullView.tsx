import clsx from "clsx";
import { ArrowLeft, ArrowRight, Heart, X } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { bytes } from "../lib/fmt";
import { t } from "../lib/i18n";
import { shortcut } from "../lib/shortcuts";
import { useStore } from "../store";
import type { Asset } from "../types";
import { DuplicateBanner, MetaRows, openAsset, PreviewBoundary, revealAsset, Stars } from "./Peek";
import { Thumb } from "./Thumb";
import { Button, IconButton, KindPill, Kbd, Label, trapTab } from "./ui";
import { Viewer } from "./Viewers";

/** How many filmstrip tiles to render on each side of the current one. */
const STRIP_SPAN = 40;
const LEGEND = ["move", "favorite", "rate", "unrate", "full-back"].map(shortcut);

export function FullView({ list }: { list: Asset[] }) {
  const s = useStore();
  const a = s.assets.find((x) => x.id === s.activeId);
  const strip = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const i = a ? list.findIndex((x) => x.id === a.id) : -1;

  // Focus moves into the full view and back to where it was (the asset list) when it closes.
  // Tab stays inside, also when focus had fallen out to the page (a control that went away).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => trapTab(e, dialog.current);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, []);

  useEffect(() => {
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [a?.id]);

  if (!a) return null;
  const step = (d: number) => list.length && s.select(list[(Math.max(i, 0) + d + list.length) % list.length].id);
  const from = Math.max(0, i - STRIP_SPAN);
  const tiles = list.slice(from, i + STRIP_SPAN + 1);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={t("fullView.label", { name: a.name })}
      tabIndex={-1}
      className="absolute inset-0 z-40 grid grid-rows-[60px_minmax(0,1fr)_100px] bg-sunken focus-visible:outline-none"
    >
      <div className="flex items-center gap-3 border-b border-line-soft px-[18px]">
        <Button size="sm" className="text-fg-2" onClick={() => s.setFull(false)} aria-label={t("fullView.close", { key: shortcut("full-back").keys })}>
          <X aria-hidden className="size-4" /> <span className="font-mono text-[11px]">{shortcut("full-back").keys}</span>
        </Button>
        <KindPill kind={a.kind} className="ml-1.5" />
        <span className="min-w-0 truncate text-[15px] font-semibold">{a.name}</span>
        <span className="text-muted">{bytes(a.size)}</span>
        <span className="ml-2 font-mono text-xs text-faint">{i >= 0 ? t("fullView.position", { index: i + 1, total: list.length }) : ""}</span>
        <Stars value={a.rating} onChange={(n) => void s.setRating([a.id], n)} className="ml-auto" />
        <IconButton
          label={t("fullView.favorite", { key: shortcut("favorite").keys })}
          aria-pressed={a.favorite}
          bordered
          className="size-[34px] text-muted"
          onClick={() => void s.setFavorite([a.id], !a.favorite)}
        >
          <Heart className={clsx("size-4", a.favorite && "fill-current text-fav")} />
        </IconButton>
        <Button onClick={() => void revealAsset(a)}>{t("fullView.showInFolder")}</Button>
        {a.kind !== "other" && (
          <Button variant="accent" onClick={() => void openAsset(a)}>
            {t("fullView.open")}
          </Button>
        )}
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px]">
        <div className={clsx("relative flex min-w-0 items-center justify-center px-[90px] py-6", a.kind === "image" ? "checker" : "bg-sunken")}>
          <PreviewBoundary asset={a}>
            <Viewer asset={a} pixelated={s.pixelated} full />
          </PreviewBoundary>
          <button
            type="button"
            aria-label={t("fullView.previous", { key: "←" })}
            onClick={() => step(-1)}
            className="absolute top-1/2 left-[18px] -mt-[22px] flex size-11 items-center justify-center rounded-full border border-line-strong bg-card text-fg hover:bg-active"
          >
            <ArrowLeft aria-hidden className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label={t("fullView.next", { key: "→" })}
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
            <Label>{t("fullView.tags")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {a.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-active px-[9px] py-[3px] text-xs">
                  #{tag}
                </span>
              ))}
              {!a.tags.length && <span className="text-faint">{t("fullView.noTags")}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("fullView.collections")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {s.collections
                .filter((c) => c.assetIds.includes(a.id))
                .map((c) => (
                  <span key={c.id} className="rounded-md bg-active px-[9px] py-[3px] text-xs">
                    {c.name}
                  </span>
                ))}
              {!s.collections.some((c) => c.assetIds.includes(a.id)) && <span className="text-faint">{t("fullView.noCollections")}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("fullView.note")}</Label>
            {s.notes[a.id] ? (
              <p className="text-[13px] whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">{s.notes[a.id]}</p>
            ) : (
              <span className="text-faint">{t("fullView.noNote")}</span>
            )}
          </div>
          <div className="mt-auto grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-muted">
            {LEGEND.map((k) => (
              <Fragment key={k.id}>
                <Kbd>{k.keys}</Kbd>
                <span className="first-letter:uppercase">{k.hint}</span>
              </Fragment>
            ))}
          </div>
        </aside>
      </div>

      <div ref={strip} role="group" aria-label={t("fullView.filmstrip")} className="flex items-center gap-2.5 overflow-x-auto border-t border-line-soft px-[18px]">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            aria-label={tile.name}
            aria-current={tile.id === a.id}
            onClick={() => s.select(tile.id)}
            className={clsx(
              "size-[66px] flex-none overflow-hidden rounded-[9px] outline-offset-2 hover:opacity-100",
              tile.id === a.id ? "outline-2 outline-accent" : "opacity-55",
            )}
          >
            <Thumb asset={tile} size="strip" pixelated={s.pixelated} className="h-full w-full" />
          </button>
        ))}
      </div>
    </div>
  );
}
