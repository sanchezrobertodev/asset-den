import { create } from "zustand";
import { api, errorText } from "./api";
import { toLab, type LabSwatch, type Swatch } from "./lib/colors";
import { applyDeltas, deltasAfter, type AssetsDelta } from "./lib/delta";
import { noFilters, parseQuery, ruleMatcher, type Filters } from "./lib/filter";
import { ancestorKeys } from "./lib/folders";
import { latestRequest } from "./lib/latest";
import { applyTheme, loadPrefs, savePrefs, type Layout, type Prefs, type SortKey, type Theme } from "./lib/prefs";
import type { AnalysisStatus, Asset, Collection, CollectionRule, DupGroup, FolderFilter, Kind, Notes, Root, SpriteSheet, ViewName } from "./types";

export interface Toast {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
  /** Label of the `undo` button, when it does something else. */
  action?: string;
  error?: boolean;
}

interface State extends Prefs {
  roots: Root[];
  assets: Asset[];
  collections: Collection[];
  /** Files indexed so far, per root being scanned. */
  scanning: Record<number, number>;
  view: ViewName;
  kinds: Kind[];
  folder: FolderFilter | null;
  query: string;
  filters: Filters;
  selected: Set<number>;
  activeId: number | null;
  /** Side panel with the active asset (Space). */
  peek: boolean;
  /** Full-screen view of the active asset (Enter). */
  full: boolean;
  palette: boolean;
  /** Open app dialog: keyboard shortcuts (?) or Settings. */
  modal: "shortcuts" | "settings" | null;
  toast: Toast | null;
  /** Open collection in the Collections view. */
  colSel: number | null;
  dups: DupGroup[] | null;
  /** The open duplicate group, by hash. */
  dupSel: string | null;
  /** Folder-tree nodes that are open, by folder key. */
  expanded: Set<string>;
  /** Most recently opened folders, newest first. */
  recentFolders: FolderFilter[];
  /** Saved sprite-sheet slicing by asset id, loaded on demand; null when the asset has none. */
  sheets: Record<number, SpriteSheet | null>;
  /** Every asset note, loaded with the library: the side panel edits them and `note:` searches them. */
  notes: Notes;
  /** Dominant colours by image id, loaded the first time a colour filter is used; null until then. */
  palettes: Map<number, LabSwatch[]> | null;
  /** How many images are analysed for colours and similarity, and the analysis pass the user started. */
  analysis: AnalysisStatus;
  /** "Find similar" scope of the library: images like `id` within `max` bits, closest first. */
  similar: { id: number; name: string; max: number; ids: number[] } | null;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  importFolder: () => Promise<void>;
  removeRoot: (id: number) => Promise<void>;
  rescan: (id: number) => Promise<void>;
  setError: (e: unknown) => void;
  showToast: (message: string, undo?: Toast["undo"], action?: string) => void;
  dismissToast: () => void;
  go: (view: ViewName, extra?: Partial<Pick<State, "kinds" | "folder" | "colSel" | "dupSel" | "query">>) => void;
  setQuery: (q: string) => void;
  toggleKind: (k: Kind | "all") => void;
  setFolder: (f: FolderFilter | null) => void;
  setFilters: (f: Partial<Filters>) => void;
  /** Clears the Filters panel, type chips, folder and search. */
  clearFilters: () => void;
  setSort: (key: SortKey) => void;
  setLayout: (l: Layout) => void;
  setGrouped: (g: boolean) => void;
  setSubfolders: (on: boolean) => void;
  toggleExpanded: (key: string) => void;
  setThumbSize: (n: number) => void;
  setTheme: (t: Theme) => void;
  setPixelated: (p: boolean) => void;
  setCheckUpdates: (on: boolean) => void;
  setAudioLoop: (on: boolean) => void;
  /** Click selection: plain replaces, toggle adds/removes, range extends from the active item over `order`. */
  select: (id: number, mode?: "replace" | "toggle" | "range", order?: number[]) => void;
  setSelected: (ids: number[]) => void;
  setPeek: (open: boolean) => void;
  setFull: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setModal: (modal: State["modal"]) => void;
  setFavorite: (ids: number[], favorite: boolean) => Promise<void>;
  addTag: (ids: number[], tag: string) => Promise<void>;
  removeTag: (ids: number[], tag: string) => Promise<void>;
  /** 1 to 5 stars, or 0 to clear. */
  setRating: (ids: number[], rating: number) => Promise<void>;
  setNote: (id: number, note: string) => Promise<void>;
  newCollection: () => Promise<void>;
  /** Saves the current search (with its type chips and filters) as a smart collection. False if the name was refused. */
  saveSmartCollection: (name: string) => Promise<boolean>;
  /** Replaces a smart collection's search, by default with the current one. */
  setCollectionRule: (id: number, rule?: CollectionRule) => Promise<void>;
  renameCollection: (id: number, name: string) => Promise<boolean>;
  deleteCollection: (id: number) => Promise<void>;
  setInCollection: (collection: number, ids: number[], member: boolean) => Promise<void>;
  copyCollection: (id: number) => Promise<void>;
  findDuplicates: () => Promise<void>;
  ignoreDuplicate: (hash: string) => Promise<void>;
  trashDuplicates: (keep: number, remove: number[]) => Promise<void>;
  loadSheet: (id: number) => Promise<void>;
  saveSheet: (id: number, sheet: SpriteSheet) => Promise<void>;
  loadPalettes: () => Promise<void>;
  findSimilar: (id: number, max?: number) => Promise<void>;
  clearSimilar: () => void;
}

