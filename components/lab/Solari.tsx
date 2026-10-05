'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

// The assistant's face: two flap units from the amber Solari boards that
// hang in Italian stations (black flaps, orange characters, solari udine),
// the boards that read SCIOPERO on strike days. Each unit
// shows an eye; expressions come from eyes alone (as with Cozmo or EMO),
// which survives being 18px tall. Every change is a real flap: the top half
// falls, shading the lower half as it passes, and the new lower half lands
// with a small bounce. CSS transforms only.

export type Eye = 'open' | 'blink' | 'happy' | 'wide' | 'sadL' | 'sadR' | 'squint' | 'lookL' | 'lookR' | 'lookU' | 'down' | 'x';
export type Mood = 'idle' | 'thinking' | 'happy' | 'alarm' | 'unsure' | 'sorry';

const INK = 'url(#sol-ink)';
const LINE = '#FFA53A'; // strokes: gradients on thin strokes render unreliably
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
    case 'happy': return <path d="M9 31 Q20 11 31 31" fill="none" stroke={LINE} strokeWidth={7} strokeLinecap="round" />;
    case 'down': return <path d="M9 25 Q20 45 31 25" fill="none" stroke={LINE} strokeWidth={7} strokeLinecap="round" />;
    case 'sadL': return <path d="M11 22 L29 15 L29 39 Q29 43 25 43 L15 43 Q11 43 11 39 Z" fill={INK} />;
    case 'sadR': return <path d="M11 15 L29 22 L29 39 Q29 43 25 43 L15 43 Q11 43 11 39 Z" fill={INK} />;
    case 'x': return <path d="M12 18 L28 38 M28 18 L12 38" stroke={LINE} strokeWidth={6} strokeLinecap="round" />;
  }
}

// Half of a flap face, showing the top or bottom half of a glyph.
// Half of a flap. Glyphs are lit amber with a soft bloom; faint blade
// lines run across them like the segments on the real boards.
function Half({ eye, part }: { eye: Eye; part: 'top' | 'bottom' }) {
  return (
    <span className="absolute inset-x-0 overflow-hidden" style={{
      top: part === 'top' ? 0 : '50%', height: '50%',
      background: part === 'top' ? 'linear-gradient(180deg,#17171A,#0F0F11)' : 'linear-gradient(180deg,#121214,#0A0A0B)',
      borderRadius: part === 'top' ? '16% 16% 2% 2% / 11% 11% 2% 2%' : '2% 2% 16% 16% / 2% 2% 11% 11%',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-x-0 w-full" style={{ top: part === 'top' ? 0 : '-100%', height: '200%', filter: 'drop-shadow(0 0 2.5px rgba(255,138,0,0.85)) drop-shadow(0 0 7px rgba(255,120,0,0.35))' }} aria-hidden>
        <Glyph eye={eye} />
      </svg>
      <span aria-hidden className="absolute inset-0" style={{ background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 3px, rgba(0,0,0,0.22) 3px 4px)' }} />
      {part === 'top' && <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 60%)' }} />}
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
      <span aria-hidden className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ height: Math.max(1, width / 26), background: '#000000', zIndex: 4 }} />
      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ left: -width * 0.04, width: width * 0.09, height: width * 0.09, background: 'radial-gradient(circle at 35% 35%, #8A8E96, #2A2C31)', zIndex: 5 }} />
      <span aria-hidden className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ right: -width * 0.04, width: width * 0.09, height: width * 0.09, background: 'radial-gradient(circle at 35% 35%, #8A8E96, #2A2C31)', zIndex: 5 }} />
    </span>
  );
}

const FACES: Record<Exclude<Mood, 'thinking'>, [Eye, Eye]> = {
  idle: ['open', 'open'], happy: ['happy', 'happy'], alarm: ['sadL', 'sadR'], unsure: ['open', 'squint'], sorry: ['down', 'down'],
};
const THINK: [Eye, Eye][] = [['lookL', 'lookL'], ['lookU', 'lookU'], ['lookR', 'lookR'], ['squint', 'squint']];

export default function Solari({ mood = 'idle', size = 40, label, float = false }: { mood?: Mood; size?: number; label?: string; float?: boolean }) {
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
  const glow = mood === 'alarm' ? 0.55 : mood === 'thinking' ? 0.45 : 0.3;
  // A floating module: brushed bezel, black glass, amber light spilling out.
  return (
    <span role="img" aria-label={label ?? 'Solari'} className="relative inline-flex shrink-0" style={{
      padding: Math.max(1.5, size * 0.05), borderRadius: size * 0.36,
      background: 'linear-gradient(150deg,#5B5F68 0%,#1C1D22 38%,#0B0B0D 62%,#3A3D44 100%)',
      boxShadow: `0 ${size * 0.1}px ${size * 0.5}px rgba(0,0,0,0.6), 0 0 ${size * 0.9}px rgba(255,130,0,${glow})`,
      animation: float && !reduce ? 'sol-float 3.6s ease-in-out infinite' : undefined,
      transition: 'box-shadow .4s ease',
    }}>
      <svg width={0} height={0} className="absolute" aria-hidden><defs><linearGradient id="sol-ink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFD08A" /><stop offset=".45" stopColor="#FFA235" /><stop offset="1" stopColor="#FF7A00" /></linearGradient></defs></svg>
      <style>{`@keyframes sol-fall{to{transform:rotateX(-90deg);filter:brightness(.5)}}@keyframes sol-land{from{transform:rotateX(90deg);filter:brightness(1.4)}to{transform:rotateX(0);filter:brightness(1)}}@keyframes sol-shadow{0%{opacity:0}45%{opacity:1}100%{opacity:0}}@keyframes sol-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-${Math.max(1, size * 0.06)}px)}}`}</style>
      <span className="relative inline-flex" style={{ padding: size * 0.13, gap, borderRadius: size * 0.31, background: 'radial-gradient(120% 90% at 50% 0%, #1A1A1D, #050506 70%)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
        <Flap eye={eyes[0]} width={size} />
        <Flap eye={eyes[1]} width={size} />
        {/* Glass reflection over the whole face */}
        <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ borderRadius: size * 0.31, background: 'linear-gradient(155deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 32%, transparent 33%, transparent 100%)', zIndex: 6 }} />
      </span>
    </span>
  );
}
