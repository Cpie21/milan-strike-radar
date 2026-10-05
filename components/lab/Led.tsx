'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// The assistant's face: an amber LED dot matrix, the kind on Italian
// platforms, that speaks in pictures rather than words, so everyone reads it.
//   LedBoard – a wide strip set flush into the top of the calm-day module.
//              It wakes up when it first appears, then lives: blinks, looks
//              around, watches a tram go by and gives a thumbs-up, shows the
//              time, a heartbeat, a coffee in the morning, sleeps at night.
//   LedFace  – the compact face: in the bar, in the answer sheet. On a strike
//              day it is alert: startled, "!!", cross brows, a rail snapping.
// Drawn on canvas: unlit dots stay faintly visible, lit dots bloom; changes
// wipe across column by column, or fade with the slight persistence of real
// LEDs, which leaves a trail behind anything that moves.

export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry' | 'alert';

const ROWS = 9;
type Cols = number[]; // one bitmask per column, bit y = row y
type Frame = { cols: Cols; offset: number; mode: 'cut' | 'wipe' | 'fade' };

const blank = (n: number): Cols => Array(Math.max(0, n)).fill(0);
function bitmap(rows: string[], top = 0): Cols {
  const w = Math.max(...rows.map(r => r.length));
  return Array.from({ length: w }, (_, x) => rows.reduce((col, row, y) => (row[x] === '#' ? col | (1 << (y + top)) : col), 0));
}
// Sprites onto a strip; `cover` hides what is behind, so a tram passes in
// front of the eyes rather than through them.
function compose(width: number, layers: [Cols, number, boolean?][]): Cols {
  const out = blank(width);
  layers.forEach(([cols, x, cover]) => cols.forEach((c, i) => { const k = x + i; if (k >= 0 && k < width) out[k] = cover ? c : out[k] | c; }));
  return out;
}
const shift = (cols: Cols, dy: number) => cols.map(c => (dy >= 0 ? c << dy : c >> -dy) & 0x1ff);

// ── Bitmaps ─────────────────────────────────────────────────────────────

const EYES: Record<string, string[]> = {
  open: ['..###..', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '..###..'],
  blink: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  sleep: ['.......', '.......', '.......', '.......', '#.....#', '.#####.', '.......'],
  squint: ['.......', '.......', '.#####.', '#######', '.#####.', '.......', '.......'],
  wide: ['.#####.', '#######', '#######', '#######', '#######', '#######', '.#####.'],
  happy: ['.......', '..###..', '.#...#.', '#.....#', '#.....#', '.......', '.......'],
  down: ['.......', '.......', '#.....#', '#.....#', '.#...#.', '..###..', '.......'],
  sadL: ['.......', '......#', '....###', '..#####', '.######', '.#####.', '..###..'],
  sadR: ['.......', '#......', '###....', '#####..', '######.', '.#####.', '..###..'],
  lookL: ['.###...', '#####..', '#####..', '#####..', '#####..', '#####..', '.###...'],
  lookR: ['...###.', '..#####', '..#####', '..#####', '..#####', '..#####', '...###.'],
  lookU: ['..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......', '.......'],
};
type Pair = [string, string];
const eye = (k: string) => bitmap(EYES[k], 1);
const eyes = ([l, r]: Pair, gap = 3): Cols => [...eye(l), ...blank(gap), ...eye(r)]; // 17 wide
const FACES: Record<Exclude<Mood, 'thinking' | 'alert'>, Pair> = {
  idle: ['open', 'open'], happy: ['happy', 'happy'], alarm: ['sadL', 'sadR'], unsure: ['open', 'squint'], sorry: ['down', 'down'],
};
const ANGRY: Pair = ['sadR', 'sadL']; // brows slanting down to the middle
const THINK: Pair[] = [['lookL', 'lookL'], ['lookU', 'lookU'], ['lookR', 'lookR'], ['squint', 'squint']];

