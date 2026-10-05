import type { Mode } from '../../../lib/lab/model';

// Pixel scenes for the graffiti wall: a parked vehicle at night, on a
// 240×140 grid scaled up with hard edges.
//
// After the side-view vehicle pixel artists (Alessio Conti, Etherfield,
// PXLCRS): one honest side view of a real Italian vehicle, filling the frame;
// 2–3 tones per material, edges in a darker tone of the fill (not black
// everywhere); glass that carries its cabin light; clear wheels; a plain
// background so the vehicle reads first.
//
// The scene lights the vehicle: warm ceiling lamps put a bright streak on
// the upper body where each lamp sits above, the lower body falls into cool
// ambient shadow, and lamps leave pools on the floor.
//
//   metro – Milan M1 "Leonardo" cab car: white body, red front, red doors
//   train – Trenord "Caravaggio" double-deck cab car: sloped nose, two
//           window rows, green and blue bands, pantograph
//   bus   – Italian low-floor city bus: orange and white, LED route sign
//   plane – A320 side view: rounded nose, swept fin, engine under the wing
// Nothing moves: it is a strike.

export const PW = 240;
export const PH = 140;

type C = CanvasRenderingContext2D;
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const P = (c: C, x: number, y: number, col: string) => R(c, x, y, 1, 1, col);
const disc = (c: C, cx: number, cy: number, r: number, col: string) => {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) c.fillRect(cx + x, cy + y, 1, 1);
};

// A silhouette as top/bottom per column, shaded in bands from the top
// (lit) to the bottom (shadow), edged in a darker tone of the fill.
type Ramp = { hi: string; base: string; low: string; edge: string; shine?: string };
// Painted white under station light at night is not white: a cool silver
// whose top catches the lamps and whose skirt sinks into the shadow.
const SILVER: Ramp = { shine: '#E4E6E8', hi: '#C3C8CE', base: '#A2A9B2', low: '#7A828D', edge: '#474D56' };
function hull(c: C, x0: number, x1: number, top: (x: number) => number, bottom: (x: number) => number, ramp: Ramp) {
  for (let x = x0; x <= x1; x++) {
    const t = Math.round(top(x)), b = Math.round(bottom(x));
    if (b <= t) continue;
    const h = b - t;
    R(c, x, t, 1, h, ramp.base);
    const hi = Math.max(1, Math.round(h * 0.2));
    R(c, x, t, 1, hi, ramp.hi);
    if (x % 2 === 0 && h > 8) P(c, x, t + hi, ramp.hi); // dithered, not banded
    const lo = Math.max(1, Math.round(h * 0.28));
    R(c, x, b - lo, 1, lo, ramp.low);
    if (x % 2 === 1 && h > 8) P(c, x, b - lo - 1, ramp.low);
    P(c, x, t, ramp.edge); P(c, x, b - 1, ramp.edge);
    if (h > 6) P(c, x, t + 1, ramp.shine ?? ramp.hi); // the roof's curve catching the ceiling light
  }
  for (let x = x0; x <= x1; x++) {
    const t = Math.round(top(x)), b = Math.round(bottom(x));
    if (b <= t) continue;
    const pt = Math.round(top(x - 1)), pb = Math.round(bottom(x - 1));
    if (x === x0 || x === x1) R(c, x, t, 1, b - t, ramp.edge);
    else { if (t < pt) R(c, x, t, 1, pt - t + 1, ramp.edge); if (b > pb) R(c, x, pb - 1, 1, b - pb + 1, ramp.edge); }
    const nt = Math.round(top(x + 1)), nb = Math.round(bottom(x + 1));
    if (t < nt) R(c, x, t, 1, nt - t + 1, ramp.edge);
    if (b > nb) R(c, x, nb - 1, 1, b - nb + 1, ramp.edge);
  }
}
const hullMask = (c: C, x0: number, x1: number, top: (x: number) => number, bottom: (x: number) => number) => {
  for (let x = x0; x <= x1; x++) { const t = Math.round(top(x)), b = Math.round(bottom(x)); if (b > t) R(c, x, t, 1, b - t, '#FFFFFF'); }
};

