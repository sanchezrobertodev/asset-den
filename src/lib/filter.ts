import type { Asset, Collection, Kind, View } from "../types";
import { folderOf } from "./format.ts";
import type { SortKey } from "./prefs";

/** Extra filters from the toolbar's Filters panel. null / empty means "any". */
export interface Filters {
  exts: string[];
  minW: number | null;
  maxW: number | null;
  minH: number | null;
  maxH: number | null;
  square: boolean;
  minBytes: number | null;
  maxBytes: number | null;
  /** Modified within this many days. */
  days: number | null;
  untagged: boolean;
  /** Has at least one of these tags. */
  anyTags: string[];
}

export const noFilters: Filters = {
  exts: [],
  minW: null,
  maxW: null,
  minH: null,
  maxH: null,
  square: false,
  minBytes: null,
  maxBytes: null,
  days: null,
  untagged: false,
  anyTags: [],
};

/** How many filter groups are active, for the toolbar badge. */
export function activeFilterCount(f: Filters): number {
  const dims = f.minW !== null || f.maxW !== null || f.minH !== null || f.maxH !== null || f.square;
  const bytes = f.minBytes !== null || f.maxBytes !== null;
  return [f.exts.length > 0, dims, bytes, f.days !== null, f.untagged, f.anyTags.length > 0].filter(Boolean).length;
}

export function matchesFilters(a: Asset, f: Filters, now = Date.now()): boolean {
  if (f.exts.length && !f.exts.includes(a.ext)) return false;
  // Dimension filters only make sense for images with known dimensions.
  if (f.minW !== null || f.maxW !== null || f.minH !== null || f.maxH !== null || f.square) {
    if (!a.width || !a.height) return false;
    if (f.minW !== null && a.width < f.minW) return false;
    if (f.maxW !== null && a.width > f.maxW) return false;
    if (f.minH !== null && a.height < f.minH) return false;
    if (f.maxH !== null && a.height > f.maxH) return false;
    if (f.square && a.width !== a.height) return false;
  }
  if (f.minBytes !== null && a.size < f.minBytes) return false;
  if (f.maxBytes !== null && a.size > f.maxBytes) return false;
  if (f.days !== null && a.mtime < now - f.days * 86_400_000) return false;
  if (f.untagged && a.tags.length) return false;
  if (f.anyTags.length && !a.tags.some((t) => f.anyTags.includes(t))) return false;
  return true;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const compare: Record<SortKey, (a: Asset, b: Asset) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  kind: (a, b) => a.kind.localeCompare(b.kind) || collator.compare(a.name, b.name),
  size: (a, b) => a.size - b.size,
  mtime: (a, b) => a.mtime - b.mtime,
  folder: (a, b) => collator.compare(folderOf(a.relPath), folderOf(b.relPath)) || collator.compare(a.name, b.name),
};

/** Assets in the current view that match the search, kind and panel filters, sorted. */
export function visibleAssets(
  assets: Asset[],
  view: View,
  query: string,
  kinds: Kind[],
  filters: Filters,
  collections: Collection[],
  sort: { key: SortKey; desc: boolean },
): Asset[] {
  const inCollection =
    view.type === "collection" ? new Set(collections.find((c) => c.id === view.id)?.assetIds ?? []) : null;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now();
  const out = assets.filter((a) => {
    if (view.type === "favorites" && !a.favorite) return false;
    if (view.type === "root" && a.rootId !== view.id) return false;
    if (view.type === "tag" && !a.tags.includes(view.tag)) return false;
    if (inCollection && !inCollection.has(a.id)) return false;
    if (kinds.length && !kinds.includes(a.kind)) return false;
    if (!matchesFilters(a, filters, now)) return false;
    // Every term must match the path or a tag; "#term" matches tags only.
    const hay = a.relPath.toLowerCase();
    return terms.every((t) =>
      t.startsWith("#") ? a.tags.some((g) => g.startsWith(t.slice(1))) : hay.includes(t) || a.tags.includes(t),
    );
  });
  const dir = sort.desc ? -1 : 1;
  return out.sort((a, b) => dir * compare[sort.key](a, b));
}
