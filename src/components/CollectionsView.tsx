import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeFilterCount, noFilters, rulesWantColors, smartMembers, type Group } from "../lib/filter";
import { bytes } from "../lib/format";
import { useStore } from "../store";
import type { Asset } from "../types";
import { AssetBrowser } from "./AssetBrowser";
import { BrowseBar } from "./Header";
import { Thumb } from "./Thumb";
import { Button, focusAssets } from "./ui";

/** `items` is the open collection's members after the type chips, search and filters, in display order. */
export function CollectionsView({ items, groups, scopeAssets }: { items: Asset[]; groups: Group[] | null; scopeAssets: Asset[] }) {
  const s = useStore();
  const byId = useMemo(() => new Map(s.assets.map((a) => [a.id, a])), [s.assets]);
  // Colours only matter to a colour rule; otherwise each batch of analysed images would recount every collection.
  const palettes = rulesWantColors(s.collections) ? s.palettes : null;
  const smart = useMemo(() => smartMembers(s.collections, s.assets, s.notes, palettes), [s.collections, s.assets, s.notes, palettes]);
  const searching = s.query.trim() !== "" || s.kinds.length > 0 || activeFilterCount(s.filters) > 0;
  const current = s.collections.find((c) => c.id === s.colSel) ?? null;
  const all = current ? (smart.get(current.id) ?? current.assetIds.map((id) => byId.get(id)).filter((a): a is Asset => !!a)) : [];
  // Selected assets shown in a plain collection, for "Remove". Ones hidden by the search or filters stay put.
  const removable = current && !current.rule ? items.filter((a) => s.selected.has(a.id)).map((a) => a.id) : [];
  const [name, setName] = useState(current?.name ?? "");
  useEffect(() => setName(current?.name ?? ""), [current?.id, current?.name]);

  // Esc reverts: the blur that follows must not save the typed name it still sees.
  const reverting = useRef(false);
  const commitName = async () => {
    if (!current) return;
    if (reverting.current) {
      reverting.current = false;
      return setName(current.name);
    }
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
                  {c.rule && <Sparkles role="img" aria-label="Smart collection" className="size-3.5 flex-none text-muted" />}
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
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-none flex-col gap-3 px-7 pt-[22px]">
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
                  if (e.key === "Enter") focusAssets();
                  if (e.key === "Escape") {
                    reverting.current = true;
                    focusAssets();
                  }
                }}
                className="border-0 border-b border-dashed border-transparent bg-transparent p-0 text-[26px] font-semibold tracking-[-.02em] text-fg focus:border-line-x"
              />
              <span className="font-mono text-xs text-muted">
                {all.length.toLocaleString()} {all.length === 1 ? "asset" : "assets"} · {bytes(all.reduce((n, a) => n + a.size, 0))}
              </span>
            </div>
            {removable.length > 0 && (
              <Button
                onClick={() => {
                  focusAssets();
                  void s.setInCollection(current.id, removable, false);
                }}
              >
                Remove {removable.length === 1 ? "1 asset" : `${removable.length.toLocaleString()} assets`}
              </Button>
            )}
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
            <Button variant="accent" disabled={!all.length} onClick={() => void s.copyCollection(current.id)}>
              Copy to folder…
            </Button>
          </div>
          {current.rule && <RuleSummary query={current.rule.query} filters={activeFilterCount({ ...noFilters, ...current.rule.filters })} />}
          </div>
          {all.length > 0 && <BrowseBar count={items.length} folders={groups?.length ?? 0} scopeAssets={scopeAssets} />}
          <div className="min-h-0 flex-1">
            {items.length > 0 ? (
              <AssetBrowser assets={items} groups={groups} />
            ) : all.length > 0 ? (
              <Hint title="No assets in this collection match these filters" body="Try removing a type, search or filter.">
                <Button onClick={s.clearFilters}>Clear search and filters</Button>
              </Hint>
            ) : current.rule ? (
              <Hint title="Nothing matches this smart collection yet" body="Its assets appear here as soon as files match its search." />
            ) : (
              <Hint
                title="This collection is empty"
                body="Add assets from any side panel, or select assets in the library and tick this collection in the side panel."
              />
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

function Hint({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-7 text-center text-muted">
      <span className="text-[15px] font-medium text-fg">{title}</span>
      <span className="max-w-md">{body}</span>
      {children && <div className="mt-2">{children}</div>}
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
