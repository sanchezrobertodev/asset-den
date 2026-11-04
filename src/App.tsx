import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SettingsDialog } from "./components/Settings";
import { ShortcutsDialog } from "./components/Shortcuts";
import { Sidebar } from "./components/Sidebar";
import { Button, focusAssets, Kbd, modalOpen } from "./components/ui";
import { Welcome } from "./components/Welcome";
import { activeFilterCount, groupByFolder, parseQuery, rulesWantColors, visibleAssets } from "./lib/filter";
import { parentOf } from "./lib/folders";
import { baseName, folderOf } from "./lib/format";
import { applyTheme, onSystemThemeChange } from "./lib/prefs";
import { shortcut } from "./lib/shortcuts";
import { useStore } from "./store";
import type { Asset } from "./types";

/** The library's hint bar, in order. */
const HINTS = ["peek", "full", "move", "favorite", "rate", "unrate", "search"].map(shortcut);

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/** Space and Enter press a focused button, and arrows move inside menus and radio groups, instead of the app shortcuts. */
function ownsKey(t: EventTarget | null, key: string) {
  const el = t instanceof HTMLElement ? t : null;
  if (!el || el === document.body || el.closest("[data-assets]")) return false;
  if (key === " " || key === "Enter")
    return el.matches("button, a[href], summary, [role=button], [role=checkbox], [role=switch], [role=radio], [role=option], [role^=menuitem]");
  return key.startsWith("Arrow") && !!el.closest("[role=radiogroup], [role=menu], [role=listbox], details");
}

