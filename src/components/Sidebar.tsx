import clsx from "clsx";
import { LoaderCircle, Monitor, Moon, Plus, RefreshCw, Sun, X } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { baseName, bytes, kindLabel } from "../lib/format";
import type { Theme } from "../lib/prefs";
import { useStore } from "../store";
import { KINDS, type ViewName } from "../types";
import { IconButton, Label } from "./ui";

/** Collection colors from the design, by position. */
const COLL_HUES = [75, 25, 250, 152, 300];
export const collColor = (i: number) => `oklch(0.72 0.12 ${COLL_HUES[i % COLL_HUES.length]})`;

const nextTheme: Record<Theme, Theme> = { system: "dark", dark: "light", light: "system" };

function NavItem({
  label,
  active,
  onClick,
  count,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex items-center justify-between rounded-lg px-3 py-[9px] text-left transition-colors duration-150",
        active ? "bg-active font-medium text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
      )}
    >
      <span>{label}</span>
      {badge ? (
        <span className="rounded-[9px] bg-warn-bg px-[7px] py-px text-[11px] font-semibold text-warn-fg">{badge}</span>
      ) : count !== undefined ? (
        <span className="font-mono text-[11px] text-faint">{count.toLocaleString()}</span>
      ) : null}
    </button>
  );
}

function Row({ active, onClick, title, children, trailing }: { active: boolean; onClick: () => void; title?: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-current={active ? "true" : undefined}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-[7px] text-left text-fg-2",
          active ? "bg-hover" : "hover:bg-hover",
        )}
      >
        {children}
      </button>
      {trailing && (
        <div className="absolute top-0 right-1 hidden h-full items-center gap-0.5 group-focus-within:flex group-hover:flex">{trailing}</div>
      )}
    </div>
  );
}

export function Sidebar() {
  const s = useStore();
  const { favorites, byRoot, byKind, total } = useMemo(() => {
    const byRoot = new Map<number, number>();
    const byKind = new Map<string, number>();
    let favorites = 0;
    let total = 0;
    for (const a of s.assets) {
      byRoot.set(a.rootId, (byRoot.get(a.rootId) ?? 0) + 1);
      byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + a.size);
      if (a.favorite) favorites++;
      total += a.size;
    }
    return { favorites, byRoot, byKind, total };
  }, [s.assets]);

  const nav: { view: ViewName; label: string; count?: number; badge?: number }[] = [
    { view: "library", label: "Library", count: s.assets.length },
    { view: "favorites", label: "Favorites", count: favorites },
    { view: "collections", label: "Collections", count: s.collections.length },
    { view: "duplicates", label: "Duplicates", badge: s.dups?.length || undefined },
    { view: "insights", label: "Insights" },
  ];
  const ThemeIcon = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : Monitor;

  return (
    <aside aria-label="Library" className="flex min-h-0 flex-col border-r border-line px-2.5">
      <div className="flex h-[60px] flex-none items-center gap-2.5 px-2">
        <div aria-hidden className="size-[22px] rounded-md bg-accent" />
        <span className="text-[15px] font-semibold tracking-[-.01em]">Asset Den</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map((n) => (
          <NavItem
            key={n.view}
            label={n.label}
            count={n.count}
            badge={n.badge}
            active={s.view === n.view}
            onClick={() => s.go(n.view)}
          />
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 pt-[22px] pb-1.5">
          <Label>Collections</Label>
          <IconButton label="New collection" className="size-6" onClick={() => void s.newCollection()}>
            <Plus className="size-4" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-px">
          {s.collections.map((c, i) => (
            <Row key={c.id} active={s.view === "collections" && s.colSel === c.id} onClick={() => s.go("collections", { colSel: c.id })}>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 flex-none rounded-[2px]" style={{ background: collColor(i) }} />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="font-mono text-[11px] text-faint">{c.assetIds.length}</span>
            </Row>
          ))}
          {!s.collections.length && <p className="px-3 py-1 text-xs text-faint">Group assets for a level or a pack.</p>}
        </div>

        <div className="flex items-center justify-between px-3 pt-[22px] pb-1.5">
          <Label>Folders</Label>
          <IconButton label="Import a folder" className="size-6" onClick={() => void s.importFolder()}>
            <Plus className="size-4" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-px">
          {s.roots.map((r) => {
            const scanning = s.scanning[r.id];
            const name = baseName(r.path);
            return (
              <Row
                key={r.id}
                title={r.path}
                active={s.view === "library" && s.folder?.rootId === r.id && !s.folder.path}
                onClick={() => s.go("library", { folder: { rootId: r.id, path: "" } })}
                trailing={
                  <>
                    <IconButton label={`Rescan ${name}`} className="size-6" onClick={() => void s.rescan(r.id)}>
                      <RefreshCw className="size-3.5" />
                    </IconButton>
                    <IconButton label={`Remove ${name} from the library (files stay on disk)`} className="size-6 hover:text-danger" onClick={() => void s.removeRoot(r.id)}>
                      <X className="size-3.5" />
                    </IconButton>
                  </>
                }
              >
                <span className="truncate">{name}</span>
                <span className="flex items-center gap-1 font-mono text-[11px] text-faint group-hover:invisible group-focus-within:invisible" aria-live="polite">
                  {scanning !== undefined && <LoaderCircle aria-label="Scanning" className="size-3 animate-spin" />}
                  {scanning !== undefined ? scanning.toLocaleString() : (byRoot.get(r.id) ?? 0).toLocaleString()}
                </span>
              </Row>
            );
          })}
          {!s.roots.length && <p className="px-3 py-1 text-xs text-faint">No folders yet.</p>}
        </div>
      </div>

      <div className="flex flex-none flex-col gap-2 px-3 py-4">
        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <span className="truncate text-fg-2">{s.roots.length === 1 ? baseName(s.roots[0].path) : `${s.roots.length} folders`}</span>
            <span className="font-mono text-[11px] whitespace-nowrap text-faint">
              {bytes(total)} · {s.assets.length.toLocaleString()} files
            </span>
          </div>
          <IconButton label={`Theme: ${s.theme} (click to change)`} className="size-7" onClick={() => s.setTheme(nextTheme[s.theme])}>
            <ThemeIcon className="size-4" />
          </IconButton>
        </div>
        <div className="flex h-[5px] gap-0.5 overflow-hidden rounded-[3px] bg-line-soft" role="img" aria-label="Library size by type">
          {KINDS.filter((k) => byKind.get(k)).map((k) => (
            <div key={k} data-kind={k} title={`${kindLabel[k]}: ${bytes(byKind.get(k)!)}`} className="k-bar" style={{ width: `${Math.max(0.6, (byKind.get(k)! / (total || 1)) * 100)}%` }} />
          ))}
        </div>
      </div>
    </aside>
  );
}
