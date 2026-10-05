// Default marks on the wall, in the manner of Italian street art and with no
// words in them, so they read the same to everyone: stencils of the pinched
// fingers (🤌), a moka pot and a Vespa; a raised fist (sciopero); bubble
// throw-ups with no letters; a crown, a dripping heart, a star, a bolt, a
// frowning face. Each is a small pixel sprite in one person's colour with a
// lighter highlight, a darker shade and a dark keyline.
//
// Bitmap legend: '.' empty · 'o' keyline · '1' colour · '2' highlight ·
// '3' shade · 'w' cream.

type C = CanvasRenderingContext2D;

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

const BITMAPS: Record<string, string[]> = {
  pinch: [
    '.....ooo.....',
    '....o212o....',
    '....o1o1o....',
    '...o21o13o...',
    '...o1o1o1o...',
    '..o21o1o13o..',
    '..o1o11o13o..',
    '.o211o1o113o.',
    '.o2111o11113o',
    '.o2111111113o',
    '..o21111113o.',
    '...o211113o..',
    '...o211113o..',
    '...o211113o..',
    '..oo222222oo.',
    '..o33333333o.',
    '..oooooooooo.',
  ],
  moka: [
    '.....oo.......',
    '....o22o......',
    '..oooooooo....',
    'oo1222221o....',
    '.o12211113ooo.',
    '..o121113o..o.',
    '...o1113o...o.',
    '..oo1113oo.o..',
    '.o12211113oo..',
    'o1222111113o..',
    'o1221111113o..',
    'o1111111113o..',
    'oooooooooooo..',
  ],
  vespa: [
    '...........oo.....',
    '..........o22o....',
    '...........o1o....',
    '....ooooo..o1o....',
    '...o22111ooo1oo...',
    '..o11111111111o...',
    '.o1211111111111o..',
    '.o11111111111111o.',
    '..o1113oooo11113o.',
    '.ooo3o.oooo.o3ooo.',
    'o.www.o....o.www.o',
    '.ooooo......ooooo.',
  ],
  fist: [
    '..oooooo...',
    '.o122221o..',
    '.o1o1o1o1o.',
    '.o1o1o1o1o.',
    '.o11111111o',
    '.oo1111111o',
    'o21o111111o',
    'o2111111113o',
    '.o111111113o',
    '..o1111113o.',
    '...o111113o.',
    '...o11113o..',
    '...o11113o..',
    '...oooooo...',
  ],
  face: [
    '...oooooo...',
    '..o222221o..',
    '.o21111111o.',
    'o2o11111o1o.',
    'o21o111o111o',
    'o11wo1ow111o',
    'o111111111o.',
    'o11oooooo11o',
    'o11owowow11o',
    '.o1oooooo13o',
    '..o1111133o.',
    '...oooooo...',
  ],
};

const lighten = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const darken = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function bitmap(c: C, rows: string[], x: number, y: number, color: string, flip: boolean) {
  const pal: Record<string, string> = { o: '#141519', '1': color, '2': lighten(color, 0.45), '3': darken(color, 0.35), w: '#F4F1EA' };
  const w = Math.max(...rows.map(r => r.length));
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === '.') return;
    c.fillStyle = pal[ch];
    c.fillRect(Math.round(x + (flip ? w - 1 - rx : rx)), Math.round(y + ry), 1, 1);
  }));
  return { w, h: rows.length };
}

// Shapes drawn from geometry, then given the same keyline/highlight/shade.
function shape(c: C, kind: string, x: number, y: number, color: string) {
  const inside: (px: number, py: number) => boolean = (() => {
    switch (kind) {
      case 'bubble': // three letterless bubbles, a throw-up's silhouette
        return (px, py) => [[5, 6, 5], [12, 5, 5.5], [19, 6, 4.5]].some(([cx, cy, r]) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r);
      case 'star':
        return (px, py) => { const a = Math.atan2(py - 6, px - 6), d = Math.hypot(px - 6, py - 6); return d <= 3 + 3.2 * Math.max(0, Math.cos(5 * (a + Math.PI / 2))) ** 2 + 0.8; };
      case 'heart':
        return (px, py) => { const X = (px - 6) / 5.5, Y = (6 - py) / 5.5; return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0; };
      case 'crown':
        return (px, py) => py >= 4 && py <= 9 && px >= 0 && px <= 14 ? true : py < 4 && py >= 0 && [1, 7, 13].some(cx => Math.abs(px - cx) <= (py) * 0.6 + 0.4);
      default: // bolt
        return (px, py) => py >= 0 && py <= 13 && (py < 7 ? px >= 3 - py * 0.2 && px <= 7 - py * 0.4 : px >= 4 - (py - 7) * 0.5 && px <= 9 - (py - 7) * 0.6) && px >= 0;
    }
  })();
  const W = 26, H = 16;
  const hi = lighten(color, 0.45), lo = darken(color, 0.35);
  for (let py = -1; py <= H; py++) for (let px = -1; px <= W; px++) {
    const on = inside(px, py);
    const edge = !on && (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1));
    if (!on && !edge) continue;
    c.fillStyle = edge ? '#141519' : !inside(px - 1, py - 1) ? hi : !inside(px + 1, py + 1) ? lo : color;
    c.fillRect(x + px, y + py, 1, 1);
  }
  if (kind === 'heart') { c.fillStyle = color; c.fillRect(x + 4, y + 12, 1, 1); c.fillRect(x + 4, y + 13, 2, 2); c.fillStyle = '#141519'; c.fillRect(x + 4, y + 15, 2, 1); } // a drip
}

export const SPRITE_KINDS = ['pinch', 'moka', 'vespa', 'fist', 'face', 'bubble', 'star', 'heart', 'crown', 'bolt'] as const;
export type SpriteKind = typeof SPRITE_KINDS[number];
export const SPRITE_SIZE: Record<SpriteKind, [number, number]> = {
  pinch: [13, 17], moka: [14, 13], vespa: [18, 12], fist: [12, 14], face: [12, 12], bubble: [24, 12], star: [13, 13], heart: [12, 16], crown: [15, 10], bolt: [10, 14],
};

// Draw a sprite centred on (cx, cy).
export function drawSprite(c: C, kind: SpriteKind, cx: number, cy: number, color: string, flip = false) {
  const [w, h] = SPRITE_SIZE[kind];
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  if (kind in BITMAPS) bitmap(c, BITMAPS[kind], x, y, color, flip);
  else shape(c, kind, x, y, color);
}
