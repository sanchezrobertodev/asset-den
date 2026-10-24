import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Maximize2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { compare } from "../lib/filter";
import { ago, bytes } from "../lib/format";
import { useStore } from "../store";
import type { Asset, Collection } from "../types";
import { ScopeChips } from "./Header";
import { useLocation } from "./Peek";
import { Thumb } from "./Thumb";
import { Button, IconButton, Modal } from "./ui";

interface Group {
  hash: string;
  items: Asset[];
}

/** Height of one row in the group list, gap included. */
const ROW = 64;

const wasted = (g: Group) => g.items[0].size * (g.items.length - 1);
const newest = (g: Group) => Math.max(...g.items.map((a) => a.mtime));
type DupSort = "space" | "copies" | "newest" | "name";
const sorts: Record<DupSort, { label: string; by: (a: Group, b: Group) => number }> = {
  space: { label: "Space freed", by: (a, b) => wasted(b) - wasted(a) },
  copies: { label: "Most copies", by: (a, b) => b.items.length - a.items.length || wasted(b) - wasted(a) },
  newest: { label: "Newest", by: (a, b) => newest(b) - newest(a) },
  name: { label: "Name", by: (a, b) => compare.name(a.items[0], b.items[0]) },
};

/** Full screen steps through the copies of the group it opens from. */
function openFull(a: Asset, hash: string) {
  useStore.setState({ activeId: a.id, selected: new Set([a.id]), full: true, dupSel: hash });
}

function CopyCard({ a, hash, keep, collections, onKeep }: { a: Asset; hash: string; keep: boolean; collections: Collection[]; onKeep: () => void }) {
  const where = useLocation(a);
  const colls = collections.filter((c) => c.assetIds.includes(a.id)).map((c) => c.name);
  return (
    // The radio is the "Keep" button; a click anywhere on the card picks it too.
    <div
      onClick={onKeep}
      className={clsx("flex min-w-0 cursor-pointer flex-col gap-3.5 rounded-[14px] border-[1.5px] bg-card p-3.5", keep ? "border-invert-bg" : "border-line-strong")}
    >
      <div
        onDoubleClick={() => openFull(a, hash)}
        className="checker relative flex h-[min(260px,30vh)] items-center justify-center overflow-hidden rounded-[10px]"
      >
        <Thumb asset={a} className="aspect-square h-[86%] max-w-[92%] rounded-md" />
        <IconButton
          label={`Full screen: ${a.name}`}
          bordered
          className="absolute top-2 right-2 bg-card"
          onClick={(e) => {
            e.stopPropagation();
            openFull(a, hash);
          }}
        >
          <Maximize2 className="size-4" />
        </IconButton>
      </div>
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{a.name}</span>
        <button
          type="button"
          role="radio"
          aria-checked={keep}
          aria-label={`Keep ${a.name} in ${where}`}
          tabIndex={keep ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            onKeep();
          }}
          className={clsx(
            "rounded-lg border px-3 py-1.5 font-medium whitespace-nowrap",
            keep ? "border-invert-bg bg-invert-bg text-invert-fg" : "border-line-strong text-fg",
          )}
        >
          {keep ? "✓ Keeping" : "Keep this one"}
        </button>
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2">
        <dt className="text-muted">Folder</dt>
        <dd className="font-mono text-xs [overflow-wrap:anywhere]">{where}</dd>
        <dt className="text-muted">Size</dt>
        <dd>
          {bytes(a.size)}
          {a.width && a.height ? ` · ${a.width} × ${a.height}` : ""}
        </dd>
        <dt className="text-muted">Modified</dt>
        <dd>{ago(a.mtime)}</dd>
        <dt className="text-muted">Tags</dt>
        <dd>{a.tags.map((t) => `#${t}`).join(" ") || "None"}</dd>
        <dt className="text-muted">Collections</dt>
        <dd>{colls.join(", ") || "None"}</dd>
      </dl>
    </div>
  );
}

const GroupRow = memo(function GroupRow({ g, i, current }: { g: Group; i: number; current: boolean }) {
  return (
    <div
      id={`dup-${i}`}
      role="option"
      aria-selected={current}
      onClick={() => useStore.setState({ dupSel: g.hash })}
      className={clsx(
        "flex h-[58px] cursor-pointer items-center gap-3 rounded-[10px] border px-3 hover:bg-field",
        current ? "border-line-strong bg-field group-focus-visible/list:ring-2 group-focus-visible/list:ring-fg" : "border-transparent",
      )}
    >
      <div className="flex flex-none">
        <Thumb asset={g.items[0]} size="row" className="size-[34px] rounded-[7px] border-2 border-bg" />
        <Thumb asset={g.items[1]} size="row" className="-ml-3 size-[34px] rounded-[7px] border-2 border-bg" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{g.items[0].name}</span>
        <span className="truncate text-muted">{g.items.slice(1).map((a) => a.name).join(", ")}</span>
      </div>
      <span className="ml-auto flex flex-none flex-col items-end gap-0.5 font-mono text-[11px] text-faint">
        <span>{bytes(g.items[0].size)}</span>
        {g.items.length > 2 && <span>×{g.items.length}</span>}
      </span>
    </div>
  );
});

