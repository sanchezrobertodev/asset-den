import clsx from "clsx";
import { useMemo, useState } from "react";
import { ago, bytes } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { useLocation } from "./Peek";
import { Thumb } from "./Thumb";
import { Button, Modal } from "./ui";

function CopyCard({ a, keep, onKeep }: { a: Asset; keep: boolean; onKeep: () => void }) {
  const collections = useStore((s) => s.collections);
  const where = useLocation(a);
  const colls = collections.filter((c) => c.assetIds.includes(a.id)).map((c) => c.name);
  return (
    <div
      role="radio"
      aria-checked={keep}
      tabIndex={0}
      onClick={onKeep}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onKeep())}
      className={clsx("flex cursor-pointer flex-col gap-3.5 rounded-[14px] border-[1.5px] bg-card p-3.5", keep ? "border-invert-bg" : "border-line-strong")}
    >
      <div className="checker flex h-[min(240px,28vh)] items-center justify-center rounded-[10px]">
        <Thumb asset={a} className="aspect-square w-[44%] rounded-md" />
      </div>
      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{a.name}</span>
        <span
          className={clsx(
            "rounded-lg border px-3 py-1.5 font-medium whitespace-nowrap",
            keep ? "border-invert-bg bg-invert-bg text-invert-fg" : "border-line-strong text-fg",
          )}
        >
          {keep ? "✓ Keeping" : "Keep this one"}
        </span>
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2">
        <dt className="text-muted">Folder</dt>
        <dd className="font-mono text-xs [overflow-wrap:anywhere]">{where}</dd>
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

export function DuplicatesView() {
  const s = useStore();
  const byId = useMemo(() => new Map(s.assets.map((a) => [a.id, a])), [s.assets]);
  const groups = useMemo(
    () => (s.dups ?? []).map((g) => ({ hash: g.hash, items: g.ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a) })).filter((g) => g.items.length > 1),
    [s.dups, byId],
  );
  const [keepBy, setKeepBy] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState(false);
  const sel = Math.min(s.dupSel, Math.max(0, groups.length - 1));
  const group = groups[sel];
  // Default to keeping the copy you've organized most (tags, favorite, collections); ties keep the first.
  const score = (a: Asset) => a.tags.length + (a.favorite ? 1 : 0) + s.collections.filter((c) => c.assetIds.includes(a.id)).length;
  const keepId = group ? (keepBy[group.hash] ?? group.items.reduce((best, a) => (score(a) > score(best) ? a : best)).id) : null;
  const remove = group ? group.items.filter((a) => a.id !== keepId) : [];
  const kept = group?.items.find((a) => a.id === keepId);
  const reclaim = groups.reduce((n, g) => n + g.items[0].size * (g.items.length - 1), 0);
  const removeLabel = remove.length === 1 ? remove[0].name : `${remove.length} copies`;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3.5 overflow-auto border-r border-line-soft px-3.5 py-5">
        <div className="flex flex-col gap-1.5 px-1.5">
          <span className="text-[15px] font-semibold">
            {groups.length ? `${groups.length} duplicate ${groups.length === 1 ? "group" : "groups"}` : "Duplicates"}
          </span>
          <span className="leading-[1.45] text-muted">
            {s.dups === null
              ? "Checking files with the same size…"
              : groups.length
                ? `Files with identical content. Removing the extra copies frees ${bytes(reclaim)}.`
                : "Nothing to review."}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {groups.map((g, i) => (
            <button
              key={g.hash}
              type="button"
              aria-current={i === sel}
              onClick={() => useStore.setState({ dupSel: i })}
              className={clsx("flex items-center gap-3 rounded-[10px] border p-3 text-left hover:bg-field", i === sel ? "border-line-strong bg-field" : "border-transparent")}
            >
              <div className="flex flex-none">
                <Thumb asset={g.items[0]} size="row" className="size-[34px] rounded-[7px] border-2 border-bg" />
                <Thumb asset={g.items[1]} size="row" className="-ml-3 size-[34px] rounded-[7px] border-2 border-bg" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{g.items[0].name}</span>
                <span className="truncate text-muted">
                  {g.items.slice(1).map((a) => a.name).join(", ")}
                </span>
              </div>
              <span className="ml-auto font-mono text-[11px] text-faint">{bytes(g.items[0].size)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-5 overflow-auto px-[30px] py-6">
        {group && kept ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xl font-semibold tracking-[-.01em]">Which one do you want to keep?</span>
              <span className="text-muted">
                {group.items.length === 2 ? "Both files are" : `All ${group.items.length} files are`} byte-for-byte identical. Tags, favorites and collections
                from the removed {remove.length === 1 ? "copy move" : "copies move"} to the one you keep.
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
              {group.items.map((a) => (
                <CopyCard key={a.id} a={a} keep={a.id === keepId} onKeep={() => setKeepBy((k) => ({ ...k, [group.hash]: a.id }))} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-4">
              <span className="text-muted">
                Group {sel + 1} of {groups.length}
              </span>
              <Button variant="ghost" size="lg" className="ml-auto" onClick={() => void s.ignoreDuplicate(group.hash)}>
                Not duplicates
              </Button>
              <Button size="lg" onClick={() => void s.ignoreDuplicate(group.hash)}>
                Keep {group.items.length === 2 ? "both" : "all"}
              </Button>
              <Button variant="invert" size="lg" onClick={() => setConfirming(true)}>
                Move {removeLabel} to Trash
              </Button>
            </div>
          </>
        ) : (
          s.dups !== null && (
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
                  void s.trashDuplicates(kept.id, remove.map((a) => a.id));
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
}
