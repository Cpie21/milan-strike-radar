import type { Mode } from '../../../lib/lab/model';

// Pixel scenes for the graffiti wall: a parked vehicle at night in a place
// you could deface, drawn on a 240×140 grid and scaled up with hard edges.
// Each vehicle carries the details people remember it by:
//   metro  – silver car, red band, sliding doors, gangways to the next cars
//   train  – Trenord-style double decker, two rows of windows, pantograph
//   bus    – ATM orange, white roof band, LED route sign, big wheel arches
//   plane  – fuselage at a gate, jet bridge, tail fin, wing and engine
// Nothing moves: it is a strike.

export const PW = 240;
export const PH = 140;

type C = CanvasRenderingContext2D;
const R = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const disc = (c: C, cx: number, cy: number, r: number, col: string) => {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) c.fillRect(cx + x, cy + y, 1, 1);
};

// Cabin light, in three warm bands so it reads as pixel art, not a gradient.
const lit = (c: C, x: number, y: number, w: number, h: number) => {
  R(c, x, y, w, h, '#C98945');
  R(c, x, y, w, Math.ceil(h * 0.6), '#E7B068');
  R(c, x, y, w, Math.ceil(h * 0.25), '#F6D49A');
  // heads and seat backs against the light
  for (let sx = x + 2; sx < x + w - 2; sx += 6) R(c, sx, y + h - Math.ceil(h * 0.35), 3, Math.ceil(h * 0.35), 'rgba(40,24,10,0.55)');
};

// 5×7 LED font for the signs
const FONT: Record<string, string[]> = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
};
export function ledText(c: C, text: string, x: number, y: number, on: string, off?: string, clip?: { x: number; w: number }) {
  [...text].forEach((ch, i) => {
    const g = FONT[ch] || FONT[' '];
    g.forEach((row, ry) => [...row].forEach((p, rx) => {
      const px = x + i * 6 + rx;
      if (clip && (px < clip.x || px >= clip.x + clip.w)) return;
      if (p === '#') R(c, px, y + ry, 1, 1, on);
      else if (off) R(c, px, y + ry, 1, 1, off);
    }));
  });
}

export type Scene = {
  body: { x0: number; y0: number; x1: number; y1: number }; // where tags go
  sign: { x: number; y: number; w: number };
  lamps: [number, number][]; // headlights, flashed on touch
  spot: { x: number; y: number }; // where your first mark lands
  background: (c: C) => void;
  neighbours: (c: C) => void; // drawn blurred: the cars beyond focus
  vehicle: (c: C) => void;
  mask: (c: C) => void; // paintable surface, in white
  foreground: (c: C) => void;
};

// ── Shared backdrops ──────────────────────────────────────────────────

function stationWall(c: C, accent: string) {
  R(c, 0, 0, PW, PH, '#121317');
  for (let y = 0; y < 108; y += 8) R(c, 0, y, PW, 1, '#17191D');
  for (let y = 0; y < 108; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < PW; x += 12) R(c, x, y, 1, 8, '#17191D');
  // old posters and a station name plate
  R(c, 12, 30, 22, 30, '#22252B'); R(c, 14, 32, 18, 12, '#2E2420'); R(c, 14, 46, 18, 2, '#3A3226');
  R(c, 206, 28, 24, 32, '#22252B'); R(c, 208, 30, 20, 14, '#1F2A33'); R(c, 208, 48, 14, 2, '#2E3A44');
  R(c, 96, 30, 48, 9, '#1D3A6B'); R(c, 97, 31, 46, 7, '#24468A');
  for (let x = 100; x < 140; x += 3) R(c, x, 34, 2, 1, '#C9D4EA');
  // ceiling lights with dithered pools
  [40, 120, 200].forEach(x => {
    R(c, x - 8, 2, 16, 2, '#FFE3B5');
    for (let y = 4; y < 30; y++) for (let dx = -14; dx <= 14; dx++) if ((dx + y) % 2 === 0 && Math.abs(dx) < 14 - y * 0.4 && Math.random() < 0.18) R(c, x + dx, y, 1, 1, 'rgba(255,214,150,0.18)');
  });
  R(c, 0, 106, PW, 2, accent === '' ? '#2A2C31' : '#2A2C31');
}

