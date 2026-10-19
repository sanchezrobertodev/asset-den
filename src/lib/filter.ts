import type { Asset, Collection, Kind, View } from "../types";
import { folderOf } from "./format";
import type { SortKey } from "./prefs";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const compare: Record<SortKey, (a: Asset, b: Asset) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  kind: (a, b) => a.kind.localeCompare(b.kind) || collator.compare(a.name, b.name),
  size: (a, b) => a.size - b.size,
  mtime: (a, b) => a.mtime - b.mtime,
  folder: (a, b) => collator.compare(folderOf(a.relPath), folderOf(b.relPath)) || collator.compare(a.name, b.name),
};

/** Assets in the current view that match the search and kind filters, sorted. */
export function visibleAssets(
  assets: Asset[],
  view: View,
  query: string,
  kinds: Kind[],
  collections: Collection[],
  sort: { key: SortKey; desc: boolean },
): Asset[] {
  const inCollection =
    view.type === "collection" ? new Set(collections.find((c) => c.id === view.id)?.assetIds ?? []) : null;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = assets.filter((a) => {
    if (view.type === "favorites" && !a.favorite) return false;
    if (view.type === "root" && a.rootId !== view.id) return false;
    if (view.type === "tag" && !a.tags.includes(view.tag)) return false;
    if (inCollection && !inCollection.has(a.id)) return false;
    if (kinds.length && !kinds.includes(a.kind)) return false;
    // Every term must match the path or a tag; "#term" matches tags only.
    const hay = a.relPath.toLowerCase();
    return terms.every((t) =>
      t.startsWith("#") ? a.tags.some((g) => g.startsWith(t.slice(1))) : hay.includes(t) || a.tags.includes(t),
    );
  });
  const dir = sort.desc ? -1 : 1;
  return out.sort((a, b) => dir * compare[sort.key](a, b));
}
