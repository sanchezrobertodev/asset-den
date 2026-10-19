import { CircleAlert, FolderPlus, SearchX, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { AssetBrowser } from "./components/AssetBrowser";
import { DetailPanel, openAsset } from "./components/DetailPanel";
import { QuickView } from "./components/QuickView";
import { Sidebar } from "./components/Sidebar";
import { DuplicatesView, StatsView } from "./components/ToolViews";
import { Toolbar } from "./components/Toolbar";
import { Button, IconButton, Kbd } from "./components/ui";
import { visibleAssets } from "./lib/filter";
import { applyTheme, onSystemThemeChange } from "./lib/prefs";
import { useStore } from "./store";

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export default function App() {
  const s = useStore();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void useStore.getState().init();
    return onSystemThemeChange(() => applyTheme(useStore.getState().theme));
  }, []);

  const visible = useMemo(
    () => visibleAssets(s.assets, s.view, s.query, s.kinds, s.collections, s.sort),
    [s.assets, s.view, s.query, s.kinds, s.collections, s.sort],
  );
  const selectedAssets = useMemo(() => s.assets.filter((a) => s.selected.has(a.id)), [s.assets, s.selected]);
  // Quick view follows the active asset, which may be outside the list (e.g. opened from Duplicates).
  const active = s.assets.find((a) => a.id === s.activeId) ?? null;
  const activeIndex = visible.findIndex((a) => a.id === s.activeId);
  const toolView = s.view.type === "duplicates" || s.view.type === "stats";

  const step = (delta: number) => {
    if (!visible.length) return;
    const i = activeIndex < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, activeIndex + delta));
    s.select(visible[i].id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === "Escape") {
        if (st.quickView) st.setQuickView(false);
        else if (!typing(e.target)) st.setSelected([]);
        return;
      }
      if (typing(e.target) || (toolView && !st.quickView)) return;
      const cols = st.layout === "grid" && !st.quickView ? st.cols : 1;
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
      if (e.key in moves) {
        e.preventDefault();
        step(moves[e.key]);
      } else if (e.key === " ") {
        e.preventDefault();
        if (st.quickView) st.setQuickView(false);
        else {
          if (st.activeId === null && visible.length) st.select(visible[0].id);
          st.setQuickView(true);
        }
      } else if (e.key === "Enter" && active) {
        void openAsset(active);
      } else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey && selectedAssets.length) {
        void st.setFavorite(
          selectedAssets.map((a) => a.id),
          !selectedAssets.every((a) => a.favorite),
        );
      } else if (e.key === "/" && !st.quickView) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "a" && (e.ctrlKey || e.metaKey) && !st.quickView) {
        e.preventDefault();
        st.setSelected(visible.map((a) => a.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {!toolView && <Toolbar count={visible.length} searchRef={searchRef} />}
        {s.error && (
          <div role="alert" className="flex items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2 text-[13px] text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{s.error}</span>
            <IconButton label="Dismiss" className="size-6 text-danger" onClick={() => s.setError(null)}>
              <X className="size-3.5" />
            </IconButton>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {s.view.type === "duplicates" ? (
              <DuplicatesView />
            ) : s.view.type === "stats" ? (
              <StatsView />
            ) : !s.roots.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <FolderPlus aria-hidden className="size-12 text-accent" />
                <div>
                  <h1 className="text-lg font-semibold">Add your first asset folder</h1>
                  <p className="mt-1 max-w-md text-[13px] text-muted">
                    Asset Den indexes the sprites, sounds, models, fonts and videos in it and keeps watching for changes.
                    Your files are only read, never changed.
                  </p>
                </div>
                <Button variant="primary" onClick={() => void s.addRoot()}>
                  <FolderPlus aria-hidden className="size-4" /> Add folder
                </Button>
              </div>
            ) : !visible.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
                <SearchX aria-hidden className="size-8" />
                {Object.keys(s.scanning).length ? "Scanning…" : "Nothing matches."}
              </div>
            ) : (
              <AssetBrowser assets={visible} />
            )}
          </div>
          {!toolView && <DetailPanel items={selectedAssets} />}
        </div>
        {!toolView && (
          <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface px-4 text-[11px] text-muted">
            <span>
              <Kbd>Space</Kbd> quick view
            </span>
            <span>
              <Kbd>←↑→↓</Kbd> move
            </span>
            <span>
              <Kbd>Enter</Kbd> open
            </span>
            <span>
              <Kbd>F</Kbd> favorite
            </span>
            <span>Drag cards into your engine or a folder to copy them</span>
          </footer>
        )}
      </main>
      {s.quickView && active && (
        <QuickView asset={active} index={activeIndex} total={visible.length} onStep={step} />
      )}
    </div>
  );
}
