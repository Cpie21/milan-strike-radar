'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { EyeLife, type Expr } from './eyes';

// The assistant's face: an amber LED dot matrix, the kind on Italian
// platforms, that speaks in pictures rather than words, so everyone reads it.
//   LedBoard – a board hanging from a rail at the top of the calm-day
//              module. It wakes up when it first appears, then lives: its
//              eyes look around, a tram goes by and it gives a thumbs-up, it
//              shows the time, a heartbeat, a coffee in the morning, sleeps
//              at night.
//   LedFace  – the compact face in its bezel: in the bar and the answer.
// The eyes are living shapes (eyes.ts) drawn into the dots every frame;
// pictures (tram, clock…) are bitmaps laid over them, wiping in column by
// column or fading with the slight persistence of real LEDs.

export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry' | 'alert' | 'off';

const ROWS = 9;
type Cols = number[]; // one bitmask per column, bit y = row y
type Frame = { cols: Cols; offset: number; mode: 'cut' | 'wipe' | 'fade'; cover?: boolean };

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

// Two layers: the living eyes (every frame) and a picture over them.
// `rows` above ROWS (the round face) adds dots above and below the frame's
// band, so the whole face is a grid of dots; frames stay vertically centred.
function Panel({ cols, pitch, frame, glow, eyes, rows = ROWS }: { cols: number; pitch: number; frame: Frame; glow: number; eyes?: EyeLife; rows?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const state = useRef({ alpha: new Float32Array(0), goal: new Float32Array(0), start: 0, mode: 'cut' as Frame['mode'], cover: new Uint8Array(0), raf: 0, last: 0 });

  useEffect(() => {
    const st = state.current;
    const n = cols * rows;
    const pad = Math.floor((rows - ROWS) / 2);
    if (st.alpha.length !== n) st.alpha = new Float32Array(n);
    const goal = new Float32Array(n);
    const cover = new Uint8Array(cols);
    frame.cols.forEach((col, i) => {
      const x = i + frame.offset;
      if (x < 0 || x >= cols) return;
      if (frame.cover && col) cover[x] = 1;
      for (let y = 0; y < ROWS; y++) if (col & (1 << y)) goal[(y + pad) * cols + x] = 1;
    });
    st.goal = goal; st.cover = cover;
    st.mode = reduce ? 'cut' : frame.mode;
    st.start = performance.now();
    eyes?.resize(cols);
    const sprite = makeSprite(pitch);
    // Sized here, on the client: the server can't know the pixel ratio,
    // and hydration keeps server attributes.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.current) {
      const w = Math.round(cols * pitch * dpr), h = Math.round(rows * pitch * dpr);
      if (canvas.current.width !== w) canvas.current.width = w;
      if (canvas.current.height !== h) canvas.current.height = h;
    }
    let visible = true;
    const io = canvas.current ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    if (io && canvas.current) io.observe(canvas.current);
    st.last = performance.now();
    const draw = () => {
      const c = canvas.current?.getContext('2d');
      if (!c) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - st.last) / 1000);
      st.last = now;
      let moving = false;
      let live: Float32Array | null = null;
      if (eyes) { if (!reduce) eyes.step(dt); else eyes.step(1); live = eyes.field(); moving = !reduce; }
      if (!visible && moving) { st.raf = requestAnimationFrame(draw); return; }
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      for (let i = 0; i < n; i++) {
        const x = i % cols, y = Math.floor(i / cols);
        const d = st.goal[i] - st.alpha[i];
        if (st.mode === 'cut') st.alpha[i] = st.goal[i];
        else if (st.mode === 'wipe') { if (now >= st.start + x * 14) st.alpha[i] += Math.sign(d) * Math.min(Math.abs(d), 0.22); }
        else st.alpha[i] += d > 0 ? Math.min(d, 0.55) : Math.max(d, -0.14); // lit fast, fades slow
        if (Math.abs(st.goal[i] - st.alpha[i]) > 0.001) moving = true; else st.alpha[i] = st.goal[i];
        const a = live && !st.cover[x] ? Math.max(live[i], st.alpha[i]) : st.alpha[i];
        const cx = (x + 0.5) * pitch * dpr - sprite.s / 2, cy = (y + 0.5) * pitch * dpr - sprite.s / 2;
        c.globalAlpha = 1;
        c.drawImage(sprite.off, cx, cy);
        if (a > 0.02) { c.globalAlpha = a * glow; c.drawImage(sprite.on, cx, cy); }
      }
      c.globalAlpha = 1;
      if (moving) st.raf = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(st.raf); io?.disconnect(); };
  }, [frame, cols, rows, pitch, glow, reduce, eyes]);

  return <canvas ref={canvas} style={{ width: cols * pitch, height: rows * pitch, display: 'block' }} aria-hidden />;
}

// ── Programmes ─────────────────────────────────────────────────────────
// A programme is an async script of pictures and waits. Starting another
// cancels the one running: its next wait throws STOP.

