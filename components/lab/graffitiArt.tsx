import type { Mode } from '../../lib/lab/model';
import { C } from './theme';

// Side views of the four vehicles on a 360×150 stage. `body` is the paintable
// surface: graffiti and free drawing are clipped to it, so paint lands on
// the vehicle, never on the air around it.

export const W = 360;
export const H = 150;

type Vehicle = { body: string; area: { x0: number; x1: number; y0: number; y1: number }; tagScale: number };

export const VEHICLES: Record<Mode, Vehicle> = {
  TRAIN: { body: 'M16 40 H276 C314 40 338 66 349 100 Q352 116 338 116 H16 Q8 116 8 108 V48 Q8 40 16 40 Z', area: { x0: 28, x1: 300, y0: 52, y1: 108 }, tagScale: 1 },
  SUBWAY: { body: 'M18 38 H342 Q352 38 352 48 V108 Q352 116 344 116 H16 Q8 116 8 108 V48 Q8 38 18 38 Z', area: { x0: 28, x1: 332, y0: 50, y1: 108 }, tagScale: 1 },
  BUS: { body: 'M16 36 H318 Q344 36 349 62 L352 106 Q352 114 344 114 H16 Q8 114 8 106 V44 Q8 36 16 36 Z', area: { x0: 26, x1: 300, y0: 48, y1: 104 }, tagScale: 1 },
  AIRPORT: { body: 'M24 80 C24 68 44 62 76 62 H292 C320 62 342 70 352 84 C342 96 320 102 292 102 H70 C44 102 24 94 24 80 Z M30 70 L16 26 Q15 22 20 22 H36 Q40 22 43 26 L78 64 Z', area: { x0: 70, x1: 300, y0: 70, y1: 96 }, tagScale: 0.68 },
};

const PANEL = '#2A2E35';
const EDGE = 'rgba(255,255,255,0.10)';
const GLASS = '#101216';
const RUBBER = '#141619';

function Bogie({ x }: { x: number }) {
  return <g className="gf-spin"><circle cx={x} cy={122} r={8} fill={RUBBER} stroke={EDGE} strokeWidth={1.5} /><path d={`M ${x - 5} 122 H ${x + 5} M ${x} 117 V 127`} stroke={EDGE} strokeWidth={1.2} /></g>;
}

// Drawn under the paint: shell, glazing, livery stripe.
export function VehicleBase({ mode, accent, clipId }: { mode: Mode; accent: string; clipId: string }) {
  const v = VEHICLES[mode];
  return (
    <g>
      {mode !== 'AIRPORT' && <>
        <line x1={0} x2={W} y1={131} y2={131} stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
        <g className="gf-ground">{Array.from({ length: 22 }, (_, i) => <rect key={i} x={i * 20 - 20} y={133} width={mode === 'BUS' ? 10 : 12} height={mode === 'BUS' ? 2 : 3} rx={1} fill="rgba(255,255,255,0.06)" />)}</g>
      </>}
      <path d={v.body} fill={PANEL} />
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={W} height={60} fill="url(#lab-sheen)" />
        {/* A reflection sliding along the glass while it moves */}
        <rect className="gf-sweep" x={-80} y={30} width={46} height={90} fill="rgba(255,255,255,0.07)" transform="skewX(-20)" />
        {mode === 'TRAIN' && <>
          {[28, 62, 96, 190, 224, 258].map(x => <rect key={x} x={x} y={54} width={26} height={20} rx={5} fill={GLASS} />)}
          <rect x={136} y={50} width={26} height={60} rx={4} fill="none" stroke={EDGE} strokeWidth={1.5} />
          <path d="M286 52 H300 C318 54 330 66 337 82 H286 Q282 82 282 78 V56 Q282 52 286 52 Z" fill={GLASS} />
          <rect x={0} y={90} width={W} height={7} fill={accent} />
        </>}
        {mode === 'SUBWAY' && <>
          {[14, 330].map(x => <rect key={x} x={x} y={50} width={16} height={26} rx={4} fill={GLASS} />)}
          {[70, 170, 270].map(x => <g key={x}><rect x={x} y={48} width={30} height={66} rx={3} fill="none" stroke={EDGE} strokeWidth={1.5} /><rect x={x + 3} y={54} width={11} height={28} rx={3} fill={GLASS} /><rect x={x + 16} y={54} width={11} height={28} rx={3} fill={GLASS} /></g>)}
          {[106, 206].map(x => <rect key={x} x={x} y={54} width={56} height={24} rx={4} fill={GLASS} />)}
          {[38, 302].map(x => <rect key={x} x={x} y={54} width={24} height={24} rx={4} fill={GLASS} />)}
          <rect x={0} y={88} width={W} height={6} fill={accent} />
        </>}
        {mode === 'BUS' && <>
          {[24, 82, 140, 198].map(x => <rect key={x} x={x} y={46} width={52} height={32} rx={5} fill={GLASS} />)}
          <rect x={258} y={46} width={30} height={66} rx={3} fill="none" stroke={EDGE} strokeWidth={1.5} />
          <rect x={262} y={50} width={22} height={30} rx={3} fill={GLASS} />
          <path d="M300 46 H316 Q336 46 341 66 L343 78 H300 Z" fill={GLASS} />
          <rect x={0} y={88} width={W} height={6} fill={accent} />
        </>}
        {mode === 'AIRPORT' && <>
          {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={92 + i * 13} cy={76} r={3.2} fill={GLASS} />)}
          <path d="M322 72 Q334 72 342 80 L326 80 Z" fill={GLASS} />
          <rect x={0} y={88} width={W} height={5} fill={accent} />
          <path d="M16 26 L30 70 H44 L36 26 Z" fill={accent} opacity={0.9} />
        </>}
      </g>
      {(mode === 'TRAIN' || mode === 'SUBWAY') && <>
        <rect x={24} y={116} width={312} height={4} fill={RUBBER} />
        {(mode === 'TRAIN' ? [46, 76, 262, 292] : [50, 80, 280, 310]).map(x => <Bogie key={x} x={x} />)}
      </>}
      {mode === 'BUS' && [76, 290].map(x => <g key={x}><circle cx={x} cy={114} r={17} fill={C.surface2} /><g className="gf-spin"><circle cx={x} cy={114} r={14} fill={RUBBER} stroke={EDGE} strokeWidth={3} /><path d={`M ${x - 6} 114 H ${x + 6} M ${x} 108 V 120`} stroke={EDGE} strokeWidth={2} /></g></g>)}
    </g>
  );
}

