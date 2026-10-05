'use client';

import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// The assistant's face is a small amber LED dot-matrix panel, the kind that
// hangs over Italian platforms listing trains in big yellow pixels. Two eyes
// drawn in lit dots do all the expressing. A change re-lights the matrix
// column by column, the way those boards refresh. Unlit dots stay faintly
// visible, as on the real panels.

export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry';

const COLS = 19;
const ROWS = 9;

// 7×7 eye bitmaps. '#' lit, '.' dark.
const EYES = {
  open: ['..###..', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '..###..'],
  blink: ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  squint: ['.......', '.......', '.#####.', '#######', '.#####.', '.......', '.......'],
  wide: ['.#####.', '#######', '#######', '#######', '#######', '#######', '.#####.'],
  happy: ['.......', '..###..', '.#...#.', '#.....#', '#.....#', '.......', '.......'],
  down: ['.......', '.......', '#.....#', '#.....#', '.#...#.', '..###..', '.......'],
  // Worried: the inner corners lift (the outer ones would read as angry).
  sadL: ['.......', '......#', '....###', '..#####', '.######', '.#####.', '..###..'],
  sadR: ['.......', '#......', '###....', '#####..', '######.', '.#####.', '..###..'],
  lookL: ['.###...', '#####..', '#####..', '#####..', '#####..', '#####..', '.###...'],
  lookR: ['...###.', '..#####', '..#####', '..#####', '..#####', '..#####', '...###.'],
  lookU: ['..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......', '.......'],
  x: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
};
type Eye = keyof typeof EYES;

const FACES: Record<Exclude<Mood, 'thinking'>, [Eye, Eye]> = {
  idle: ['open', 'open'], happy: ['happy', 'happy'], alarm: ['sadL', 'sadR'], unsure: ['open', 'squint'], sorry: ['down', 'down'],
};
const THINK: [Eye, Eye][] = [['lookL', 'lookL'], ['lookU', 'lookU'], ['lookR', 'lookR'], ['squint', 'squint']];

function frame([l, r]: [Eye, Eye]) {
  const lit = new Set<number>();
  const put = (eye: Eye, col0: number) => EYES[eye].forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') lit.add((y + 1) * COLS + col0 + x); }));
  put(l, 1);
  put(r, 11);
  return lit;
}

export default function Solari({ mood = 'idle', size = 40, label, float = false }: { mood?: Mood; size?: number; label?: string; float?: boolean }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
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
    const next = () => { timer = setTimeout(() => { if (!alive) return; setBlink(true); timer = setTimeout(() => { setBlink(false); next(); }, 180); }, 2400 + Math.random() * 3600); };
    next();
    return () => { alive = false; clearTimeout(timer); };
  }, [mood, reduce]);
  useEffect(() => {
    if (mood !== 'alarm' || reduce) return;
    const a = setTimeout(() => setStartled(true), 0);
    const b = setTimeout(() => setStartled(false), 600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [mood, reduce]);

  const eyes: [Eye, Eye] = mood === 'thinking' ? THINK[tick % THINK.length]
    : mood === 'idle' && blink ? ['blink', 'blink']
      : mood === 'alarm' && startled ? ['wide', 'wide'] : FACES[mood];
  const lit = frame(eyes);

  // `size` is the width of one eye in px; dots follow from it.
  const pitch = size / 7;
  const r = pitch * 0.36;
  const w = COLS * pitch;
  const h = ROWS * pitch;
  const pad = pitch * 0.9;
  const glow = mood === 'alarm' ? 0.55 : mood === 'thinking' ? 0.42 : 0.28;

  return (
    <span role="img" aria-label={label ?? 'assistant'} className="relative inline-flex shrink-0" style={{
      padding: Math.max(1.5, pitch * 0.35), borderRadius: pitch * 2.2,
      background: 'linear-gradient(160deg,#4A4D55 0%,#1A1B1F 30%,#0C0C0E 70%,#2C2E34 100%)',
      boxShadow: `0 ${pitch}px ${pitch * 4}px rgba(0,0,0,0.6), 0 0 ${pitch * 7}px rgba(255,150,20,${glow})`,
      animation: float && !reduce ? `led-float-${uid} 3.8s ease-in-out infinite` : undefined,
      transition: 'box-shadow .5s ease',
    }}>
      <style>{`@keyframes led-float-${uid}{0%,100%{transform:translateY(0)}50%{transform:translateY(-${Math.max(1, pitch * 0.5)}px)}}`}</style>
      <span className="relative block overflow-hidden" style={{ padding: pad, borderRadius: pitch * 1.8, background: 'radial-gradient(120% 100% at 50% 0%, #121110, #050505 70%)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)' }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block" aria-hidden>
          <defs>
            <radialGradient id={`led-on-${uid}`}>
              <stop offset="0" stopColor="#FFF2C8" />
              <stop offset="0.45" stopColor="#FFC23A" />
              <stop offset="1" stopColor="#F08A00" />
            </radialGradient>
            <filter id={`led-bloom-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={pitch * 0.55} result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Unlit dots, faintly visible */}
          <g fill="#2A1C08">
            {Array.from({ length: COLS * ROWS }, (_, i) => <circle key={i} cx={(i % COLS + 0.5) * pitch} cy={(Math.floor(i / COLS) + 0.5) * pitch} r={r} />)}
          </g>
          {/* Lit dots: every dot fades on or off, the matrix refreshing left to right */}
          <g filter={`url(#led-bloom-${uid})`}>
            {Array.from({ length: COLS * ROWS }, (_, i) => (
              <circle key={i} cx={(i % COLS + 0.5) * pitch} cy={(Math.floor(i / COLS) + 0.5) * pitch} r={r * 1.05} fill={`url(#led-on-${uid})`}
                style={{ opacity: lit.has(i) ? 1 : 0, transition: reduce ? undefined : `opacity 110ms linear ${(i % COLS) * 9}ms` }} />
            ))}
          </g>
        </svg>
        {/* Glass over the panel */}
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 35%, transparent 36%)' }} />
      </span>
    </span>
  );
}