const STOP = Symbol('stop');
type Show = (cols: Cols, offset: number, mode?: Frame['mode'], cover?: boolean) => void;
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
    const show: Show = (cols, offset, mode = 'wipe', cover = false) => { if (g === gen.current) setFrame({ cols, offset, mode, cover }); };
    // Start on a timer, never synchronously inside the effect.
    wait(0).then(() => script(show, wait)).catch(e => { if (e !== STOP) throw e; });
    return stop;
  };
}

const jitter = (ms: number) => ms * (0.8 + Math.random() * 0.5);
const EXPR: Record<Mood, Expr> = { idle: 'idle', thinking: 'thinking', happy: 'happy', alarm: 'alarm', unsure: 'unsure', sorry: 'sorry', alert: 'concerned', off: 'off' };
const glowOf = (mood: Mood) => (mood === 'alarm' ? 1 : mood === 'thinking' || mood === 'alert' ? 0.85 : mood === 'off' ? 0.4 : 0.72);
const EMPTY: Frame = { cols: [], offset: 0, mode: 'cut' };

// ── Housings ───────────────────────────────────────────────────────────

const GLASS = 'linear-gradient(170deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 30%, transparent 31%), repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px)';
const ANODISED = 'linear-gradient(180deg,#50545C 0%,#2C2E34 9%,#1C1D21 55%,#141518 100%)';

// The anodised housing with a chamfer, four screws and recessed smoked glass.
function Housing({ children, pitch, glow, radius }: { children: React.ReactNode; pitch: number; glow: number; radius?: number }) {
  const r = radius ?? pitch * 2.6;
  const screw = (pos: React.CSSProperties) => <i aria-hidden className="absolute rounded-full" style={{ ...pos, width: Math.max(2, pitch * 0.95), height: Math.max(2, pitch * 0.95), background: 'radial-gradient(circle at 35% 30%, #A2A6AE, #3A3D44 60%, #1A1B1E)' }} />;
  const s = Math.max(1.5, pitch * 0.32);
  return (
    <span className="relative inline-flex" style={{
      padding: Math.max(3, pitch * 0.95), borderRadius: r, background: ANODISED,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.7), 0 ${pitch}px ${pitch * 3.2}px rgba(0,0,0,0.5), 0 0 ${pitch * 8}px rgba(255,150,30,${0.08 + glow * 0.2})`,
    }}>
      {screw({ left: s, top: s })}{screw({ right: s, top: s })}{screw({ left: s, bottom: s })}{screw({ right: s, bottom: s })}
      <span className="relative block overflow-hidden" style={{ borderRadius: r * 0.55, padding: pitch * 0.45, background: '#040404', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,0,0,0.6)' }}>
        {children}
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: GLASS }} />
      </span>
    </span>
  );
}

// ── Compact face ────────────────────────────────────────────────────────
// `attend`: where its attention is (the field you are typing in).

// `round`: a circular porthole of a display, for the bar's round end, where
// a round thing sits with an even margin all the way round.
export function LedFace({ mood = 'idle', size = 20, cols: wide = 19, attend = false, round }: { mood?: Mood; size?: number; cols?: number; attend?: boolean; round?: number }) {
  const pitch = size / 7;
  // Round: a square grid just covering the porthole, so dots reach its rim
  // all the way round, not only across the middle.
  const span = round ? Math.ceil((round - 6) / pitch) | 1 : 0;
  const cols = round ? span : wide, rows = round ? span : ROWS;
  const [eyes] = useState(() => new EyeLife(cols, rows));
  useEffect(() => { eyes.setExpr(EXPR[mood]); }, [eyes, mood]);
  useEffect(() => { if (attend) eyes.look(1, 0.25, 60_000); else eyes.look(0, 0, 0); }, [eyes, attend]);
  if (round) return (
    <span role="img" aria-hidden className="relative inline-flex items-center justify-center rounded-full" style={{
      width: round, height: round, background: ANODISED,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.5), 0 0 ${pitch * 6}px rgba(255,150,30,${glowOf(mood) * 0.18})`,
    }}>
      <span className="relative flex items-center justify-center rounded-full overflow-hidden" style={{ width: round - 6, height: round - 6, background: '#040404', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.95)' }}>
        <Panel cols={cols} rows={rows} pitch={pitch} frame={EMPTY} glow={glowOf(mood)} eyes={eyes} />
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: GLASS }} />
      </span>
    </span>
  );
  return (
    <span role="img" aria-hidden className="inline-flex">
      <Housing pitch={pitch} glow={glowOf(mood) * 0.6}>
        <Panel cols={cols} pitch={pitch} frame={EMPTY} glow={glowOf(mood)} eyes={eyes} />
      </Housing>
    </span>
  );
}

// ── Board (calm-day module) ─────────────────────────────────────────────
// Hangs from the module's top rail. Wakes once per visit; after that it
// keeps living through calm days, glancing the way you moved.

