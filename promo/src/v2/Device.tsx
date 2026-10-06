import { SYSTEM } from './fonts';

// iPhone 17 Pro, to its own numbers: a 402×874 pt screen with a 62 pt
// display corner radius, the Dynamic Island (126×37 pt, 11 pt from the top),
// the status bar, a thin black border and a titanium band with its buttons.
// Everything is in screen points; `k` is video pixels per point.
export const SCREEN = { w: 402, h: 874, r: 62 };
const BEZEL = 10.5, BAND = 3.2;

export function Device({ k, children, touches = [] }: { k: number; children: React.ReactNode; touches?: { x: number; y: number; a: number }[] }) {
  const p = (v: number) => v * k;
  const outer = BEZEL + BAND;
  return (
    <div style={{ position: 'absolute', left: p(-outer), top: p(-outer), width: p(SCREEN.w + outer * 2), height: p(SCREEN.h + outer * 2) }}>
      {/* buttons on the band: action, volume up/down on the left; side button and Camera Control on the right */}
      {[[-1, 148, 30], [-1, 196, 60], [-1, 270, 60], [1, 228, 96], [1, 470, 58]].map(([side, y, h], i) => (
        <div key={i} style={{ position: 'absolute', top: p(outer + y), height: p(h), width: p(2.4), [side < 0 ? 'left' : 'right']: p(-1.8),
          borderRadius: p(1.2), background: 'linear-gradient(90deg,#2a2b2f,#8a8c92,#3a3b40)' }} />
      ))}
      {/* titanium band */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: p(SCREEN.r + outer),
        background: 'linear-gradient(160deg,#9a9ca2 0%,#4a4b50 12%,#2c2d31 40%,#2a2b2f 62%,#55575d 88%,#a5a7ad 100%)',
        boxShadow: `0 ${p(30)}px ${p(60)}px rgba(0,0,0,0.55), 0 ${p(8)}px ${p(16)}px rgba(0,0,0,0.4)` }} />
      {/* black border glass */}
      <div style={{ position: 'absolute', inset: p(BAND), borderRadius: p(SCREEN.r + BEZEL), background: '#000', boxShadow: `inset 0 0 0 ${p(0.6)}px rgba(255,255,255,0.08)` }} />
      {/* the screen */}
      <div style={{ position: 'absolute', left: p(outer), top: p(outer), width: p(SCREEN.w), height: p(SCREEN.h), borderRadius: p(SCREEN.r), overflow: 'hidden', background: '#0A0B0D' }}>
        {children}
        <StatusBar k={k} />
        {touches.map((t, i) => t.a > 0.01 && (
          <div key={i} style={{ position: 'absolute', left: p(t.x - 22), top: p(t.y - 22), width: p(44), height: p(44), borderRadius: '50%',
            background: 'rgba(255,255,255,0.32)', border: `${p(1.5)}px solid rgba(255,255,255,0.75)`, opacity: t.a, transform: `scale(${0.85 + 0.15 * t.a})` }} />
        ))}
      </div>
    </div>
  );
}

function StatusBar({ k }: { k: number }) {
  const p = (v: number) => v * k;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: p(54), color: '#fff', fontFamily: SYSTEM }}>
      <div style={{ position: 'absolute', left: p(33), width: p(76), top: p(17), textAlign: 'center', fontSize: p(17), fontWeight: 600, letterSpacing: p(-0.2), lineHeight: `${p(22)}px` }}>9:41</div>
      <div style={{ position: 'absolute', left: p(201 - 63), top: p(11), width: p(126), height: p(37), borderRadius: p(18.5), background: '#000' }} />
      <svg style={{ position: 'absolute', right: p(30), top: p(21.5), width: p(80), height: p(13) }} viewBox="0 0 80 13">
        {/* cellular */}
        {[0, 1, 2, 3].map(i => <rect key={i} x={i * 5} y={9 - i * 2.6} width={3.2} height={3.4 + i * 2.6} rx={0.9} fill="#fff" />)}
        {/* wi-fi */}
        <g transform="translate(29 0)" fill="#fff">
          <path d="M8 2.2c2.7 0 5.2 1 7 2.8l1.3-1.3C14.1 1.5 11.2.3 8 .3S1.9 1.5-.3 3.7L1 5c1.8-1.8 4.3-2.8 7-2.8Z" />
          <path d="M8 5.6c1.8 0 3.4.7 4.6 1.8l1.3-1.3C12.4 4.6 10.3 3.7 8 3.7s-4.4.9-5.9 2.4l1.3 1.3C4.6 6.3 6.2 5.6 8 5.6Z" />
          <path d="M8 9.1c.9 0 1.7.3 2.3.9L8 12.4 5.7 10c.6-.6 1.4-.9 2.3-.9Z" />
        </g>
        {/* battery */}
        <g transform="translate(51 0.5)">
          <rect x={0.5} y={0.5} width={24} height={11.5} rx={3.6} fill="none" stroke="rgba(255,255,255,0.4)" />
          <rect x={2.2} y={2.2} width={20.6} height={8.1} rx={2.2} fill="#fff" />
          <path d="M26.2 4.2v4.1c.9-.3 1.5-1.1 1.5-2s-.6-1.8-1.5-2.1Z" fill="rgba(255,255,255,0.45)" />
        </g>
      </svg>
    </div>
  );
}
