// What is already on the vehicle: real-looking train graffiti, not
// stickers. Handstyle tags in one colour, white-on-colour outlined tags,
// bubbly throw-ups, a neon loop scrawled over the top, drips everywhere,
// overlapping each other the way a wall builds up over weeks. The letters
// are invented: they read as graffiti, not as words (nobody should have
// to read Italian, and nobody can read a good handstyle anyway).
//
// Drawn on the high-resolution paint layer (3× the pixel scene) with a
// soft spray edge, then lit by the vehicle like everything else on it.

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

type C = CanvasRenderingContext2D;
type Pt = [number, number];
export type Tag = { kind: 'tag' | 'outline' | 'throwup' | 'loop'; x: number; y: number; w: number; h: number; fill: string; line: string; seed: string; age: number };

// Glyph skeletons in a 0..1 box (x right, y down); a letter is 1–3 strokes.
const GLYPHS: Pt[][][] = [
  [[[0.1, 1], [0.1, 0.05], [0.8, 0.5], [0.15, 0.6]]],
  [[[0.9, 0.15], [0.3, 0], [0.1, 0.5], [0.4, 1], [0.95, 0.85]]],
  [[[0.1, 1], [0.5, 0], [0.9, 1]], [[0.25, 0.6], [0.8, 0.55]]],
  [[[0.1, 0], [0.1, 1], [0.95, 1]]],
  [[[0.85, 0.1], [0.2, 0.05], [0.3, 0.5], [0.8, 0.55], [0.7, 1], [0.05, 0.95]]],
  [[[0.1, 1], [0.15, 0], [0.5, 0.6], [0.85, 0], [0.9, 1]]],
  [[[0.1, 0], [0.5, 1], [0.95, 0]]],
  [[[0.5, 0], [0.5, 1]], [[0.05, 0.15], [0.95, 0.1]]],
  [[[0.1, 1], [0.1, 0], [0.9, 1], [0.9, 0]]],
  [[[0.5, 0.05], [0.05, 0.5], [0.5, 0.98], [0.95, 0.5], [0.5, 0.05]]],
  [[[0.1, 0], [0.1, 1]], [[0.95, 0], [0.15, 0.55], [0.95, 1]]],
  [[[0.05, 0.1], [0.95, 0.1], [0.05, 0.95], [0.95, 0.9]]],
];

// Catmull-Rom through points, as a dense polyline.
function smooth(pts: Pt[], steps = 8): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as Pt);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A word of invented letters: slanted, uneven, joined, with a flourish.
function word(rand: () => number, x: number, y: number, w: number, h: number): Pt[][] {
  const n = 3 + Math.floor(rand() * 3);
  const lw = w / (n + 0.6), slant = 0.18 + rand() * 0.25;
  const strokes: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const g = GLYPHS[Math.floor(rand() * GLYPHS.length)];
    const sx = lw * (0.75 + rand() * 0.45), sy = h * (0.7 + rand() * 0.4), ox = x + i * lw + (rand() - 0.5) * lw * 0.2, oy = y + (rand() - 0.5) * h * 0.18;
    g.forEach(stroke => strokes.push(smooth(stroke.map(([u, v]) => [ox + u * sx + (1 - v) * sy * slant + (rand() - 0.5) * 2, oy + v * sy + (rand() - 0.5) * 2] as Pt), 6)));
  }
  // the flourish: a long underline that kicks up at the end
  const by = y + h * 1.08;
  strokes.push(smooth([[x - lw * 0.2, by + h * 0.05], [x + w * 0.4, by + h * 0.12], [x + w * 0.85, by], [x + w * 1.02, by - h * 0.35]], 10));
  return strokes;
}

function line(c: C, pts: Pt[], width: number, rand: () => number, taper = true) {
  // varying pressure: drawn as overlapping dabs along the path
  for (let i = 0; i < pts.length; i++) {
    const t = i / Math.max(1, pts.length - 1);
    const p = taper ? 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)) : 1;
    const r = (width / 2) * p * (0.92 + rand() * 0.16);
    c.beginPath(); c.arc(pts[i][0], pts[i][1], Math.max(0.6, r), 0, Math.PI * 2); c.fill();
    if (i) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const d = Math.hypot(bx - ax, by - ay);
      for (let k = 1; k < d / (r * 0.6); k++) { const u = k / (d / (r * 0.6)); c.beginPath(); c.arc(ax + (bx - ax) * u, ay + (by - ay) * u, Math.max(0.6, r), 0, Math.PI * 2); c.fill(); }
    }
  }
}

