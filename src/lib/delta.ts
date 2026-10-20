import type { Asset } from "../types";

/** One backend change: the current rows of changed or added assets, and the ids that are gone. `seq` counts changes in commit order. */
export interface AssetsDelta {
  seq: number;
  upserted: Asset[];
  removed: number[];
}

/**
 * Deltas from `received` that follow `seq`, in order and once each. null when one is missing, so the caller reloads
 * everything instead.
 */
export function deltasAfter(seq: number, received: AssetsDelta[]): AssetsDelta[] | null {
  const next = [...new Map(received.filter((d) => d.seq > seq).map((d) => [d.seq, d])).values()].sort((a, b) => a.seq - b.seq);
  return next.every((d, i) => d.seq === seq + 1 + i) ? next : null;
}

/**
 * `assets` with `deltas` applied in order: changed rows replaced in place, new rows appended, removed rows dropped.
 * `gone` is every id removed along the way, including ones SQLite reused for a new file (that row is appended as new),
 * so state tied to the old file can be cleared. Returns the same array when nothing changed.
 */
export function applyDeltas(assets: Asset[], deltas: AssetsDelta[]): { assets: Asset[]; gone: Set<number> } {
  const fresh = new Map<number, Asset>();
  const gone = new Set<number>();
  for (const d of deltas) {
    for (const id of d.removed) {
      fresh.delete(id);
      gone.add(id);
    }
    for (const a of d.upserted) fresh.set(a.id, a);
  }
  if (!fresh.size && !gone.size) return { assets, gone };
  const out: Asset[] = [];
  for (const a of assets) {
    if (gone.has(a.id)) continue;
    const n = fresh.get(a.id);
    if (n) fresh.delete(a.id);
    out.push(n ?? a);
  }
  out.push(...fresh.values());
  return { assets: out, gone };
}
