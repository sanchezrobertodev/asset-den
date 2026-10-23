import clsx from "clsx";
import { ChevronRight, CircleArrowUp, Folder, FolderOpen, Keyboard, LoaderCircle, Monitor, Moon, Plus, RefreshCw, Settings, Sparkles, Sun, X } from "lucide-react";
import { openUpdates, useAppUpdate } from "../appUpdate";
import { UpdateNotice } from "./AppUpdate";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { smartMembers } from "../lib/filter";
import { treeFor, type FolderNode } from "../lib/folders";
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
  const { favorites, byKind, total } = useMemo(() => {
    const byKind = new Map<string, number>();
    let favorites = 0;
    let total = 0;
    for (const a of s.assets) {
      byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + a.size);
      if (a.favorite) favorites++;
      total += a.size;
    }
    return { favorites, byKind, total };
  }, [s.assets]);
  const smart = useMemo(() => smartMembers(s.collections, s.assets, s.notes, s.palettes), [s.collections, s.assets, s.notes, s.palettes]);

  const nav: { view: ViewName; label: string; count?: number; badge?: number }[] = [
    { view: "library", label: "Library", count: s.assets.length },
    { view: "favorites", label: "Favorites", count: favorites },
    { view: "collections", label: "Collections", count: s.collections.length },
    { view: "duplicates", label: "Duplicates", badge: s.dups?.length || undefined },
    { view: "insights", label: "Insights" },
  ];
  const ThemeIcon = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : Monitor;
  const updatesSupported = useAppUpdate((u) => u.supported);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);

  return (
    <aside aria-label="Library" className="flex min-h-0 flex-col border-r border-line px-2.5">
      <div className="flex h-[60px] flex-none items-center gap-2.5 px-2">
        <svg aria-hidden viewBox="0 0 1024 1024" className="size-[22px] flex-none">
          {/* Same mark as app-icon.svg, the source of src-tauri/icons. */}
          <rect width="1024" height="1024" rx="228" fill="#1b1915" />
          <rect x="176" y="268" width="392" height="528" rx="72" fill="#6aa7f2" transform="rotate(-15 372 532)" />
          <rect x="456" y="268" width="392" height="528" rx="72" fill="#f2b84b" transform="rotate(15 652 532)" />
          <rect x="316" y="228" width="392" height="560" rx="72" fill="#5ad68e" stroke="#1b1915" strokeWidth="36" paintOrder="stroke" />
          <circle cx="604" cy="360" r="52" fill="#1b1915" />
          <path d="M376 700 L484 548 L556 632 L604 580 L652 700 Z" fill="#1b1915" stroke="#1b1915" strokeWidth="28" strokeLinejoin="round" />
        </svg>
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
                {c.rule ? (
                  <Sparkles aria-label="Smart collection" className="size-3 flex-none" style={{ color: collColor(i) }} />
                ) : (
                  <span aria-hidden className="size-2 flex-none rounded-[2px]" style={{ background: collColor(i) }} />
                )}
                <span className="truncate">{c.name}</span>
              </span>
              <span className="font-mono text-[11px] text-faint">{(smart.get(c.id)?.length ?? c.assetIds.length).toLocaleString()}</span>
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
        <div role="tree" aria-label="Folders" className="flex flex-col gap-px">
          <FolderTree />
          {!s.roots.length && (
            <button type="button" onClick={() => void s.importFolder()} className="px-3 py-1 text-left text-xs text-muted hover:text-fg">
              + Import a folder
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-none flex-col gap-2 px-3 pt-4 pb-3">
        <UpdateNotice />
        <div className="flex min-w-0 flex-col gap-0.5 text-xs">
          <span className="truncate text-fg-2" title={s.roots.map((r) => r.path).join("\n")}>
            {s.roots.length === 1 ? baseName(s.roots[0].path) : `${s.roots.length} folders`}
          </span>
          <span className="font-mono text-[11px] whitespace-nowrap text-faint">
            {bytes(total)} · {s.assets.length.toLocaleString()} files
          </span>
        </div>
        <div className="flex h-[5px] gap-0.5 overflow-hidden rounded-[3px] bg-line-soft" role="img" aria-label="Library size by type">
          {KINDS.filter((k) => byKind.get(k)).map((k) => (
            <div key={k} data-kind={k} title={`${kindLabel[k]}: ${bytes(byKind.get(k)!)}`} className="k-bar" style={{ width: `${Math.max(0.6, (byKind.get(k)! / (total || 1)) * 100)}%` }} />
          ))}
        </div>
      </div>
      {/* App controls live in their own bar so they never squeeze the library name. */}
      <div className="-mx-2.5 flex h-11 flex-none items-center gap-0.5 border-t border-line-soft px-3">
        <span className="mr-auto min-w-0 truncate font-mono text-[11px] text-faint" title={version ? `Asset Den ${version}` : undefined}>
          {version ? `v${version}` : ""}
        </span>
        {updatesSupported && (
          <IconButton label="Check for updates" className="size-7" onClick={openUpdates}>
            <CircleArrowUp className="size-4" />
          </IconButton>
        )}
        <IconButton label={`Theme: ${s.theme} (click to change)`} className="size-7" onClick={() => s.setTheme(nextTheme[s.theme])}>
          <ThemeIcon className="size-4" />
        </IconButton>
        <IconButton label="Keyboard shortcuts (?)" className="size-7" onClick={() => s.setModal("shortcuts")}>
          <Keyboard className="size-4" />
        </IconButton>
        <IconButton label="Settings" className="size-7" onClick={() => s.setModal("settings")}>
          <Settings className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
}

/** Expandable folder tree: roots at the top level, then their folders. Only open branches are rendered. */
function FolderTree() {
  const s = useStore();
  const tree = treeFor(s.assets, s.roots);
  const rows: { node: FolderNode; depth: number }[] = [];
  const walk = (n: FolderNode, depth: number) => {
    rows.push({ node: n, depth });
    if (s.expanded.has(n.key)) n.children.forEach((c) => walk(c, depth + 1));
  };
  // Roots with nothing indexed yet still get a row (e.g. while their first scan runs).
  s.roots.forEach((r) => walk(tree.find((t) => t.rootId === r.id) ?? { key: `${r.id}:`, rootId: r.id, path: "", name: baseName(r.path), count: 0, bytes: 0, children: [] }, 0));

  return rows.map(({ node: n, depth }) => {
    const isRoot = depth === 0;
    const open = s.expanded.has(n.key);
    const active = s.view === "library" && s.folder?.rootId === n.rootId && s.folder.path === n.path;
    const scanning = isRoot ? s.scanning[n.rootId] : undefined;
    const Icon = active ? FolderOpen : Folder;
    return (
      <div key={n.key} role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-level={depth + 1} aria-selected={active} className="group relative flex items-center">
        <span className="flex w-5 flex-none justify-center" style={{ marginLeft: 4 + depth * 14 }}>
          {n.children.length > 0 && (
            <button
              type="button"
              aria-label={`${open ? "Collapse" : "Expand"} ${n.name}`}
              onClick={() => s.toggleExpanded(n.key)}
              className="flex size-5 items-center justify-center rounded text-muted hover:bg-active hover:text-fg"
            >
              <ChevronRight aria-hidden className={clsx("size-3.5 transition-transform duration-150", open && "rotate-90")} />
            </button>
          )}
        </span>
        <button
          type="button"
          title={isRoot ? s.roots.find((r) => r.id === n.rootId)?.path : n.path}
          onClick={() => s.go("library", { folder: { rootId: n.rootId, path: n.path } })}
          onDoubleClick={() => n.children.length && s.toggleExpanded(n.key)}
          className={clsx(
            "flex h-[30px] min-w-0 flex-1 items-center gap-1.5 rounded-lg pr-3 pl-1 text-left",
            active ? "bg-active font-medium text-fg" : isRoot ? "text-fg hover:bg-hover" : "text-fg-2 hover:bg-hover",
            isRoot && !active && "font-medium",
          )}
        >
          <Icon aria-hidden className={clsx("size-3.5 flex-none", active ? "text-accent" : "text-muted")} />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          <span className={clsx("flex items-center gap-1 font-mono text-[11px] text-faint", isRoot && "group-hover:invisible group-focus-within:invisible")} aria-live={isRoot ? "polite" : undefined}>
            {scanning !== undefined && <LoaderCircle aria-label="Scanning" className="size-3 animate-spin" />}
            {(scanning ?? n.count).toLocaleString()}
          </span>
        </button>
        {isRoot && (
          <div className="absolute top-0 right-1 hidden h-full items-center gap-0.5 group-focus-within:flex group-hover:flex">
            <IconButton label={`Rescan ${n.name}`} className="size-6" onClick={() => void s.rescan(n.rootId)}>
              <RefreshCw className="size-3.5" />
            </IconButton>
            <IconButton label={`Remove ${n.name} from the library (files stay on disk)`} className="size-6 hover:text-danger" onClick={() => void s.removeRoot(n.rootId)}>
              <X className="size-3.5" />
            </IconButton>
          </div>
        )}
      </div>
    );
  });
}
