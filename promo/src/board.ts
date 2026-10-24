import { glyphColumns, GLYPH_ROWS } from './pixelFont';

// The LED board's content, frame by frame: a grid of lamp brightnesses
// (0..1), row 0 at the top. Text is the site's own pixel lettering.
export type Grid = { cols: number; rows: number; data: Float32Array };
export const grid = (cols: number, rows: number): Grid => ({ cols, rows, data: new Float32Array(cols * rows) });

export function textLine(g: Grid, text: string, top: number, align: 'center' | number = 'center', level = 1) {
  const cols = glyphColumns(text);
  const x0 = align === 'center' ? Math.floor((g.cols - cols.length) / 2) : align;
  cols.forEach((col, i) => {
    const x = x0 + i;
    if (x < 0 || x >= g.cols) return;
    for (let y = 0; y < GLYPH_ROWS; y++) if (col >> y & 1) g.data[(top + y) * g.cols + x] = Math.max(g.data[(top + y) * g.cols + x], level);
  });
  return { x0, width: cols.length };
}

// Two soft rounded eyes, as the board draws them: open 0..1, gaze -1..1.
export function eyes(g: Grid, open: number, gx = 0, gy = 0, level = 1) {
  const cx = g.cols / 2 + gx * 6, cy = g.rows / 2 + gy * 2;
  const w = 7.2, h = 11 * Math.max(0.08, open), sep = 7.5;
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
    const px = x + 0.5, py = y + 0.5;
    let a = 0;
    for (const ex of [cx - sep, cx + sep]) {
      const hw = w / 2, hh = h / 2, r = Math.min(hw, hh) * 0.9;
      const qx = Math.abs(px - ex) - (hw - r), qy = Math.abs(py - cy) - (hh - r);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      a = Math.max(a, Math.min(1, Math.max(0, 0.6 - sd)));
    }
    if (a > 0.04) g.data[y * g.cols + x] = Math.max(g.data[y * g.cols + x], a * level);
  }
}

// To a texture: bottom row first (GL's v = 0 is the board's bottom).
export function toTexture(g: Grid) {
  const out = new Uint8Array(g.cols * g.rows);
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) out[(g.rows - 1 - y) * g.cols + x] = Math.round(Math.min(1, g.data[y * g.cols + x]) * 255);
  return { data: out, width: g.cols, height: g.rows };
}
