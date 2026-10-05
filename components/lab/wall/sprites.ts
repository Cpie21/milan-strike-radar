// The marks already on the wall: what people spray on a train they're
// stuck waiting for. Angry and wordless, so they read the same to everyone:
// the anger mark 💢, a big X, "!!", a cross face, a fist, 🤌 ("ma che
// vuoi?"), thumbs down, a clock crossed out, a "no service" sign, a splat
// and a rage scribble. No stars, no crowns: this is a protest, not décor.
//
// Each is a mask rendered as a small spray piece, built up the way pieces
// on real trains are: overspray haze first, then the fill with volume
// (lighter top, darker bottom), a dark outline, white shine marks, and
// drips where the paint ran.

type C = CanvasRenderingContext2D;
type Mask = (x: number, y: number) => boolean;

export function rng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The hands as bitmaps at 1×; drawn at 2×.
const BITMAPS: Record<string, string[]> = {
  fist: [
    '..######...',
    '.#.#.#.##..',
    '.#.#.#.#.#.',
    '.#########.',
    '############',
    '##.#########',
    '##.#########',
    '.##########.',
    '..#########.',
    '...#######..',
    '...######...',
    '...######...',
  ],
  pinch: [
    '.....###.....',
    '....#####....',
    '....#.#.#....',
    '...##.#.##...',
    '...#.#.#.#...',
    '..##.#.#.##..',
    '..#.##.#.##..',
    '.####.#.####.',
    '.#####.#####.',
    '.###########.',
    '..#########..',
    '...#######...',
    '...#######...',
    '...#######...',
  ],
  thumbsDown: [
    '##..####..',
    '##.#####..',
    '##.######.',
    '##.#####..',
    '##.######.',
    '..#######.',
    '...##.....',
    '...##.....',
    '....#.....',
  ],
};
function fromBitmap(rows: string[], scale: number): [Mask, number, number] {
  const w = Math.max(...rows.map(r => r.length));
  return [(x, y) => rows[Math.floor(y / scale)]?.[Math.floor(x / scale)] === '#', w * scale, rows.length * scale];
}

// Geometry for the rest, in a w×h box.
const dist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const line = (pts: number[][], r: number): Mask => (x, y) => pts.some((p, i) => i > 0 && dist(x + 0.5, y + 0.5, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= r);
const ring = (x: number, y: number, cx: number, cy: number, r0: number, r1: number) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return d >= r0 && d <= r1; };

const SHAPES: Record<string, (rand: () => number) => [Mask, number, number]> = {
  // 💢: four bracket arcs, their bellies facing the centre
  vein: () => [(x, y) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([sx, sy]) =>
    (x + 0.5 - 11) * sx > 1.5 && (y + 0.5 - 11) * sy > 1.5 && ring(x, y, 11 + sx * 10, 11 + sy * 10, 6.5, 9.6)), 22, 22],
  bigX: rand => {
    const a = line([[3 + rand() * 2, 3], [25, 23 + rand() * 2]], 2.6), b = line([[25 - rand() * 2, 3], [3, 24]], 2.3);
    return [(x, y) => a(x, y) || b(x, y), 28, 27];
  },
  bangs: () => [(x, y) => [5, 15].some(cx => (Math.abs(x + 0.5 - cx) <= 2.8 - y / 14 && y >= 1 && y <= 15) || Math.hypot(x + 0.5 - cx, y + 0.5 - 20.5) <= 2.3), 20, 24],
  face: () => [(x, y) => {
    if (Math.hypot(x + 0.5 - 12, y + 0.5 - 12) > 11) return false;
    const brow = (x < 12 ? dist(x + 0.5, y + 0.5, 5, 6, 10, 9) : dist(x + 0.5, y + 0.5, 14, 9, 19, 6)) <= 1.2;
    const eye = Math.hypot(x + 0.5 - 8.5, y + 0.5 - 11.5) <= 1.4 || Math.hypot(x + 0.5 - 15.5, y + 0.5 - 11.5) <= 1.4;
    const mouth = ring(x, y, 12, 23, 5.4, 6.6) && y < 19;
    return !(brow || eye || mouth);
  }, 24, 24],
  clock: () => [(x, y) => ring(x, y, 12, 12, 8, 11)
    || dist(x + 0.5, y + 0.5, 12, 12, 12, 5.5) <= 1.1 || dist(x + 0.5, y + 0.5, 12, 12, 16.5, 13) <= 1.1
    || dist(x + 0.5, y + 0.5, 2, 22, 22, 2) <= 1.8, 24, 24],
  // 🚫 over a tram front: "no service"
  noService: () => [(x, y) => {
    const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
    const tram = x >= 8 && x <= 15 && y >= 7 && y <= 16 && !(y >= 9 && y <= 11 && (x === 9 || x === 10 || x === 13 || x === 14)) && !(y === 16 && x > 9 && x < 14);
    return (d >= 9 && d <= 11.6) || (d < 10 && dist(x + 0.5, y + 0.5, 5, 5, 19, 19) <= 1.7) || tram;
  }, 24, 24],
  splat: rand => {
    const blobs = [[13, 12, 7], ...Array.from({ length: 6 }, () => [13 + (rand() - 0.5) * 20, 12 + (rand() - 0.5) * 16, 1.5 + rand() * 2.5])];
    return [(x, y) => blobs.some(([bx, by, r]) => Math.hypot(x + 0.5 - bx, y + 0.5 - by) <= r), 26, 24];
  },
  // a furious tangle, loops on loops (no zigzag: that reads as letters)
  scribble: rand => [line(Array.from({ length: 22 }, (_, i) => { const t = i * 0.5; return [15 + Math.cos(t) * (9 + rand() * 4), 11 + Math.sin(t * 1.15) * (6 + rand() * 3)]; }), 0.9), 30, 22],
};