function Toast() {
  const { toast, dismissToast } = useStore();
  // Always mounted, so screen readers announce each message as it appears.
  return (
    <div aria-live={toast?.error ? "assertive" : "polite"} className="pointer-events-none absolute inset-x-0 bottom-6 z-[80] flex justify-center">
      {toast && (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto flex max-w-[min(720px,90%)] items-center gap-3.5 rounded-[11px] bg-invert-bg py-2.5 pr-3 pl-4 text-invert-fg shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]",
            toast.error && "border-l-4 border-danger",
          )}
        >
          <span className="font-medium">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                dismissToast();
                Promise.resolve().then(toast.undo).catch(useStore.getState().setError);
              }}
              className="h-7 rounded-[7px] bg-bg px-2.5 font-semibold whitespace-nowrap text-fg"
            >
              {toast.action ?? "Undo"}
            </button>
          )}
          {toast.error && (
            <button type="button" onClick={dismissToast} className="h-7 rounded-[7px] px-2 font-semibold opacity-70 hover:opacity-100">
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Tells screen readers when a scan starts and ends, without reading every count update. */
function ScanStatus() {
  const { scanning, roots } = useStore();
  const names = Object.keys(scanning)
    .map((id) => baseName(roots.find((r) => r.id === Number(id))?.path ?? ""))
    .join(", ");
  const [message, setMessage] = useState("");
  useEffect(
    () =>
      setMessage((prev) =>
        names ? `Scanning ${names}…` : prev ? `Scan finished. ${useStore.getState().assets.length.toLocaleString()} files in the library.` : "",
      ),
    [names],
  );
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
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
    void useAppUpdate.getState().init();
    const off = onSystemThemeChange(() => applyTheme(useStore.getState().theme, useStore.getState().accent));
    return off;
  }, []);

  const collection = s.collections.find((c) => c.id === s.colSel) ?? null;
  const similar = s.similar?.ids ?? null;
  const wantsColors = !!s.filters.color || parseQuery(s.query).colors.length > 0 || rulesWantColors(s.collections);
  // Colours only matter to a colour filter; otherwise their updates during an analysis pass mustn't re-sort the list.
  const palettes = wantsColors ? s.palettes : null;
  const scope = { view: s.view, kinds: s.kinds, folder: s.folder, subfolders: s.subfolders, query: s.query, filters: s.filters, collection, notes: s.notes, similar, palettes };
  const visible = useMemo(
    () => visibleAssets(s.assets, scope, s.sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.assets, s.view, s.kinds, s.folder, s.subfolders, s.query, s.filters, collection, s.notes, s.sort, similar, palettes],
  );
  // Same scope without the type chips, so each chip can show its count. Only counted, so not sorted.
  const scopeAssets = useMemo(
    () => visibleAssets(s.assets, { ...scope, kinds: [] }, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.assets, s.view, s.folder, s.subfolders, s.query, s.filters, collection, s.notes, similar, palettes],
  );
  useEffect(() => {
    if (wantsColors) void useStore.getState().loadPalettes();
  }, [wantsColors]);
  const browse = s.view === "library" || s.view === "favorites";
  const navigable = browse || s.view === "collections";
  const groups = useMemo(
    // "Find similar" results stay in one list, closest first.
    () => ((browse || s.view === "collections") && s.grouped && !similar ? groupByFolder(visible, s.roots, browse ? s.folder : null) : null),
    [browse, s.view, s.grouped, similar, visible, s.roots, s.folder],
  );
  // In Duplicates, full screen steps through the copies of the open group.
  const copies = useMemo(() => {
    const g = s.view === "duplicates" ? s.dups?.find((d) => d.hash === s.dupSel) : null;
    return g ? g.ids.map((id) => s.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a) : null;
  }, [s.view, s.dups, s.dupSel, s.assets]);
  const order = useMemo(() => copies ?? (groups ? groups.flatMap((g) => g.items) : visible), [copies, groups, visible]);
  const active = s.assets.find((a) => a.id === s.activeId) ?? null;
  const peekOn = s.peek && !!active && (navigable || s.full);

  // A link to another view (Insights rows, the duplicate banner, search actions) goes away with the old view: land on the new one.
  const lastView = useRef(s.view);
  useEffect(() => {
    if (lastView.current !== s.view && document.activeElement === document.body) focusAssets();
    lastView.current = s.view;
  }, [s.view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      // A dialog handles its own keys (Escape closes it).
      if (st.modal || modalOpen()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.setPalette(!st.palette);
        return;
      }
      if (st.palette) return;
      if (typing(e.target)) {
        // Esc leaves the field for the asset list, where the shortcuts work again.
        if (e.key === "Escape") focusAssets();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        st.setModal("shortcuts");
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
      if ((!navigable && !st.full) || ownsKey(e.target, e.key)) return;
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
        const want = new Set(ids);
        const items = st.assets.filter((a) => want.has(a.id));
        if (items.length) void st.setFavorite(ids, !items.every((a) => a.favorite));
      } else if (/^[0-5]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ids = st.selected.size ? [...st.selected] : st.activeId !== null ? [st.activeId] : [];
        if (ids.length) void st.setRating(ids, Number(e.key));
      } else if (e.key.toLowerCase() === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        st.setSelected(order.map((a) => a.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, navigable]);

  const scanning = Object.keys(s.scanning).length > 0;
  const filtered = s.query || s.kinds.length > 0 || s.folder !== null || activeFilterCount(s.filters) > 0 || !!similar;
  // Whether the open folder holds any files itself, before any filter; decides which empty state fits.
  const hasDirectFiles = useMemo(
    () => !!s.folder && s.assets.some((a) => a.rootId === s.folder!.rootId && folderOf(a.relPath) === s.folder!.path),
    [s.assets, s.folder],
  );

  return (
    <div className="relative grid h-full grid-cols-[220px_minmax(0,1fr)] overflow-hidden bg-bg text-fg">
      <button
        type="button"
        onClick={focusAssets}
        className="absolute top-2 left-2 z-[90] -translate-y-[200%] rounded-[9px] bg-invert-bg px-3 py-2 font-semibold text-invert-fg focus:translate-y-0"
      >
        Skip to the assets
      </button>
      <Sidebar />
      <div className="grid min-h-0 min-w-0" style={{ gridTemplateColumns: `minmax(0,1fr) ${peekOn ? "clamp(300px,30vw,400px)" : "0px"}` }}>
        <main tabIndex={-1} className="flex min-h-0 min-w-0 flex-col focus-visible:outline-none">
          <Header />
          {browse && !s.roots.length && (
            <div className="min-h-0 flex-1">
              <Welcome />
            </div>
          )}
          {browse && s.roots.length > 0 && (
            <>
              <BrowseBar count={visible.length} folders={groups?.length ?? 0} scopeAssets={scopeAssets} />
              <div className="min-h-0 flex-1">
                {visible.length ? (
                  <AssetBrowser assets={order} groups={groups} />
                ) : scanning && !s.assets.length ? (
                  <Empty title="Scanning…" body="Assets appear here as soon as they're indexed." />
                ) : s.folder && !s.subfolders && !hasDirectFiles ? (
                  <Empty
                    title={`No files directly in ${s.folder.path ? baseName(s.folder.path) : "this folder"}`}
                    body="Its assets are in subfolders."
                    action={<Button onClick={() => s.setSubfolders(true)}>Include subfolders</Button>}
                  />
                ) : s.similar && s.view === "library" ? (
                  <Empty
                    title={`Nothing looks like ${s.similar.name}`}
                    body={`No other analysed image is within ${s.similar.max} bits of it. Try a looser match above.`}
                    action={<Button onClick={s.clearSimilar}>Back to the library</Button>}
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
          {s.view === "collections" && <CollectionsView items={order} groups={groups} scopeAssets={scopeAssets} />}
          {s.view === "duplicates" && <DuplicatesView visible={visible} scopeAssets={scopeAssets} />}
          {s.view === "insights" && <InsightsView />}
          {navigable && !peekOn && !s.palette && !s.full && order.length > 0 && (
            <div className="pointer-events-none absolute bottom-3.5 left-[236px] z-[5] flex items-center gap-3.5 rounded-[9px] border border-line-soft bg-bg/90 px-3 py-1.5 text-xs whitespace-nowrap text-faint">
              {HINTS.map((h) => (
                <span key={h.id}>
                  <Kbd>{h.keys}</Kbd> {h.hint}
                </span>
              ))}
              <span>
                <Kbd>?</Kbd> all shortcuts
              </span>
            </div>
          )}
          <ScanStatus />
        </main>
        {peekOn && <Peek list={order} />}
      </div>

      {s.full && active && <FullView list={order} />}
      {s.palette && <Palette />}
      {s.modal === "shortcuts" && <ShortcutsDialog />}
      {s.modal === "settings" && <SettingsDialog />}
      <UpdateDialog />
      <Toast />
    </div>
  );
}