function platform(c: C) {
  R(c, 0, 110, PW, 2, '#3B3E44'); // rail head
  R(c, 0, 112, PW, 28, '#1E2024');
  for (let x = 0; x < PW; x += 16) R(c, x, 116, 1, 24, '#24272B');
  R(c, 0, 113, PW, 3, '#D9B640');
  for (let x = 0; x < PW; x += 4) R(c, x + 1, 114, 1, 1, '#A88A2C'); // tactile studs
}

function bogie(c: C, x: number) {
  R(c, x, 104, 26, 4, '#1A1B1E');
  disc(c, x + 6, 108, 3, '#0F1012'); disc(c, x + 20, 108, 3, '#0F1012');
  R(c, x + 5, 108, 2, 1, '#4A4D52'); R(c, x + 19, 108, 2, 1, '#4A4D52');
}

// ── Metro ─────────────────────────────────────────────────────────────

function metroCar(c: C, x: number, accent: string) {
  const w = 148;
  R(c, x + 2, 48, w - 4, 3, '#4E525A');
  R(c, x, 51, w, 4, '#666B73');
  R(c, x, 55, w, 45, '#8C9199');
  R(c, x, 55, w, 1, '#A9AEB6');
  R(c, x, 96, w, 6, '#6A6F77');
  R(c, x, 86, w, 4, accent);
  R(c, x, 86, w, 1, 'rgba(255,255,255,0.35)');
  [18, 66, 114].forEach(dx => {
    R(c, x + dx, 58, 16, 44, '#7D828A');
    R(c, x + dx + 8, 58, 1, 44, '#5C6067');
    lit(c, x + dx + 2, 61, 5, 17);
    lit(c, x + dx + 10, 61, 5, 17);
  });
  [[4, 12], [38, 26], [86, 26], [134, 10]].forEach(([dx, ww]) => lit(c, x + dx, 61, ww, 15));
  bogie(c, x + 10);
  bogie(c, x + w - 36);
}

function metro(accent: string): Scene {
  const x = 46;
  return {
    body: { x0: x + 2, y0: 56, x1: x + 146, y1: 100 },
    sign: { x: 152, y: 12, w: 76 },
    lamps: [],
    spot: { x: x + 74, y: 72 },
    background: c => {
      stationWall(c, accent);
      // overhead line hangers
      for (let px = 10; px < PW; px += 50) R(c, px, 0, 1, 44, '#24262B');
      R(c, 0, 44, PW, 1, '#33363C');
    },
    neighbours: c => { metroCar(c, x - 156, accent); metroCar(c, x + 156, accent); },
    vehicle: c => {
      // gangways to the next cars
      R(c, x - 8, 58, 8, 40, '#2A2C31'); for (let y = 60; y < 96; y += 3) R(c, x - 8, y, 8, 1, '#3A3D43');
      R(c, x + 148, 58, 8, 40, '#2A2C31'); for (let y = 60; y < 96; y += 3) R(c, x + 148, y, 8, 1, '#3A3D43');
      metroCar(c, x, accent);
    },
    mask: c => { R(c, x, 51, 148, 51, '#FFFFFF'); },
    foreground: platform,
  };
}

// ── Regional train (double decker) ─────────────────────────────────────

function trainCar(c: C, x: number, accent: string) {
  const w = 160;
  R(c, x + 3, 34, w - 6, 3, '#6E737B');
  R(c, x, 37, w, 63, '#A6ABB2');
  R(c, x, 37, w, 1, '#C3C7CD');
  R(c, x, 94, w, 8, '#6E737B');
  R(c, x, 66, w, 4, accent);
  R(c, x, 70, w, 2, '#3FAE6A');
  for (let dx = 8; dx < w - 12; dx += 19) lit(c, x + dx, 44, 13, 12); // upper deck
  [[6, 22], [56, 46], [132, 22]].forEach(([dx, ww]) => { for (let d = 0; d + 11 <= ww; d += 15) lit(c, x + dx + d, 76, 11, 11); });
  [34, 110].forEach(dx => { R(c, x + dx, 72, 18, 30, '#8E939A'); R(c, x + dx + 9, 72, 1, 30, '#6A6F77'); lit(c, x + dx + 2, 75, 6, 13); lit(c, x + dx + 11, 75, 6, 13); });
  bogie(c, x + 10);
  bogie(c, x + w - 36);
}

