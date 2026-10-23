import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { activeFilterCount, noFilters, smartMembers } from "../lib/filter";
import { bytes } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { Thumb } from "./Thumb";
import { Button, KindPill } from "./ui";

export function CollectionsView({ items }: { items: Asset[] }) {
  const s = useStore();
  const byId = useMemo(() => new Map(s.assets.map((a) => [a.id, a])), [s.assets]);
  const smart = useMemo(() => smartMembers(s.collections, s.assets, s.notes), [s.collections, s.assets, s.notes]);
  const searching = s.query.trim() !== "" || s.kinds.length > 0 || activeFilterCount(s.filters) > 0;
  const current = s.collections.find((c) => c.id === s.colSel) ?? null;
  const [name, setName] = useState(current?.name ?? "");
  useEffect(() => setName(current?.name ?? ""), [current?.id, current?.name]);

  const commitName = async () => {
    if (!current) return;
    if (!name.trim() || name.trim() === current.name || !(await s.renameCollection(current.id, name))) setName(current.name);
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5 overflow-auto border-r border-line-soft px-4 py-[18px]">
        {s.collections.map((c) => {
          const members = smart.get(c.id) ?? c.assetIds.map((id) => byId.get(id)).filter((a): a is Asset => !!a);
          const on = c.id === s.colSel;
          return (
            <button
              key={c.id}
              type="button"
              aria-current={on}
              onClick={() => useStore.setState({ colSel: c.id })}
              className={clsx("flex flex-col gap-2.5 rounded-xl border p-2.5 text-left hover:border-line-x", on ? "border-line-x bg-active" : "border-line")}
            >
              <div className="grid h-[104px] grid-cols-[2fr_1fr] grid-rows-2 gap-1">
                {[0, 1, 2].map((i) =>
                  members[i] ? (
                    <Thumb key={i} asset={members[i]} size="row" className={clsx("h-full w-full rounded-[7px]", i === 0 && "row-span-2")} />
                  ) : (
                    <div key={i} className={clsx("rounded-[7px] bg-field", i === 0 && "row-span-2")} />
                  ),
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-0.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  {c.rule && <Sparkles aria-label="Smart collection" className="size-3.5 flex-none text-muted" />}
                  {c.name}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {members.length} {members.length === 1 ? "asset" : "assets"} · {bytes(members.reduce((n, a) => n + a.size, 0))}
                </span>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void s.newCollection()}
          className="h-[42px] rounded-xl border border-dashed border-line-x text-muted hover:border-line-x hover:text-fg"
        >
          + New collection
        </button>
      </div>

      {current ? (
        <div className="flex min-w-0 flex-col gap-5 overflow-auto px-7 pt-[22px] pb-10">
          <div className="flex flex-wrap items-end gap-3.5">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <input
                aria-label="Collection name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void commitName()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setName(current.name);
                    e.currentTarget.blur();
                  }
                }}
                className="border-0 border-b border-dashed border-transparent bg-transparent p-0 text-[26px] font-semibold tracking-[-.02em] text-fg outline-none focus:border-line-x"
              />
              <span className="font-mono text-xs text-muted">
                {items.length.toLocaleString()} {items.length === 1 ? "asset" : "assets"} · {bytes(items.reduce((n, a) => n + a.size, 0))}
              </span>
            </div>
            {current.rule && (
              <>
                <Button
                  onClick={() => {
                    s.go("library", { query: current.rule!.query, kinds: [], folder: null });
                    s.setFilters({ ...noFilters, ...current.rule!.filters });
                  }}
                >
                  Open as search
                </Button>
                <Button
                  disabled={!searching}
                  title={searching ? undefined : "Search or filter the library first"}
                  onClick={() => void s.setCollectionRule(current.id)}
                >
                  Use current search
                </Button>
              </>
            )}
            <Button onClick={() => void s.deleteCollection(current.id)}>Delete</Button>
            <Button variant="accent" disabled={!items.length} onClick={() => void s.copyCollection(current.id)}>
              Copy to folder…
            </Button>
          </div>
          {current.rule && <RuleSummary query={current.rule.query} filters={activeFilterCount({ ...noFilters, ...current.rule.filters })} />}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
            {items.map((a) => {
              const isSel = a.id === s.activeId && s.peek;
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    s.select(a.id);
                    s.setPeek(true);
                  }}
                  onDoubleClick={() => {
                    s.select(a.id);
                    s.setFull(true);
                  }}
                  className="group flex min-w-0 cursor-pointer flex-col gap-[7px]"
                >
                  <div className={clsx("relative aspect-square overflow-hidden rounded-xl outline-offset-2", isSel && "outline-2 outline-accent")}>
                    <Thumb asset={a} pixelated={s.pixelated} className="h-full w-full rounded-xl" />
                    {!current.rule && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void s.setInCollection(current.id, [a.id], false);
                        }}
                        className="absolute top-2 right-2 flex h-6 items-center rounded-md bg-[rgba(13,12,11,.78)] px-2 text-[11px] text-[#efede8] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    )}
                    <KindPill kind={a.kind} className="absolute bottom-2 left-2 px-[7px] py-0.5 text-[11px]" />
                  </div>
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="-mt-[3px] font-mono text-[11px] text-muted">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                    {bytes(a.size)}
                  </span>
                </div>
              );
            })}
            {!current.rule && (
              <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-x p-4 text-center text-muted">
                <span className="text-[22px] text-fg-2">+</span>
                <span className="leading-snug">Add from any side panel, or select assets and tick this collection</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="m-auto flex flex-col items-center gap-2 text-muted">
          <span className="text-[15px] font-medium text-fg">No collections yet</span>
          <span>Group the assets for a level, a character or a pack.</span>
          <Button variant="accent" className="mt-2" onClick={() => void s.newCollection()}>
            New collection
          </Button>
        </div>
      )}
    </div>
  );
}

/** What a smart collection matches: its saved search and how many Filters-panel groups it uses. */
function RuleSummary({ query, filters }: { query: string; filters: number }) {
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-2 text-muted">
      <Sparkles aria-hidden className="size-3.5" />
      <span>Every asset that matches</span>
      {query && <span className="rounded-md bg-active px-2 py-0.5 font-mono text-xs text-fg-2">{query}</span>}
      {filters > 0 && (
        <span className="rounded-md bg-active px-2 py-0.5 text-xs text-fg-2">
          {filters} {filters === 1 ? "filter" : "filters"}
        </span>
      )}
      {!query && !filters && <span>anything</span>}
    </div>
  );
}
