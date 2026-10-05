import type { Mode } from '../../../lib/lab/model';

// Pixel scenes for the graffiti wall: a parked vehicle at night in a place
// you could deface, on a 240×140 grid scaled up with hard edges.
//
// Drawn the way side-view vehicle pixel artists work (Etherfield, Alessio
// Conti, PXLCRS): one fixed side view, honest proportions, every material
// on a 3–4 step ramp, a 1px dark outline, light from above (bright roofline,
// shadowed skirt), glass as one dark band with a reflection, and details at
// the scale they read: door frames, handles, bogies, roof gear.
// Each vehicle keeps the things people remember it by:
//   metro – silver car, red doors and band, window band, gangways
//   train – white double decker, two glass bands, green band, pantograph
//   bus   – ATM orange, white roof, LED route sign, raked screen, mirror
//   plane – white fuselage at a jet bridge, coloured tail, wing, engine
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

const INK = '#141519';
const STEEL = ['#E2E5E9', '#BEC3CA', '#9AA0A8', '#767C85', '#555A62'];
const WHITE = ['#F2F2EF', '#DCDDDA', '#C2C4C3', '#A0A3A5', '#7C8084'];
const GLASS = ['#2E3A48', '#18202A', '#0E1218'];

// A body panel lit from above: highlight line, base, shadowed lower edge.
function panel(c: C, x: number, y: number, w: number, h: number, ramp: string[]) {
  R(c, x, y, w, h, ramp[2]);
  R(c, x, y, w, 2, ramp[1]);
  R(c, x, y, w, 1, ramp[0]);
  R(c, x, y + h - 3, w, 3, ramp[3]);
  R(c, x, y + h - 1, w, 1, ramp[4]);
}

// A continuous glass band with a diagonal reflection and pillars.
function glassBand(c: C, x: number, y: number, w: number, h: number, lit = true) {
  R(c, x, y, w, h, GLASS[1]);
  R(c, x, y, w, 1, GLASS[0]);
  R(c, x, y + h - 1, w, 1, GLASS[2]);
  if (lit) {
    // warm cabins behind the glass, darker at the bottom where seats are
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      const t = (yy - y) / h;
      c.fillStyle = t < 0.3 ? 'rgba(246,206,140,0.55)' : t < 0.7 ? 'rgba(220,160,90,0.45)' : 'rgba(120,80,40,0.45)';
      c.fillRect(x + 1, yy, w - 2, 1);
    }
    for (let sx = x + 3; sx < x + w - 2; sx += 5) R(c, sx, y + Math.round(h * 0.55), 2, Math.ceil(h * 0.45) - 1, 'rgba(30,18,8,0.55)'); // heads / seat backs
  }
  for (let i = 0; i < h; i++) if (x + 6 + i < x + w) P(c, x + 6 + i, y + h - 1 - i, 'rgba(255,255,255,0.10)'); // reflection
}

function pillars(c: C, xs: number[], y: number, h: number, col: string) { xs.forEach(px => R(c, px, y, 2, h, col)); }

function bogie(c: C, x: number, y: number) {
  R(c, x, y, 30, 4, '#22242A');
  R(c, x + 2, y + 1, 26, 1, '#34373E');
  R(c, x + 12, y - 2, 6, 3, '#2B2E34'); // bolster
  [x + 7, x + 23].forEach(cx => { disc(c, cx, y + 5, 4, '#101114'); disc(c, cx, y + 5, 1, '#5A5E66'); P(c, cx - 2, y + 2, '#3A3D44'); });
  R(c, x + 10, y + 4, 10, 2, '#3A3D44'); // spring
}

function underframe(c: C, x: number, w: number, y: number) {
  R(c, x + 2, y, w - 4, 3, '#1B1D21');
  [0.32, 0.5].forEach(t => { R(c, x + w * t, y + 1, 14, 5, '#2A2D33'); R(c, x + w * t + 1, y + 2, 12, 1, '#363A41'); });
}

