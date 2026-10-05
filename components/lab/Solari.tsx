'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// The assistant's face: two split-flap units from a Solari departure board,
// the boards Italian stations flip to SCIOPERO on strike days. Each unit
// shows an eye; expressions come from eyes alone (as with Cozmo or EMO),
// which survives being 18px tall. Every change is a real flap: the top half
// falls, shading the lower half as it passes, and the new lower half lands
// with a small bounce. CSS transforms only.

export type Eye = 'open' | 'blink' | 'happy' | 'wide' | 'sadL' | 'sadR' | 'squint' | 'lookL' | 'lookR' | 'lookU' | 'down' | 'x';
export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry';

const INK = '#F3EFE6';
const W = 40;
const H = 56;

function Glyph({ eye }: { eye: Eye }) {
  const r = (x: number, y: number, w: number, h: number, rx = 6) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={INK} />;
  switch (eye) {
    case 'open': return r(11, 13, 18, 30, 8);
    case 'blink': return r(9, 26, 22, 4, 2);
    case 'squint': return r(10, 22, 20, 12, 6);
    case 'wide': return r(8, 9, 24, 38, 11);
    case 'lookL': return r(6, 15, 16, 26, 7);
    case 'lookR': return r(18, 15, 16, 26, 7);
    case 'lookU': return r(12, 8, 16, 24, 7);
    case 'happy': return <path d="M10 34 Q20 16 30 34" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
    case 'down': return <path d="M10 24 Q20 38 30 24" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />;
    case 'sadL': return <path d="M11 22 L29 15 L29 39 Q29 43 25 43 L15 43 Q11 43 11 39 Z" fill={INK} />;
    case 'sadR': return <path d="M11 15 L29 22 L29 39 Q29 43 25 43 L15 43 Q11 43 11 39 Z" fill={INK} />;
    case 'x': return <path d="M12 18 L28 38 M28 18 L12 38" stroke={INK} strokeWidth={5.5} strokeLinecap="round" />;
  }
}

// Half of a flap face, showing the top or bottom half of a glyph.
function Half({ eye, part }: { eye: Eye; part: 'top' | 'bottom' }) {
  return (
    <span className="absolute inset-x-0 overflow-hidden" style={{
      top: part === 'top' ? 0 : '50%', height: '50%',
      background: part === 'top' ? 'linear-gradient(180deg,#2A2C31,#1F2024)' : 'linear-gradient(180deg,#25272B,#1B1C20)',
      borderRadius: part === 'top' ? '18% 18% 3% 3% / 13% 13% 2% 2%' : '3% 3% 18% 18% / 2% 2% 13% 13%',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-x-0 w-full" style={{ top: part === 'top' ? 0 : '-100%', height: '200%' }} aria-hidden>
        <Glyph eye={eye} />
      </svg>
    </span>
  );
}

const DUR = 95; // ms per half

function Flap({ eye, width }: { eye: Eye; width: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(eye);
  const [flip, setFlip] = useState<{ from: Eye; to: Eye; id: number } | null>(null);
  const busy = flip !== null;

  useEffect(() => {
    if (busy || eye === shown) return;
    if (reduce) { const t = setTimeout(() => setShown(eye), 0); return () => clearTimeout(t); }
    const t = setTimeout(() => setFlip({ from: shown, to: eye, id: Date.now() }), 0);
    return () => clearTimeout(t);
  }, [eye, shown, busy, reduce]);

  const height = (width * H) / W;
  return (
    <span className="relative block" style={{ width, height, perspective: width * 6 }}>
      {/* Static layers: new top already revealed behind the falling flap, old bottom until covered */}
      <Half eye={flip ? flip.to : shown} part="top" />
      <Half eye={flip ? flip.from : shown} part="bottom" />
      {flip && (
        <>
          {/* Both moving halves hinge on the split line (the flap's centre) */}
          <span key={`a${flip.id}`} className="absolute inset-0" style={{ transformOrigin: '50% 50%', animation: `sol-fall ${DUR}ms cubic-bezier(.55,0,.9,.5) forwards`, backfaceVisibility: 'hidden', zIndex: 2 }}>
            <Half eye={flip.from} part="top" />
          </span>
          <span key={`b${flip.id}`} className="absolute inset-0" style={{ transformOrigin: '50% 50%', transform: 'rotateX(90deg)', animation: `sol-land ${DUR * 1.5}ms cubic-bezier(.2,.7,.3,1.25) ${DUR}ms forwards`, backfaceVisibility: 'hidden', zIndex: 3 }}
            onAnimationEnd={() => { setShown(flip.to); setFlip(null); }}>
            <Half eye={flip.to} part="bottom" />
          </span>
          {/* The falling flap's shadow passing over the lower half */}
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-1/2 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))', animation: `sol-shadow ${DUR * 2.2}ms ease-out forwards`, zIndex: 1, borderRadius: '0 0 18% 18% / 0 0 13% 13%' }} />
        </>
      )}
      {/* The split: a dark gap with hinge pins */}
      <span aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ height: Math.max(1, width / 26), background: '#0B0C0E', zIndex: 4 }} />
      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: -width * 0.04, width: width * 0.09, height: width * 0.09, background: '#4A4D55', zIndex: 5 }} />
      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ right: -width * 0.04, width: width * 0.09, height: width * 0.09, background: '#4A4D55', zIndex: 5 }} />
    </span>
  );
}

