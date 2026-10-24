// What is already on the vehicle: real train graffiti, not stickers, and
// not tidy. A wall builds up over weeks, by many hands, fast and at night:
// - one or two big pieces that own the side, tilted, running over doors and
//   windows and off the edge;
// - handstyle tags of every size scrawled over and between them;
// - white-on-colour outlined tags, bubbly throw-ups;
// - fast slashes, an X through someone else's name, neon loops on top;
// - splatter and spray fog, and the ghost of older paint half buffed off;
// - drips everywhere.
// The letters are invented: they read as graffiti, not as words (nobody
// should have to read Italian, and nobody can read a good handstyle).
//
// Painted on the high-resolution layer (3× the pixel scene) with a soft
// spray edge, then lit by the vehicle like everything else on it.

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
export type TagKind = 'piece' | 'tag' | 'outline' | 'throwup' | 'loop' | 'slash' | 'splat' | 'haze';
export type Tag = { kind: TagKind; x: number; y: number; w: number; h: number; rot: number; fill: string; line: string; seed: string; age: number };

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
  [[[0.2, 0.9], [0.5, -0.2], [0.75, 1.1], [1.1, 0.3]]],
  [[[0, 0.6], [0.4, 0.2], [0.3, 1.05], [0.95, 0.4]]],
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

// A word of invented letters, written fast: letters crowd and overlap, the
// baseline waves, one letter shoots up, and the last throws a long tail.
function word(rand: () => number, x: number, y: number, w: number, h: number, wild: number): Pt[][] {
  const n = 3 + Math.floor(rand() * 4);
  const lw = w / (n * 0.82 + 0.4), slant = 0.12 + rand() * 0.4;
  const wave = (rand() - 0.5) * h * 0.5 * wild, phase = rand() * 6;
  const tall = Math.floor(rand() * n);
  const strokes: Pt[][] = [];
  let pen = x;
  for (let i = 0; i < n; i++) {
    const g = GLYPHS[Math.floor(rand() * GLYPHS.length)];
    const k = i === tall ? 1.35 + rand() * 0.4 : 0.65 + rand() * 0.5;
    const sx = lw * (0.7 + rand() * 0.6), sy = h * k;
    const oy = y + Math.sin(phase + i * 1.3) * wave + (1 - k) * h * (0.6 + rand() * 0.4) + (rand() - 0.5) * h * 0.2 * wild;
    const j = () => (rand() - 0.5) * lw * 0.12 * (1 + wild);
    g.forEach(stroke => strokes.push(smooth(stroke.map(([u, v]) => [pen + u * sx + (1 - v) * sy * slant + j(), oy + v * sy + j()] as Pt), 6)));
    pen += lw * (0.62 + rand() * 0.35); // crowding: the next letter starts inside this one
  }
  // the last letter's tail, and a flourish under it all
  const end = strokes[strokes.length - 1];
  const [ex, ey] = end[end.length - 1];
  strokes.push(smooth([[ex, ey], [ex + lw * 0.6, ey + h * 0.2 * (rand() - 0.3)], [ex + lw * (1.2 + rand()), ey - h * (0.3 + rand() * 0.5)]], 8));
  if (rand() < 0.7) {
    const by = y + h * (1.05 + rand() * 0.15);
    strokes.push(smooth([[x - lw * 0.3, by + h * 0.08], [x + w * 0.35, by + h * (0.1 + rand() * 0.15)], [pen + lw * 0.2, by - h * 0.05], [pen + lw * 0.9, by - h * (0.4 + rand() * 0.4)]], 10));
  }
  return strokes;
}

// A line laid by a can: dabs along the path, pressure swelling and fading.
function line(c: C, pts: Pt[], width: number, rand: () => number, taper = true) {
  for (let i = 1; i < pts.length; i++) {
    const t = i / Math.max(1, pts.length - 1);
    const p = taper ? 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) : 1;
    const r = (width / 2) * p * (0.85 + rand() * 0.3);
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay), step = Math.max(0.6, r * 0.55);
    for (let k = 0; k < Math.max(d, 0.01); k += step) { const u = d ? k / d : 0; c.beginPath(); c.arc(ax + (bx - ax) * u, ay + (by - ay) * u, Math.max(0.5, r), 0, Math.PI * 2); c.fill(); }
  }
}

