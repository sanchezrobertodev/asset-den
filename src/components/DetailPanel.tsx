import { Eye, FolderOpen, SquareArrowOutUpRight, Star, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api, errorText } from "../api";
import { bytes, date, kindLabel } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Thumb } from "./Thumb";
import { Button, IconButton } from "./ui";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2 py-1 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

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

function TagEditor({ items }: { items: Asset[] }) {
  const { addTag, removeTag, assets } = useStore();
  const [draft, setDraft] = useState("");
  const ids = items.map((a) => a.id);
  // On a multi-selection, show the tags all of them share.
  const shared = items.reduce<string[]>((acc, a, i) => (i === 0 ? a.tags : acc.filter((t) => a.tags.includes(t))), []);
  const known = useMemo(() => [...new Set(assets.flatMap((a) => a.tags))].sort(), [assets]);

  const submit = () => {
    const t = draft.trim();
    setDraft("");
    if (t) void addTag(ids, t);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {shared.map((t) => (
          <span key={t} className="flex h-6 items-center gap-0.5 rounded-full border border-border-strong bg-surface-2 pr-0.5 pl-2 text-xs">
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => void removeTag(ids, t)}
              className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        list="known-tags"
        aria-label="Add tag"
        placeholder="Add tag and press Enter"
        value={draft}
        maxLength={64}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") submit();
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className="mt-2 h-8 w-full rounded-md border border-border-strong bg-bg px-2 text-[13px] placeholder:text-muted"
      />
      <datalist id="known-tags">
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

function CollectionPicker({ items }: { items: Asset[] }) {
  const { collections, setInCollection } = useStore();
  if (!collections.length) return <p className="text-xs text-muted">Create a collection in the sidebar first.</p>;
  const ids = items.map((a) => a.id);
  return (
    <ul className="space-y-0.5">
      {collections.map((c) => {
        const all = ids.every((id) => c.assetIds.includes(id));
        return (
          <li key={c.id}>
            <label className="flex h-7 cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={all}
                onChange={() => void setInCollection(c.id, ids, !all)}
                className="size-3.5 accent-[var(--accent)]"
              />
              {c.name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function DetailPanel({ items }: { items: Asset[] }) {
  const { pixelated, setFavorite, setQuickView, setSelected } = useStore();
  if (!items.length) return null;
  const a = items[0];
  const single = items.length === 1;
  const allFav = items.every((x) => x.favorite);

  return (
    <aside aria-label="Details" className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="truncate text-sm font-semibold">{single ? a.name : `${items.length} selected`}</h2>
        <IconButton label="Clear selection" onClick={() => setSelected([])} className="-mr-2">
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="space-y-5 p-4">
        {single && (
          <button
            type="button"
            onClick={() => setQuickView(true)}
            aria-label="Open quick view"
            className="block w-full overflow-hidden rounded-lg border border-border"
          >
            <Thumb asset={a} pixelated={pixelated} className="aspect-square w-full" />
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {single && (
            <Button size="sm" variant="primary" onClick={() => setQuickView(true)}>
              <Eye aria-hidden className="size-4" /> Quick view
            </Button>
          )}
          <Button size="sm" onClick={() => void setFavorite(items.map((x) => x.id), !allFav)} aria-pressed={allFav}>
            <Star aria-hidden className={allFav ? "size-4 fill-warn text-warn" : "size-4"} />
            {allFav ? "Unfavorite" : "Favorite"}
          </Button>
          {single && (
            <>
              <Button size="sm" onClick={() => void revealAsset(a)}>
                <FolderOpen aria-hidden className="size-4" /> Show in folder
              </Button>
              {a.kind !== "other" && (
                <Button size="sm" onClick={() => void openAsset(a)}>
                  <SquareArrowOutUpRight aria-hidden className="size-4" /> Open
                </Button>
              )}
            </>
          )}
        </div>
        {single ? (
          <dl>
            <Field label="Kind">
              {kindLabel[a.kind]} <span className="font-mono text-xs text-muted">.{a.ext}</span>
            </Field>
            <Field label="Size">{bytes(a.size)}</Field>
            {a.width && a.height && (
              <Field label="Dimensions">
                {a.width} × {a.height}px
              </Field>
            )}
            <Field label="Modified">{date(a.mtime)}</Field>
            <Field label="Path">
              <span className="font-mono text-xs break-all select-text">{a.path}</span>
            </Field>
          </dl>
        ) : (
          <dl>
            <Field label="Total size">{bytes(items.reduce((n, x) => n + x.size, 0))}</Field>
            <p className="pt-1 text-xs text-muted">Drag the selection out to copy every file at once.</p>
          </dl>
        )}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Tags</h3>
          <TagEditor items={items} />
        </section>
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Collections</h3>
          <CollectionPicker items={items} />
        </section>
      </div>
    </aside>
  );
}
