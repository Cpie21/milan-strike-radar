import type { Mode } from '../../../lib/lab/model';
import { rng, SYMBOLS, type Tag } from '../graffitiArt';
import type { Stroke } from '../graffitiStore';

// Everything painted on a vehicle's side, drawn into one canvas that the 3D
// body wears as its texture: livery, glazing, everyone's tags, your strokes.
// Coordinates are the 360×150 stage the drawings are stored in.

export const STAGE = { w: 360, h: 150 };

type Livery = {
  windows: [number, number, number, number, number][];
  paths: string[]; // shaped glazing (noses, windscreens)
  doors: [number, number, number, number][];
  stripe: [number, number];
  circles?: [number, number, number][];
};

export const LIVERY: Record<Mode, Livery> = {
  TRAIN: {
    windows: [28, 62, 96, 190, 224, 258].map(x => [x, 54, 26, 20, 5]),
    paths: ['M286 52 H300 C318 54 330 66 337 82 H286 Q282 82 282 78 V56 Q282 52 286 52 Z'],
    doors: [[136, 50, 26, 60]],
    stripe: [90, 7],
  },
  SUBWAY: {
    windows: [[14, 50, 16, 26, 4], [330, 50, 16, 26, 4], [106, 54, 56, 24, 4], [206, 54, 56, 24, 4], [38, 54, 24, 24, 4], [302, 54, 24, 24, 4],
      ...[70, 170, 270].flatMap(x => [[x + 3, 54, 11, 28, 3], [x + 16, 54, 11, 28, 3]] as [number, number, number, number, number][])],
    paths: [],
    doors: [[70, 48, 30, 66], [170, 48, 30, 66], [270, 48, 30, 66]],
    stripe: [88, 6],
  },
  BUS: {
    windows: [[24, 46, 52, 32, 5], [82, 46, 52, 32, 5], [140, 46, 52, 32, 5], [198, 46, 52, 32, 5], [262, 50, 22, 30, 3]],
    paths: ['M300 46 H316 Q336 46 341 66 L343 78 H300 Z'],
    doors: [[258, 46, 30, 66]],
    stripe: [88, 6],
  },
  AIRPORT: {
    windows: [],
    paths: ['M322 72 Q334 72 342 80 L326 80 Z'],
    doors: [[298, 66, 14, 26]],
    stripe: [88, 5],
    circles: Array.from({ length: 16 }, (_, i) => [92 + i * 13, 76, 3.2] as [number, number, number]),
  },
};

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

// The painted shell, without graffiti: a night livery. Graphite body,
// glazing dark in the colour map (the light comes from the glow map).
export function paintBody(ctx: CanvasRenderingContext2D, mode: Mode, accent: string) {
  const L = LIVERY[mode];
  const body = ctx.createLinearGradient(0, 30, 0, 120);
  body.addColorStop(0, '#454A54');
  body.addColorStop(0.5, '#2A2E35');
  body.addColorStop(1, '#17191D');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, STAGE.w, STAGE.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.6;
  for (let x = 60; x < STAGE.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 118); ctx.stroke(); }
  ctx.fillStyle = accent;
  ctx.fillRect(0, L.stripe[0], STAGE.w, L.stripe[1]);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, L.stripe[0], STAGE.w, 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 0.8;
  L.doors.forEach(([x, y, w, h]) => { rr(ctx, x, y, w, h, 2.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke(); });
  glazing(ctx, mode, () => '#2B2117');
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 0.5;
  L.windows.forEach(([x, y, w, h, r]) => { rr(ctx, x + 0.3, y + 0.3, w - 0.6, h - 0.6, r); ctx.stroke(); });
  const skirt = ctx.createLinearGradient(0, 104, 0, 120);
  skirt.addColorStop(0, 'rgba(0,0,0,0)');
  skirt.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = skirt;
  ctx.fillRect(0, 104, STAGE.w, 16);
}

function glazing(ctx: CanvasRenderingContext2D, mode: Mode, fill: () => string | CanvasGradient) {
  const L = LIVERY[mode];
  ctx.fillStyle = fill();
  L.windows.forEach(([x, y, w, h, r]) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); ctx.fill(p); });
  L.paths.forEach(d => ctx.fill(new Path2D(d)));
  L.circles?.forEach(([x, y, r]) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); ctx.fill(p); });
}

// What glows at night: lit cabins, the livery stripe. Used as an emissive
// map, so it blooms against the dark card instead of sitting on it.
export function paintGlow(ctx: CanvasRenderingContext2D, mode: Mode, accent: string) {
  const L = LIVERY[mode];
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, STAGE.w, STAGE.h);
  glazing(ctx, mode, () => {
    const g = ctx.createLinearGradient(0, 46, 0, 84);
    g.addColorStop(0, '#F6CF95');
    g.addColorStop(1, '#9C5F24');
    return g;
  });
  // Seat backs and heads against the light, so the cabins read as cabins.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  L.windows.forEach(([x, y, w, h], i) => {
    if (w < 20) return;
    for (let sx = x + 6 + (i % 3) * 2; sx < x + w - 6; sx += 15) { const p = new Path2D(); p.roundRect(sx, y + h * 0.55, 6, h * 0.45, 3); ctx.fill(p); }
  });
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = accent;
  ctx.fillRect(0, L.stripe[0], STAGE.w, L.stripe[1]);
  ctx.globalAlpha = 1;
}

// Others' tags: language-neutral symbols with a dark outline and overspray.
export function paintTag(ctx: CanvasRenderingContext2D, tag: Tag) {
  const sym = SYMBOLS[tag.kind];
  const path = new Path2D(sym.d);
  ctx.save();
  ctx.translate(tag.x, tag.y);
  ctx.rotate((tag.r * Math.PI) / 180);
  ctx.scale(tag.s, tag.s);
  ctx.globalAlpha = tag.back ? 0.45 : 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,11,13,0.55)';
  ctx.lineWidth = sym.w + 3;
  ctx.stroke(path);
  ctx.shadowColor = tag.color;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = tag.color;
  ctx.lineWidth = sym.w;
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  tag.drips.forEach(dx => {
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(dx, 13); ctx.lineTo(dx, 20 + Math.abs(dx) % 8); ctx.stroke();
  });
  ctx.restore();
}

function trace(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) ctx.lineTo(p[0] + 0.1, p[1]);
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  if (p.length > 2) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
}

// A user's spray stroke: halo, solid core, speckle; drips are thin runs
// with a bead at the end. `px` is device pixels per stage unit.
export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, index: number, px: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  if (s.d) {
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = s.w;
    trace(ctx, s.p);
    ctx.stroke();
    const [x, y] = s.p.slice(-2);
    ctx.beginPath(); ctx.arc(x, y, s.w * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const rand = rng(`${index}|${s.p.length}|${s.p[0]}`);
  ctx.globalAlpha = 0.3;
  ctx.shadowColor = s.c;
  ctx.shadowBlur = s.w * 1.4 * px;
  ctx.lineWidth = s.w * 1.5;
  trace(ctx, s.p);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = s.w;
  trace(ctx, s.p);
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < s.p.length; i += 6) {
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      const d = s.w * (0.8 + rand() * 0.9);
      ctx.beginPath();
      ctx.arc(s.p[i] + Math.cos(a) * d, s.p[i + 1] + Math.sin(a) * d, 0.35 + rand() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