// Tinted glass on an empty, parked car: the cabin is dim, its ceiling
// strip still glows, seat backs stand dark against the far-side windows,
// which let the platform light through. No reflections.
function pane(c: C, x: number, y: number, w: number, h: number, frame: string) {
  R(c, x, y, w, h, '#202A33');
  R(c, x + 1, y + 1, w - 2, 1, '#8FA6AC'); // ceiling light strip
  R(c, x + 1, y + 2, w - 2, 1, '#3A4A54');
  const far = Math.max(2, Math.round(h * 0.38));
  R(c, x + 2, y + 3, w - 4, far, '#34444E'); // the far-side windows
  for (let sx = x + 2; sx < x + w - 3; sx += 4) { R(c, sx, y + 3 + far - 2, 2, h - far - 4, '#141B21'); P(c, sx, y + 3 + far - 2, '#4B5A63'); }
  R(c, x, y, w, 1, frame); R(c, x, y + h - 1, w, 1, frame); R(c, x, y, 1, h, frame); R(c, x + w - 1, y, 1, h, frame);
}
// A continuous tinted band of windows split by mullions (regional trains).
function band(c: C, x0: number, x1: number, y: number, h: number, frame: string, step: number) {
  for (let x = x0; x < x1; x += step) pane(c, x, y, Math.min(step + 1, x1 - x), h, frame);
}
// Dark glass (cab windscreen, bus screen) with a sky streak.
function darkGlass(c: C, x: number, y: number, w: number, h: number) {
  R(c, x, y, w, h, '#151C25');
  R(c, x, y, w, 1, '#2C3B4C');
  R(c, x + 1, y + h - 3, w - 2, 2, '#1D2630'); // the dashboard
}
function wheel(c: C, cx: number, cy: number, r: number) {
  disc(c, cx, cy, r, '#0D0E10');
  if (r > 3) disc(c, cx, cy, r - 2, '#4E535B');
  if (r > 3) disc(c, cx, cy, r - 3, '#8D939B');
  disc(c, cx, cy, Math.max(1, r - 5), '#3A3E45');
  P(c, cx - 1, cy - r + 2, '#B9BEC5');
}
function bogie(c: C, x: number, y: number) {
  R(c, x, y, 28, 3, '#1E2024'); R(c, x + 2, y, 24, 1, '#32363C');
  R(c, x + 11, y - 2, 6, 2, '#2A2D33');
  wheel(c, x + 6, y + 5, 4); wheel(c, x + 22, y + 5, 4);
}

// The scene's light on the vehicle.
function lampsOn(c: C, inside: (x: number, y: number) => boolean, lamps: number[], y0: number, y1: number) {
  lamps.forEach(lx => {
    for (let y = y0; y < y0 + 14; y++) for (let dx = -2; dx <= 2; dx++) if (inside(lx + dx, y)) { c.fillStyle = `rgba(255,214,150,${(0.24 - (y - y0) * 0.016) * (1 - Math.abs(dx) * 0.25)})`; c.fillRect(lx + dx, y, 1, 1); }
  });
  for (let y = y1 - 10; y < y1; y++) { c.fillStyle = `rgba(20,40,80,${(y - (y1 - 10)) * 0.02})`; for (let x = 0; x < PW; x++) if (inside(x, y)) c.fillRect(x, y, 1, 1); }
}