const FACES: Record<Exclude<Mood, 'thinking'>, [Eye, Eye]> = {
  idle: ['open', 'open'], happy: ['happy', 'happy'], alarm: ['sadL', 'sadR'], unsure: ['open', 'squint'], sorry: ['down', 'down'],
};
const THINK: [Eye, Eye][] = [['lookL', 'lookL'], ['lookU', 'lookU'], ['lookR', 'lookR'], ['squint', 'squint']];

export default function Solari({ mood = 'idle', size = 40, label }: { mood?: Mood; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);
  const [blink, setBlink] = useState(false);

  // Thinking: the eyes look around, one flip at a time.
  useEffect(() => {
    if (mood !== 'thinking' || reduce) return;
    const t = setInterval(() => setTick(n => n + 1), 330);
    return () => clearInterval(t);
  }, [mood, reduce]);
  // Idle: an occasional blink, never on a beat.
  useEffect(() => {
    if (mood !== 'idle' || reduce) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => { timer = setTimeout(() => { if (!alive) return; setBlink(true); timer = setTimeout(() => { setBlink(false); next(); }, 260); }, 2600 + Math.random() * 3400); };
    next();
    return () => { alive = false; clearTimeout(timer); };
  }, [mood, reduce]);
  // An alarm first goes wide, then settles worried.
  const [startled, setStartled] = useState(false);
  useEffect(() => {
    if (mood !== 'alarm' || reduce) return;
    const a = setTimeout(() => setStartled(true), 0);
    const b = setTimeout(() => setStartled(false), 650);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [mood, reduce]);

  const eyes: [Eye, Eye] = mood === 'thinking' ? THINK[tick % THINK.length]
    : mood === 'idle' && blink ? ['blink', 'blink']
      : mood === 'alarm' && startled ? ['wide', 'wide'] : FACES[mood];
  const gap = size * 0.12;
  return (
    <span role="img" aria-label={label ?? 'Solari'} className="inline-flex shrink-0" style={{
      padding: size * 0.14, gap, borderRadius: size * 0.32,
      background: 'linear-gradient(180deg,#17181B,#0E0F11)',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6), 0 ${size * 0.06}px ${size * 0.25}px rgba(0,0,0,0.45)`,
    }}>
      <style>{`@keyframes sol-fall{to{transform:rotateX(-90deg);filter:brightness(.55)}}@keyframes sol-land{from{transform:rotateX(90deg);filter:brightness(1.35)}to{transform:rotateX(0);filter:brightness(1)}}@keyframes sol-shadow{0%{opacity:0}45%{opacity:1}100%{opacity:0}}`}</style>
      <Flap eye={eyes[0]} width={size} />
      <Flap eye={eyes[1]} width={size} />
    </span>
  );
}
