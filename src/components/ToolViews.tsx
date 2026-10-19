import { Copy, Eye, FolderOpen, LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { bytes, folderOf, kindLabel } from "../lib/format";
import { useStore } from "../store";
import { KINDS, type Asset } from "../types";
import { revealAsset } from "./DetailPanel";
import { Thumb } from "./Thumb";
import { Button, IconButton, KindIcon } from "./ui";

export function DuplicatesView() {
  const { assets, duplicates, findingDuplicates, findDuplicates, select, setQuickView, pixelated } = useStore();
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const groups = (duplicates ?? [])
    .map((g) => g.map((id) => byId.get(id)).filter((a): a is Asset => !!a))
    .filter((g) => g.length > 1);
  const wasted = groups.reduce((n, g) => n + g[0].size * (g.length - 1), 0);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold">Duplicates</h1>
          <p className="text-[13px] text-muted">
            Files with identical content across all folders. Only same-size files are hashed. Nothing is ever deleted here.
          </p>
        </div>
        <Button variant="primary" className="ml-auto" onClick={() => void findDuplicates()} disabled={findingDuplicates}>
          {findingDuplicates ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Copy aria-hidden className="size-4" />}
          {duplicates ? "Check again" : "Find duplicates"}
        </Button>
      </div>
      {duplicates && (
        <p className="mt-4 text-sm" aria-live="polite">
          {groups.length ? (
            <>
              <strong>{groups.length}</strong> groups, <strong>{bytes(wasted)}</strong> in extra copies.
            </>
          ) : (
            "No duplicates found."
          )}
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {groups.map((g) => (
          <li key={g[0].id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <Thumb asset={g[0]} pixelated={pixelated} className="size-14 shrink-0 rounded" />
              <div className="min-w-0">
                <div className="truncate font-medium">{g[0].name}</div>
                <div className="font-mono text-xs text-muted">
                  {g.length} copies · {bytes(g[0].size)} each · {bytes(g[0].size * (g.length - 1))} extra
                </div>
              </div>
            </div>
            <ul className="mt-2 space-y-px">
              {g.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded px-1 text-[13px] hover:bg-surface-hover">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={a.path}>
                    {a.path}
                  </span>
                  <IconButton
                    label={`Quick view ${a.relPath}`}
                    className="size-7"
                    onClick={() => {
                      select(a.id);
                      setQuickView(true);
                    }}
                  >
                    <Eye className="size-3.5" />
                  </IconButton>
                  <IconButton label={`Show ${a.relPath} in folder`} className="size-7" onClick={() => void revealAsset(a)}>
                    <FolderOpen className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { label: React.ReactNode; key: string; count: number; size: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.size));
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <table className="w-full text-[13px]">
        <thead className="sr-only">
          <tr>
            <th>Name</th>
            <th>Share of size</th>
            <th>Files</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="w-40 max-w-40 truncate py-1 pr-3">{r.label}</td>
              <td className="py-1">
                <div className="h-2.5 rounded-full bg-surface-2">
                  <div className="h-2.5 rounded-full bg-accent" style={{ width: `${(r.size / max) * 100}%` }} />
                </div>
              </td>
              <td className="w-20 py-1 pl-3 text-right font-mono text-xs text-muted">{r.count.toLocaleString()}</td>
              <td className="w-20 py-1 pl-2 text-right font-mono text-xs">{bytes(r.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function tally(assets: Asset[], keyOf: (a: Asset) => string) {
  const m = new Map<string, { count: number; size: number }>();
  for (const a of assets) {
    const k = keyOf(a);
    const v = m.get(k) ?? { count: 0, size: 0 };
    v.count++;
    v.size += a.size;
    m.set(k, v);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.size - a.size);
}

export function StatsView() {
  const { assets, roots } = useStore();
  const rootName = useMemo(() => new Map(roots.map((r) => [r.id, r.path.split(/[\\/]/).filter(Boolean).pop() ?? r.path])), [roots]);
  const total = assets.reduce((n, a) => n + a.size, 0);
  const kinds = tally(assets, (a) => a.kind).sort((a, b) => KINDS.indexOf(a.key as never) - KINDS.indexOf(b.key as never));
  const exts = tally(assets, (a) => a.ext || "(none)").slice(0, 15);
  const folders = tally(assets, (a) => `${rootName.get(a.rootId)}/${folderOf(a.relPath).split("/")[0]}`).slice(0, 15);

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Stats</h1>
      <p className="text-[13px] text-muted">
        {assets.length.toLocaleString()} files, {bytes(total)} across {roots.length} folder{roots.length === 1 ? "" : "s"}.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Bars
          title="By type"
          rows={kinds.map((r) => ({
            ...r,
            label: (
              <span className="flex items-center gap-2">
                <KindIcon kind={r.key as Asset["kind"]} className="size-4" />
                {kindLabel[r.key as Asset["kind"]]}
              </span>
            ),
          }))}
        />
        <Bars title="Largest extensions" rows={exts.map((r) => ({ ...r, label: <span className="font-mono">.{r.key}</span> }))} />
        <Bars
          title="Largest top-level folders"
          rows={folders.map((r) => ({ ...r, label: <span title={r.key}>{r.key.replace(/\/$/, "/ (root)")}</span> }))}
        />
      </div>
    </div>
  );
}
