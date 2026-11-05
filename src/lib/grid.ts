/**
 * Where ↑ (d = -1) or ↓ (d = 1) lands from card `i` in a grid of `cols` columns. `sizes` are the lengths of its folder
 * groups, in order; each group starts a new row. Keeps the column, or takes the last card of a shorter row, and stays
 * put on the first and last row.
 */
export function rowStep(sizes: number[], cols: number, i: number, d: 1 | -1): number {
  const rows: [start: number, length: number][] = [];
  let at = 0;
  for (const n of sizes) {
    for (let r = 0; r < n; r += cols) rows.push([at + r, Math.min(cols, n - r)]);
    at += n;
  }
  const r = rows.findIndex(([start, n]) => i >= start && i < start + n);
  const to = rows[r + d];
  return r < 0 || !to ? i : to[0] + Math.min(i - rows[r][0], to[1] - 1);
}