function drips(c: C, strokes: Pt[][], color: string, width: number, rand: () => number, count: number) {
  const lows = strokes.flatMap(s => s.filter((p, i) => i > 0 && i < s.length - 1 && p[1] >= s[i - 1][1] && p[1] >= s[i + 1][1]));
  c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round';
  for (let i = 0; i < count && lows.length; i++) {
    const [x, y] = lows[Math.floor(rand() * lows.length)];
    const len = 5 + rand() * rand() * 60, w = width * (0.25 + rand() * 0.4);
    c.lineWidth = w;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 2, y + len); c.stroke();
    c.beginPath(); c.ellipse(x, y + len + w * 0.4, w * 0.7, w * 0.95, 0, 0, Math.PI * 2); c.fill();
  }
}

function splatter(c: C, cx: number, cy: number, r: number, color: string, rand: () => number) {
  c.fillStyle = color;
  for (let i = 0; i < 28; i++) {
    const a = rand() * Math.PI * 2, d = r * Math.pow(rand(), 0.6), s = Math.max(0.6, r * 0.36 * Math.pow(rand(), 2));
    c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, 0, Math.PI * 2); c.fill();
  }
}

// Paint one piece onto the high-res layer.
export function paintTag(c: C, t: Tag) {
  const rand = rng(t.seed);
  c.save();
  c.globalAlpha = t.age;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // tilt about the piece's centre
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  c.translate(cx, cy); c.rotate(t.rot); c.translate(-cx, -cy);
  switch (t.kind) {
    case 'haze': {
      // old paint, half buffed off: a soft fog of colour
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(t.w, t.h) / 2);
      g.addColorStop(0, t.fill); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = t.age * 0.16; c.fillStyle = g;
      c.beginPath(); c.ellipse(cx, cy, t.w / 2, t.h / 2, 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'splat':
      splatter(c, cx, cy, t.w / 2, t.fill, rand);
      drips(c, [[[cx - t.w * 0.2, cy], [cx, cy + 2], [cx + t.w * 0.2, cy]]], t.fill, 3, rand, 3);
      break;
    case 'slash': {
      // fast strokes: a crossing-out, or two
      c.fillStyle = t.fill; c.shadowColor = t.fill; c.shadowBlur = 3;
      const a = smooth([[t.x, t.y + t.h * 0.1], [t.x + t.w * 0.5, t.y + t.h * (0.4 + rand() * 0.2)], [t.x + t.w, t.y + t.h * 0.95]], 10);
      line(c, a, 3 + rand() * 3, rand);
      if (rand() < 0.6) line(c, smooth([[t.x + t.w, t.y], [t.x + t.w * 0.45, t.y + t.h * 0.55], [t.x, t.y + t.h]], 10), 3 + rand() * 3, rand);
      c.shadowBlur = 0; drips(c, [a], t.fill, 2.5, rand, 3);
      break;
    }
    case 'loop': {
      // a neon scrawl of loops over the top, thin and fast
      const pts: Pt[] = Array.from({ length: 16 }, (_, i) => [t.x + (i / 15) * t.w + (rand() - 0.5) * t.w * 0.14, t.y + t.h / 2 + Math.sin(i * 1.6 + rand()) * t.h * 0.55]);
      c.fillStyle = t.fill; c.shadowColor = t.fill; c.shadowBlur = 5;
      line(c, smooth(pts, 10), 2.4 + rand() * 1.5, rand);
      break;
    }
    default: {
      const wild = t.kind === 'tag' ? 1.4 : t.kind === 'piece' ? 0.8 : 1;
      const strokes = word(rand, t.x, t.y, t.w, t.h, wild);
      const width = t.kind === 'throwup' ? t.h * 0.4 : t.kind === 'piece' ? t.h * 0.3 : t.kind === 'outline' ? t.h * 0.22 : t.h * 0.12;
      if (t.kind !== 'tag') {
        // the outline: the same letters fatter, in the line colour, with a
        // hard drop shadow under big pieces
        if (t.kind === 'piece') { c.fillStyle = 'rgba(10,10,12,0.85)'; strokes.forEach(s => line(c, s.map(([x, y]) => [x + width * 0.35, y + width * 0.3] as Pt), width + 6, rand, false)); }
        c.fillStyle = t.line;
        strokes.forEach(s => line(c, s, width + 5, rand, false));
      }
      c.fillStyle = t.fill; c.shadowColor = t.fill; c.shadowBlur = t.kind === 'tag' ? 3.5 : 2;
      strokes.forEach(s => line(c, s, width, rand, t.kind === 'tag'));
      c.shadowBlur = 0;
      if (t.kind !== 'tag') {
        // shine: thin bright marks along the top of fat letters
        c.fillStyle = 'rgba(255,255,255,0.7)';
        strokes.slice(0, -1).forEach(s => { if (rand() < 0.6) line(c, s.map(([x, y]) => [x - width * 0.18, y - width * 0.22] as Pt).filter((_, i) => i % 3 === 0), width * 0.14, rand, true); });
      }
      if (rand() < 0.5) splatter(c, t.x + rand() * t.w, t.y + rand() * t.h, t.h * 0.4, t.fill, rand);
      drips(c, strokes, t.kind === 'tag' ? t.fill : t.line, Math.max(2.2, width * 0.5), rand, t.kind === 'piece' || t.kind === 'throwup' ? 9 : 5);
    }
  }
  c.restore();
}

// Graffiti colours as they are actually bought: lots of white, silver and
// black, then a few loud ones.
const FILLS = ['#F4F1EA', '#F4F1EA', '#F4F1EA', '#D9DDE2', '#3DFF7A', '#2F6BFF', '#FF3B3B', '#FFD23F', '#FF5FB7', '#B07CFF', '#FF8A2A'];

// Others' marks across the body, oldest first: fog and ghosts, the big
// pieces, then tags over everything, then slashes, loops and splatter.
export function tagsFor(seed: string, count: number, body: { x0: number; y0: number; x1: number; y1: number }, K: number): Tag[] {
  const rand = rng(`tags|${seed}`);
  const X0 = body.x0 * K, Y0 = body.y0 * K, W = (body.x1 - body.x0) * K, H = (body.y1 - body.y0) * K;
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  // Each wall has its own few colours, as a crew's cans do: white leads,
  // two or three loud ones, black for lines. A rainbow reads as noise.
  const loud = FILLS.slice(4).sort(() => rand() - 0.5).slice(0, 2 + Math.floor(rand() * 2));
  const fills = ['#F4F1EA', '#F4F1EA', '#D9DDE2', ...loud];
  const lines = ['#1A1B1F', '#1A1B1F', ...loud];
  const out: Tag[] = [];
  const add = (kind: TagKind, w: number, h: number, age: number, fillAs?: string) => {
    const fill = fillAs ?? pick(fills);
    let lineColour = pick(lines);
    if (lineColour === fill) lineColour = '#1A1B1F';
    const x = X0 - w * 0.15 + rand() * (W + w * 0.1 - w * 0.8);
    const y = Y0 - h * 0.15 + rand() * Math.max(1, H - h * 0.7);
    out.push({ kind, x, y, w, h, rot: (rand() - 0.5) * (kind === 'piece' ? 0.3 : 0.6), fill, line: lineColour, seed: `${seed}|${out.length}`, age });
  };
  if (count <= 0) return out;
  // More people, a busier wall, but the body keeps showing through.
  const n = Math.min(8, Math.max(3, Math.round(count / 2)));
  for (let i = 0; i < 1 + Math.floor(rand() * 2); i++) add('haze', W * (0.2 + rand() * 0.25), H * (0.5 + rand() * 0.4), 0.8);
  for (let i = 0; i < Math.min(3, Math.ceil(n / 3)); i++) {
    const h = H * (0.14 + rand() * 0.14);
    add(rand() < 0.5 ? 'outline' : 'throwup', Math.min(W * 0.4, h * (2.3 + rand())), h, 0.82);
  }
  // the piece that owns the side: big, white, outlined, tilted
  { const h = H * (0.5 + rand() * 0.2); add('piece', Math.min(W * 0.7, h * (2.4 + rand() * 0.8)), h, 0.92, '#F4F1EA'); }
  for (let i = 0; i < n; i++) {
    const h = H * (0.1 + rand() * rand() * 0.3);
    add('tag', Math.min(W * 0.45, h * (3 + rand() * 2)), h, 0.82 + (i / n) * 0.15);
  }
  if (count > 3) add('slash', W * (0.12 + rand() * 0.12), H * (0.3 + rand() * 0.4), 0.9);
  add('loop', W * (0.2 + rand() * 0.25), H * 0.28, 0.95);
  for (let i = 0; i < 1 + Math.floor(rand() * 2); i++) { const s = H * (0.07 + rand() * 0.1); add('splat', s, s, 0.9); }
  return out;
}
