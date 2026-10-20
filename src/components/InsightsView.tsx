import { useMemo } from "react";
import { baseName, bytes, folderOf, kindLabel } from "../lib/format";
import { useStore } from "../store";
import { KINDS, type Kind } from "../types";

const card = "flex flex-col rounded-xl border border-line bg-card px-5 py-[18px]";
const pct = (r: number) => (r < 0.001 ? "<0.1%" : `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`);

export function InsightsView() {
  const s = useStore();
  const d = useMemo(() => {
    const total = s.assets.reduce((n, a) => n + a.size, 0);
    const kinds = KINDS.map((k) => {
      const list = s.assets.filter((a) => a.kind === k);
      const b = list.reduce((n, a) => n + a.size, 0);
      return { k, count: list.length, b, r: total ? b / total : 0 };
    })
      .filter((t) => t.count)
      .sort((x, y) => y.r - x.r);
    const largest = [...s.assets].sort((x, y) => y.size - x.size).slice(0, 6);
    const folders = new Map<string, { rootId: number; path: string; count: number; b: number }>();
    for (const a of s.assets) {
      const top = folderOf(a.relPath).split("/")[0];
      const k = `${a.rootId}:${top}`;
      const f = folders.get(k) ?? { rootId: a.rootId, path: top, count: 0, b: 0 };
      f.count++;
      f.b += a.size;
      folders.set(k, f);
    }
    const topFolders = [...folders.values()].sort((x, y) => y.b - x.b).slice(0, 6);
    const untagged = s.assets.filter((a) => !a.tags.length).length;
    return { total, kinds, largest, topFolders, untagged };
  }, [s.assets]);
  const dupCount = s.dups?.length ?? 0;
  const rootName = (id: number) => baseName(s.roots.find((r) => r.id === id)?.path ?? "");
  const multi = s.roots.length > 1;

  const stats = [
    { k: "Files", v: s.assets.length.toLocaleString() },
    { k: "Total size", v: bytes(d.total) },
    { k: "Untagged", v: d.untagged.toLocaleString(), link: "Show untagged →", run: () => (s.setFilters({ untagged: true }), s.go("library")) },
    {
      k: "Duplicate groups",
      v: String(dupCount),
      link: dupCount ? "Review duplicates →" : "All clear",
      run: dupCount ? () => s.go("duplicates") : undefined,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto px-7 pt-6 pb-10">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {stats.map((st) => (
          <button
            key={st.k}
            type="button"
            disabled={!st.run}
            onClick={st.run}
            className="flex flex-col gap-1.5 rounded-xl border border-line bg-card px-[18px] py-4 text-left enabled:hover:border-line-x disabled:cursor-default"
          >
            <span className="text-muted">{st.k}</span>
            <span className="text-[26px] font-semibold tracking-[-.02em]">{st.v}</span>
            <span className="h-4 text-xs text-accent">{st.link ?? ""}</span>
          </button>
        ))}
      </div>

      <section className={`${card} gap-4`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Storage by type</h2>
          <span className="font-mono text-xs text-muted">{bytes(d.total)} total</span>
        </div>
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-[5px]" role="img" aria-label="Storage by type">
          {d.kinds.map((t) => (
            <div key={t.k} data-kind={t.k} className="k-bar" style={{ width: `${Math.max(0.6, t.r * 100)}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1">
          {d.kinds.map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => s.go("library", { kinds: [t.k as Kind], folder: null })}
              className="-mx-2 flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-active"
            >
              <span aria-hidden data-kind={t.k} className="k-bar size-[9px] rounded-[3px]" />
              <span className="font-medium">{kindLabel[t.k as Kind]}</span>
              <span className="text-faint">{t.count.toLocaleString()}</span>
              <span className="ml-auto font-mono text-xs">{bytes(t.b)}</span>
              <span className="w-11 text-right font-mono text-xs text-faint">{pct(t.r)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3.5">
        <section className={`${card} gap-0.5`}>
          <h2 className="mb-2 text-[15px] font-semibold">Largest files</h2>
          {d.largest.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                s.go("library", { kinds: [], folder: null, query: "" });
                s.select(a.id);
                s.setPeek(true);
              }}
              className="-mx-2 grid h-9 grid-cols-[minmax(0,1fr)_minmax(60px,140px)_70px] items-center gap-3.5 rounded-[7px] px-2 text-left hover:bg-active"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden data-kind={a.kind} className="k-bar size-[7px] flex-none rounded-full" />
                <span className="font-medium whitespace-nowrap">{a.name}</span>
                <span className="truncate text-faint">{folderOf(a.relPath)}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-[3px] bg-active">
                <span className="block h-full bg-fg-2" style={{ width: `${Math.max(1, (a.size / (d.largest[0]?.size || 1)) * 100)}%` }} />
              </span>
              <span className="text-right font-mono text-xs">{bytes(a.size)}</span>
            </button>
          ))}
        </section>
        <section className={`${card} gap-0.5`}>
          <h2 className="mb-2 text-[15px] font-semibold">Folders</h2>
          {d.topFolders.map((f) => (
            <button
              key={`${f.rootId}:${f.path}`}
              type="button"
              onClick={() => s.go("library", { kinds: [], folder: { rootId: f.rootId, path: f.path } })}
              className="-mx-2 grid h-9 grid-cols-[minmax(0,1fr)_40px_minmax(60px,140px)_70px] items-center gap-3.5 rounded-[7px] px-2 text-left hover:bg-active"
            >
              <span className="truncate font-medium">{[multi ? rootName(f.rootId) : "", f.path || (multi ? "" : rootName(f.rootId))].filter(Boolean).join("/")}</span>
              <span className="text-right text-faint">{f.count.toLocaleString()}</span>
              <span className="h-1.5 overflow-hidden rounded-[3px] bg-active">
                <span className="block h-full bg-fg-2" style={{ width: `${Math.max(1, (f.b / (d.topFolders[0]?.b || 1)) * 100)}%` }} />
              </span>
              <span className="text-right font-mono text-xs">{bytes(f.b)}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
