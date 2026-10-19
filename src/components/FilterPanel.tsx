import clsx from "clsx";
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeFilterCount, noFilters, type Filters } from "../lib/filter";
import { useStore } from "../store";
import { Button, IconButton } from "./ui";

const MB = 1024 * 1024;

const dimPresets: { label: string; f: Partial<Filters> }[] = [
  { label: "Tiny ≤ 64px", f: { minW: null, minH: null, maxW: 64, maxH: 64 } },
  { label: "Small ≤ 256px", f: { minW: null, minH: null, maxW: 256, maxH: 256 } },
  { label: "Textures ≥ 1024px", f: { minW: 1024, minH: 1024, maxW: null, maxH: null } },
];

const datePresets: { label: string; days: number | null }[] = [
  { label: "Any time", days: null },
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "1 year", days: 365 },
];

function Group({ title, onClear, active, children }: { title: string; onClear: () => void; active: boolean; children: ReactNode }) {
  return (
    <fieldset className="border-t border-border px-4 py-3 first:border-t-0">
      <legend className="sr-only">{title}</legend>
      <div className="mb-2 flex h-5 items-center justify-between">
        <span aria-hidden className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {title}
        </span>
        {active && (
          <button type="button" onClick={onClear} className="text-xs text-muted hover:text-fg">
            Clear
          </button>
        )}
      </div>
      {children}
    </fieldset>
  );
}

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "h-7 rounded-full border px-2.5 text-xs transition-colors duration-150",
        on ? "border-accent bg-accent/15 text-fg" : "border-border-strong text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** Number input that maps empty to null. `scale` converts the shown unit to the stored one (MB to bytes). */
function NumField({ label, value, onChange, scale = 1 }: { label: string; value: number | null; onChange: (v: number | null) => void; scale?: number }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
      {label}
      <input
        type="number"
        min={0}
        step="any"
        value={value === null ? "" : +(value / scale).toFixed(3)}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)) * scale)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Any"
        className="h-8 w-full rounded-md border border-border-strong bg-bg px-2 text-[13px] text-fg placeholder:text-muted"
      />
    </label>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterButton() {
  const { assets, filters: f, setFilters } = useStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(f);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { exts, tags } = useMemo(() => {
    const e = new Map<string, number>();
    const t = new Set<string>();
    for (const a of assets) {
      if (a.ext) e.set(a.ext, (e.get(a.ext) ?? 0) + 1);
      for (const g of a.tags) t.add(g);
    }
    return { exts: [...e.entries()].sort((a, b) => b[1] - a[1]), tags: [...t].sort() };
  }, [assets]);

  const dimsActive = f.minW !== null || f.maxW !== null || f.minH !== null || f.maxH !== null || f.square;
  const isPreset = (p: Partial<Filters>) => Object.entries(p).every(([k, v]) => f[k as keyof Filters] === v);

  return (
    <div ref={root} className="relative">
      <Button
        size="sm"
        variant={count ? "primary" : "secondary"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters{count > 0 && ` · ${count}`}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          className="absolute top-10 left-0 z-30 flex max-h-[75vh] w-96 flex-col rounded-lg border border-border-strong bg-surface shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold">Filters</h2>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button type="button" onClick={() => setFilters(noFilters)} className="px-1 text-xs text-muted hover:text-fg">
                  Clear all
                </button>
              )}
              <IconButton label="Close filters" className="size-7" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>
          </div>
          <div className="overflow-y-auto">
            <Group title="Extension" active={f.exts.length > 0} onClear={() => setFilters({ exts: [] })}>
              <div className="flex flex-wrap gap-1.5">
                {exts.map(([e, n]) => (
                  <Chip key={e} on={f.exts.includes(e)} onClick={() => setFilters({ exts: toggle(f.exts, e) })} label={`.${e}, ${n} files`}>
                    <span className="font-mono">.{e}</span> <span className="text-muted">{n}</span>
                  </Chip>
                ))}
              </div>
            </Group>

            <Group
              title="Image size"
              active={dimsActive}
              onClear={() => setFilters({ minW: null, maxW: null, minH: null, maxH: null, square: false })}
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                {dimPresets.map((p) => (
                  <Chip key={p.label} on={isPreset(p.f)} onClick={() => setFilters(p.f)}>
                    {p.label}
                  </Chip>
                ))}
                <Chip on={f.square} onClick={() => setFilters({ square: !f.square })}>
                  Square only
                </Chip>
              </div>
              <div className="flex gap-2">
                <NumField label="Min width" value={f.minW} onChange={(v) => setFilters({ minW: v })} />
                <NumField label="Max width" value={f.maxW} onChange={(v) => setFilters({ maxW: v })} />
                <NumField label="Min height" value={f.minH} onChange={(v) => setFilters({ minH: v })} />
                <NumField label="Max height" value={f.maxH} onChange={(v) => setFilters({ maxH: v })} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">In pixels. Only images with known dimensions match.</p>
            </Group>

            <Group
              title="File size & date"
              active={f.minBytes !== null || f.maxBytes !== null || f.days !== null}
              onClear={() => setFilters({ minBytes: null, maxBytes: null, days: null })}
            >
              <div className="flex gap-2">
                <NumField label="Min size (MB)" value={f.minBytes} scale={MB} onChange={(v) => setFilters({ minBytes: v })} />
                <NumField label="Max size (MB)" value={f.maxBytes} scale={MB} onChange={(v) => setFilters({ maxBytes: v })} />
              </div>
              <div className="mt-3 mb-1.5 text-xs text-muted">Modified in the last</div>
              <div className="flex flex-wrap gap-1.5">
                {datePresets.map((p) => (
                  <Chip key={p.label} on={f.days === p.days} onClick={() => setFilters({ days: p.days })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group
              title="Tags"
              active={f.untagged || f.anyTags.length > 0}
              onClear={() => setFilters({ untagged: false, anyTags: [] })}
            >
              <div className="flex flex-wrap gap-1.5">
                <Chip on={f.untagged} onClick={() => setFilters({ untagged: !f.untagged, anyTags: [] })}>
                  Untagged only
                </Chip>
                {tags.map((t) => (
                  <Chip key={t} on={f.anyTags.includes(t)} onClick={() => setFilters({ anyTags: toggle(f.anyTags, t), untagged: false })}>
                    #{t}
                  </Chip>
                ))}
              </div>
              {tags.length > 0 && <p className="mt-1.5 text-[11px] text-muted">Matches assets with any of the selected tags.</p>}
            </Group>
          </div>
        </div>
      )}
    </div>
  );
}