function train(accent: string): Scene {
  const x = 40;
  return {
    body: { x0: x + 2, y0: 40, x1: x + 158, y1: 98 },
    sign: { x: 160, y: 8, w: 70 },
    lamps: [],
    spot: { x: x + 80, y: 60 },
    background: c => {
      stationWall(c, accent);
      R(c, 0, 18, PW, 1, '#4C4F55'); // catenary
      R(c, 0, 14, PW, 1, '#2E3035');
      [16, 224].forEach(px => R(c, px, 6, 3, 102, '#24262B'));
    },
    neighbours: c => { trainCar(c, x - 168, accent); trainCar(c, x + 168, accent); },
    vehicle: c => {
      R(c, x - 8, 44, 8, 54, '#2A2C31'); for (let y = 46; y < 96; y += 3) R(c, x - 8, y, 8, 1, '#3A3D43');
      R(c, x + 160, 44, 8, 54, '#2A2C31'); for (let y = 46; y < 96; y += 3) R(c, x + 160, y, 8, 1, '#3A3D43');
      trainCar(c, x, accent);
      // pantograph up to the wire
      const px = x + 70;
      R(c, px, 32, 20, 2, '#2C2E33');
      for (let i = 0; i < 7; i++) { R(c, px + 4 + i, 31 - i * 2, 1, 2, '#3C3F45'); R(c, px + 15 - i, 31 - i * 2, 1, 2, '#3C3F45'); }
      R(c, px + 4, 18, 12, 1, '#55585E');
    },
    mask: c => { R(c, x, 37, 160, 65, '#FFFFFF'); },
    foreground: platform,
  };
}

// ── Bus ───────────────────────────────────────────────────────────────

function bus(accent: string): Scene {
  const x = 44;
  const w = 152;
  return {
    body: { x0: x + 2, y0: 56, x1: x + 128, y1: 98 },
    sign: { x: 18, y: 10, w: 64 },
    lamps: [[x + w - 3, 90]],
    spot: { x: x + 60, y: 84 },
    background: c => {
      R(c, 0, 0, PW, PH, '#111215');
      // depot shutters
      [[8, 70], [86, 70], [164, 70]].forEach(([sx, sw]) => {
        R(c, sx, 22, sw, 86, '#1C1E22');
        for (let y = 24; y < 108; y += 3) R(c, sx, y, sw, 1, '#22252A');
        R(c, sx, 20, sw, 2, '#2C2F35');
      });
      [46, 124, 202].forEach(lx => { R(c, lx - 5, 8, 10, 2, '#FFD9A0'); for (let y = 10; y < 24; y++) if (y % 2) R(c, lx - (y - 8), y, (y - 8) * 2, 1, 'rgba(255,214,150,0.06)'); });
    },
    neighbours: () => {},
    vehicle: c => {
      R(c, x + 36, 46, 40, 5, '#B9BDC3'); // roof AC
      R(c, x + 4, 51, w - 12, 3, '#E9E3DA');
      R(c, x, 54, w, 48, '#E3832F');
      R(c, x, 54, w, 7, '#ECE6DC');
      R(c, x, 94, w, 8, '#3A3D43');
      R(c, x, 90, w, 2, accent);
      [[6, 28], [38, 28], [70, 28]].forEach(([dx, ww]) => lit(c, x + dx, 62, ww, 18));
      // folding door
      R(c, x + 102, 60, 20, 42, '#2A2E34'); lit(c, x + 104, 62, 7, 36); lit(c, x + 113, 62, 7, 36);
      // windscreen, raked
      for (let i = 0; i < 26; i++) R(c, x + 126 + Math.floor(i / 4), 60 + i, w - 126 - Math.floor(i / 4) - 1, 1, i < 3 ? '#4A5866' : '#2A3440');
      R(c, x + 130, 64, 6, 1, 'rgba(255,255,255,0.25)');
      // LED route sign
      R(c, x + 124, 54, 26, 7, '#0A0A0B');
      ledText(c, '90', x + 131, 54, '#FFB12E');
      // mirror, headlight
      R(c, x + w, 60, 4, 1, '#2A2C31'); R(c, x + w + 3, 60, 1, 9, '#2A2C31');
      R(c, x + w - 5, 89, 4, 3, '#FFF1C9');
      // wheel arches and wheels
      [30, 118].forEach(dx => {
        disc(c, x + dx, 103, 10, '#141518');
        disc(c, x + dx, 104, 8, '#0E0F11');
        disc(c, x + dx, 104, 3, '#7A7E85');
      });
    },
    mask: c => {
      R(c, x, 54, w, 48, '#FFFFFF');
      c.globalCompositeOperation = 'destination-out';
      [30, 118].forEach(dx => disc(c, x + dx, 103, 10, '#000'));
      c.globalCompositeOperation = 'source-over';
    },
    foreground: c => {
      R(c, 0, 110, PW, 2, '#3A3C41');
      R(c, 0, 112, PW, 28, '#1B1D20');
      for (let lx = 6; lx < PW; lx += 24) R(c, lx, 125, 12, 2, '#55575C');
    },
  };
}

