import clsx from "clsx";
import { useMemo } from "react";
import { baseName, folderOf } from "../lib/format";
import { bytes, kindLabel, num } from "../lib/fmt";
import { t } from "../lib/i18n";
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
      .filter((kind) => kind.count)
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
  // A link shows what its card counts, so it starts from a clear search and Filters panel.
  const show = (extra?: Parameters<typeof s.go>[1]) => {
    s.clearFilters();
    s.go("library", extra);
  };

  const stats = [
    { id: "files", k: t("insightsView.stats.files"), v: num(s.assets.length) },
    { id: "size", k: t("insightsView.stats.totalSize"), v: bytes(d.total) },
    {
      id: "untagged",
      k: t("insightsView.stats.untagged"),
      v: num(d.untagged),
      link: t("insightsView.stats.showUntagged"),
      run: () => (show(), s.setFilters({ untagged: true })),
    },
    {
      id: "duplicates",
      k: t("insightsView.stats.duplicates"),
      v: String(dupCount),
      link: dupCount ? t("insightsView.stats.reviewDuplicates") : t("insightsView.stats.allClear"),
      run: dupCount ? () => s.go("duplicates") : undefined,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto px-7 pt-6 pb-10">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {stats.map((st) => {
          // Only the cards that lead somewhere are buttons.
          const Card = st.run ? "button" : "div";
          return (
            <Card
              key={st.id}
              type={st.run ? "button" : undefined}
              onClick={st.run}
              className={clsx("flex flex-col gap-1.5 rounded-xl border border-line bg-card px-[18px] py-4 text-left", st.run && "hover:border-line-x")}
            >
              <span className="text-muted">{st.k}</span>
              <span className="text-[26px] font-semibold tracking-[-.02em]">{st.v}</span>
              <span className="h-4 text-xs text-accent">{st.link ?? ""}</span>
            </Card>
          );
        })}
      </div>

      <section className={`${card} gap-4`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">{t("insightsView.storageByType")}</h2>
          <span className="font-mono text-xs text-muted">{t("insightsView.total", { size: bytes(d.total) })}</span>
        </div>
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-[5px]" role="img" aria-label={t("insightsView.storageByType")}>
          {d.kinds.map((kind) => (
            <div key={kind.k} data-kind={kind.k} className="k-bar" style={{ width: `${Math.max(0.6, kind.r * 100)}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1">
          {d.kinds.map((kind) => (
            <button
              key={kind.k}
              type="button"
              onClick={() => show({ kinds: [kind.k as Kind] })}
              className="-mx-2 flex items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-active"
            >
              <span aria-hidden data-kind={kind.k} className="k-bar size-[9px] rounded-[3px]" />
              <span className="font-medium">{kindLabel[kind.k as Kind]}</span>
              <span className="text-faint">{num(kind.count)}</span>
              <span className="ml-auto font-mono text-xs">{bytes(kind.b)}</span>
              <span className="w-11 text-right font-mono text-xs text-faint">{pct(kind.r)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3.5">
        <section className={`${card} gap-0.5`}>
          <h2 className="mb-2 text-[15px] font-semibold">{t("insightsView.largest")}</h2>
          {d.largest.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                show();
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
          <h2 className="mb-2 text-[15px] font-semibold">{t("insightsView.folders")}</h2>
          {d.topFolders.map((f) => (
            <button
              key={`${f.rootId}:${f.path}`}
              type="button"
              onClick={() => show({ folder: { rootId: f.rootId, path: f.path } })}
              className="-mx-2 grid h-9 grid-cols-[minmax(0,1fr)_40px_minmax(60px,140px)_70px] items-center gap-3.5 rounded-[7px] px-2 text-left hover:bg-active"
            >
              <span className="truncate font-medium">{[multi ? rootName(f.rootId) : "", f.path || (multi ? "" : rootName(f.rootId))].filter(Boolean).join("/")}</span>
              <span className="text-right text-faint">{num(f.count)}</span>
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
