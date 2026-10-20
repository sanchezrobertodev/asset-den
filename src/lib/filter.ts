import type { Asset, Collection, FolderFilter, Kind, Root, ViewName } from "../types";
import { folderOf, kindLabel } from "./format.ts";
import type { SortKey } from "./prefs";

/** Extra filters from the Filters panel. null / empty means "any". */
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

/** How many filter groups are active, for the badge on the Filters button. */
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

/** A search like `type:audio in:sprites #player size:>1mb hero`, as used by the search bar and the ⌘K palette. */
export interface Query {
  /** null = any type; an empty array = a `type:` that matched nothing. */
  types: Kind[] | null;
  folder: string | null;
  tags: string[];
  minBytes: number;
  maxBytes: number;
  text: string[];
}

const UNITS: Record<string, number> = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 ** 3 };

export function parseQuery(q: string): Query {
  const out: Query = { types: null, folder: null, tags: [], minBytes: 0, maxBytes: Infinity, text: [] };
  for (const t of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (t.startsWith("type:")) {
      const s = t.slice(5);
      if (!s) continue;
      const hits = (Object.keys(kindLabel) as Kind[]).filter((k) => k.startsWith(s) || kindLabel[k].toLowerCase().startsWith(s));
      out.types = [...(out.types ?? []), ...hits];
    } else if (t.startsWith("in:")) {
      if (t.length > 3) out.folder = t.slice(3);
    } else if (t.startsWith("#")) {
      if (t.length > 1) out.tags.push(t.slice(1));
    } else if (t.startsWith("size:")) {
      const m = t.slice(5).match(/^([<>])?(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
      if (!m) continue;
      const b = parseFloat(m[2]) * UNITS[m[3] ?? "kb"];
      if (m[1] === "<") out.maxBytes = b;
      else out.minBytes = b;
    } else out.text.push(t);
  }
  return out;
}

export function matchesQuery(a: Asset, q: Query): boolean {
  if (q.types && !q.types.includes(a.kind)) return false;
  if (q.folder && !folderOf(a.relPath).toLowerCase().split("/").some((seg) => seg.startsWith(q.folder!))) return false;
  if (!q.tags.every((t) => a.tags.some((g) => g.startsWith(t)))) return false;
  if (a.size < q.minBytes || a.size > q.maxBytes) return false;
  const hay = a.relPath.toLowerCase();
  return q.text.every((t) => hay.includes(t) || a.tags.includes(t));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const compare: Record<SortKey, (a: Asset, b: Asset) => number> = {
  name: (a, b) => collator.compare(a.name, b.name),
  kind: (a, b) => a.kind.localeCompare(b.kind) || collator.compare(a.name, b.name),
  size: (a, b) => a.size - b.size,
  mtime: (a, b) => a.mtime - b.mtime,
  folder: (a, b) => collator.compare(folderOf(a.relPath), folderOf(b.relPath)) || collator.compare(a.name, b.name),
};

export interface Scope {
  view: ViewName;
  kinds: Kind[];
  folder: FolderFilter | null;
  query: string;
  filters: Filters;
  /** The open collection, for the Collections view. */
  collection: Collection | null;
}

/** Assets the current view shows, after type chips, folder, search and Filters panel, sorted. */
export function visibleAssets(assets: Asset[], s: Scope, sort: { key: SortKey; desc: boolean }): Asset[] {
  const members = s.view === "collections" ? new Set(s.collection?.assetIds ?? []) : null;
  const q = parseQuery(s.query);
  const now = Date.now();
  const out = assets.filter((a) => {
    if (members) return members.has(a.id);
    if (s.view === "favorites" && !a.favorite) return false;
    if (s.kinds.length && !s.kinds.includes(a.kind)) return false;
    if (s.folder) {
      if (a.rootId !== s.folder.rootId) return false;
      if (s.folder.path && !(a.relPath === s.folder.path || a.relPath.startsWith(s.folder.path + "/"))) return false;
    }
    return matchesFilters(a, s.filters, now) && matchesQuery(a, q);
  });
  const dir = sort.desc ? -1 : 1;
  return out.sort((a, b) => dir * compare[sort.key](a, b));
}

export interface Group {
  key: string;
  label: string;
  items: Asset[];
  bytes: number;
}

/** Splits a sorted list into folder groups (keeping the sort inside each), folders in name order. */
export function groupByFolder(list: Asset[], roots: Root[]): Group[] {
  const rootName = new Map(roots.map((r) => [r.id, r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path]));
  const multi = roots.length > 1;
  const groups = new Map<string, Group>();
  for (const a of list) {
    const folder = folderOf(a.relPath);
    const key = `${a.rootId}:${folder}`;
    let g = groups.get(key);
    if (!g) {
      const label = [multi ? rootName.get(a.rootId) : "", folder].filter(Boolean).join("/") || rootName.get(a.rootId) || "/";
      g = { key, label, items: [], bytes: 0 };
      groups.set(key, g);
    }
    g.items.push(a);
    g.bytes += a.size;
  }
  return [...groups.values()].sort((a, b) => collator.compare(a.label, b.label));
}