export function LedBoard({ mood = 'idle', pitch = 4.4, nudge, attend = false }: { mood?: Mood; pitch?: number; nudge?: { key: string; dir: number }; attend?: boolean }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLSpanElement>(null);
  const [W, setW] = useState(41);
  const width = useRef(W);
  const measured = useRef(false);
  useLayoutEffect(() => { width.current = W; });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Room for the housing's frame on both sides
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(31, Math.min(64, Math.floor((e.contentRect.width - pitch * 3.4 - 8) / pitch)));
      width.current = w; measured.current = true; setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pitch]);
  const [eyes] = useState(() => new EyeLife(41, ROWS));
  const [frame, setFrame] = useState<Frame>(EMPTY);
  const play = useProgramme(setFrame);
  const woke = useRef(false);

  // The idle life of the board: eyes most of the time, a little scene now and then.
  const live = async (show: Show, wait: Wait) => {
    if (!woke.current) {
      woke.current = true;
      // The board's real width first: woken at the default width, the static
      // and the sweep stopped short of its right edge.
      for (let i = 0; i < 20 && !measured.current; i++) await wait(30);
      eyes.show(false);
      for (const d of [0.06, 0.18, 0.34, 0.16, 0.05]) { show(noise(width.current, d), 0, 'cut'); await wait(70); }
      show([], 0, 'cut'); await wait(140);
      for (let x = 0; x < width.current; x += 2) { show([0x1ff, 0x1ff], x, 'fade'); await wait(14); }
      show([], 0, 'fade'); await wait(220);
      eyes.show(true); eyes.look(-0.8, 0, 500); await wait(600);
      eyes.look(0.8, -0.2, 500); await wait(600);
      eyes.look(0, 0, 0);
    }
    const scenes = [tram, clock, heartbeat, tram, morning];
    for (let i = 0; ; i++) {
      show([], 0, 'fade'); eyes.show(true);
      await wait(jitter(9000));
      await (romeHour() < 6 ? sleep : scenes[i % scenes.length])(show, wait);
    }
  };
  // A tram goes by in front, the eyes follow it, then a thumbs-up: all fine.
  const tram = async (show: Show, wait: Wait) => {
    const w = width.current;
    eyes.look(1, 0, 900); await wait(700);
    for (let x = w; x > -TRAM.length; x--) {
      eyes.look(Math.max(-1, Math.min(1, ((x + 8) - w / 2) / (w / 2))), 0.1, 300);
      show(compose(w, [[TRAM, x], [track(w), 0]]), 0, 'fade', true);
      await wait(40);
    }
    show([], 0, 'fade'); eyes.look(-1, 0, 600); await wait(500);
    eyes.show(false); await wait(150);
    show(THUMB, Math.floor(w / 2) - 5); await wait(1500);
    show([], 0, 'fade'); eyes.show(true); eyes.setExpr('happy'); await wait(1300); eyes.setExpr('idle');
  };
  const pictureThen = async (show: Show, wait: Wait, draw: () => Promise<void>) => {
    eyes.show(false); await wait(160); await draw(); show([], 0, 'fade'); eyes.show(true);
  };
  const clock = (show: Show, wait: Wait) => pictureThen(show, wait, async () => {
    const cols = digits(romeClock());
    show(cols, Math.floor((width.current - cols.length) / 2)); await wait(3000);
  });
  const heartbeat = (show: Show, wait: Wait) => pictureThen(show, wait, async () => {
    const w = width.current, tape = pulse(2, w);
    for (let k = 0; k <= tape.length - w; k += 1) { show(tape.slice(k, k + w), 0, 'fade'); await wait(24); }
  });
  const morning = async (show: Show, wait: Wait) => {
    const h = romeHour();
    if (h < 6 || h > 10) { eyes.setExpr('happy'); await wait(1200); eyes.setExpr('idle'); return; }
    await pictureThen(show, wait, async () => {
      const x = Math.floor(width.current / 2) - 4;
      for (let k = 0; k < 10; k++) { show(CUP[k % 2], x, k ? 'fade' : 'wipe'); await wait(360); }
    });
  };
  const sleep = async (show: Show, wait: Wait) => {
    eyes.setExpr('sleepy');
    const e = Math.floor(width.current / 2) + 10;
    for (let k = 0; k < 3; k++) for (let y = 5; y >= -3; y--) { show(compose(width.current, [[shift(ZED, y), e]]), 0, 'fade'); await wait(380); }
    eyes.setExpr('idle');
  };

  useEffect(() => {
    eyes.setExpr(EXPR[mood]);
    if (reduce || mood !== 'idle') return play(async show => { show([], 0, 'cut'); eyes.show(mood !== 'off'); });
    return play(live);
  }, [mood, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  // Glance the way the day moved.
  useEffect(() => {
    if (!nudge || reduce || mood !== 'idle' || !woke.current) return;
    eyes.look(nudge.dir < 0 ? -1 : 1, 0, 700);
  }, [nudge?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Watching you type.
  useEffect(() => { if (attend) eyes.look(0, 1, 60_000); else eyes.look(0, 0, 0); }, [eyes, attend]);

  return (
    <span ref={box} role="img" aria-hidden className="block w-full">
      <span className="flex justify-center">
        <Housing pitch={pitch} glow={glowOf(mood)}>
          <Panel cols={W} pitch={pitch} frame={frame} glow={glowOf(mood)} eyes={eyes} />
        </Housing>
      </span>
    </span>
  );
}