const prefs = loadPrefs();
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;
/** Number of the last delta `assets` includes; -1 until the first full load. */
let seq = -1;
/** Full loads in flight. Deltas wait in `incoming` meanwhile, and the load's `seq` says which of them it already has. */
let loading = 0;
let incoming: AssetsDelta[] = [];
/** The last note save; each one waits for the one before. */
let noteSaves: Promise<unknown> = Promise.resolve();
/** Colours reported while the palettes load, applied on top of what the load returns. */
let paletteBacklog: [number, Swatch[]][] | null = null;
/** "Find similar": answers to superseded (slider drags) or cancelled requests are dropped; re-asked as analysis goes on. */
const similarAsk = latestRequest<{ id: number; max: number }>(2000);
/** Ends "Find similar", including a request still on its way. */
const noSimilar = () => {
  similarAsk.cancel();
  return { similar: null };
};

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { theme, sort, layout, thumbSize, pixelated, grouped, subfolders, checkUpdates, audioLoop } = get();
    savePrefs({ theme, sort, layout, thumbSize, pixelated, grouped, subfolders, checkUpdates, audioLoop });
  };
  const patchAssets = (ids: number[], f: (a: Asset) => Asset) => {
    const s = new Set(ids);
    set((st) => ({ assets: st.assets.map((a) => (s.has(a.id) ? f(a) : a)) }));
  };
  /** Runs a backend write; on failure shows the error and reloads, undoing any optimistic change. */
  const write = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch (e) {
      get().setError(e);
      await get().reload();
      return false;
    }
  };
  /** Side effects of opening a folder: the tree expands down to it and it joins the recent list. */
  const folderState = (f: FolderFilter | null | undefined): Partial<State> => {
    if (!f) return {};
    const { expanded, recentFolders } = get();
    const same = (x: FolderFilter) => x.rootId === f.rootId && x.path === f.path;
    return {
      expanded: new Set([...expanded, ...ancestorKeys(f).slice(0, -1)]),
      recentFolders: [f, ...recentFolders.filter((x) => !same(x))].slice(0, 6),
    };
  };
  const nameOf = (id: number) => get().assets.find((a) => a.id === id)?.name ?? "asset";
  /** The current search as a smart-collection rule. Type chips become type: words, unless the query names types itself. */
  const currentRule = (): CollectionRule => {
    const { query, kinds, filters } = get();
    const types = parseQuery(query).types ? [] : kinds.map((k) => `type:${k}`);
    return { query: [query.trim(), ...types].filter(Boolean).join(" "), filters };
  };
  /** Forgets selection, the active asset, duplicate entries and cached slicings for assets that are gone. */
  const keepOnly = (s: State, has: (id: number) => boolean): Partial<State> => ({
    selected: new Set([...s.selected].filter(has)),
    activeId: s.activeId !== null && has(s.activeId) ? s.activeId : null,
    dups: s.dups?.map((g) => ({ ...g, ids: g.ids.filter(has) })).filter((g) => g.ids.length > 1) ?? null,
    // SQLite can reuse a deleted asset's id, so a removed asset's slicing must not stick to a new one.
    sheets: Object.fromEntries(Object.entries(s.sheets).filter(([id]) => has(Number(id)))),
    notes: Object.fromEntries(Object.entries(s.notes).filter(([id]) => has(Number(id)))),
    palettes: s.palettes && new Map([...s.palettes].filter(([id]) => has(id))),
  });
  /** Patches `assets` with the deltas received so far, or reloads everything if one went missing. True if it patched. */
  const applyIncoming = () => {
    if (loading || seq < 0) return false;
    const next = deltasAfter(seq, incoming);
    if (!next) {
      void get().reload();
      return false;
    }
    incoming = [];
    if (!next.length) return false;
    seq = next[next.length - 1].seq;
    set((s) => {
      const { assets, gone, changed } = applyDeltas(s.assets, next);
      const out: Partial<State> = gone.size ? { assets, ...keepOnly(s, (id) => !gone.has(id)) } : { assets };
      // A file's new version has no colours until it's analysed again, which with "keep analysed" off may be never.
      const palettes = out.palettes ?? s.palettes;
      if (changed.size && palettes) out.palettes = new Map([...palettes].filter(([id]) => !changed.has(id)));
      return out;
    });
    return true;
  };
  // A scan sends a delta per batch: apply the first right away, then at most once a second, or less often when an
  // update takes long to render (big libraries: every update re-sorts the whole list), so the UI stays responsive.
  let last = 0;
  let gap = 1000;
  let queued: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (queued) return;
    const wait = last + gap - Date.now();
    if (wait > 0) {
      queued = setTimeout(() => {
        queued = null;
        flush();
      }, wait);
      return;
    }
    last = Date.now();
    const t = performance.now();
    if (!applyIncoming()) return;
    // Two frames later the update has rendered; wait at least 4x that long before the next one.
    requestAnimationFrame(() => requestAnimationFrame(() => (gap = Math.max(1000, 4 * (performance.now() - t)))));
  };

  return {
    ...prefs,
    roots: [],
    assets: [],
    collections: [],
    scanning: {},
    view: "library",
    kinds: [],
    folder: null,
    query: "",
    filters: noFilters,
    selected: new Set(),
    activeId: null,
    peek: false,
    full: false,
    palette: false,
    modal: null,
    toast: null,
    sheets: {},
    notes: {},
    palettes: null,
    analysis: { done: 0, total: 0, running: false, paused: false, keep: false },
    similar: null,
    colSel: null,
    dups: null,
    dupSel: null,
    expanded: new Set(),
    recentFolders: [],

    init: async () => {
      await api.onAssetsDelta((d) => {
        incoming.push(d);
        flush();
      });
      await api.onScanProgress((p) =>
        set((s) => {
          const scanning = { ...s.scanning };
          if (p.done) delete scanning[p.rootId];
          else scanning[p.rootId] = p.count;
          return { scanning };
        }),
      );
      await api.onImageFeatures((colors) => {
        // Images analysed since can match the open "Find similar"; its results were a snapshot.
        similarAsk.again(({ id, max }) => void get().findSimilar(id, max));
        if (paletteBacklog) paletteBacklog.push(...colors);
        set((s) => {
          if (!s.palettes || paletteBacklog) return {};
          const palettes = new Map(s.palettes);
          for (const [id, c] of colors) palettes.set(id, toLab(c));
          return { palettes };
        });
      });
      await api.onAnalysisStatus((analysis) => set({ analysis }));
      api.analysisStatus().then((analysis) => set({ analysis }), get().setError);
      let pending: ReturnType<typeof setTimeout> | null = null;
      await api.onAssetsChanged(() => {
        // A scan or a burst of file events ended: catch up once, then refresh collections and re-check duplicates.
        if (pending) clearTimeout(pending);
        pending = setTimeout(async () => {
          applyIncoming();
          try {
            set({ collections: await api.listCollections() });
          } catch (e) {
            get().setError(e);
          }
          await get().findDuplicates();
        }, 150);
      });
      await get().reload();
      void get().findDuplicates();
    },

    reload: async () => {
      loading++;
      try {
        const [roots, list, collections, notes] = await Promise.all([api.listRoots(), api.listAssets(), api.listCollections(), api.listNotes()]);
        seq = list.seq;
        const ids = new Set(list.assets.map((a) => a.id));
        set((s) => ({
          roots,
          assets: list.assets,
          collections,
          colSel: collections.some((c) => c.id === s.colSel) ? s.colSel : (collections[0]?.id ?? null),
          ...keepOnly(s, (id) => ids.has(id)),
          notes,
        }));
      } catch (e) {
        // Keeping a gap would retry the failing load at once, forever. The next delta finds the gap and retries.
        incoming = [];
        get().setError(e);
      } finally {
        loading--;
      }
      // Deltas that arrived during the load, minus the ones it already had.
      applyIncoming();
    },

    importFolder: async () => {
      const path = await api.pickFolder();
      if (!path) return;
      try {
        const root = await api.addRoot(path);
        const folder = { rootId: root.id, path: "" };
        set((s) => ({ roots: [...s.roots, root], scanning: { ...s.scanning, [root.id]: 0 }, view: "library", folder, ...noSimilar(), ...folderState(folder) }));
      } catch (e) {
        get().setError(e);
      }
    },
    removeRoot: async (id) => {
      const root = get().roots.find((r) => r.id === id);
      await write(() => api.removeRoot(id));
      set((s) => ({ folder: s.folder?.rootId === id ? null : s.folder, recentFolders: s.recentFolders.filter((f) => f.rootId !== id) }));
      await get().reload();
      if (root) get().showToast(`Removed ${root.path} from the library. Files are untouched.`);
    },
    rescan: async (id) => {
      set((s) => ({ scanning: { ...s.scanning, [id]: 0 } }));
      await write(() => api.rescan(id));
    },

    setError: (e) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: { id: ++toastSeq, message: errorText(e), error: true } });
      toastTimer = setTimeout(() => get().dismissToast(), 8000);
    },
    showToast: (message, undo, action) => {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: { id: ++toastSeq, message, undo, action } });
      toastTimer = setTimeout(() => get().dismissToast(), 4500);
    },
    dismissToast: () => set({ toast: null }),

    go: (view, extra = {}) => set({ view, full: false, palette: false, ...noSimilar(), ...extra, ...folderState(extra.folder) }),
    setQuery: (query) => set({ query }),
    toggleKind: (k) =>
      set((s) => ({ kinds: k === "all" ? [] : s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k] })),
    setFolder: (folder) => set({ folder, ...noSimilar(), ...folderState(folder) }),
    setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
    clearFilters: () => set({ filters: noFilters, kinds: [], folder: null, query: "", ...noSimilar() }),
    setSort: (key) => {
      set((s) => ({ sort: { key, desc: s.sort.key === key ? !s.sort.desc : key === "mtime" || key === "size" } }));
      persist();
    },
    setLayout: (layout) => {
      set({ layout });
      persist();
    },
    setGrouped: (grouped) => {
      set({ grouped });
      persist();
    },
    setSubfolders: (subfolders) => {
      set({ subfolders });
      persist();
    },
    toggleExpanded: (key) =>
      set((s) => {
        const expanded = new Set(s.expanded);
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        return { expanded };
      }),
    setThumbSize: (thumbSize) => {
      set({ thumbSize });
      persist();
    },
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
      persist();
    },
    setPixelated: (pixelated) => {
      set({ pixelated });
      persist();
    },
    setCheckUpdates: (checkUpdates) => {
      set({ checkUpdates });
      persist();
    },
    setAudioLoop: (audioLoop) => {
      set({ audioLoop });
      persist();
    },

    // On a failed read the entry stays unknown, so a guess never overwrites a saved slicing.
    loadSheet: async (id) => {
      try {
        const sheet = await api.getSpriteSheet(id);
        set((st) => ({ sheets: { ...st.sheets, [id]: sheet } }));
      } catch (e) {
        get().setError(e);
      }
    },
    saveSheet: async (id, sheet) => {
      set((st) => ({ sheets: { ...st.sheets, [id]: sheet } }));
      try {
        await api.setSpriteSheet(id, sheet);
      } catch (e) {
        get().setError(e);
      }
    },

    loadPalettes: async () => {
      if (get().palettes || paletteBacklog) return;
      paletteBacklog = [];
      try {
        const rows = await api.imageColors();
        const palettes = new Map(rows.map(([id, c]) => [id, toLab(c)]));
        for (const [id, c] of paletteBacklog) palettes.set(id, toLab(c));
        set({ palettes });
      } catch (e) {
        get().setError(e);
      } finally {
        paletteBacklog = null;
      }
    },
    findSimilar: async (id, max = 10) => {
      const current = similarAsk.start({ id, max });
      try {
        const ids = await api.findSimilar(id, max);
        if (!current()) return;
        // A new image opens the library on its results; a new slider position or a refresh keeps the view as it is.
        const nav = get().similar?.id === id ? {} : { view: "library" as const, full: false, palette: false, query: "", kinds: [], folder: null };
        set({ ...nav, similar: { id, name: nameOf(id), max, ids } });
      } catch (e) {
        if (!current()) return;
        similarAsk.cancel(); // or every analysis batch would ask again and show the same error
        get().setError(e);
      }
    },
    clearSimilar: () => set(noSimilar()),

    select: (id, mode = "replace", order = []) =>
      set((s) => {
        if (mode === "toggle") {
          const selected = new Set(s.selected);
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          return { selected, activeId: id };
        }
        if (mode === "range" && s.activeId !== null) {
          const a = order.indexOf(s.activeId);
          const b = order.indexOf(id);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            return { selected: new Set(order.slice(lo, hi + 1)) };
          }
        }
        return { selected: new Set([id]), activeId: id };
      }),
    setSelected: (ids) => set({ selected: new Set(ids) }),
    setPeek: (peek) => set((s) => ({ peek: peek && s.activeId !== null, full: peek && s.full })),
    setFull: (full) => set((s) => ({ full: full && s.activeId !== null, peek: s.peek || full })),
    setPalette: (palette) => set({ palette }),
    setModal: (modal) => set({ modal, palette: false }),

    setFavorite: async (ids, favorite) => {
      patchAssets(ids, (a) => ({ ...a, favorite }));
      if (!(await write(() => api.setFavorite(ids, favorite)))) return;
      const what = ids.length === 1 ? nameOf(ids[0]) : `${ids.length} assets`;
      get().showToast(favorite ? `Added ${what} to Favorites` : `Removed ${what} from Favorites`, () =>
        get().setFavorite(ids, !favorite),
      );
    },
    addTag: async (ids, raw) => {
      try {
        const tag = await api.addTag(ids, raw.replace(/^#/, ""));
        patchAssets(ids, (a) => (a.tags.includes(tag) ? a : { ...a, tags: [...a.tags, tag].sort() }));
      } catch (e) {
        get().setError(e);
      }
    },
    removeTag: async (ids, tag) => {
      patchAssets(ids, (a) => ({ ...a, tags: a.tags.filter((t) => t !== tag) }));
      await write(() => api.removeTag(ids, tag));
    },
    setRating: async (ids, rating) => {
      // Previous ratings, grouped, so Undo restores each asset's own.
      const wanted = new Set(ids);
      const before = new Map<number, number[]>();
      for (const a of get().assets) {
        if (!wanted.has(a.id)) continue;
        const group = before.get(a.rating);
        if (group) group.push(a.id);
        else before.set(a.rating, [a.id]);
      }
      patchAssets(ids, (a) => ({ ...a, rating }));
      if (!(await write(() => api.setRating(ids, rating)))) return;
      const what = ids.length === 1 ? nameOf(ids[0]) : `${ids.length} assets`;
      get().showToast(rating ? `Rated ${what} ${"★".repeat(rating)}` : `Cleared the rating of ${what}`, async () => {
        for (const [r, group] of before) {
          patchAssets(group, (a) => ({ ...a, rating: r }));
          if (!(await write(() => api.setRating(group, r)))) return;
        }
      });
    },
    setNote: async (id, note) => {
      const text = note.trim();
      if ((get().notes[id] ?? "") === text) return;
      // Optimistic, so the next edit is compared with this one and not with a save still in flight; saves run one at a
      // time in the order they were made, so the last edit is the one that sticks.
      set((s) => {
        const notes = { ...s.notes };
        if (text) notes[id] = text;
        else delete notes[id];
        return { notes };
      });
      const run = noteSaves.then(() => api.setNote(id, note));
      noteSaves = run.catch(() => {});
      await write(() => run);
    },

    newCollection: async () => {
      const names = new Set(get().collections.map((c) => c.name));
      let name = "New collection";
      for (let i = 2; names.has(name); i++) name = `New collection ${i}`;
      try {
        const id = await api.createCollection(name);
        set({ collections: await api.listCollections() });
        get().go("collections", { colSel: id });
      } catch (e) {
        get().setError(e);
      }
    },
    saveSmartCollection: async (name) => {
      try {
        const id = await api.createCollection(name, currentRule());
        set({ collections: await api.listCollections() });
        get().go("collections", { colSel: id });
        return true;
      } catch (e) {
        get().setError(e);
        return false;
      }
    },
    setCollectionRule: async (id, rule = currentRule()) => {
      const c = get().collections.find((x) => x.id === id);
      if (!c?.rule) return;
      const old = c.rule;
      set((s) => ({ collections: s.collections.map((x) => (x.id === id ? { ...x, rule } : x)) }));
      if (!(await write(() => api.setCollectionRule(id, rule)))) return;
      get().showToast(`Updated the search of ${c.name}`, () => get().setCollectionRule(id, old));
    },
    renameCollection: async (id, name) => {
      try {
        const clean = await api.renameCollection(id, name);
        set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, name: clean } : c)) }));
        return true;
      } catch (e) {
        get().setError(e);
        return false;
      }
    },
    deleteCollection: async (id) => {
      const c = get().collections.find((x) => x.id === id);
      if (!c) return;
      set((s) => ({ collections: s.collections.filter((x) => x.id !== id) }));
      if (!(await write(() => api.deleteCollection(id)))) return;
      await get().reload();
      get().showToast(`Deleted ${c.name}. Files are untouched.`, async () => {
        const nid = await api.createCollection(c.name, c.rule);
        if (c.assetIds.length) await api.setInCollection(nid, c.assetIds, true);
        await get().reload();
        set({ colSel: nid });
      });
    },
    setInCollection: async (collection, ids, member) => {
      const name = get().collections.find((c) => c.id === collection)?.name ?? "collection";
      set((s) => ({
        collections: s.collections.map((c) =>
          c.id !== collection
            ? c
            : { ...c, assetIds: member ? [...new Set([...c.assetIds, ...ids])] : c.assetIds.filter((id) => !ids.includes(id)) },
        ),
      }));
      if (!(await write(() => api.setInCollection(collection, ids, member)))) return;
      const what = ids.length === 1 ? nameOf(ids[0]) : `${ids.length} assets`;
      get().showToast(member ? `Added ${what} to ${name}` : `Removed ${what} from ${name}`, () =>
        get().setInCollection(collection, ids, !member),
      );
    },
    copyCollection: async (id) => {
      const c = get().collections.find((x) => x.id === id);
      if (!c) return;
      const ids = c.rule ? get().assets.filter(ruleMatcher(c.rule, get().notes, undefined, get().palettes)).map((a) => a.id) : c.assetIds;
      if (!ids.length) return;
      const dest = await api.pickFolder(`Copy ${c.name} to…`);
      if (!dest) return;
      try {
        const r = await api.copyCollection(ids, dest);
        if (r.failed.length) get().setError(`Copied ${r.copied} files. ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}`);
        else get().showToast(`Copied ${r.copied} ${r.copied === 1 ? "file" : "files"} to ${dest}`);
      } catch (e) {
        get().setError(e);
      }
    },

    findDuplicates: async () => {
      try {
        set({ dups: await api.findDuplicates() });
      } catch (e) {
        get().setError(e);
      }
    },
    ignoreDuplicate: async (hash) => {
      set((s) => ({ dups: s.dups?.filter((g) => g.hash !== hash) ?? null }));
      if (!(await write(() => api.setDuplicateIgnored(hash, true)))) return;
      get().showToast("Marked as not duplicates", async () => {
        await api.setDuplicateIgnored(hash, false);
        await get().findDuplicates();
      });
    },
    trashDuplicates: async (keep, remove) => {
      const label = remove.length === 1 ? nameOf(remove[0]) : `${remove.length} copies`;
      try {
        await api.trashDuplicates(keep, remove);
        await get().reload();
        await get().findDuplicates();
        get().showToast(`Moved ${label} to the Trash. You can restore it from there.`);
      } catch (e) {
        get().setError(e);
        await get().reload();
      }
    },
  };
});