const TRAM = bitmap([
  '......####.......',
  '.......##........',
  '.###############.',
  '#..##..##..##..##',
  '#..##..##..##..##',
  '#################',
  '#################',
  '..##.........##..',
]);
const THUMB = bitmap([
  '....#.....',
  '...##.....',
  '...##.....',
  '..#######.',
  '##.######.',
  '##.#####..',
  '##.######.',
  '##.#####..',
  '##..####..',
]);
const CUP_BODY = ['########.', '#######.#', '#######.#', '.#######.', '..####...', '#########'];
const CUP = [
  bitmap(['..#..#...', '...#..#..', '..#..#...', ...CUP_BODY]),
  bitmap(['...#..#..', '..#..#...', '...#..#..', ...CUP_BODY]),
];
const BANG = bitmap(['##', '##', '##', '##', '##', '##', '..', '##']);
const ZED = bitmap(['####', '..#.', '.#..', '####']);
const track = (w: number): Cols => Array.from({ length: w }, (_, x) => (x % 3 === 2 ? 0 : 1 << 8));
const ECG = [5, 5, 5, 5, 4, 4, 5, 5, 6, 2, 0, 8, 6, 5, 5, 5, 4, 3, 3, 4, 5, 5, 5, 5];
function pulse(beats: number, lead: number): Cols {
  const rows = [...Array(lead).fill(5), ...Array.from({ length: beats * ECG.length }, (_, i) => ECG[i % ECG.length]), ...Array(lead).fill(5)];
  return rows.map((r, i) => { const p = rows[i - 1] ?? r; let c = 0; for (let y = Math.min(p, r); y <= Math.max(p, r); y++) c |= 1 << y; return c; });
}
const noise = (w: number, d: number): Cols => Array.from({ length: w }, () => { let c = 0; for (let y = 0; y < ROWS; y++) if (Math.random() < d) c |= 1 << y; return c; });

// 5×7 font, for the clock only: digits read the same in every language.
const F: Record<string, string> = {
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
  3: '.###.#...#....#..##.....##...#.###.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
  6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#...#..##..', ':': '......##...##........##...##.......',
};
function digits(text: string): Cols {
  return [...text].flatMap(ch => {
    const g = F[ch];
    if (!g) return [0, 0];
    const w = ch === ':' ? 3 : 5, off = ch === ':' ? 1 : 0;
    return [...Array.from({ length: w }, (_, x) => { let c = 0; for (let y = 0; y < 7; y++) if (g[y * 5 + x + off] === '#') c |= 1 << (y + 1); return c; }), 0];
  });
}
const romeClock = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const romeHour = () => Number(romeClock().slice(0, 2));

// ── Panel renderer ──────────────────────────────────────────────────────

type Sprite = { on: HTMLCanvasElement; off: HTMLCanvasElement; s: number };
const sprites = new Map<number, Sprite>();
function makeSprite(pitch: number): Sprite {
  const cached = sprites.get(pitch);
  if (cached) return cached;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = Math.ceil(pitch * 2.4 * dpr);
  const mk = (draw: (c: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = c.height = s; draw(c.getContext('2d')!); return c; };
  const r = pitch * 0.36 * dpr;
  const on = mk(c => {
    const halo = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    halo.addColorStop(0, 'rgba(255,170,40,0.55)'); halo.addColorStop(0.4, 'rgba(255,140,0,0.18)'); halo.addColorStop(1, 'rgba(255,120,0,0)');
    c.fillStyle = halo; c.fillRect(0, 0, s, s);
    const g = c.createRadialGradient(s / 2 - r * 0.3, s / 2 - r * 0.3, 0, s / 2, s / 2, r);
    g.addColorStop(0, '#FFF4D6'); g.addColorStop(0.5, '#FFC23A'); g.addColorStop(1, '#E98100');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, r, 0, Math.PI * 2); c.fill();
  });
  const off = mk(c => {
    const g = c.createRadialGradient(s / 2, s / 2 - r * 0.3, 0, s / 2, s / 2, r);
    g.addColorStop(0, '#3A2810'); g.addColorStop(1, '#1C1308');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, r, 0, Math.PI * 2); c.fill();
  });
  const sprite = { on, off, s };
  sprites.set(pitch, sprite);
  return sprite;
}