function drips(c: C, strokes: Pt[][], color: string, width: number, rand: () => number, count: number) {
  const lows = strokes.flatMap(s => s.filter((p, i) => i > 0 && i < s.length - 1 && p[1] >= s[i - 1][1] && p[1] >= s[i + 1][1]));
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round';
  for (let i = 0; i < count && lows.length; i++) {
    const [x, y] = lows[Math.floor(rand() * lows.length)];
    const len = 6 + rand() * rand() * 42, w = width * (0.35 + rand() * 0.35);
    c.lineWidth = w;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 1.5, y + len); c.stroke();
    c.beginPath(); c.ellipse(x, y + len + w * 0.4, w * 0.75, w * 0.95, 0, 0, Math.PI * 2); c.fill();
  }
}

// Paint one piece onto the high-res layer.
export function paintTag(c: C, t: Tag) {
  const rand = rng(t.seed);
  c.save();
  c.globalAlpha = t.age;
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (t.kind === 'loop') {
    // a neon scrawl of loops over the top, thin and fast
    const pts: Pt[] = Array.from({ length: 14 }, (_, i) => [t.x + (i / 13) * t.w + (rand() - 0.5) * t.w * 0.12, t.y + t.h / 2 + Math.sin(i * 1.7 + rand()) * t.h * 0.5]);
    c.fillStyle = t.fill; c.shadowColor = t.fill; c.shadowBlur = 4;
    line(c, smooth(pts, 10), 2.6, rand);
    c.restore();
    return;
  }
  const strokes = word(rand, t.x, t.y, t.w, t.h);
  const width = t.kind === 'throwup' ? t.h * 0.42 : t.kind === 'outline' ? t.h * 0.26 : t.h * 0.15;
  if (t.kind !== 'tag') {
    // the outline: the same letters a little fatter, in the line colour
    c.fillStyle = t.line;
    strokes.forEach(s => line(c, s, width + 5, rand, false));
  }
  // the fill, with its overspray haze
  c.fillStyle = t.fill; c.shadowColor = t.fill; c.shadowBlur = t.kind === 'tag' ? 3.5 : 2;
  strokes.forEach(s => line(c, s, width, rand, t.kind === 'tag'));
  c.shadowBlur = 0;
  // shine: a thin bright line along the top of fat letters
  if (t.kind !== 'tag') {
    c.fillStyle = 'rgba(255,255,255,0.75)';
    strokes.slice(0, -1).forEach(s => line(c, s.map(([x, y]) => [x - width * 0.18, y - width * 0.22] as Pt).filter((_, i) => i % 3 === 0), width * 0.16, rand, true));
  }
  drips(c, strokes, t.kind === 'tag' ? t.fill : t.line, Math.max(2.2, width * 0.5), rand, t.kind === 'throwup' ? 6 : 4);
  c.restore();
}

// Graffiti colours as they are actually bought: lots of white, silver and
// black, then a few loud ones.
const FILLS = ['#F4F1EA', '#F4F1EA', '#F4F1EA', '#D9DDE2', '#3DFF7A', '#2F6BFF', '#FF3B3B', '#FFD23F', '#FF5FB7', '#B07CFF'];

// Others' pieces across the body, overlapping, oldest first.
export function tagsFor(seed: string, count: number, body: { x0: number; y0: number; x1: number; y1: number }, K: number): Tag[] {
  const rand = rng(`tags|${seed}`);
  const W = (body.x1 - body.x0) * K, H = (body.y1 - body.y0) * K;
  const n = Math.min(14, count);
  return Array.from({ length: n }, (_, i) => {
    const r = rand();
    const kind: Tag['kind'] = r < 0.42 ? 'tag' : r < 0.68 ? 'outline' : r < 0.85 ? 'throwup' : 'loop';
    const h = kind === 'throwup' ? H * (0.26 + rand() * 0.14) : kind === 'outline' ? H * (0.22 + rand() * 0.12) : kind === 'loop' ? H * 0.25 : H * (0.12 + rand() * 0.12);
    const w = Math.min(W * 0.55, h * (kind === 'tag' ? 3.4 : 2.6) * (0.8 + rand() * 0.5));
    const fill = FILLS[Math.floor(rand() * FILLS.length)];
    let line = FILLS[Math.floor(rand() * FILLS.length)];
    if (line === fill) line = fill === '#1A1B1F' ? '#F4F1EA' : '#1A1B1F';
    return {
      kind, w, h, fill, line, seed: `${seed}|${i}`,
      x: body.x0 * K + rand() * Math.max(1, W - w), y: body.y0 * K + H * 0.08 + rand() * Math.max(1, H * 0.8 - h),
      age: 0.72 + (i / Math.max(1, n)) * 0.25, // the newer on top, fresher
    };
  });
}
