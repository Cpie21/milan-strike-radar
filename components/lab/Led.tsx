'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// The assistant's face: the amber LED dot-matrix panels that hang over
// Italian platforms. Two forms:
//   LedBoard – a wide hanging board for the calm-day module. Between
//              expressions it does what real boards do: shows the time, runs
//              a line of text, scrolls the next item in, all as one tape.
//   LedFace  – a compact pair of eyes for the input bar.
// Drawn on canvas: unlit dots stay faintly visible, lit dots bloom, changes
// either wipe across column by column (expressions) or scroll a column at a
// time (text), as the real panels do.

export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry';

// ── Bitmaps ─────────────────────────────────────────────────────────────

const EYES: Record<string, string[]> = {
  open: ['..###..', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '..###..'],
  blink: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
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
const FACES: Record<Exclude<Mood, 'thinking'>, [string, string]> = {
  idle: ['open', 'open'], happy: ['happy', 'happy'], alarm: ['sadL', 'sadR'], unsure: ['open', 'squint'], sorry: ['down', 'down'],
};
const THINK: [string, string][] = [['lookL', 'lookL'], ['lookU', 'lookU'], ['lookR', 'lookR'], ['squint', 'squint']];

// 5×7 board font
const F: Record<string, string> = {
  A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.###.', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.###.#...##.....###.....##...#.###.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####', 0: '.###.#...##..###.#.###..##...#.###.',
  1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####', 3: '.###.#...#....#..##.....##...#.###.',
  4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.', 6: '..##..#...#....####.#...##...#.###.',
  7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.', 9: '.###.#...##...#.####....#...#..##..',
  ':': '......##...##........##...##.......', '·': '................##...##............', '.': '..........................##...##..',
  '-': '................###................', ' ': '...................................',
};
function glyphColumns(ch: string): number[] {
  const g = F[ch] ?? F[' '];
  const w = ch === ':' || ch === '·' || ch === '.' || ch === ' ' ? 3 : 5;
  const off = w === 3 ? 1 : 0;
  return Array.from({ length: w }, (_, x) => {
    let col = 0;
    for (let y = 0; y < 7; y++) if (g[y * 5 + x + off] === '#') col |= 1 << y;
    return col;
  });
}
export function textColumns(text: string) {
  return [...text.toUpperCase()].flatMap(ch => [...glyphColumns(ch), 0]);
}
function eyesColumns([l, r]: [string, string], gap = 3) {
  const eye = (k: string) => Array.from({ length: 7 }, (_, x) => { let col = 0; EYES[k].forEach((row, y) => { if (row[x] === '#') col |= 1 << y; }); return col; });
  return [...eye(l), ...Array(gap).fill(0), ...eye(r)];
}

// ── Panel renderer ──────────────────────────────────────────────────────

type Target = { cols: number[]; offset: number; wipe: boolean }; // columns placed starting at `offset`

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

function Panel({ cols, rows, pitch, target, glow }: { cols: number; rows: number; pitch: number; target: Target; glow: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const state = useRef({ alpha: new Float32Array(cols * rows), goal: new Float32Array(cols * rows), start: 0, wipe: false, raf: 0 });

  useEffect(() => {
    const st = state.current;
    const goal = new Float32Array(cols * rows);
    target.cols.forEach((col, i) => {
      const x = i + target.offset;
      if (x < 0 || x >= cols) return;
      for (let y = 0; y < 7; y++) if (col & (1 << y)) goal[(y + 1) * cols + x] = 1;
    });
    st.goal = goal;
    st.wipe = target.wipe && !reduce;
    st.start = performance.now();
    const sprite = makeSprite(pitch);
    // Size the backing store here, on the client: the server can't know
    // the device pixel ratio, and hydration keeps server attributes.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.current) {
      const w = Math.round(cols * pitch * dpr), h = Math.round(rows * pitch * dpr);
      if (canvas.current.width !== w) canvas.current.width = w;
      if (canvas.current.height !== h) canvas.current.height = h;
    }
    const draw = () => {
      const c = canvas.current?.getContext('2d');
      if (!c) return;
      const now = performance.now();
      let moving = false;
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      for (let i = 0; i < cols * rows; i++) {
        const x = i % cols, y = Math.floor(i / cols);
        if (st.wipe) {
          const due = st.start + x * 14;
          if (now >= due) { const d = st.goal[i] - st.alpha[i]; st.alpha[i] += Math.sign(d) * Math.min(Math.abs(d), 0.22); }
          if (st.alpha[i] !== st.goal[i]) moving = true;
        } else st.alpha[i] = st.goal[i];
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
  }, [target, cols, rows, pitch, glow, reduce]);

  return <canvas ref={canvas} style={{ width: cols * pitch, height: rows * pitch, display: 'block' }} aria-hidden />;
}

// The housing: anodised frame with a chamfer, smoked glass recessed in it,
// four screws. Boards hang from two rods, as on platforms.
function Housing({ children, pitch, hanging, glow }: { children: React.ReactNode; pitch: number; hanging?: boolean; glow: number }) {
  const r = pitch * 2.4;
  const screw = (pos: React.CSSProperties) => <i aria-hidden className="absolute rounded-full" style={{ ...pos, width: pitch * 1.1, height: pitch * 1.1, background: 'radial-gradient(circle at 35% 30%, #9A9EA6, #3A3D44 60%, #1A1B1E)', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.6)' }} />;
  return (
    <span className="relative inline-flex flex-col items-center">
      {hanging && (
        <span aria-hidden className="flex justify-between" style={{ width: '62%', height: pitch * 3 }}>
          {[0, 1].map(i => <i key={i} style={{ width: Math.max(2, pitch * 0.45), height: '100%', background: 'linear-gradient(90deg,#2A2C31,#6A6E76,#2A2C31)' }} />)}
        </span>
      )}
      <span className="relative inline-flex" style={{
        padding: pitch * 0.9, borderRadius: r,
        background: 'linear-gradient(180deg,#4B4F57 0%,#2A2C32 8%,#1B1C20 55%,#141518 100%)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.7), 0 ${pitch * 1.2}px ${pitch * 4}px rgba(0,0,0,0.55), 0 0 ${pitch * 9}px rgba(255,150,30,${0.12 + glow * 0.22})`,
      }}>
        {screw({ left: pitch * 0.3, top: pitch * 0.3 })}{screw({ right: pitch * 0.3, top: pitch * 0.3 })}
        {screw({ left: pitch * 0.3, bottom: pitch * 0.3 })}{screw({ right: pitch * 0.3, bottom: pitch * 0.3 })}
        {/* Chamfer, then the recessed smoked glass */}
        <span className="relative block overflow-hidden" style={{ borderRadius: r * 0.6, padding: pitch * 0.5, background: '#040404', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.6)' }}>
          {children}
          <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(170deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 30%, transparent 31%), repeating-linear-gradient(180deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px)' }} />
        </span>
      </span>
    </span>
  );
}

function useFace(mood: Mood) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [blink, setBlink] = useState(false);
  const [startled, setStartled] = useState(false);
  useEffect(() => {
    if (mood !== 'thinking' || reduce) return;
    const t = setInterval(() => setTick(n => n + 1), 420);
    return () => clearInterval(t);
  }, [mood, reduce]);
  useEffect(() => {
    if (mood !== 'idle' || reduce) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => { timer = setTimeout(() => { if (!alive) return; setBlink(true); timer = setTimeout(() => { setBlink(false); next(); }, 160); }, 2400 + Math.random() * 3600); };
    next();
    return () => { alive = false; clearTimeout(timer); };
  }, [mood, reduce]);
  useEffect(() => {
    if (mood !== 'alarm' || reduce) return;
    const a = setTimeout(() => setStartled(true), 0);
    const b = setTimeout(() => setStartled(false), 600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [mood, reduce]);
  return mood === 'thinking' ? THINK[tick % THINK.length] : mood === 'idle' && blink ? ['blink', 'blink'] as [string, string] : mood === 'alarm' && startled ? ['wide', 'wide'] as [string, string] : FACES[mood];
}

const glowOf = (mood: Mood) => (mood === 'alarm' ? 1 : mood === 'thinking' ? 0.85 : 0.7);

// ── Compact face (input bar, sheet header) ──────────────────────────────

export function LedFace({ mood = 'idle', size = 20 }: { mood?: Mood; size?: number }) {
  const eyes = useFace(mood);
  const pitch = size / 7;
  const [target, setTarget] = useState<Target>({ cols: eyesColumns(eyes), offset: 1, wipe: false });
  const key = eyes.join();
  useEffect(() => { const t = setTimeout(() => setTarget({ cols: eyesColumns(eyes), offset: 1, wipe: true }), 0); return () => clearTimeout(t); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span role="img" aria-label="" className="inline-flex">
      <Housing pitch={pitch} glow={glowOf(mood) * 0.6}>
        <Panel cols={19} rows={9} pitch={pitch} target={target} glow={glowOf(mood)} />
      </Housing>
    </span>
  );
}

// ── Hanging board (calm-day module) ─────────────────────────────────────
// Idle, it cycles like a platform board: eyes (with blinks) → the time →
// a line of real information scrolled through → eyes again, every change
// a scroll or a wipe, never a cut. `message` interrupts the cycle: when the
// day changes, the board scrolls the new day through before looking back.

export function LedBoard({ mood = 'idle', lines, message, pitch = 4.4 }: { mood?: Mood; lines: string[]; message?: string; pitch?: number }) {
  const reduce = useReducedMotion();
  const COLS = 41;
  const eyes = useFace(mood);
  const [target, setTarget] = useState<Target>({ cols: eyesColumns(eyes), offset: 12, wipe: false });
  const showing = useRef<'eyes' | 'other'>('eyes');
  const queue = useRef<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Scroll a tape through: from the current content, text enters right and
  // leaves left, and the eyes scroll back in behind it.
  const scrollThrough = (text: string, then: () => void) => {
    const eyesCols = eyesColumns(FACES.idle);
    const tape = [...Array(12).fill(0), ...eyesCols, ...Array(14).fill(0), ...textColumns(text), ...Array(16).fill(0), ...eyesCols];
    const end = tape.length - 12 - eyesCols.length;
    let x = 0;
    showing.current = 'other';
    const step = () => {
      setTarget({ cols: tape, offset: -x, wipe: false });
      if (x < end) { x += 1; later(step, 55); } else { showing.current = 'eyes'; then(); }
    };
    step();
  };
  const showClock = (then: () => void) => {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const cols = textColumns(now);
    showing.current = 'other';
    setTarget({ cols, offset: Math.floor((COLS - cols.length) / 2), wipe: true });
    later(() => { showing.current = 'eyes'; setTarget({ cols: eyesColumns(FACES.idle), offset: 12, wipe: true }); then(); }, 3200);
  };

  // The idle programme
  useEffect(() => {
    if (mood !== 'idle' || reduce) return;
    let i = 0;
    const cycle = () => {
      const pending = queue.current.shift();
      if (pending) { scrollThrough(pending, () => later(cycle, 5000)); return; }
      const step = i++ % 3;
      if (step === 0) later(() => showClock(() => later(cycle, 6000)), 0);
      else { const line = lines[(step - 1) % Math.max(1, lines.length)]; if (line) scrollThrough(line, () => later(cycle, 6000)); else later(cycle, 6000); }
    };
    later(cycle, 4500);
    return clear;
  }, [mood, reduce, lines.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new day: interrupt and scroll it through.
  useEffect(() => {
    if (!message) return;
    if (reduce) return;
    clear();
    scrollThrough(message, () => {
      if (mood === 'idle') later(() => { queue.current = []; setTarget({ cols: eyesColumns(FACES.idle), offset: 12, wipe: true }); }, 0);
    });
    return clear;
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expressions (blinks, moods) apply whenever the eyes are up.
  const key = eyes.join();
  useEffect(() => {
    if (showing.current !== 'eyes') return;
    const t = setTimeout(() => setTarget({ cols: eyesColumns(eyes), offset: 12, wipe: true }), 0);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clear, []);

  return (
    <span role="img" aria-label="" className="inline-flex">
      <Housing pitch={pitch} hanging glow={glowOf(mood)}>
        <Panel cols={COLS} rows={9} pitch={pitch} target={target} glow={glowOf(mood)} />
      </Housing>
    </span>
  );
}