export const SPRITE_KINDS = ['vein', 'bigX', 'bangs', 'face', 'fist', 'pinch', 'thumbsDown', 'clock', 'noService', 'splat', 'scribble'] as const;
export type SpriteKind = typeof SPRITE_KINDS[number];

const tone = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function maskOf(kind: SpriteKind, rand: () => number): [Mask, number, number] {
  return kind in BITMAPS ? fromBitmap(BITMAPS[kind], 2) : SHAPES[kind](rand);
}

export function spriteSize(kind: SpriteKind): [number, number] {
  const [, w, h] = maskOf(kind, rng(kind));
  return [w, h];
}

// Draw a piece centred on (cx, cy); the seed keeps it the same on redraw.
// `scale` enlarges the shape in whole pixels; outline, shine and drips stay
// one pixel, as a bigger piece is still sprayed with the same can.
export function drawSprite(c: C, kind: SpriteKind, cx: number, cy: number, color: string, flip = false, seed: string = kind, scale = 1) {
  const rand = rng(seed);
  const [raw, w0, h0] = maskOf(kind, rand);
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const inside: Mask = (x, y) => x >= 0 && y >= 0 && x < w && y < h && raw(Math.floor((flip ? w - 1 - x : x) / scale), Math.floor(y / scale));
  const ox = Math.round(cx - w / 2), oy = Math.round(cy - h / 2);
  const dot = (x: number, y: number, col: string, a = 1) => { c.globalAlpha = a; c.fillStyle = col; c.fillRect(ox + x, oy + y, 1, 1); };
  const near = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && inside(x + dx, y + dy)) return true;
    return false;
  };
  const edge = (x: number, y: number) => !inside(x, y) && (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1));

  // 1. overspray: a thin haze of the colour around the piece
  for (let y = -3; y < h + 3; y++) for (let x = -3; x < w + 3; x++) {
    if (inside(x, y) || edge(x, y)) continue;
    if (near(x, y, 2) && rand() < 0.28) dot(x, y, color, 0.45);
    else if (near(x, y, 3) && rand() < 0.1) dot(x, y, color, 0.3);
  }
  // 2. fill with volume: per column, lighter at the top, darker at the bottom
  const hi = tone(color, 0.32), lo = tone(color, -0.32);
  for (let x = 0; x < w; x++) {
    let t = -1, b = -1;
    for (let y = 0; y < h; y++) if (inside(x, y)) { if (t < 0) t = y; b = y; }
    for (let y = t; y >= 0 && y <= b; y++) if (inside(x, y)) { const u = (y - t) / Math.max(1, b - t); dot(x, y, u < 0.3 ? hi : u > 0.78 ? lo : color); }
  }
  // 3. outline
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (edge(x, y)) dot(x, y, '#121317');
  // 4. shine: two short white marks where the top-left edge turns
  let shines = 0;
  for (let y = 1; y < h && shines < 2; y++) for (let x = 1; x < w && shines < 2; x++) {
    if (inside(x, y) && inside(x + 1, y + 1) && inside(x + 2, y + 1) && !inside(x - 1, y - 1) && rand() < 0.4) {
      dot(x + 1, y + 1, '#FFFFFF', 0.95); dot(x + 2, y + 1, '#FFFFFF', 0.6); shines++; x += 7;
    }
  }
  // 5. drips from the lower edge
  const lows: [number, number][] = [];
  for (let x = 1; x < w - 1; x++) for (let y = h - 1; y >= 0; y--) if (inside(x, y)) { if (!inside(x, y + 1)) lows.push([x, y]); break; }
  for (let i = 0; i < Math.min(2 + Math.floor(rand() * 2), lows.length); i++) {
    const [x, y] = lows[Math.floor(rand() * lows.length)];
    const len = 2 + Math.floor(rand() * 5);
    for (let k = 1; k <= len; k++) dot(x, y + k, k === len ? lo : color);
    dot(x, y + len + 1, '#121317', 0.6);
  }
  c.globalAlpha = 1;
}