/** The groups as one focusable listbox: arrows, Page Up/Down, Home and End move through them. Only visible rows render. */
function GroupList({ groups, sel }: { groups: Group[]; sel: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: groups.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW, overscan: 6 });
  useEffect(() => {
    if (groups.length) v.scrollToIndex(sel, { align: "auto" });
  }, [sel, groups.length, v]);
  const rows = v.getVirtualItems();
  const shown = rows.some((r) => r.index === sel);
  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label="Duplicate groups"
      tabIndex={0}
      aria-activedescendant={shown ? `dup-${sel}` : undefined}
      onKeyDown={(e) => {
        const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? ROW) / ROW) - 1);
        const to = { ArrowDown: sel + 1, ArrowUp: sel - 1, PageDown: sel + page, PageUp: sel - page, Home: 0, End: groups.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        useStore.setState({ dupSel: groups[Math.max(0, Math.min(groups.length - 1, to))].hash });
      }}
      className={clsx("group/list min-h-0 flex-1 overflow-y-auto px-3.5 pb-5", shown ? "focus-visible:outline-none" : "-outline-offset-2")}
    >
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {rows.map((r) => (
          <div key={groups[r.index].hash} className="absolute left-0 w-full" style={{ top: r.start }}>
            <GroupRow g={groups[r.index]} i={r.index} current={r.index === sel} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoized: the app re-renders on every store change, and this view only needs its own slices.
/** `visible` and `scopeAssets` are the assets in the type chips, search and filters, and the same without the chips. */
export const DuplicatesView = memo(function DuplicatesView({ visible, scopeAssets }: { visible: Asset[]; scopeAssets: Asset[] }) {
  const assets = useStore((s) => s.assets);
  const dups = useStore((s) => s.dups);
  const dupSel = useStore((s) => s.dupSel);
  const collections = useStore((s) => s.collections);
  const ignoreDuplicate = useStore((s) => s.ignoreDuplicate);
  const trashDuplicates = useStore((s) => s.trashDuplicates);
  const clearFilters = useStore((s) => s.clearFilters);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const groups = useMemo(
    () => (dups ?? []).map((g) => ({ hash: g.hash, items: g.ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a) })).filter((g) => g.items.length > 1),
    [dups, byId],
  );
  const [sort, setSort] = useState<DupSort>("space");
  // A group shows when any of its copies passes the type chips, search and filters. The chips count groups.
  const shown = useMemo(() => {
    const ids = new Set(visible.map((a) => a.id));
    return groups.filter((g) => g.items.some((a) => ids.has(a.id))).sort(sorts[sort].by);
  }, [groups, visible, sort]);
  const chips = useMemo(() => {
    const ids = new Set(scopeAssets.map((a) => a.id));
    const counts = new Map<string, number>();
    let total = 0;
    for (const g of groups)
      if (g.items.some((a) => ids.has(a.id))) {
        total++;
        counts.set(g.items[0].kind, (counts.get(g.items[0].kind) ?? 0) + 1);
      }
    return { counts, total };
  }, [groups, scopeAssets]);
  const reclaim = useMemo(() => shown.reduce((n, g) => n + wasted(g), 0), [shown]);
  const [keepBy, setKeepBy] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  // The open group stays open through sorting and filtering. Filtered out, the first group opens instead; resolved, the
  // group that took its place in the list does.
  const lastAt = useRef(0);
  const found = shown.findIndex((g) => g.hash === dupSel);
  const resolved = !groups.some((g) => g.hash === dupSel);
  const sel = found >= 0 ? found : resolved ? Math.min(lastAt.current, Math.max(0, shown.length - 1)) : 0;
  lastAt.current = sel;
  const group = shown[sel];
  // Default to keeping the copy you've organized most (tags, favorite, collections); ties keep the first.
  const score = (a: Asset) => a.tags.length + (a.favorite ? 1 : 0) + collections.filter((c) => c.assetIds.includes(a.id)).length;
  const keepId = group ? (keepBy[group.hash] ?? group.items.reduce((best, a) => (score(a) > score(best) ? a : best)).id) : null;
  const remove = group ? group.items.filter((a) => a.id !== keepId) : [];
  const kept = group?.items.find((a) => a.id === keepId);
  const removeLabel = remove.length === 1 ? remove[0].name : `${remove.length} copies`;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-3.5 border-r border-line-soft pt-5">
        <div className="flex flex-col gap-1.5 px-5">
          <span role="status" className="text-[15px] font-semibold">
            {groups.length
              ? `${shown.length === groups.length ? "" : `${shown.length.toLocaleString()} of `}${groups.length.toLocaleString()} duplicate ${groups.length === 1 ? "group" : "groups"}`
              : "Duplicates"}
          </span>
          <span className="leading-[1.45] text-muted">
            {dups === null
              ? "Checking files with the same size…"
              : shown.length
                ? `Files with identical content. Removing the extra copies frees ${bytes(reclaim)}.`
                : groups.length
                  ? "Files with identical content."
                  : "Nothing to review."}
          </span>
        </div>
        {groups.length > 0 && (
          <>
            <ScopeChips counts={chips.counts} total={chips.total} className="px-5" />
            <label className="flex items-center gap-1.5 px-5 text-muted">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as DupSort)}
                className="h-[30px] rounded-lg border border-line-strong bg-field px-1.5 text-fg"
              >
                {Object.entries(sorts).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {shown.length > 0 && <GroupList groups={shown} sel={sel} />}
      </div>

      <div className="flex min-h-0 flex-col gap-5 overflow-auto px-[30px] py-6">
        {group && kept ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xl font-semibold tracking-[-.01em]">Which one do you want to keep?</span>
              <span className="text-muted">
                {group.items.length === 2 ? "Both files are" : `All ${group.items.length} files are`} byte-for-byte identical ({bytes(group.items[0].size)}{" "}
                each). Tags, favorites and collections from the removed {remove.length === 1 ? "copy move" : "copies move"} to the one you keep.
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Copy to keep"
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const at = group.items.findIndex((a) => a.id === keepId);
                const next = (at + d + group.items.length) % group.items.length;
                setKeepBy((k) => ({ ...k, [group.hash]: group.items[next].id }));
                e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
              }}
              className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[18px]"
            >
              {group.items.map((a) => (
                <CopyCard
                  key={a.id}
                  a={a}
                  hash={group.hash}
                  keep={a.id === keepId}
                  collections={collections}
                  onKeep={() => setKeepBy((k) => ({ ...k, [group.hash]: a.id }))}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-4">
              <span className="text-muted">
                Group {(sel + 1).toLocaleString()} of {shown.length.toLocaleString()}
              </span>
              <Button variant="ghost" size="lg" className="ml-auto" onClick={() => void ignoreDuplicate(group.hash)}>
                Not duplicates
              </Button>
              <Button size="lg" onClick={() => void ignoreDuplicate(group.hash)}>
                Keep {group.items.length === 2 ? "both" : "all"}
              </Button>
              <Button variant="invert" size="lg" onClick={() => setConfirming(true)}>
                Move {removeLabel} to Trash
              </Button>
            </div>
          </>
        ) : groups.length > 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 text-muted">
            <span className="text-base font-medium text-fg">No duplicate groups match these filters</span>
            <span>Try removing a type, search or filter.</span>
            <Button className="mt-2" onClick={clearFilters}>
              Clear search and filters
            </Button>
          </div>
        ) : (
          dups !== null && (
            <div className="m-auto flex flex-col items-center gap-2 text-muted">
              <span className="text-base font-medium text-fg">No duplicates left</span>
              <span>Asset Den checks again whenever files change.</span>
            </div>
          )
        )}
      </div>

      {confirming && kept && (
        <Modal
          title={`Move ${removeLabel} to Trash?`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button
                variant="invert"
                data-autofocus
                onClick={() => {
                  setConfirming(false);
                  void trashDuplicates(kept.id, remove.map((a) => a.id));
                }}
              >
                Move to Trash
              </Button>
            </>
          }
        >
          <p className="leading-relaxed">
            {remove.map((a) => a.name).join(", ")} {remove.length === 1 ? "goes" : "go"} to your system's Trash (the Recycle Bin on Windows), where you can
            restore {remove.length === 1 ? "it" : "them"}. Its tags, favorite and collections move to <span className="text-fg">{kept.name}</span>.
            Asset Den checks the files are still identical first.
          </p>
        </Modal>
      )}
    </div>
  );
});