function Panel({ cols, pitch, frame, glow }: { cols: number; pitch: number; frame: Frame; glow: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const state = useRef({ alpha: new Float32Array(0), goal: new Float32Array(0), start: 0, mode: 'cut' as Frame['mode'], raf: 0 });

  useEffect(() => {
    const st = state.current;
    const n = cols * ROWS;
    if (st.alpha.length !== n) st.alpha = new Float32Array(n);
    const goal = new Float32Array(n);
    frame.cols.forEach((col, i) => {
      const x = i + frame.offset;
      if (x < 0 || x >= cols) return;
      for (let y = 0; y < ROWS; y++) if (col & (1 << y)) goal[y * cols + x] = 1;
    });
    st.goal = goal;
    st.mode = reduce ? 'cut' : frame.mode;
    st.start = performance.now();
    const sprite = makeSprite(pitch);
    // Sized here, on the client: the server can't know the pixel ratio,
    // and hydration keeps server attributes.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.current) {
      const w = Math.round(cols * pitch * dpr), h = Math.round(ROWS * pitch * dpr);
      if (canvas.current.width !== w) canvas.current.width = w;
      if (canvas.current.height !== h) canvas.current.height = h;
    }
    const draw = () => {
      const c = canvas.current?.getContext('2d');
      if (!c) return;
      const now = performance.now();
      let moving = false;
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      for (let i = 0; i < n; i++) {
        const x = i % cols, y = Math.floor(i / cols);
        const d = st.goal[i] - st.alpha[i];
        if (st.mode === 'cut') st.alpha[i] = st.goal[i];
        else if (st.mode === 'wipe') { if (now >= st.start + x * 14) st.alpha[i] += Math.sign(d) * Math.min(Math.abs(d), 0.22); }
        else st.alpha[i] += d > 0 ? Math.min(d, 0.55) : Math.max(d, -0.14); // lit fast, fades slow
        if (Math.abs(st.goal[i] - st.alpha[i]) > 0.001) moving = true; else st.alpha[i] = st.goal[i];
        const cx = (x + 0.5) * pitch * dpr - sprite.s / 2, cy = (y + 0.5) * pitch * dpr - sprite.s / 2;
        c.globalAlpha = 1;
        c.drawImage(sprite.off, cx, cy);
        if (st.alpha[i] > 0) { c.globalAlpha = st.alpha[i] * glow; c.drawImage(sprite.on, cx, cy); }
      }
      c.globalAlpha = 1;
      if (moving) st.raf = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(st.raf);
  }, [frame, cols, pitch, glow, reduce]);

  return <canvas ref={canvas} style={{ width: cols * pitch, height: ROWS * pitch, display: 'block' }} aria-hidden />;
}

// ── Programmes ─────────────────────────────────────────────────────────
// A programme is an async script of frames and waits. Starting another
// cancels the one running: its next wait throws STOP.

const STOP = Symbol('stop');
type Show = (cols: Cols, offset: number, mode?: Frame['mode']) => void;
type Wait = (ms: number) => Promise<void>;

function useProgramme(setFrame: (f: Frame) => void) {
  const gen = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => { gen.current++; timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => stop, []);
  return (script: (show: Show, wait: Wait) => Promise<void>) => {
    stop();
    const g = gen.current;
    const wait: Wait = ms => new Promise((res, rej) => { timers.current.push(setTimeout(() => (g === gen.current ? res() : rej(STOP)), ms)); });
    const show: Show = (cols, offset, mode = 'wipe') => { if (g === gen.current) setFrame({ cols, offset, mode }); };
    // Start on a timer, never synchronously inside the effect.
    wait(0).then(() => script(show, wait)).catch(e => { if (e !== STOP) throw e; });
    return stop;
  };
}

const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.5);

// Eyes resting: open, with a blink or two.
async function rest(show: Show, wait: Wait, at: number, ms: number) {
  show(eyes(FACES.idle), at);
  const end = Date.now() + ms;
  while (Date.now() < end - 800) {
    await wait(jitter(2600));
    show(eyes(['blink', 'blink']), at, 'cut'); await wait(140);
    show(eyes(FACES.idle), at, 'cut');
  }
  await wait(Math.max(0, end - Date.now()));
}

// The face for a mood (the same on board and face); loops while it lasts.
async function moodScript(mood: Mood, show: Show, wait: Wait, at: number, width: number) {
  if (mood === 'thinking') { for (let i = 0; ; i++) { show(eyes(THINK[i % THINK.length]), at); await wait(420); } }
  if (mood === 'alarm') { show(eyes(['wide', 'wide']), at, 'cut'); await wait(600); show(eyes(FACES.alarm), at); return; }
  if (mood === 'alert') return alert(show, wait, at, width);
  if (mood === 'idle') { for (;;) await rest(show, wait, at, 8000); }
  show(eyes(FACES[mood]), at);
}

