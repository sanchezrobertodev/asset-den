import clsx from "clsx";
import { ArrowLeft, ArrowRight, TriangleAlert, X } from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, errorText } from "../api";
import { ago, audioDetails, baseName, bytes, folderOf } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Button, focusAssets, IconButton, KindPill, Label } from "./ui";
import { PreviewFailure, Viewer } from "./Viewers";

export async function openAsset(a: Asset) {
  try {
    await api.openDefault(a.id);
  } catch (e) {
    useStore.getState().setError(errorText(e));
  }
}

export async function revealAsset(a: Asset) {
  try {
    await api.reveal(a.id);
  } catch (e) {
    useStore.getState().setError(errorText(e));
  }
}

/**
 * Shows "Couldn't preview this file" when a viewer fails, whether while rendering (a lazy chunk that fails to load, a
 * bug) or while loading the file, which viewers report through usePreviewFailure. The rest of the panel keeps working.
 * Resets when another asset, or a new version of the file, is shown.
 */
export class PreviewBoundary extends Component<{ asset: Asset; children: ReactNode }, { failed: boolean; message: string | null }> {
  state = { failed: false, message: null as string | null };

  static getDerivedStateFromError(e: unknown) {
    return { failed: true, message: e instanceof PreviewFailure ? e.message : null };
  }

  componentDidUpdate(prev: { asset: Asset }) {
    const a = this.props.asset;
    if (this.state.failed && (prev.asset.id !== a.id || prev.asset.mtime !== a.mtime)) this.setState({ failed: false, message: null });
  }

  render() {
    const a = this.props.asset;
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <TriangleAlert aria-hidden className="size-5 text-muted" />
        <div className="flex flex-col gap-1">
          <span className="font-medium text-fg">Couldn't preview this file</span>
          <span className="max-w-[440px] text-xs text-muted [overflow-wrap:anywhere]">
            {this.state.message ?? "It may be damaged or use a format variant Asset Den can't read."}
          </span>
        </div>
        <div className="flex gap-2">
          {a.kind !== "other" && (
            <Button size="sm" onClick={() => void openAsset(a)}>
              Open
            </Button>
          )}
          <Button size="sm" onClick={() => void revealAsset(a)}>
            Show in folder
          </Button>
        </div>
      </div>
    );
  }
}

export function copyPath(a: Asset) {
  navigator.clipboard.writeText(a.path).then(
    () => useStore.getState().showToast("Path copied"),
    () => useStore.getState().setError("Couldn't copy to the clipboard."),
  );
}

/** "lib/sprites/" the way the design shows a file's location. */
export function useLocation(a: Asset) {
  const roots = useStore((s) => s.roots);
  const root = roots.find((r) => r.id === a.rootId);
  return [root ? baseName(root.path) : "", folderOf(a.relPath)].filter(Boolean).join("/") + "/";
}

/** The other copies of `a`, if it's part of a duplicate group, plus that group's position. */
export function useDuplicateOf(a: Asset) {
  const { dups, assets } = useStore();
  return useMemo(() => {
    const i = dups?.findIndex((g) => g.ids.includes(a.id)) ?? -1;
    if (i < 0) return null;
    const others = dups![i].ids.filter((id) => id !== a.id).map((id) => assets.find((x) => x.id === id)?.name ?? "");
    return { hash: dups![i].hash, names: others.filter(Boolean) };
  }, [dups, assets, a.id]);
}

export function DuplicateBanner({ a }: { a: Asset }) {
  const dup = useDuplicateOf(a);
  const go = useStore((s) => s.go);
  if (!dup) return null;
  return (
    <button
      type="button"
      onClick={() => go("duplicates", { dupSel: dup.hash })}
      className="flex items-center justify-between gap-2.5 rounded-[10px] bg-warn-bg px-3 py-2.5 text-left text-warn-fg"
    >
      <span className="min-w-0">Identical to {dup.names.join(", ")}</span>
      <span className="font-semibold whitespace-nowrap">Review →</span>
    </button>
  );
}