// Drawn over the paint, so the near wing sits in front of the fuselage.
export function VehicleFront({ mode }: { mode: Mode }) {
  if (mode !== 'AIRPORT') return null;
  return (
    <g>
      <path d="M150 94 L208 94 L178 136 Q175 141 169 141 H158 Z" fill="#23262C" stroke={EDGE} strokeWidth={1} />
      <ellipse cx={190} cy={108} rx={20} ry={8} fill="#30343B" stroke={EDGE} strokeWidth={1} />
      {[0, 1, 2].map(i => <line key={i} x1={260 + i * 30} x2={300 + i * 30} y1={124 + i * 8} y2={124 + i * 8} stroke="rgba(255,255,255,0.06)" strokeWidth={2} strokeLinecap="round" />)}
    </g>
  );
}

// ── Others' tags ───────────────────────────────────────────────────────
// Generated from the card's seed: the same strike always shows the same
// wall, and it fills up as the count grows.

export const SPRAY = ['#FF4FA3', '#36E0FF', '#B8FF3C', '#FFE14D', '#FFFFFF', '#FF7A1A'];

// Marks anyone reads the same way, in any language: an angry face, "!!",
// "?!", a cross, the manga anger vein, a broken heart, a stopped clock.
const SYMBOLS = {
  angry: { d: 'M -13 0 A 13 13 0 1 0 13 0 A 13 13 0 1 0 -13 0 M -8 -6 L -3 -3 M 8 -6 L 3 -3 M -6 7 Q 0 2 6 7', w: 3.4 },
  bang: { d: 'M -5 -13 L -5 4 M 5 -13 L 5 4 M -5 11 L -5 11.5 M 5 11 L 5 11.5', w: 4.6 },
  what: { d: 'M -12 -7 Q -12 -14 -6 -14 Q 0 -14 0 -8 Q 0 -3 -6 -1 L -6 4 M -6 11 L -6 11.5 M 8 -14 L 8 4 M 8 11 L 8 11.5', w: 4 },
  cross: { d: 'M -11 -11 L 11 11 M 11 -11 L -11 11', w: 5 },
  vein: { d: 'M -12 -4 Q -5 -5 -4 -12 M 4 -12 Q 5 -5 12 -4 M 12 4 Q 5 5 4 12 M -4 12 Q -5 5 -12 4', w: 3.4 },
  heart: { d: 'M 0 12 L -12 0 Q -16 -10 -7 -12 Q -2 -12 0 -7 Q 2 -12 7 -12 Q 16 -10 12 0 Z M 0 -7 L -3 -1 L 2 2 L -1 8', w: 3 },
  clock: { d: 'M -12 0 A 12 12 0 1 0 12 0 A 12 12 0 1 0 -12 0 M 0 0 L 0 -8 M 0 0 L 6 3 M -16 -16 L 16 16', w: 3 },
  swirl: { d: 'M -20 0 C -10 -18 12 -18 14 -2 C 16 12 -6 14 -8 2 C -9 -6 4 -8 6 0', w: 4.5 },
  zig: { d: 'M -22 4 L -12 -8 L -2 6 L 8 -8 L 18 6', w: 4 },
};
export type SymbolKind = keyof typeof SYMBOLS;
const KINDS = Object.keys(SYMBOLS) as SymbolKind[];

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