// ── Plane at the gate ─────────────────────────────────────────────────

function plane(accent: string): Scene {
  const fuse = (c: C, col: string) => {
    for (let y = 62; y <= 86; y++) {
      const t = (y - 74) / 12;
      const nose = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 12);
      const tail = Math.round(Math.max(0, (y - 62) * 0.9));
      c.fillStyle = col;
      c.fillRect(34 + Math.max(0, 22 - tail), y, 168 + nose - Math.max(0, 22 - tail), 1);
    }
  };
  const fin = (c: C, col: string) => { for (let y = 30; y < 64; y++) { const x0 = 36 + Math.round((y - 30) * 0.35); R(c, x0, y, 22 - Math.round((y - 30) * 0.1), 1, col); } };
  return {
    body: { x0: 60, y0: 64, x1: 200, y1: 84 },
    sign: { x: 150, y: 8, w: 76 },
    lamps: [[212, 80]],
    spot: { x: 130, y: 76 },
    background: c => {
      R(c, 0, 0, PW, PH, '#0D0F14');
      R(c, 0, 36, PW, 64, '#14171D');
      for (let gx = 0; gx < PW; gx += 12) for (let gy = 40; gy < 96; gy += 10) R(c, gx + 1, gy, 10, 8, (gx * 7 + gy) % 5 ? '#1B222C' : '#3A3424');
      R(c, 0, 36, PW, 2, '#262A31');
    },
    neighbours: () => {},
    vehicle: c => {
      fin(c, accent);
      fuse(c, '#A7ACB4');
      R(c, 40, 62, 180, 3, 'rgba(255,255,255,0.12)');
      for (let y = 80; y <= 86; y++) R(c, 50, y, 160, 1, 'rgba(0,0,0,0.12)');
      R(c, 52, 78, 158, 2, accent);
      for (let wx = 70; wx < 196; wx += 5) R(c, wx, 69, 2, 3, '#E7B068');
      R(c, 203, 67, 7, 3, '#1E2630');
      R(c, 186, 66, 5, 12, '#8E939A'); // door
      // wing and engine
      for (let y = 82; y < 98; y++) R(c, 96 + Math.round((y - 82) * 0.4), y, 54 - (y - 82) * 2, 1, '#6E737B');
      R(c, 112, 90, 20, 8, '#80858C'); R(c, 112, 91, 3, 6, '#2A2C31');
      // gear
      R(c, 120, 98, 2, 4, '#1A1B1E'); R(c, 196, 86, 2, 16, '#1A1B1E');
      // jet bridge
      R(c, 188, 44, 52, 16, '#2C2F36'); R(c, 188, 58, 6, 10, '#2C2F36');
      for (let bx = 194; bx < 236; bx += 6) R(c, bx, 48, 4, 4, '#3A3424');
    },
    mask: c => { fuse(c, '#FFFFFF'); fin(c, '#FFFFFF'); },
    foreground: c => {
      R(c, 0, 100, PW, 40, '#1A1C20');
      for (let i = 0; i < 60; i++) R(c, 10 + i * 2.6, 132 - i * 0.5, 2, 1, '#C9A63A');
      R(c, 0, 100, PW, 1, '#2A2C31');
    },
  };
}

export function sceneFor(mode: Mode, accent: string): Scene {
  return mode === 'SUBWAY' ? metro(accent) : mode === 'TRAIN' ? train(accent) : mode === 'BUS' ? bus(accent) : plane(accent);
}

// A cheap box blur for the out-of-focus cars (canvas `filter` is not
// available everywhere).
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