// 5×7 LED font for signs
const FONT: Record<string, string[]> = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'], C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'], E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'], M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'], '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
};
export function ledText(c: C, text: string, x: number, y: number, on: string, off?: string, clip?: { x: number; w: number }) {
  [...text].forEach((ch, i) => {
    const g = FONT[ch] || FONT[' '];
    g.forEach((row, ry) => [...row].forEach((p, rx) => {
      const px = x + i * 6 + rx;
      if (clip && (px < clip.x || px >= clip.x + clip.w)) return;
      if (p === '#') P(c, px, y + ry, on);
      else if (off) P(c, px, y + ry, off);
    }));
  });
}
// A tiny 3×5 font for the route number on the bus
const SMALL: Record<string, string[]> = { '9': ['###', '#.#', '###', '..#', '###'], '0': ['###', '#.#', '#.#', '#.#', '###'] };
function smallText(c: C, text: string, x: number, y: number, col: string) {
  [...text].forEach((ch, i) => (SMALL[ch] || []).forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') P(c, x + i * 4 + rx, y + ry, col); })));
}

export type Scene = {
  body: { x0: number; y0: number; x1: number; y1: number };
  sign: { x: number; y: number; w: number };
  lamps: [number, number][];
  spot: { x: number; y: number };
  background: (c: C) => void;
  neighbours: (c: C) => void;
  vehicle: (c: C) => void;
  mask: (c: C) => void;
  foreground: (c: C) => void;
};

// ── Backdrops ──────────────────────────────────────────────────────────

function stationWall(c: C) {
  R(c, 0, 0, PW, PH, '#111216');
  // tiled wall, two tones, grout lines
  for (let y = 0; y < 106; y += 6) for (let x = (y / 6) % 2 ? -4 : 0; x < PW; x += 8) { R(c, x, y, 7, 5, (x * 3 + y) % 7 ? '#17191E' : '#191B20'); }
  R(c, 0, 58, PW, 2, '#1D2D52'); R(c, 0, 60, PW, 1, '#14203B'); // station colour line
  // posters (faded) and a name plate
  [[8, 18], [196, 22]].forEach(([px, py]) => { R(c, px, py, 30, 34, '#0E0F12'); R(c, px + 1, py + 1, 28, 32, '#2A2420'); R(c, px + 3, py + 3, 24, 14, '#3A2E26'); R(c, px + 3, py + 20, 18, 2, '#4A3B2C'); R(c, px + 3, py + 24, 12, 2, '#3D3127'); });
  R(c, 92, 26, 56, 11, '#0E0F12'); R(c, 93, 27, 54, 9, '#1E3B78');
  for (let x = 97; x < 143; x += 4) R(c, x, 30, 3, 3, '#C9D4EA');
  // ceiling: a strip light every 80px with a dithered pool
  [40, 120, 200].forEach(x => {
    R(c, x - 10, 2, 20, 2, '#FFE6BE'); R(c, x - 11, 4, 22, 1, '#3A3326');
    for (let y = 5; y < 40; y++) for (let dx = -18; dx <= 18; dx++) if ((dx + y) % 3 === 0 && Math.abs(dx) < 18 - y * 0.35 && ((dx * 7 + y * 13) % 5 === 0)) P(c, x + dx, y, 'rgba(255,214,150,0.10)');
  });
  R(c, 0, 104, PW, 2, '#1A1B1F');
}

function platform(c: C) {
  R(c, 0, 108, PW, 3, '#3A3D43'); R(c, 0, 108, PW, 1, '#5A5E66'); // rail head
  R(c, 0, 111, PW, 29, '#1C1E22');
  for (let x = 0; x < PW; x += 20) R(c, x, 117, 1, 23, '#22252A');
  R(c, 0, 125, PW, 1, '#22252A');
  R(c, 0, 112, PW, 4, '#D8B23C'); R(c, 0, 112, PW, 1, '#EBCB5B');
  for (let x = 1; x < PW; x += 3) P(c, x, 114, '#A3862B');
  R(c, 0, 116, PW, 1, '#0E0F11');
}

// ── Metro ─────────────────────────────────────────────────────────────

const MW = 150;
function metroCar(c: C, x: number, red: string) {
  const top = 50;
  // roof with equipment
  R(c, x + 4, top - 3, MW - 8, 3, STEEL[3]); R(c, x + 4, top - 3, MW - 8, 1, STEEL[2]);
  [[30, 22], [96, 22]].forEach(([dx, w]) => { R(c, x + dx, top - 6, w, 3, '#5D626A'); for (let i = 0; i < w; i += 3) P(c, x + dx + i, top - 5, '#3C4047'); });
  panel(c, x, top, MW, 52, STEEL);
  // window band and doors
  glassBand(c, x + 4, top + 7, MW - 8, 19);
  [20, 68, 116].forEach(dx => {
    // red doors, as on Milan's red line
    panel(c, x + dx, top + 5, 16, 47, ['#FF8C82', '#E8483C', '#D93A2F', '#A82A21', '#7E1F18']);
    R(c, x + dx - 1, top + 5, 1, 47, INK); R(c, x + dx + 16, top + 5, 1, 47, INK);
    glassBand(c, x + dx + 2, top + 8, 5, 21); glassBand(c, x + dx + 9, top + 8, 5, 21);
    R(c, x + dx + 7, top + 6, 2, 46, '#7E1F18');
    P(c, x + dx + 6, top + 33, INK); P(c, x + dx + 9, top + 33, INK); // handles
  });
  pillars(c, [x + 36, x + 52, x + 84, x + 100], top + 7, 19, STEEL[3]);
  // the red band below the windows, and a destination display
  R(c, x, top + 33, MW, 4, red); R(c, x, top + 33, MW, 1, '#FF8C82'); R(c, x, top + 36, MW, 1, '#8E2A23');
  R(c, x + 40, top + 39, 12, 4, '#0B0B0C'); R(c, x + 41, top + 40, 10, 2, '#E99A2A');
  // outline
  R(c, x - 1, top, 1, 52, INK); R(c, x + MW, top, 1, 52, INK); R(c, x, top - 1, MW, 1, INK); R(c, x, top + 52, MW, 1, INK);
  underframe(c, x, MW, top + 52);
  bogie(c, x + 12, top + 54); bogie(c, x + MW - 42, top + 54);
}

function metro(red: string): Scene {
  const x = 45;
  return {
    body: { x0: x + 3, y0: 52, x1: x + MW - 3, y1: 100 },
    sign: { x: 154, y: 9, w: 76 },
    lamps: [],
    spot: { x: x + MW / 2, y: 74 },
    background: c => { stationWall(c); for (let px = 20; px < PW; px += 60) R(c, px, 0, 1, 44, '#24262B'); R(c, 0, 43, PW, 1, '#3A3D43'); },
    neighbours: c => { metroCar(c, x - MW - 10, red); metroCar(c, x + MW + 10, red); },
    vehicle: c => {
      [x - 10, x + MW].forEach(gx => { R(c, gx, 58, 10, 40, '#202227'); for (let y = 59; y < 97; y += 2) R(c, gx, y, 10, 1, '#2C2F35'); });
      metroCar(c, x, red);
    },
    mask: c => { R(c, x, 50, MW, 52, '#FFFFFF'); },
    foreground: platform,
  };
}

// ── Regional train: double decker ───────────────────────────────────────

const TW = 164;
function trainCar(c: C, x: number, blue: string) {
  const top = 34;
  R(c, x + 6, top - 2, TW - 12, 2, WHITE[3]);
  panel(c, x, top, TW, 68, WHITE);
  glassBand(c, x + 4, top + 7, TW - 8, 13); // upper deck
  glassBand(c, x + 4, top + 34, TW - 8, 12); // lower deck
  pillars(c, [x + 26, x + 50, x + 74, x + 98, x + 122, x + 146], top + 7, 13, WHITE[3]);
  pillars(c, [x + 26, x + 74, x + 98, x + 146], top + 34, 12, WHITE[3]);
  // doors at the low floor
  [44, 116].forEach(dx => {
    R(c, x + dx, top + 30, 20, 38, WHITE[2]); R(c, x + dx, top + 30, 20, 1, WHITE[0]);
    R(c, x + dx - 1, top + 30, 1, 38, WHITE[4]); R(c, x + dx + 20, top + 30, 1, 38, WHITE[4]);
    glassBand(c, x + dx + 2, top + 33, 7, 18); glassBand(c, x + dx + 11, top + 33, 7, 18);
    R(c, x + dx + 9, top + 30, 2, 38, WHITE[3]);
  });
  // livery: green band, blue line
  R(c, x, top + 54, TW, 6, '#2F9A5B'); R(c, x, top + 54, TW, 1, '#5BC184'); R(c, x, top + 59, TW, 1, '#1E6C3E');
  R(c, x, top + 25, TW, 2, blue);
  R(c, x - 1, top, 1, 68, INK); R(c, x + TW, top, 1, 68, INK); R(c, x, top - 1, TW, 1, INK); R(c, x, top + 68, TW, 1, INK);
  bogie(c, x + 12, top + 70); bogie(c, x + TW - 42, top + 70);
}

function train(blue: string): Scene {
  const x = 38;
  return {
    body: { x0: x + 3, y0: 36, x1: x + TW - 3, y1: 100 },
    sign: { x: 160, y: 6, w: 70 },
    lamps: [],
    spot: { x: x + TW / 2, y: 64 },
    background: c => {
      stationWall(c);
      R(c, 0, 16, PW, 1, '#5A5E66'); R(c, 0, 12, PW, 1, '#33363C'); // catenary
      for (let px = 4; px < PW; px += 30) R(c, px, 12, 1, 4, '#3A3D43'); // droppers
      [14, 226].forEach(px => { R(c, px, 4, 4, 100, '#22252A'); R(c, px, 4, 1, 100, '#2E3137'); });
    },
    neighbours: c => { trainCar(c, x - TW - 10, blue); trainCar(c, x + TW + 10, blue); },
    vehicle: c => {
      [x - 10, x + TW].forEach(gx => { R(c, gx, 42, 10, 56, '#202227'); for (let y = 43; y < 97; y += 2) R(c, gx, y, 10, 1, '#2C2F35'); });
      trainCar(c, x, blue);
      // pantograph up to the wire
      const px = x + 66;
      R(c, px, 30, 26, 2, '#2C2E33'); R(c, px + 4, 29, 4, 1, '#4A4D53'); R(c, px + 18, 29, 4, 1, '#4A4D53');
      for (let i = 0; i < 7; i++) { P(c, px + 6 + i, 28 - i * 2, '#4A4D53'); P(c, px + 6 + i, 27 - i * 2, '#3A3D43'); P(c, px + 19 - i, 28 - i * 2, '#4A4D53'); P(c, px + 19 - i, 27 - i * 2, '#3A3D43'); }
      R(c, px + 5, 16, 16, 1, '#7A7E86');
    },
    mask: c => { R(c, x, 34, TW, 68, '#FFFFFF'); },
    foreground: platform,
  };
}

// ── Bus ───────────────────────────────────────────────────────────────

function bus(): Scene {
  const x = 40;
  const w = 158;
  const top = 50;
  const ORANGE = ['#FFC07A', '#F59A45', '#E07C2A', '#B65E1A', '#8A4512'];
  const wheel = (cx: number) => {
    disc(c0!, cx, 104, 11, '#0B0C0E');
    disc(c0!, cx, 105, 9, '#141518'); disc(c0!, cx, 105, 5, '#3A3D43'); disc(c0!, cx, 105, 3, '#8A8F97'); disc(c0!, cx, 105, 1, '#3A3D43');
  };
  let c0: C | null = null;
  return {
    body: { x0: x + 3, y0: top + 2, x1: x + 128, y1: 98 },
    sign: { x: 162, y: 7, w: 70 },
    lamps: [[x + w - 3, 92]],
    spot: { x: x + 64, y: 86 },
    background: c => {
      R(c, 0, 0, PW, PH, '#101114');
      [[6, 72], [84, 72], [162, 72]].forEach(([sx, sw]) => {
        R(c, sx, 20, sw, 88, '#1B1D21');
        for (let y = 22; y < 108; y += 3) { R(c, sx, y, sw, 1, '#22252A'); R(c, sx, y + 1, sw, 1, '#191B1F'); }
        R(c, sx - 2, 16, sw + 4, 4, '#2C2F35'); R(c, sx - 2, 16, sw + 4, 1, '#3D4148');
        R(c, sx + sw / 2 - 6, 98, 12, 3, '#2C2F35'); // handle
      });
      [45, 123, 201].forEach(lx => { R(c, lx - 6, 6, 12, 2, '#FFDDA6'); for (let y = 8; y < 30; y++) for (let dx = -(y - 6); dx <= y - 6; dx++) if ((dx + y) % 4 === 0) P(c, lx + dx, y, 'rgba(255,214,150,0.05)'); });
    },
    neighbours: () => {},
    vehicle: c => {
      c0 = c;
      R(c, x + 34, top - 6, 44, 6, '#B9BDC3'); R(c, x + 34, top - 6, 44, 1, '#DADDE1'); for (let i = 2; i < 44; i += 3) P(c, x + 34 + i, top - 3, '#8E939A'); // roof AC
      panel(c, x, top, w, 50, ORANGE);
      R(c, x, top, w, 8, WHITE[1]); R(c, x, top, w, 1, WHITE[0]); R(c, x, top + 7, w, 1, WHITE[3]);
      glassBand(c, x + 4, top + 10, 100, 20);
      pillars(c, [x + 36, x + 70], top + 10, 20, ORANGE[3]);
      // folding door with glass
      R(c, x + 106, top + 9, 22, 41, '#22262C');
      glassBand(c, x + 108, top + 11, 8, 36); glassBand(c, x + 118, top + 11, 8, 36);
      // raked windscreen
      for (let i = 0; i < 30; i++) R(c, x + 130 + Math.floor(i / 4), top + 9 + i, w - 130 - Math.floor(i / 4) - 1, 1, i < 2 ? GLASS[0] : GLASS[1]);
      for (let i = 0; i < 10; i++) P(c, x + 136 + i, top + 26 - i, 'rgba(255,255,255,0.18)');
      // LED route sign
      R(c, x + 128, top + 1, 28, 6, '#08080A'); smallText(c, '90', x + 136, top + 1, '#FFB12E');
      // skirt, mirror, lights, outline
      R(c, x, top + 42, w, 8, '#2E3136'); R(c, x, top + 42, w, 1, '#44484F');
      R(c, x + w, top + 9, 4, 1, INK); R(c, x + w + 3, top + 9, 2, 10, INK);
      R(c, x + w - 6, top + 38, 5, 3, '#FFF1C9'); R(c, x + 1, top + 38, 3, 3, '#C9372C');
      R(c, x - 1, top, 1, 50, INK); R(c, x, top - 1, w, 1, INK);
      // wheel arches and wheels
      [32, 122].forEach(dx => { disc(c, x + dx, top + 52, 13, '#0E0F11'); wheel(x + dx); });
      // shadow on the road
      for (let i = 0; i < w; i++) if (i % 2) P(c, x + i, 116, 'rgba(0,0,0,0.5)');
    },
    mask: c => {
      R(c, x, top, w, 50, '#FFFFFF');
      c.globalCompositeOperation = 'destination-out';
      [32, 122].forEach(dx => disc(c, x + dx, top + 52, 13, '#000'));
      c.globalCompositeOperation = 'source-over';
    },
    foreground: c => {
      R(c, 0, 114, PW, 2, '#3A3C41'); R(c, 0, 114, PW, 1, '#4C4F55');
      R(c, 0, 116, PW, 24, '#1A1C1F');
      for (let lx = 4; lx < PW; lx += 26) R(c, lx, 128, 14, 2, '#5A5C61');
    },
  };
}

// ── Plane at the gate ─────────────────────────────────────────────────

function plane(tail: string): Scene {
  const fuse = (c: C, ramp: string[] | null) => {
    for (let y = 60; y <= 88; y++) {
      const t = (y - 74) / 14;
      const nose = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 16);
      const tailCut = Math.max(0, 24 - Math.round((y - 60) * 1.1));
      const x0 = 30 + tailCut;
      const x1 = 200 + nose;
      const col = ramp ? (y < 62 ? ramp[0] : y < 66 ? ramp[1] : y < 80 ? ramp[2] : y < 85 ? ramp[3] : ramp[4]) : '#FFFFFF';
      R(c, x0, y, x1 - x0, 1, col);
      if (ramp) { P(c, x0 - 1, y, INK); P(c, x1, y, INK); }
    }
  };
  const fin = (c: C, col: string | null) => {
    for (let y = 26; y < 62; y++) {
      const x0 = 32 + Math.round((y - 26) * 0.45);
      const w = 20 - Math.round((y - 26) * 0.12);
      R(c, x0, y, w, 1, col ?? '#FFFFFF');
      if (col) { P(c, x0 - 1, y, INK); R(c, x0, y, 2, 1, 'rgba(255,255,255,0.25)'); }
    }
  };
  return {
    body: { x0: 56, y0: 62, x1: 206, y1: 86 },
    sign: { x: 104, y: 8, w: 76 },
    lamps: [[214, 82]],
    spot: { x: 132, y: 74 },
    background: c => {
      R(c, 0, 0, PW, PH, '#0C0E13');
      for (let i = 0; i < 40; i++) P(c, (i * 53) % PW, (i * 29) % 30, i % 3 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)');
      R(c, 0, 34, PW, 66, '#121519'); R(c, 0, 34, PW, 2, '#22262D');
      for (let gx = 0; gx < PW; gx += 14) for (let gy = 38; gy < 96; gy += 11) R(c, gx + 1, gy, 12, 9, (gx * 7 + gy * 3) % 5 ? '#18202A' : '#3A3222');
      for (let gx = 0; gx < PW; gx += 14) R(c, gx, 36, 1, 64, '#0A0C0F');
    },
    neighbours: () => {},
    vehicle: c => {
      fin(c, tail);
      fuse(c, WHITE);
      R(c, 52, 79, 160, 2, tail);
      for (let wx = 72; wx < 194; wx += 5) { R(c, wx, 69, 2, 3, '#E7B068'); P(c, wx, 69, '#F6D49A'); }
      R(c, 204, 66, 9, 4, GLASS[1]); R(c, 204, 66, 9, 1, GLASS[0]);
      R(c, 184, 65, 6, 14, WHITE[3]); R(c, 184, 65, 6, 1, WHITE[4]); // door
      // wing (near side) and engine
      for (let y = 84; y < 100; y++) { const x0 = 98 + Math.round((y - 84) * 0.5); R(c, x0, y, 58 - (y - 84) * 2, 1, y === 84 ? '#9AA0A8' : '#767C85'); P(c, x0 - 1, y, INK); }
      R(c, 108, 92, 26, 9, '#B7BCC3'); R(c, 108, 92, 26, 1, '#E2E5E9'); R(c, 108, 100, 26, 1, '#6C727B');
      R(c, 108, 93, 3, 7, '#1A1C20'); R(c, 107, 92, 1, 9, INK);
      // gear and wheel
      R(c, 120, 101, 2, 5, '#1A1B1E'); disc(c, 121, 107, 2, '#0F1012');
      R(c, 196, 88, 2, 16, '#1A1B1E'); disc(c, 197, 105, 2, '#0F1012');
      // jet bridge with its canopy on the door
      R(c, 190, 44, 50, 16, '#2B2E35'); R(c, 190, 44, 50, 1, '#3D4148');
      for (let bx = 196; bx < 238; bx += 7) R(c, bx, 48, 5, 4, '#3A3222');
      R(c, 186, 56, 10, 12, '#1F2126'); R(c, 186, 56, 1, 12, INK);
      // nose light
      P(c, 214, 82, '#FFF1C9');
    },
    mask: c => { fuse(c, null); fin(c, null); },
    foreground: c => {
      R(c, 0, 104, PW, 36, '#17191C'); R(c, 0, 104, PW, 1, '#262930');
      for (let i = 0; i < 70; i++) P(c, 6 + i * 2.6, 134 - i * 0.42, '#C9A63A');
      for (let i = 0; i < 50; i++) P(c, 70 + i * 3, 112, 'rgba(201,166,58,0.5)');
    },
  };
}

export function sceneFor(mode: Mode, accent: string): Scene {
  return mode === 'SUBWAY' ? metro('#D93A2F') : mode === 'TRAIN' ? train(accent) : mode === 'BUS' ? bus() : plane(accent);
}

// Box blur for the out-of-focus cars (canvas `filter` is not everywhere).
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
