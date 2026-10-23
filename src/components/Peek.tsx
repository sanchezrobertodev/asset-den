import clsx from "clsx";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, errorText } from "../api";
import { ago, audioDetails, baseName, bytes, folderOf } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Button, IconButton, KindPill, Label } from "./ui";
import { Viewer } from "./Viewers";

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
    return { index: i, names: others.filter(Boolean) };
  }, [dups, assets, a.id]);
}

export function DuplicateBanner({ a }: { a: Asset }) {
  const dup = useDuplicateOf(a);
  const go = useStore((s) => s.go);
  if (!dup) return null;
  return (
    <button
      type="button"
      onClick={() => go("duplicates", { dupSel: dup.index })}
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
      <div className="flex flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-card p-1.5">
        {shared.map((t) => (
          <span key={t} className="flex h-6 items-center gap-1.5 rounded-md bg-line py-0 pr-1 pl-[9px] text-xs">
            #{t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => void removeTag(ids, t)}
              className="flex size-4 items-center justify-center rounded text-muted hover:bg-line-x hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label="Add tag"
          value={draft}
          maxLength={64}
          placeholder="Add tag, press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submit();
            if (e.key === "Escape") e.currentTarget.blur();
            if (e.key === "Backspace" && !draft && shared.length) void removeTag(ids, shared[shared.length - 1]);
          }}
          className="h-6 min-w-[110px] flex-1 border-0 bg-transparent px-1 text-xs text-fg outline-none"
        />
      </div>
    </div>
  );
}

export function CollectionChecks({ items }: { items: Asset[] }) {
  const { collections, setInCollection, newCollection } = useStore();
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
  if (!a) return null;
  const multi = selectedAssets.length > 1;
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
            {selectedAssets.every((x) => x.favorite) ? "★ Unfavorite all" : "☆ Favorite all"}
          </Button>
          <TagEditor items={selectedAssets} />
          <CollectionChecks items={selectedAssets} />
        </div>
      ) : (
        <>
          <div
            onDoubleClick={() => s.setFull(true)}
            className={clsx("flex h-[250px] flex-none items-center justify-center border-b border-line-soft px-[22px] py-4", a.kind === "image" ? "checker" : "bg-bg")}
          >
            <Viewer asset={a} pixelated={s.pixelated} />
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

function PeekBody({ a }: { a: Asset }) {
  const setFavorite = useStore((s) => s.setFavorite);
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
        <IconButton
          label={a.favorite ? "Unfavorite (F)" : "Favorite (F)"}
          aria-pressed={a.favorite}
          bordered
          className={clsx("size-[34px] rounded-[9px] text-base", a.favorite ? "text-star" : "text-muted")}
          onClick={() => void setFavorite([a.id], !a.favorite)}
        >
          {a.favorite ? "★" : "☆"}
        </IconButton>
      </div>
      <DuplicateBanner a={a} />
      <MetaRows a={a} />
      <TagEditor items={[a]} />
      <CollectionChecks items={[a]} />
    </div>
  );
}