export type Tag = { kind: SymbolKind; x: number; y: number; r: number; s: number; color: string; drips: number[]; back?: boolean };

// Tags sit on a jittered grid so each mark stays readable; the cell holding
// your spot stays empty. Past the grid, extra tags go in small and faded
// underneath, so a busy wall reads as dense, not as noise.
export function makeTags(mode: Mode, seed: string, count: number): Tag[] {
  const { area, tagScale } = VEHICLES[mode];
  const rand = rng(seed);
  const spot = mySpot(mode, seed);
  const cols = mode === 'AIRPORT' ? 6 : 5;
  const rows = mode === 'AIRPORT' ? 1 : 2;
  const cw = (area.x1 - area.x0) / cols;
  const ch = (area.y1 - area.y0) / rows;
  const cells = Array.from({ length: cols * rows }, (_, i) => ({ x: area.x0 + (i % cols + 0.5) * cw, y: area.y0 + (Math.floor(i / cols) + 0.5) * ch }))
    .filter(c => Math.abs(c.x - spot.x) > cw * 0.7 || Math.abs(c.y - spot.y) > ch * 0.7)
    .map(c => ({ c, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map(({ c }) => c);
  const tag = (x: number, y: number, s: number): Tag => ({
    kind: KINDS[Math.floor(rand() * KINDS.length)], x, y, r: rand() * 24 - 12, s,
    color: SPRAY[Math.floor(rand() * SPRAY.length)],
    drips: rand() > 0.55 ? [rand() * 16 - 8] : [],
  });
  const front = cells.slice(0, Math.min(count, cells.length)).map(c => tag(c.x + (rand() - 0.5) * cw * 0.3, c.y + (rand() - 0.5) * ch * 0.25, (0.85 + rand() * 0.3) * tagScale));
  const back = Array.from({ length: Math.min(Math.max(count - front.length, 0), 14) }, () => ({ ...tag(area.x0 + rand() * (area.x1 - area.x0), area.y0 + rand() * (area.y1 - area.y0), 0.6 * tagScale), back: true }));
  return [...back, ...front];
}

// "Mine": a fixed spot per card, so the waiting hint and your stamp line up.
export function mySpot(mode: Mode, seed: string) {
  const { area, tagScale } = VEHICLES[mode];
  const rand = rng(`${seed}|mine`);
  return { x: area.x0 + (area.x1 - area.x0) * (0.35 + rand() * 0.3), y: (area.y0 + area.y1) / 2, s: 1.25 * tagScale, r: rand() * 10 - 5 };
}

export function TagMark({ tag }: { tag: Tag }) {
  const sym = SYMBOLS[tag.kind];
  return (
    <g transform={`translate(${tag.x} ${tag.y}) rotate(${tag.r}) scale(${tag.s})`} opacity={tag.back ? 0.4 : 1}>
      <path d={sym.d} fill="none" stroke={C.ink} strokeWidth={sym.w + 3} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
      <path d={sym.d} fill="none" stroke={tag.color} strokeWidth={sym.w} strokeLinecap="round" strokeLinejoin="round" />
      {tag.drips.map((dx, i) => <path key={i} d={`M ${dx} 13 v ${7 + Math.abs(dx) % 8}`} stroke={tag.color} strokeWidth={1.8} strokeLinecap="round" />)}
    </g>
  );
}

// Rough edges plus a faint overspray halo, applied once to the whole layer.
export function SprayFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={1} seed={3} result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale={2.4} xChannelSelector="R" yChannelSelector="G" result="rough" />
      <feGaussianBlur in="SourceGraphic" stdDeviation={2.6} result="mist" />
      <feComponentTransfer in="mist" result="faint"><feFuncA type="linear" slope={0.5} /></feComponentTransfer>
      <feMerge><feMergeNode in="faint" /><feMergeNode in="rough" /></feMerge>
    </filter>
  );
}
