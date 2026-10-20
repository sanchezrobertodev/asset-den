export interface Grid {
  cols: number;
  rows: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Guesses how a sprite sheet is sliced from its pixel size. A strip of square frames (256×64) wins; otherwise square
 * cells that tile both sides, picking the size whose frame count is nearest 16 (256×256 → 4×4 of 64).
 */
export function guessGrid(width: number, height: number): Grid {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w > h && w % h === 0) return { cols: w / h, rows: 1 };
  if (h > w && h % w === 0) return { cols: 1, rows: h / w };
  const g = gcd(w, h);
  let best: Grid = { cols: 1, rows: 1 };
  let score = Infinity;
  for (let cell = g; cell >= 8; cell--) {
    if (g % cell) continue;
    const grid = { cols: w / cell, rows: h / cell };
    const s = Math.abs(Math.log2(grid.cols * grid.rows) - 4);
    if (s < score) [best, score] = [grid, s];
  }
  return best;
}

/** Size in pixels of one frame; a remainder that doesn't fill a whole frame is ignored. */
export function frameSize(width: number, height: number, g: Grid) {
  return { w: Math.max(1, Math.floor(width / g.cols)), h: Math.max(1, Math.floor(height / g.rows)) };
}

/** Columns and rows that fit frames of the given size. */
export function gridFor(width: number, height: number, frameW: number, frameH: number): Grid {
  return { cols: Math.max(1, Math.floor(width / Math.max(1, frameW))), rows: Math.max(1, Math.floor(height / Math.max(1, frameH))) };
}