// Strike day: startled, then cross; every so often "!!", or a rail snaps.
async function alert(show: Show, wait: Wait, at: number, width: number) {
  const mid = Math.floor(width / 2);
  for (const d of [0.25, 0.4]) { show(noise(width, d), 0, 'cut'); await wait(60); }
  show(eyes(['wide', 'wide']), at, 'cut'); await wait(520);
  for (let i = 0; ; i++) {
    show(eyes(ANGRY), at);
    await wait(jitter(2600));
    show(eyes(['squint', 'squint']), at, 'cut'); await wait(110); show(eyes(ANGRY), at, 'cut');
    await wait(jitter(2600));
    if (i % 2 === 0) {
      for (let k = 0; k < 3; k++) { show(compose(width, [[BANG, mid - 4], [BANG, mid + 2]]), 0, 'cut'); await wait(230); show([], 0, 'cut'); await wait(130); }
    } else {
      const rail = (gap: number, droop: number) => Array.from({ length: width }, (_, x) => (Math.abs(x - mid + 0.5) < gap ? 0 : Math.abs(x - mid + 0.5) < gap + droop ? 1 << 8 : 1 << 6));
      show(rail(0, 0), 0); await wait(600);
      show(rail(1, 0), 0, 'cut'); await wait(160);
      for (let k = 0; k < 6; k++) {
        const sparks = Array.from({ length: width }, (_, x) => (Math.abs(x - mid) < 4 && Math.random() < 0.5 ? 1 << (1 + Math.floor(Math.random() * 4)) : 0));
        show(rail(1, 3).map((c, x) => c | sparks[x]), 0, 'fade'); await wait(90);
      }
      show(rail(1, 3), 0, 'fade'); await wait(700);
      show(eyes(['wide', 'wide']), at, 'cut'); await wait(300);
    }
  }
}

// ── Housings ───────────────────────────────────────────────────────────

const GLASS = 'linear-gradient(170deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 30%, transparent 31%), repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px)';

// A small anodised bezel around recessed smoked glass.
function Bezel({ children, pitch, glow, flat }: { children: React.ReactNode; pitch: number; glow: number; flat?: boolean }) {
  const r = pitch * (flat ? 3.4 : 2.4);
  return (
    <span className="relative inline-flex" style={{
      padding: flat ? pitch * 0.6 : pitch * 0.8, borderRadius: r,
      background: flat ? '#070707' : 'linear-gradient(180deg,#4B4F57 0%,#2A2C32 10%,#1B1C20 55%,#141518 100%)',
      boxShadow: flat
        ? `inset 0 1px 3px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 ${pitch * 6}px rgba(255,150,30,${glow * 0.18})`
        : `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.7), 0 ${pitch}px ${pitch * 3}px rgba(0,0,0,0.5), 0 0 ${pitch * 8}px rgba(255,150,30,${0.1 + glow * 0.2})`,
    }}>
      <span className="relative block overflow-hidden" style={{ borderRadius: r * 0.6, padding: flat ? 0 : pitch * 0.4, background: '#040404', boxShadow: flat ? 'none' : 'inset 0 2px 4px rgba(0,0,0,0.95)' }}>
        {children}
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: GLASS }} />
      </span>
    </span>
  );
}

const glowOf = (mood: Mood) => (mood === 'alarm' || mood === 'alert' ? 1 : mood === 'thinking' ? 0.85 : 0.7);

// ── Compact face ────────────────────────────────────────────────────────

