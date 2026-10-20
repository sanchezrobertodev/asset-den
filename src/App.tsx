import clsx from "clsx";
import { useEffect, useMemo } from "react";
import { useAppUpdate } from "./appUpdate";
import { UpdateDialog } from "./components/AppUpdate";
import { AssetBrowser } from "./components/AssetBrowser";
import { CollectionsView } from "./components/CollectionsView";
import { DuplicatesView } from "./components/DuplicatesView";
import { FullView } from "./components/FullView";
import { BrowseBar, Header } from "./components/Header";
import { InsightsView } from "./components/InsightsView";
import { Palette } from "./components/Palette";
import { Peek } from "./components/Peek";
import { Sidebar } from "./components/Sidebar";
import { Button, Kbd } from "./components/ui";
import { activeFilterCount, groupByFolder, visibleAssets } from "./lib/filter";
import { parentOf } from "./lib/folders";
import { baseName, folderOf } from "./lib/format";
import { applyTheme, onSystemThemeChange } from "./lib/prefs";
import { useStore } from "./store";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function Toast() {
  const { toast, dismissToast } = useStore();
  if (!toast) return null;
  return (
    <div
      role={toast.error ? "alert" : "status"}
      className={clsx(
        "absolute bottom-6 left-1/2 z-[80] flex max-w-[min(720px,90%)] -translate-x-1/2 items-center gap-3.5 rounded-[11px] bg-invert-bg py-2.5 pr-3 pl-4 text-invert-fg shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]",
        toast.error && "border-l-4 border-danger",
      )}
    >
      <span className="font-medium">{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            dismissToast();
            void toast.undo!();
          }}
          className="h-7 rounded-[7px] bg-bg px-2.5 font-semibold text-fg"
        >
          Undo
        </button>
      )}
      {toast.error && (
        <button type="button" onClick={dismissToast} className="h-7 rounded-[7px] px-2 font-semibold opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center text-muted">
      <span className="text-[15px] font-medium text-fg">{title}</span>
      <span>{body}</span>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export default function App() {
  const s = useStore();

  useEffect(() => {
    void useStore.getState().init();
    // Quietly look for a new version once the library is up; failures (offline, no release yet) stay silent.
    const t = setTimeout(() => void useAppUpdate.getState().check({ quiet: true }), 4000);
    const off = onSystemThemeChange(() => applyTheme(useStore.getState().theme));
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);

  const collection = s.collections.find((c) => c.id === s.colSel) ?? null;
  const scope = { view: s.view, kinds: s.kinds, folder: s.folder, subfolders: s.subfolders, query: s.query, filters: s.filters, collection };
  const visible = useMemo(
    () => visibleAssets(s.assets, scope, s.sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.assets, s.view, s.kinds, s.folder, s.subfolders, s.query, s.filters, collection, s.sort],
  );
  // Same scope without the type chips, so each chip can show its count.
  const scopeAssets = useMemo(
    () => visibleAssets(s.assets, { ...scope, kinds: [] }, s.sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.assets, s.view, s.folder, s.subfolders, s.query, s.filters, collection, s.sort],
  );
  const browse = s.view === "library" || s.view === "favorites";
  const navigable = browse || s.view === "collections";
  const groups = useMemo(
    () => (browse && s.grouped ? groupByFolder(visible, s.roots, s.folder) : null),
    [browse, s.grouped, visible, s.roots, s.folder],
  );
  const order = useMemo(() => (groups ? groups.flatMap((g) => g.items) : visible), [groups, visible]);
  const active = s.assets.find((a) => a.id === s.activeId) ?? null;
  const peekOn = s.peek && !!active && (navigable || s.full);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.setPalette(!st.palette);
        return;
      }
      if (st.palette) return;
      if (typing(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        st.setPalette(true);
        return;
      }
      if (e.altKey && e.key === "ArrowUp" && st.folder?.path && (st.view === "library" || st.view === "favorites")) {
        e.preventDefault();
        st.setFolder(parentOf(st.folder));
        return;
      }
      if (e.key === "Escape") {
        if (st.full) st.setFull(false);
        else if (st.peek) st.setPeek(false);
        else st.setSelected([]);
        return;
      }
      if (!navigable && !st.full) return;
      const i = order.findIndex((a) => a.id === st.activeId);
      const ensureActive = () => {
        if (st.activeId === null && order.length) st.select(order[0].id);
        return st.activeId !== null || order.length > 0;
      };
      if (e.key === " ") {
        e.preventDefault();
        if (st.full) st.setFull(false);
        else if (ensureActive()) st.setPeek(!st.peek);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (ensureActive()) st.setFull(true);
      } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) && order.length) {
        e.preventDefault();
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
        st.select(order[((i < 0 ? 0 : i + d) + order.length) % order.length].id);
      } else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        const ids = st.selected.size ? [...st.selected] : st.activeId !== null ? [st.activeId] : [];
        const items = st.assets.filter((a) => ids.includes(a.id));
        if (items.length) void st.setFavorite(ids, !items.every((a) => a.favorite));
      } else if (e.key.toLowerCase() === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        st.setSelected(order.map((a) => a.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, navigable]);

  const scanning = Object.keys(s.scanning).length > 0;
  const filtered = s.query || s.kinds.length > 0 || s.folder !== null || activeFilterCount(s.filters) > 0;
  // Whether the open folder holds any files itself, before any filter; decides which empty state fits.
  const hasDirectFiles = useMemo(
    () => !!s.folder && s.assets.some((a) => a.rootId === s.folder!.rootId && folderOf(a.relPath) === s.folder!.path),
    [s.assets, s.folder],
  );

  return (
    <div className="relative grid h-full grid-cols-[220px_minmax(0,1fr)] overflow-hidden bg-bg text-fg">
      <Sidebar />
      <div className="grid min-h-0 min-w-0" style={{ gridTemplateColumns: `minmax(0,1fr) ${peekOn ? "clamp(300px,30vw,400px)" : "0px"}` }}>
        <section className="flex min-h-0 min-w-0 flex-col">
          <Header />
          {browse && (
            <>
              <BrowseBar count={visible.length} folders={groups?.length ?? 0} scopeAssets={scopeAssets} />
              <div className="min-h-0 flex-1">
                {!s.roots.length ? (
                  <Empty
                    title="Import your first asset folder"
                    body="Asset Den indexes the sprites, sounds, models, fonts and videos in it and keeps watching for changes."
                    action={
                      <Button variant="accent" size="lg" onClick={() => void s.importFolder()}>
                        Import a folder
                      </Button>
                    }
                  />
                ) : visible.length ? (
                  <AssetBrowser assets={order} groups={groups} />
                ) : scanning && !s.assets.length ? (
                  <Empty title="Scanning…" body="Assets appear here as soon as they're indexed." />
                ) : s.folder && !s.subfolders && !hasDirectFiles ? (
                  <Empty
                    title={`No files directly in ${s.folder.path ? baseName(s.folder.path) : "this folder"}`}
                    body="Its assets are in subfolders."
                    action={<Button onClick={() => s.setSubfolders(true)}>Include subfolders</Button>}
                  />
                ) : s.view === "favorites" && !filtered ? (
                  <Empty title="No favorites yet" body="Press F on any asset to add it here." />
                ) : (
                  <Empty
                    title="No assets match these filters"
                    body="Try removing a type, folder or search filter."
                    action={<Button onClick={s.clearFilters}>Clear search and filters</Button>}
                  />
                )}
              </div>
            </>
          )}
          {s.view === "collections" && <CollectionsView items={visible} />}
          {s.view === "duplicates" && <DuplicatesView />}
          {s.view === "insights" && <InsightsView />}
        </section>
        {peekOn && <Peek list={s.view === "collections" ? visible : order} />}
      </div>

      {s.full && active && <FullView list={s.view === "collections" ? visible : order} />}
      {s.palette && <Palette />}
      <UpdateDialog />
      <Toast />
      {navigable && !peekOn && !s.palette && !s.full && order.length > 0 && (
        <div className="pointer-events-none absolute bottom-3.5 left-[236px] z-[5] flex items-center gap-3.5 rounded-[9px] border border-line-soft bg-bg/90 px-3 py-1.5 text-xs text-faint">
          <span>
            <Kbd>Space</Kbd> quick view
          </span>
          <span>
            <Kbd>↵</Kbd> full screen
          </span>
          <span>
            <Kbd>← →</Kbd> move
          </span>
          <span>
            <Kbd>F</Kbd> favorite
          </span>
          <span>
            <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd> search
          </span>
        </div>
      )}
    </div>
  );
}
