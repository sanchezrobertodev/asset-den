import { create } from "zustand";
import { api, errorText } from "./api";
import { applyTheme, loadPrefs, savePrefs, type Layout, type Prefs, type SortKey, type Theme } from "./lib/prefs";
import type { Asset, Collection, Kind, Root, View } from "./types";

interface State extends Prefs {
  roots: Root[];
  assets: Asset[];
  collections: Collection[];
  /** Files indexed so far, per root being scanned. */
  scanning: Record<number, number>;
  error: string | null;
  view: View;
  query: string;
  kinds: Kind[];
  selected: Set<number>;
  activeId: number | null;
  quickView: boolean;
  /** Grid columns, so arrow up/down can move a whole row. */
  cols: number;
  duplicates: number[][] | null;
  findingDuplicates: boolean;

  init: () => Promise<void>;
  reload: () => Promise<void>;
  addRoot: () => Promise<void>;
  removeRoot: (id: number) => Promise<void>;
  rescan: (id: number) => Promise<void>;
  setError: (e: unknown) => void;
  setView: (v: View) => void;
  setQuery: (q: string) => void;
  toggleKind: (k: Kind) => void;
  setSort: (key: SortKey) => void;
  setLayout: (l: Layout) => void;
  setThumbSize: (n: number) => void;
  setTheme: (t: Theme) => void;
  setPixelated: (p: boolean) => void;
  setCols: (n: number) => void;
  /** Click selection: plain replaces, toggle adds/removes, range extends from the active item over `order`. */
  select: (id: number, mode?: "replace" | "toggle" | "range", order?: number[]) => void;
  setSelected: (ids: number[]) => void;
  setQuickView: (open: boolean) => void;
  setFavorite: (ids: number[], favorite: boolean) => Promise<void>;
  addTag: (ids: number[], tag: string) => Promise<void>;
  removeTag: (ids: number[], tag: string) => Promise<void>;
  createCollection: (name: string) => Promise<number | null>;
  deleteCollection: (id: number) => Promise<void>;
  setInCollection: (collection: number, ids: number[], member: boolean) => Promise<void>;
  findDuplicates: () => Promise<void>;
}

const prefs = loadPrefs();

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { theme, sort, layout, thumbSize, pixelated } = get();
    savePrefs({ theme, sort, layout, thumbSize, pixelated });
  };
  const patchAssets = (ids: number[], f: (a: Asset) => Asset) => {
    const s = new Set(ids);
    set((st) => ({ assets: st.assets.map((a) => (s.has(a.id) ? f(a) : a)) }));
  };
  /** Runs a backend write; on failure shows the error and reloads, undoing any optimistic change. */
  const write = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      set({ error: errorText(e) });
      await get().reload();
    }
  };

  return {
    ...prefs,
    roots: [],
    assets: [],
    collections: [],
    scanning: {},
    error: null,
    view: { type: "all" },
    query: "",
    kinds: [],
    selected: new Set(),
    activeId: null,
    quickView: false,
    cols: 1,
    duplicates: null,
    findingDuplicates: false,

    init: async () => {
      await api.onScanProgress((p) =>
        set((s) => {
          const scanning = { ...s.scanning };
          if (p.done) delete scanning[p.rootId];
          else scanning[p.rootId] = p.count;
          return { scanning };
        }),
      );
      let pending: ReturnType<typeof setTimeout> | null = null;
      await api.onAssetsChanged(() => {
        // Bursts of file events arrive close together; reload once.
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => void get().reload(), 150);
      });
      await get().reload();
    },

    reload: async () => {
      try {
        const [roots, assets, collections] = await Promise.all([
          api.listRoots(),
          api.listAssets(),
          api.listCollections(),
        ]);
        const ids = new Set(assets.map((a) => a.id));
        set((s) => ({
          roots,
          assets: assets as Asset[],
          collections,
          selected: new Set([...s.selected].filter((id) => ids.has(id))),
          activeId: s.activeId !== null && ids.has(s.activeId) ? s.activeId : null,
          quickView: s.quickView && s.activeId !== null && ids.has(s.activeId),
          duplicates: s.duplicates?.map((g) => g.filter((id) => ids.has(id))).filter((g) => g.length > 1) ?? null,
        }));
      } catch (e) {
        set({ error: errorText(e) });
      }
    },

    addRoot: async () => {
      const path = await api.pickFolder();
      if (!path) return;
      try {
        const root = await api.addRoot(path);
        set((s) => ({ roots: [...s.roots, root], scanning: { ...s.scanning, [root.id]: 0 }, view: { type: "root", id: root.id } }));
      } catch (e) {
        set({ error: errorText(e) });
      }
    },
    removeRoot: async (id) => {
      await write(() => api.removeRoot(id));
      set((s) => ({ view: s.view.type === "root" && s.view.id === id ? { type: "all" } : s.view }));
      await get().reload();
    },
    rescan: async (id) => {
      set((s) => ({ scanning: { ...s.scanning, [id]: 0 } }));
      await write(() => api.rescan(id));
    },
    setError: (e) => set({ error: e === null ? null : errorText(e) }),

    setView: (view) => set({ view, selected: new Set(), activeId: null, quickView: false }),
    setQuery: (query) => set({ query }),
    toggleKind: (k) => set((s) => ({ kinds: s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k] })),
    setSort: (key) => {
      set((s) => ({ sort: { key, desc: s.sort.key === key ? !s.sort.desc : key === "mtime" || key === "size" } }));
      persist();
    },
    setLayout: (layout) => {
      set({ layout });
      persist();
    },
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
    setCols: (cols) => set({ cols }),

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
    setQuickView: (quickView) => set((s) => ({ quickView: quickView && s.activeId !== null })),

    setFavorite: async (ids, favorite) => {
      patchAssets(ids, (a) => ({ ...a, favorite }));
      await write(() => api.setFavorite(ids, favorite));
    },
    addTag: async (ids, raw) => {
      try {
        const tag = await api.addTag(ids, raw);
        patchAssets(ids, (a) => (a.tags.includes(tag) ? a : { ...a, tags: [...a.tags, tag].sort() }));
      } catch (e) {
        set({ error: errorText(e) });
      }
    },
    removeTag: async (ids, tag) => {
      patchAssets(ids, (a) => ({ ...a, tags: a.tags.filter((t) => t !== tag) }));
      await write(() => api.removeTag(ids, tag));
    },
    createCollection: async (name) => {
      try {
        const id = await api.createCollection(name);
        set({ collections: await api.listCollections() });
        return id;
      } catch (e) {
        set({ error: errorText(e) });
        return null;
      }
    },
    deleteCollection: async (id) => {
      set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
        view: s.view.type === "collection" && s.view.id === id ? { type: "all" } : s.view,
      }));
      await write(() => api.deleteCollection(id));
    },
    setInCollection: async (collection, ids, member) => {
      set((s) => ({
        collections: s.collections.map((c) =>
          c.id !== collection
            ? c
            : {
                ...c,
                assetIds: member
                  ? [...new Set([...c.assetIds, ...ids])]
                  : c.assetIds.filter((id) => !ids.includes(id)),
              },
        ),
      }));
      await write(() => api.setInCollection(collection, ids, member));
    },
    findDuplicates: async () => {
      set({ findingDuplicates: true });
      try {
        set({ duplicates: await api.findDuplicates() });
      } catch (e) {
        set({ error: errorText(e) });
      } finally {
        set({ findingDuplicates: false });
      }
    },
  };
});