export function LedFace({ mood = 'idle', size = 20, flat }: { mood?: Mood; size?: number; flat?: boolean }) {
  const reduce = useReducedMotion();
  const W = 19, at = 1;
  const pitch = size / 7;
  const [frame, setFrame] = useState<Frame>({ cols: eyes(mood === 'alert' ? ANGRY : mood === 'thinking' ? THINK[0] : FACES[mood]), offset: at, mode: 'cut' });
  const play = useProgramme(setFrame);
  useEffect(() => {
    if (reduce) return play(async show => show(eyes(mood === 'alert' ? ANGRY : mood === 'thinking' ? THINK[0] : FACES[mood]), at, 'cut'));
    return play((show, wait) => moodScript(mood, show, wait, at, W));
  }, [mood, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span role="img" aria-hidden className="inline-flex">
      <Bezel pitch={pitch} glow={glowOf(mood) * 0.6} flat={flat}>
        <Panel cols={W} pitch={pitch} frame={frame} glow={glowOf(mood)} />
      </Bezel>
    </span>
  );
}

// ── Board (calm-day module) ─────────────────────────────────────────────
// As wide as the module allows. Wakes once per visit; after that it keeps
// living through calm days, glancing the way you moved when the day changes.

export function LedBoard({ mood = 'idle', pitch = 4.6, nudge }: { mood?: Mood; pitch?: number; nudge?: { key: string; dir: number } }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLSpanElement>(null);
  const [W, setW] = useState(41);
  const width = useRef(W);
  useLayoutEffect(() => { width.current = W; });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(41, Math.min(96, Math.floor(e.contentRect.width / pitch)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pitch]);
  const [frame, setFrame] = useState<Frame>({ cols: [], offset: 0, mode: 'cut' });
  const play = useProgramme(setFrame);
  const woke = useRef(false);
  const at = () => Math.floor(width.current / 2) - 8;

  // The idle life of the board.
  const live = async (show: Show, wait: Wait) => {
    if (!woke.current) {
      woke.current = true;
      const w = width.current;
      for (const d of [0.06, 0.18, 0.34, 0.16, 0.05]) { show(noise(w, d), 0, 'cut'); await wait(70); }
      show([], 0, 'cut'); await wait(140);
      for (let x = 0; x < w; x += 2) { show([0x1ff, 0x1ff], x, 'fade'); await wait(14); }
      show([], 0, 'fade'); await wait(260);
      show(eyes(['blink', 'blink']), at(), 'cut'); await wait(300);
      show(eyes(['squint', 'squint']), at(), 'cut'); await wait(120);
      show(eyes(FACES.idle), at(), 'cut'); await wait(600);
      show(eyes(['lookL', 'lookL']), at()); await wait(420);
      show(eyes(['lookR', 'lookR']), at()); await wait(420);
    }
    const scenes = [tram, look, clock, heartbeat, wink, tram, morning];
    for (let i = 0; ; i++) {
      await rest(show, wait, at(), jitter(7000));
      await (romeHour() < 6 ? sleep : scenes[i % scenes.length])(show, wait);
    }
  };
  // A tram goes by in front, the eyes follow it, then a thumbs-up: all fine.
  const tram = async (show: Show, wait: Wait) => {
    const w = width.current, e = at();
    show(eyes(['lookR', 'lookR']), e); await wait(700);
    for (let x = w; x > -TRAM.length; x--) {
      const pair: Pair = x + 8 > e + 8 ? ['lookR', 'lookR'] : ['lookL', 'lookL'];
      show(compose(w, [[eyes(pair), e], [TRAM, x, true], [track(w), 0]]), 0, 'fade');
      await wait(40);
    }
    show(eyes(['lookL', 'lookL']), e, 'fade'); await wait(500);
    show(THUMB, Math.floor(w / 2) - 5); await wait(1600);
    show(eyes(FACES.happy), e); await wait(1300);
  };
  const look = async (show: Show, wait: Wait) => {
    for (const k of ['lookL', 'lookR', 'lookU'] as const) { show(eyes([k, k]), at()); await wait(jitter(700)); }
  };
  const clock = async (show: Show, wait: Wait) => {
    const cols = digits(romeClock());
    show(cols, Math.floor((width.current - cols.length) / 2)); await wait(3200);
  };
  const heartbeat = async (show: Show, wait: Wait) => {
    const w = width.current, tape = pulse(2, w);
    for (let k = 0; k <= tape.length - w; k += 1) { show(tape.slice(k, k + w), 0, 'fade'); await wait(24); }
  };
  const wink = async (show: Show, wait: Wait) => {
    show(eyes(['open', 'blink']), at(), 'cut'); await wait(260);
    show(eyes(FACES.happy), at()); await wait(1100);
  };
  const morning = async (show: Show, wait: Wait) => {
    const h = romeHour();
    if (h < 6 || h > 10) return wink(show, wait);
    const x = Math.floor(width.current / 2) - 4;
    for (let k = 0; k < 10; k++) { show(CUP[k % 2], x, k ? 'fade' : 'wipe'); await wait(360); }
    show(eyes(FACES.happy), at()); await wait(1000);
  };
  const sleep = async (show: Show, wait: Wait) => {
    const e = at();
    for (let k = 0; k < 3; k++) for (let y = 5; y >= -3; y--) {
      show(compose(width.current, [[eyes(['sleep', 'sleep']), e], [shift(ZED, y), e + 19]]), 0, 'fade'); await wait(380);
    }
  };

  useEffect(() => {
    if (reduce) return play(async show => show(eyes(mood === 'thinking' ? THINK[0] : mood === 'alert' ? ANGRY : FACES[mood]), at(), 'cut'));
    if (mood === 'idle') return play(live);
    return play((show, wait) => moodScript(mood, show, wait, at(), width.current));
  }, [mood, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-centre on resize, and glance the way the day moved.
  useEffect(() => {
    if (!nudge || reduce || mood !== 'idle' || !woke.current) return;
    const k: string = nudge.dir < 0 ? 'lookL' : 'lookR';
    return play(async (show, wait) => { show(eyes([k, k]), at()); await wait(650); await live(show, wait); });
  }, [nudge?.key, W]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={box} role="img" aria-hidden className="relative block w-full overflow-hidden" style={{ padding: `${pitch * 0.7}px 0`, borderRadius: 16, background: '#060606', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.05), 0 1px 0 rgba(255,255,255,0.05)' }}>
      <span className="flex justify-center"><Panel cols={W} pitch={pitch} frame={frame} glow={glowOf(mood)} /></span>
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: GLASS }} />
    </span>
  );
}