export function MetaRows({ a }: { a: Asset }) {
  const rows = [
    a.width && a.height ? ["Dimensions", `${a.width}×${a.height}`] : null,
    audioDetails(a) ? ["Audio", audioDetails(a)] : null,
    ["Size", bytes(a.size)],
    ["Format", `.${a.ext}`],
    ["Modified", ago(a.mtime)],
  ].filter(Boolean) as [string, string][];
  return (
    <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-y-[9px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-mono text-xs [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TagEditor({ items }: { items: Asset[] }) {
  const { addTag, removeTag } = useStore();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ids = items.map((a) => a.id);
  // On a multi-selection, show the tags all of them share.
  const shared = items.reduce<string[]>((acc, a, i) => (i === 0 ? a.tags : acc.filter((t) => a.tags.includes(t))), []);
  const submit = () => {
    const t = draft.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
    setDraft("");
    if (t) void addTag(ids, t);
  };
  return (
    <div className="flex flex-col gap-2">
      <Label>Tags</Label>
      <div className="focus-ring-within flex flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-card p-1.5">
        {shared.map((t) => (
          <span key={t} className="flex h-6 items-center gap-1.5 rounded-md bg-line py-0 pr-1 pl-[9px] text-xs">
            #{t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => {
                // The chip goes away with its button; keep focus in the tag field.
                input.current?.focus();
                void removeTag(ids, t);
              }}
              className="flex size-4 items-center justify-center rounded text-muted hover:bg-line-x hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          aria-label="Add tag"
          value={draft}
          maxLength={64}
          placeholder="Add tag, press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submit();
            if (e.key === "Escape") focusAssets();
            if (e.key === "Backspace" && !draft && shared.length) void removeTag(ids, shared[shared.length - 1]);
          }}
          className="h-6 min-w-[110px] flex-1 border-0 bg-transparent px-1 text-xs text-fg outline-none"
        />
      </div>
    </div>
  );
}

/** Five stars as a radio group: click or use the arrow keys. Picking the current rating again clears it. */
export function Stars({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const to = ({ ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 1, End: 5 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    // Keep the arrows from also moving to another asset.
    e.preventDefault();
    e.stopPropagation();
    const n = Math.min(5, Math.max(0, to));
    if (n !== value) onChange(n);
    box.current?.querySelectorAll<HTMLElement>("[role=radio]")[Math.max(n, 1) - 1]?.focus();
  };
  return (
    <div ref={box} role="radiogroup" aria-label="Rating" onKeyDown={onKeyDown} className={clsx("flex items-center", className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const hint = value === n ? "Clear rating (0)" : `Rate ${n} ${n === 1 ? "star" : "stars"} (${n})`;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            title={hint}
            // One tab stop for the group: the current rating, or the first star.
            tabIndex={n === Math.max(value, 1) ? 0 : -1}
            onClick={() => onChange(value === n ? 0 : n)}
            className={clsx(
              "flex size-6 items-center justify-center rounded text-[15px] leading-none hover:bg-active",
              n <= value ? "text-star" : "text-faint hover:text-muted",
            )}
          >
            {n <= value ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}

/** Free-text note for one asset; render it with `key={asset.id}`. Saves after a pause in typing and on blur. */
export function NoteEditor({ a }: { a: Asset }) {
  const { notes, setNote } = useStore();
  const [draft, setDraft] = useState(notes[a.id] ?? "");
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) void setNote(a.id, pending.current);
    pending.current = null;
  };
  // Switching assets or closing the panel unmounts this: save what's typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flush, []);
  return (
    <div className="flex flex-col gap-2">
      <Label>Note</Label>
      <textarea
        aria-label="Note"
        value={draft}
        maxLength={5000}
        rows={3}
        placeholder="Add a note"
        onChange={(e) => {
          setDraft(e.target.value);
          pending.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={flush}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") focusAssets();
        }}
        className="min-h-[68px] resize-y rounded-[9px] border border-line-strong bg-card px-2.5 py-2 text-[13px] text-fg placeholder:text-muted"
      />
    </div>
  );
}

export function CollectionChecks({ items }: { items: Asset[] }) {
  const { collections: all, setInCollection, newCollection } = useStore();
  // Smart collections pick their own members.
  const collections = all.filter((c) => !c.rule);
  const ids = items.map((a) => a.id);
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Collections</Label>
      {collections.map((c) => {
        const on = ids.every((id) => c.assetIds.includes(id));
        return (
          <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => void setInCollection(c.id, ids, !on)} className="flex items-center gap-2.5 py-1 text-left">
            <span
              aria-hidden
              className={clsx(
                "flex size-4 items-center justify-center rounded border text-[11px] font-bold",
                on ? "border-accent bg-accent text-accent-fg" : "border-line-x",
              )}
            >
              {on ? "✓" : ""}
            </span>
            <span className="text-fg-2">{c.name}</span>
          </button>
        );
      })}
      {!collections.length && (
        <button type="button" onClick={() => void newCollection()} className="py-1 text-left text-muted hover:text-fg">
          + New collection
        </button>
      )}
    </div>
  );
}

export function Peek({ list }: { list: Asset[] }) {
  const s = useStore();
  const selectedAssets = useMemo(() => s.assets.filter((a) => s.selected.has(a.id)), [s.assets, s.selected]);
  const a = s.assets.find((x) => x.id === s.activeId);
  // Closing the panel (Esc) while focus is in it hands focus back to the asset list instead of dropping it.
  useEffect(
    () => () => {
      if (document.activeElement === document.body) focusAssets();
    },
    [],
  );
  if (!a) return null;
  const multi = selectedAssets.length > 1;
  const mixedRating = selectedAssets.some((x) => x.rating !== selectedAssets[0].rating);
  const sharedRating = multi && !mixedRating ? selectedAssets[0].rating : 0;
  const i = list.findIndex((x) => x.id === a.id);
  const step = (d: number) => list.length && s.select(list[(Math.max(i, 0) + d + list.length) % list.length].id);

  return (
    <aside aria-label="Details" className="flex min-h-0 min-w-0 flex-col border-l border-line bg-panel">
      <div className="flex h-[60px] flex-none items-center gap-1.5 border-b border-line-soft px-3.5">
        <IconButton label="Previous (←)" bordered onClick={() => step(-1)}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <IconButton label="Next (→)" bordered onClick={() => step(1)}>
          <ArrowRight className="size-4" />
        </IconButton>
        <span className="ml-1 font-mono text-xs text-faint">{i >= 0 ? `${i + 1} of ${list.length.toLocaleString()}` : ""}</span>
        <Button size="sm" className="ml-auto" onClick={() => s.setFull(true)}>
          Full screen <span className="font-mono text-[11px] text-muted">↵</span>
        </Button>
        <IconButton label="Close (Esc)" onClick={() => s.setPeek(false)}>
          <X className="size-4" />
        </IconButton>
      </div>

      {multi ? (
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto p-[18px]">
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold tracking-[-.01em]">{selectedAssets.length} selected</span>
            <span className="font-mono text-xs text-muted">{bytes(selectedAssets.reduce((n, x) => n + x.size, 0))} · drag them out together</span>
          </div>
          <Button
            onClick={() => void s.setFavorite(selectedAssets.map((x) => x.id), !selectedAssets.every((x) => x.favorite))}
            className="self-start"
          >
            <span aria-hidden>{selectedAssets.every((x) => x.favorite) ? "★" : "☆"}</span>
            {selectedAssets.every((x) => x.favorite) ? "Unfavorite all" : "Favorite all"}
          </Button>
          <div className="flex flex-col gap-2">
            <Label>Rating</Label>
            <span className="flex items-center gap-2.5">
              <Stars value={sharedRating} onChange={(n) => void s.setRating(selectedAssets.map((x) => x.id), n)} />
              {mixedRating && <span className="text-xs text-muted">Mixed</span>}
            </span>
          </div>
          <TagEditor items={selectedAssets} />
          <CollectionChecks items={selectedAssets} />
        </div>
      ) : (
        <>
          <div
            onDoubleClick={() => s.setFull(true)}
            className={clsx("flex h-[250px] flex-none items-center justify-center border-b border-line-soft px-[22px] py-4", a.kind === "image" ? "checker" : "bg-bg")}
          >
            <PreviewBoundary asset={a}>
              <Viewer asset={a} pixelated={s.pixelated} />
            </PreviewBoundary>
          </div>
          <PeekBody a={a} />
        </>
      )}

      {!multi && (
        <div className="flex flex-none gap-2 border-t border-line-soft px-3.5 py-3">
          {a.kind !== "other" && (
            <Button variant="invert" className="flex-1" onClick={() => void openAsset(a)}>
              Open
            </Button>
          )}
          <Button className="flex-1" onClick={() => void revealAsset(a)}>
            Show in folder
          </Button>
          <Button onClick={() => copyPath(a)}>Copy path</Button>
        </div>
      )}
    </aside>
  );
}

/** Image formats the backend can analyse; the same list as kind::DECODABLE. */
const ANALYSABLE = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tga", "psd", "tif", "tiff", "ico"];

function PeekBody({ a }: { a: Asset }) {
  const setFavorite = useStore((s) => s.setFavorite);
  const setRating = useStore((s) => s.setRating);
  const findSimilar = useStore((s) => s.findSimilar);
  const where = useLocation(a);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-[18px] pt-[18px] pb-5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-lg font-semibold tracking-[-.01em] [overflow-wrap:anywhere]">{a.name}</span>
          <span className="flex min-w-0 items-center gap-2">
            <KindPill kind={a.kind} className="flex-none" />
            <span className="min-w-0 truncate font-mono text-xs text-muted" title={a.path}>
              {where}
            </span>
          </span>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Stars value={a.rating} onChange={(n) => void setRating([a.id], n)} />
          <IconButton
            label="Favorite (F)"
            aria-pressed={a.favorite}
            bordered
            className={clsx("size-[34px] rounded-[9px] text-base", a.favorite ? "text-star" : "text-muted")}
            onClick={() => void setFavorite([a.id], !a.favorite)}
          >
            {a.favorite ? "★" : "☆"}
          </IconButton>
        </div>
      </div>
      <DuplicateBanner a={a} />
      {a.kind === "image" && ANALYSABLE.includes(a.ext) && (
        <Button size="sm" className="self-start" onClick={() => void findSimilar(a.id)}>
          Find similar
        </Button>
      )}
      <MetaRows a={a} />
      <TagEditor items={[a]} />
      <CollectionChecks items={[a]} />
      <NoteEditor key={a.id} a={a} />
    </div>
  );
}