// LED font for the strike sign ("!!!" while you press); 3×5 for the bus route
const FONT: Record<string, string[]> = {
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'], ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
export function ledText(c: C, text: string, x: number, y: number, on: string, off?: string, clip?: { x: number; w: number }) {
  [...text].forEach((ch, i) => (FONT[ch] || FONT[' ']).forEach((row, ry) => [...row].forEach((p, rx) => {
    const px = x + i * 6 + rx;
    if (clip && (px < clip.x || px >= clip.x + clip.w)) return;
    if (p === '#') P(c, px, y + ry, on); else if (off) P(c, px, y + ry, off);
  })));
}
const SMALL: Record<string, string[]> = { '9': ['###', '#.#', '###', '..#', '###'], '0': ['###', '#.#', '#.#', '#.#', '###'] };
function smallText(c: C, text: string, x: number, y: number, col: string) {
  [...text].forEach((ch, i) => (SMALL[ch] || []).forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') P(c, x + i * 4 + rx, y + ry, col); })));
}

export type Scene = {
  body: { x0: number; y0: number; x1: number; y1: number }; // the paintable side, for slots
  sign: { x: number; y: number; w: number };
  lamps: [number, number][]; // headlights, flashed while you press the button
  background: (c: C) => void;
  neighbours: (c: C) => void;
  vehicle: (c: C) => void;
  mask: (c: C) => void;
  foreground: (c: C) => void;
};

// ── Backdrops: plain, so the vehicle reads first ───────────────────────

const CEILING = [44, 120, 196];
function station(c: C) {
  const g = c.createLinearGradient(0, 0, 0, 110);
  g.addColorStop(0, '#0C0D11'); g.addColorStop(1, '#16181E');
  c.fillStyle = g; c.fillRect(0, 0, PW, PH);
  for (let y = 22; y < 104; y += 10) R(c, 0, y, PW, 1, 'rgba(255,255,255,0.025)');
  R(c, 0, 40, PW, 3, '#1B2742');
  CEILING.forEach(x => {
    R(c, x - 12, 3, 24, 2, '#FFE7C2'); R(c, x - 13, 5, 26, 1, '#3A3326');
    for (let y = 6; y < 46; y++) { const w = 14 + (y - 6) * 0.7; c.fillStyle = `rgba(255,214,150,${0.05 - (y - 6) * 0.001})`; c.fillRect(Math.round(x - w), y, Math.round(w * 2), 1); }
  });
}
function platform(c: C) {
  R(c, 0, 106, PW, 3, '#3C4047'); R(c, 0, 106, PW, 1, '#5C6169');
  R(c, 0, 109, PW, 31, '#1A1C21');
  R(c, 0, 110, PW, 4, '#D6B13F'); R(c, 0, 110, PW, 1, '#ECCB5E');
  for (let x = 1; x < PW; x += 3) P(c, x, 112, '#A88A2C');
  CEILING.forEach(x => { for (let y = 116; y < 140; y++) { const w = 18 + (y - 116) * 0.9; c.fillStyle = 'rgba(255,214,150,0.035)'; c.fillRect(Math.round(x - w), y, Math.round(w * 2), 1); } });
}

// ── Metro: Milan M1 "Leonardo" cab car ─────────────────────────────────

function metro(): Scene {
  const x0 = 22, x1 = 216, top = 54, bot = 100;
  const WHITE = SILVER;
  const RED: Ramp = { shine: '#FF8A7C', hi: '#E8463A', base: '#C92F25', low: '#9A221B', edge: '#5E140F' };
  const T = (x: number) => (x > x1 - 8 ? top + (x - (x1 - 8)) * 0.9 : top);
  const B = () => bot;
  const doors = [52, 106, 160];
  return {
    body: { x0: x0 + 4, y0: top + 2, x1: x1 - 28, y1: bot - 2 },
    sign: { x: 158, y: 12, w: 70 },
    lamps: [[x1 - 3, top + 33]],
    background: station,
    neighbours: c => {
      hull(c, -60, x0 - 6, () => top, () => bot, SILVER);
      for (let x = -56; x < x0 - 10; x += 18) pane(c, x, top + 9, 14, 16, '#474D56');
      R(c, -60, bot - 8, x0 + 54, 3, '#C92F25');
    },
    vehicle: c => {
      R(c, x0 - 6, top + 8, 6, bot - top - 12, '#24262B'); for (let y = top + 9; y < bot - 4; y += 2) R(c, x0 - 6, y, 6, 1, '#33363C');
      R(c, x0 + 30, top - 4, 46, 4, '#8E949C'); R(c, x0 + 30, top - 4, 46, 1, '#B4BAC2');
      R(c, x0 + 110, top - 3, 30, 3, '#8E949C');
      hull(c, x0, x1, T, B, WHITE);
      hull(c, x1 - 26, x1, T, B, RED); // red front wrapping the cab
      darkGlass(c, x1 - 22, top + 6, 18, 18);
      R(c, x1 - 4, top + 32, 3, 3, '#FFF3D0');
      for (let x = x0 + 4; x < x1 - 30; x += 18) if (!doors.some(d => x + 14 > d - 2 && x < d + 20)) pane(c, x, top + 9, 14, 16, '#474D56');
      doors.forEach(d => {
        R(c, d - 1, top + 6, 20, bot - top - 6, '#5E140F');
        hull(c, d, d + 17, () => top + 7, () => bot, RED);
        pane(c, d + 2, top + 10, 6, 22, '#5E140F'); pane(c, d + 10, top + 10, 6, 22, '#5E140F');
        R(c, d + 8, top + 7, 2, bot - top - 7, '#5E140F');
      });
      R(c, x0, bot - 8, x1 - x0 - 26, 3, '#C92F25'); R(c, x0, bot - 8, x1 - x0 - 26, 1, '#E8463A');
      // the white M on red, as on every Milan metro sign
      R(c, x0 + 86, top + 30, 9, 9, '#C92F25'); R(c, x0 + 86, top + 30, 9, 1, '#E8463A');
      ['#.#.#', '#####', '#.#.#', '#.#.#', '#...#'].forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') P(c, x0 + 88 + rx, top + 32 + ry, '#FFFFFF'); }));
      R(c, x0 + 4, bot, x1 - x0 - 8, 3, '#1E2024');
      bogie(c, x0 + 22, bot + 1); bogie(c, x1 - 52, bot + 1);
      lampsOn(c, (x, y) => x >= x0 && x <= x1 && y >= T(x) && y < bot, CEILING, top, bot);
    },
    mask: c => hullMask(c, x0, x1 - 27, T, B),
    foreground: platform,
  };
}

// ── Regional train: Trenord "Caravaggio" double-deck, cab car + one more ──

function train(): Scene {
  const top = 34, bot = 102, H = bot - top;
  const cab0 = 36, x1 = 226, nose = x1 - 50;
  const GREEN: Ramp = { shine: '#8FE0A9', hi: '#46B26F', base: '#2F9A5B', low: '#1F7344', edge: '#124A2B' };
  const BLUE = '#2D6FD0';
  // The Caravaggio's nose: the roof rolls over, slowly then steeply, into a
  // raked windscreen; a short rounded front below carries the lamps.
  const T = (x: number) => (x > nose ? top + Math.round(H * 0.62 * ((x - nose) / (x1 - nose)) ** 1.8) : top);
  const B = (x: number) => (x > x1 - 6 ? bot - Math.round((x - (x1 - 6)) * 1.5) : bot);
  const flat = () => top, floor = () => bot;
  // One double-deck side, shared by both cars: tinted window bands on two
  // decks, green doors, the green band with a blue line.
  const side = (c: C, a: number, b: number, doors: number[]) => {
    band(c, a + 6, b - 6, top + 8, 13, '#474D56', 15);
    const lower = [a + 6, ...doors.flatMap(d => [d - 4, d + 26]), b - 6];
    for (let i = 0; i < lower.length; i += 2) if (lower[i + 1] - lower[i] > 10) band(c, lower[i], lower[i + 1], top + 35, 12, '#474D56', 15);
    for (let x = a + 1; x < b; x++) {
      if (doors.some(d => x >= d - 1 && x <= d + 22) || T(x) > bot - 20) continue;
      R(c, x, bot - 16, 1, 6, '#2F9A5B'); P(c, x, bot - 16, '#46B26F'); P(c, x, bot - 11, '#1F7344'); R(c, x, bot - 19, 1, 2, BLUE);
    }
    doors.forEach(d => {
      R(c, d - 1, top + 28, 24, H - 28, '#474D56');
      hull(c, d, d + 21, () => top + 29, floor, GREEN);
      pane(c, d + 2, top + 33, 8, 22, '#124A2B'); pane(c, d + 12, top + 33, 8, 22, '#124A2B'); R(c, d + 10, top + 29, 2, H - 29, '#124A2B');
    });
  };
  return {
    body: { x0: 2, y0: top + 2, x1: nose - 4, y1: bot - 2 },
    sign: { x: 158, y: 6, w: 70 },
    lamps: [[x1 - 6, bot - 18]],
    background: c => { station(c); R(c, 0, 16, PW, 1, '#5A5E66'); R(c, 0, 12, PW, 1, '#33363C'); for (let x = 4; x < PW; x += 30) R(c, x, 12, 1, 4, '#3A3D43'); },
    neighbours: () => {},
    vehicle: c => {
      // The next car, running on out of the frame, joined by its gangway
      hull(c, -80, cab0 - 7, flat, floor, SILVER);
      side(c, -80, cab0 - 7, [-6]);
      R(c, cab0 - 6, top + 10, 5, H - 18, '#1A1C20'); for (let y = top + 11; y < bot - 8; y += 2) R(c, cab0 - 6, y, 5, 1, '#2A2D33');
      // The cab car
      hull(c, cab0, x1, T, B, SILVER);
      side(c, cab0, nose - 6, [70, 128]);
      // Cab: a side window, then the windscreen in its black mask, from the
      // roof's curve down to half height, following the nose.
      pane(c, nose - 4, top + 8, 12, 14, '#474D56');
      for (let x = nose + 10; x <= x1 - 3; x++) {
        const t = T(x) + 1, b = top + Math.round(H * 0.5) + Math.round((x - nose - 10) * 0.15);
        if (b - t < 2) continue;
        R(c, x, t, 1, b - t, '#0E1319');
        P(c, x, t, '#2C3B4C');
        if (b - t > 6) R(c, x, t + 2, 1, Math.min(3, b - t - 4), '#18212B'); // the dim cab inside
      }
      // the front below: green and blue wrap round the nose, lamps in black
      for (let x = nose; x < x1 - 1; x++) { if (B(x) - 19 < T(x) + 2) continue; R(c, x, B(x) - 16, 1, 6, '#2F9A5B'); P(c, x, B(x) - 16, '#46B26F'); R(c, x, B(x) - 19, 1, 2, BLUE); }
      R(c, x1 - 10, bot - 26, 8, 4, '#0E1319'); R(c, x1 - 8, bot - 25, 3, 2, '#FFF3D0'); P(c, x1 - 8, bot - 25, '#FFFFFF');
      R(c, -60, bot, x1 + 50, 3, '#1E2024');
      bogie(c, -20, bot + 1); bogie(c, cab0 + 10, bot + 1); bogie(c, x1 - 60, bot + 1);
      // pantograph on the cab car's roof
      const px = cab0 + 56;
      R(c, px, top - 2, 24, 2, '#2C2E33');
      for (let i = 0; i < 7; i++) { P(c, px + 6 + i, top - 3 - i * 2, '#4A4D53'); P(c, px + 18 - i, top - 3 - i * 2, '#4A4D53'); }
      R(c, px + 4, top - 18, 16, 1, '#7A7E86');
      lampsOn(c, (x, y) => ((x >= cab0 && x <= x1 && y >= T(x) && y < B(x)) || (x < cab0 - 7 && y >= top && y < bot)), CEILING, top, bot);
    },
    mask: c => { hullMask(c, 0, cab0 - 8, flat, floor); hullMask(c, cab0, nose - 2, T, B); },
    foreground: platform,
  };
}

// ── City bus ──────────────────────────────────────────────────────────

function bus(): Scene {
  const x0 = 26, x1 = 214, top = 52, bot = 104;
  // arancio ministeriale, the orange Italian buses wore for decades
  const ORANGE: Ramp = { shine: '#FFC58A', hi: '#FFA04A', base: '#F07F1E', low: '#C26112', edge: '#7E3B08' };
  const round = (x: number) => (x < x0 + 4 ? 4 - (x - x0) : x > x1 - 4 ? 4 - (x1 - x) : 0);
  const T = (x: number) => top + Math.max(0, round(x));
  const B = () => bot;
  const wheels = [64, 178];
  return {
    body: { x0: x0 + 4, y0: top + 3, x1: x1 - 26, y1: bot - 4 },
    sign: { x: 14, y: 8, w: 64 },
    lamps: [[x1 - 3, bot - 12]],
    background: c => {
      const g = c.createLinearGradient(0, 0, 0, 110);
      g.addColorStop(0, '#0C0D11'); g.addColorStop(1, '#17191E');
      c.fillStyle = g; c.fillRect(0, 0, PW, PH);
      [[4, 76], [84, 76], [164, 76]].forEach(([sx, sw]) => { R(c, sx, 22, sw, 84, '#15171B'); for (let y = 24; y < 106; y += 4) R(c, sx, y, sw, 1, '#1B1E22'); R(c, sx - 2, 19, sw + 4, 3, '#24272C'); });
      CEILING.forEach(x => { R(c, x - 8, 6, 16, 2, '#FFDDA6'); for (let y = 8; y < 34; y++) { const w = 10 + (y - 8) * 0.8; c.fillStyle = 'rgba(255,214,150,0.04)'; c.fillRect(Math.round(x - w), y, Math.round(w * 2), 1); } });
    },
    neighbours: () => {},
    vehicle: c => {
      R(c, x0 + 40, top - 5, 80, 5, '#A9AEB5'); R(c, x0 + 40, top - 5, 80, 1, '#CDD1D6');
      hull(c, x0, x1, T, B, ORANGE);
      for (let x = x0 + 1; x < x1; x++) R(c, x, T(x) + 1, 1, 6, '#EDEAE4');
      for (let x = x0 + 4; x < x1 - 30; x += 22) if (!(x > 110 && x < 140)) pane(c, x, top + 9, 20, 20, '#8A4512');
      [[116, 22], [x1 - 40, 14]].forEach(([d, w]) => { R(c, d, top + 8, w, bot - top - 10, '#22262C'); pane(c, d + 1, top + 9, Math.floor(w / 2) - 1, bot - top - 14, '#22262C'); pane(c, d + Math.floor(w / 2) + 1, top + 9, Math.floor(w / 2) - 1, bot - top - 14, '#22262C'); });
      darkGlass(c, x1 - 24, top + 9, 20, 30);
      R(c, x1 - 24, top + 2, 20, 6, '#08080A'); smallText(c, '90', x1 - 18, top + 2, '#FFB12E');
      R(c, x1 + 1, top + 10, 3, 1, '#1A1B1F'); R(c, x1 + 3, top + 10, 2, 9, '#1A1B1F');
      R(c, x1 - 4, bot - 13, 3, 3, '#FFF1C9'); R(c, x0 + 1, bot - 13, 2, 3, '#C9372C');
      R(c, x0, bot - 6, x1 - x0, 5, '#2B2E33'); R(c, x0, bot - 6, x1 - x0, 1, '#40444B');
      wheels.forEach(wx => { disc(c, wx, bot, 12, '#101114'); wheel(c, wx, bot + 1, 10); });
      lampsOn(c, (x, y) => x >= x0 && x <= x1 && y >= T(x) && y < bot - 6, CEILING, top, bot - 6);
    },
    mask: c => {
      hullMask(c, x0, x1 - 26, T, B);
      c.globalCompositeOperation = 'destination-out';
      wheels.forEach(wx => disc(c, wx, bot, 12, '#000'));
      c.globalCompositeOperation = 'source-over';
    },
    foreground: c => {
      R(c, 0, 114, PW, 2, '#3A3C41'); R(c, 0, 116, PW, 24, '#17191C');
      for (let lx = 4; lx < PW; lx += 26) R(c, lx, 128, 14, 2, '#4E5055');
      for (let i = x0; i < x1; i += 2) P(c, i, 115, 'rgba(0,0,0,0.6)');
    },
  };
}

// ── Plane: A320 side view, facing right ────────────────────────────────

function plane(tail: string): Scene {
  const x0 = 20, x1 = 224;
  const cy = 78; // fuselage centre line
  const half = 12;
  const nose = x1 - 26;
  // Fuselage: a tube with a rounded nose and a tail cone that sweeps up.
  const T = (x: number) => x > nose ? cy - Math.sqrt(Math.max(0, 1 - ((x - nose) / 26) ** 2)) * half
    : x < 64 ? cy - half + (64 - x) * 0.12 : cy - half;
  const B = (x: number) => x > nose ? cy + Math.sqrt(Math.max(0, 1 - ((x - nose) / 26) ** 2)) * half
    : x < 74 ? cy + half - (74 - x) * 0.36 : cy + half;
  const WHITE = SILVER;
  const TAIL: Ramp = { shine: '#A9D2FF', hi: '#6FB2FF', base: tail, low: '#1F5FB4', edge: '#123A70' };
  const GREY: Ramp = { shine: '#D7DBDF', hi: '#B6BCC3', base: '#8E959E', low: '#666D77', edge: '#3A3F47' };
  // Fin: leading edge (front, right) swept up and back; near-vertical trailing edge.
  const finTop = (x: number) => (x <= 38 ? 30 : 30 + (x - 38) * (36 / 28));
  const finBottom = (x: number) => (x < 28 ? 30 + (x - 24) * 9 : cy - half + 1);
  return {
    body: { x0: 70, y0: cy - half + 2, x1: nose - 4, y1: cy + half - 2 },
    sign: { x: 8, y: 6, w: 64 },
    lamps: [[x1 - 2, cy + 4]],
    background: c => {
      const g = c.createLinearGradient(0, 0, 0, 104);
      g.addColorStop(0, '#0A0C12'); g.addColorStop(1, '#161A22');
      c.fillStyle = g; c.fillRect(0, 0, PW, PH);
      for (let i = 0; i < 30; i++) P(c, (i * 67) % PW, (i * 23) % 26, 'rgba(255,255,255,0.35)');
      R(c, 0, 44, PW, 4, '#141820');
      for (let x = 0; x < PW; x += 9) R(c, x + 2, 45, 5, 2, (x * 7) % 5 ? '#212A36' : '#5C4A2E');
      [30, 120, 210].forEach(x => { R(c, x, 20, 1, 84, '#22262D'); R(c, x - 3, 20, 7, 2, '#FFE2B0'); });
    },
    neighbours: () => {},
    vehicle: c => {
      hull(c, 24, 66, finTop, finBottom, TAIL);
      for (let y = 0; y < 5; y++) R(c, 18 + y, cy - 3 + y, 26 - y * 2, 1, y === 0 ? '#C2C7CD' : '#9EA4AC'); // stabiliser
      hull(c, x0, x1, T, B, WHITE);
      for (let x = 74; x < nose + 8; x++) P(c, x, cy + 4, tail); // cheat line
      for (let x = 78; x < nose - 6; x += 4) { R(c, x, cy - 5, 2, 2, '#2A3644'); P(c, x, cy - 5, '#5D7086'); }
      [nose - 10, 70].forEach(dx => { R(c, dx, cy - 8, 5, 13, '#C9CDD3'); R(c, dx, cy - 8, 5, 1, '#9EA4AC'); R(c, dx, cy - 8, 1, 13, '#9EA4AC'); R(c, dx + 4, cy - 8, 1, 13, '#9EA4AC'); });
      for (let i = 0; i < 9; i++) R(c, nose + 8 + i, cy - 7 + Math.floor(i / 4), 1, 3, '#1A222C'); // cockpit
      // the near wing, nearly edge-on: a thin swept blade from the belly
      for (let x = 96; x <= 156; x++) { const t = cy + half - 3 + Math.round((156 - x) * 0.1), h = x > 150 ? 2 : 3; R(c, x, t, 1, h, '#B6BCC3'); P(c, x, t + h - 1, '#666D77'); }
      R(c, 92, cy + half + 1, 6, 2, '#8E959E'); // wingtip, the sharklet's root
      // CFM nacelle under and ahead of the wing: round intake, tapering tail
      const ec = cy + half + 9, er = 7;
      const eT = (x: number) => ec - er + (x < 142 ? Math.round(((142 - x) / 4) ** 1.4) : 0) + (x > 166 ? Math.round(((x - 166) / 2) ** 2) : 0);
      const eB = (x: number) => ec + er - (x < 142 ? Math.round(((142 - x) / 4) ** 1.4) : 0) - (x > 166 ? Math.round(((x - 166) / 2) ** 2) : 0);
      R(c, 146, cy + half - 1, 12, 4, '#666D77'); // pylon
      hull(c, 132, 169, eT, eB, GREY);
      R(c, 167, ec - 4, 2, 8, '#1A1D22'); R(c, 166, ec - 3, 1, 6, '#3A3F47'); // intake
      R(c, 129, ec - 1, 4, 3, '#3A3F47'); P(c, 128, ec, '#3A3F47'); // exhaust cone
      R(c, nose + 4, cy + half - 1, 2, 10, '#3A3F47'); wheel(c, nose + 5, cy + half + 10, 3);
      R(c, 130, cy + half + 1, 2, 21, '#3A3F47'); wheel(c, 131, cy + half + 22, 4); wheel(c, 123, cy + half + 22, 4);
      R(c, x1 - 1, cy + 3, 2, 2, '#FFF3D0');
      lampsOn(c, (x, y) => x >= x0 && x <= x1 && y >= T(x) && y < B(x), [30, 120, 210], cy - half, cy + half);
    },
    mask: c => hullMask(c, 66, nose - 2, T, B),
    foreground: c => {
      R(c, 0, 104, PW, 36, '#14161A'); R(c, 0, 104, PW, 1, '#22252B');
      for (let i = 0; i < 80; i++) P(c, i * 3, 124, i % 2 ? '#C9A63A' : 'rgba(201,166,58,0.4)');
      for (let x = 20; x < 220; x += 2) P(c, x, 113, 'rgba(0,0,0,0.5)');
    },
  };
}

export function sceneFor(mode: Mode, accent: string): Scene {
  return mode === 'SUBWAY' ? metro() : mode === 'TRAIN' ? train() : mode === 'BUS' ? bus() : plane(accent);
}

// Box blur for out-of-focus layers (canvas `filter` is not everywhere).
export function boxBlur(c: C, radius: number) {
  const img = c.getImageData(0, 0, PW, PH);
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  for (let pass = 0; pass < 2; pass++) {
    const from = pass === 0 ? src : out.slice();
    const to = pass === 0 ? out : src;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = pass === 0 ? Math.min(PW - 1, Math.max(0, x + k)) : x;
        const yy = pass === 0 ? y : Math.min(PH - 1, Math.max(0, y + k));
        const i = (yy * PW + xx) * 4;
        r += from[i]; g += from[i + 1]; b += from[i + 2]; a += from[i + 3]; n++;
      }
      const o = (y * PW + x) * 4;
      to[o] = r / n; to[o + 1] = g / n; to[o + 2] = b / n; to[o + 3] = a / n;
    }
  }
  c.putImageData(img, 0, 0);
}
