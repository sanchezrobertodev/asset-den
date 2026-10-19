import clsx from "clsx";
import {
  ChartColumn,
  Copy,
  Folder,
  FolderPlus,
  Layers,
  Library,
  LoaderCircle,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { baseName, kindLabel } from "../lib/format";
import { useStore } from "../store";
import { KINDS, type View } from "../types";
import { IconButton, KindIcon } from "./ui";

function same(a: View, b: View) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="flex h-7 items-center justify-between px-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {action}
      </div>
      <ul className="mt-0.5 space-y-px px-1.5">{children}</ul>
    </section>
  );
}

function Row({
  icon,
  label,
  count,
  active,
  onClick,
  title,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  count?: number | ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
  trailing?: ReactNode;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-150",
          active ? "bg-accent/15 font-medium text-fg" : "text-fg/90 hover:bg-surface-hover",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={clsx("font-mono text-[11px] text-muted", trailing && "group-hover:invisible group-focus-within:invisible")}>
          {count}
        </span>
      </button>
      {trailing && (
        <div className="absolute top-0 right-1 hidden h-8 items-center group-focus-within:flex group-hover:flex">
          {trailing}
        </div>
      )}
    </li>
  );
}

export function Sidebar() {
  const s = useStore();
  const [newCollection, setNewCollection] = useState<string | null>(null);

  const counts = useMemo(() => {
    const byRoot = new Map<number, number>();
    const byKind = new Map<string, number>();
    const byTag = new Map<string, number>();
    let favorites = 0;
    for (const a of s.assets) {
      byRoot.set(a.rootId, (byRoot.get(a.rootId) ?? 0) + 1);
      byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
      for (const t of a.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
      if (a.favorite) favorites++;
    }
    return { byRoot, byKind, byTag, favorites };
  }, [s.assets]);
  const tags = [...counts.byTag.keys()].sort();
  const iconCls = "size-4 shrink-0 text-muted";

  const submitCollection = async () => {
    const name = newCollection?.trim();
    setNewCollection(null);
    if (!name) return;
    const id = await s.createCollection(name);
    if (id !== null) s.setView({ type: "collection", id });
  };

  return (
    <nav aria-label="Library" className="h-full w-60 shrink-0 overflow-y-auto border-r border-border bg-surface pb-4">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <Layers aria-hidden className="size-5 text-accent" />
        <span className="font-mono text-sm font-semibold">Asset Den</span>
      </div>

      <Section title="Library">
        <Row
          icon={<Library aria-hidden className={iconCls} />}
          label="All assets"
          count={s.assets.length}
          active={same(s.view, { type: "all" })}
          onClick={() => s.setView({ type: "all" })}
        />
        <Row
          icon={<Star aria-hidden className={iconCls} />}
          label="Favorites"
          count={counts.favorites}
          active={same(s.view, { type: "favorites" })}
          onClick={() => s.setView({ type: "favorites" })}
        />
      </Section>

      <Section
        title="Folders"
        action={
          <IconButton label="Add folder" onClick={() => void s.addRoot()} className="size-7">
            <FolderPlus className="size-4" />
          </IconButton>
        }
      >
        {s.roots.map((r) => {
          const scanning = s.scanning[r.id];
          return (
            <Row
              key={r.id}
              icon={<Folder aria-hidden className={iconCls} />}
              label={baseName(r.path)}
              title={r.path}
              count={
                scanning !== undefined ? (
                  <span className="flex items-center gap-1" aria-live="polite">
                    <LoaderCircle aria-label="Scanning" className="size-3 animate-spin" />
                    {scanning}
                  </span>
                ) : (
                  counts.byRoot.get(r.id) ?? 0
                )
              }
              active={same(s.view, { type: "root", id: r.id })}
              onClick={() => s.setView({ type: "root", id: r.id })}
              trailing={
                <>
                  <IconButton label={`Rescan ${baseName(r.path)}`} className="size-7" onClick={() => void s.rescan(r.id)}>
                    <RefreshCw className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${baseName(r.path)} from the library (files stay on disk)`}
                    className="size-7 hover:text-danger"
                    onClick={() => void s.removeRoot(r.id)}
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </>
              }
            />
          );
        })}
        {!s.roots.length && <li className="px-2 py-1 text-xs text-muted">No folders yet.</li>}
      </Section>

      <Section title="Types">
        {KINDS.filter((k) => counts.byKind.get(k)).map((k) => (
          <li key={k}>
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-hover">
              <input
                type="checkbox"
                checked={s.kinds.includes(k)}
                onChange={() => s.toggleKind(k)}
                className="size-3.5 accent-[var(--accent)]"
              />
              <KindIcon kind={k} className="size-4" />
              <span className="flex-1">{kindLabel[k]}</span>
              <span className="font-mono text-[11px] text-muted">{counts.byKind.get(k)}</span>
            </label>
          </li>
        ))}
      </Section>

      {tags.length > 0 && (
        <Section title="Tags">
          {tags.map((t) => (
            <Row
              key={t}
              icon={<Tag aria-hidden className={iconCls} />}
              label={t}
              count={counts.byTag.get(t)}
              active={same(s.view, { type: "tag", tag: t })}
              onClick={() => s.setView({ type: "tag", tag: t })}
            />
          ))}
        </Section>
      )}

      <Section
        title="Collections"
        action={
          <IconButton label="New collection" onClick={() => setNewCollection("")} className="size-7">
            <Plus className="size-4" />
          </IconButton>
        }
      >
        {s.collections.map((c) => (
          <Row
            key={c.id}
            icon={<Layers aria-hidden className={iconCls} />}
            label={c.name}
            count={c.assetIds.length}
            active={same(s.view, { type: "collection", id: c.id })}
            onClick={() => s.setView({ type: "collection", id: c.id })}
            trailing={
              <IconButton
                label={`Delete collection ${c.name} (assets stay)`}
                className="size-7 hover:text-danger"
                onClick={() => void s.deleteCollection(c.id)}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            }
          />
        ))}
        {newCollection !== null && (
          <li className="px-1">
            <input
              autoFocus
              aria-label="Collection name"
              placeholder="Collection name"
              value={newCollection}
              maxLength={80}
              onChange={(e) => setNewCollection(e.target.value)}
              onBlur={() => void submitCollection()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCollection();
                if (e.key === "Escape") setNewCollection(null);
              }}
              className="h-8 w-full rounded-md border border-border-strong bg-bg px-2 text-[13px]"
            />
          </li>
        )}
        {!s.collections.length && newCollection === null && (
          <li className="px-2 py-1 text-xs text-muted">Group assets for a level or a pack.</li>
        )}
      </Section>

      <Section title="Tools">
        <Row
          icon={<Copy aria-hidden className={iconCls} />}
          label="Duplicates"
          count={s.duplicates?.length}
          active={same(s.view, { type: "duplicates" })}
          onClick={() => s.setView({ type: "duplicates" })}
        />
        <Row
          icon={<ChartColumn aria-hidden className={iconCls} />}
          label="Stats"
          active={same(s.view, { type: "stats" })}
          onClick={() => s.setView({ type: "stats" })}
        />
      </Section>
    </nav>
  );
}
