import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage, hex } from '../comp/Stage';
import { Caption, FONT } from '../comp/Caption';
import type { Lang } from './Hook';

// Fed up? The wall: the real pixel metro with everyone's paint, and a fresh
// tag sprayed across it, mist and all; the counter ticks over.
export const SPRAY_FRAMES = 40;
const STROKES = [
  { d: 'M 140 330 C 220 210, 300 420, 380 300 S 520 210, 560 330', c: '#FF4FA3', at: 4 },
  { d: 'M 600 250 C 650 380, 720 380, 760 260 S 860 230, 900 360', c: '#38D9F5', at: 11 },
  { d: 'M 210 470 C 380 430, 640 520, 880 450', c: '#B6F23A', at: 18 },
];
export function Spray({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tilt = interpolate(frame, [0, SPRAY_FRAMES], [16, -6], { easing: Easing.inOut(Easing.sin) });
  const tick = spring({ frame: frame - 24, fps, config: { damping: 9, stiffness: 220 } });
  const n = frame >= 24 ? (lang === 'zh' ? 29 : 29) : 28;
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 2000, overflow: 'hidden' }}>
      <Stage keyColor={hex('#FF5147')} power={0.8} keyPos={[0, 0.05]} drift={1} />
      <div style={{ position: 'absolute', left: -60, right: -60, top: 640, transform: `rotateY(${tilt}deg) rotateX(6deg) scale(1.12)`, transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'relative', borderRadius: 44, overflow: 'hidden', boxShadow: '0 60px 120px rgba(0,0,0,0.6)' }}>
          <Img src={staticFile(`app/wall-${lang}.png`)} style={{ width: '100%', display: 'block' }} />
          <svg viewBox="0 0 1040 700" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs><filter id="glow"><feGaussianBlur stdDeviation="9" /></filter><filter id="mist"><feGaussianBlur stdDeviation="22" /></filter></defs>
            {STROKES.map((s, i) => {
              const p = interpolate(frame, [s.at, s.at + 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
              return (
                <g key={i} style={{ mixBlendMode: 'screen' }}>
                  <path d={s.d} stroke={s.c} strokeWidth={46} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} filter="url(#mist)" opacity={0.55} />
                  <path d={s.d} stroke={s.c} strokeWidth={20} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} filter="url(#glow)" />
                  <path d={s.d} stroke={s.c} strokeWidth={13} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {/* the counter */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1360, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '26px 48px', borderRadius: 999, background: '#D52B20', color: '#fff', fontFamily: FONT[lang], fontWeight: 800, fontSize: 52,
          transform: `scale(${1 + tick * 0.12 - Math.max(0, tick - 1) * 0.12})`, boxShadow: '0 20px 60px rgba(213,43,32,0.5)' }}>
          {lang === 'zh' ? `${n} 人已表达不满` : `${n} people fed up`}
        </div>
      </div>
      <Caption lang={lang} from={2} to={SPRAY_FRAMES + 3} top={190} accent="#FF6A5E"
        lines={lang === 'zh' ? ['气不过？[喷两笔]', '和全城的人一起'] : ['Fed up? [Spray it.]', 'With everyone else in town']} />
    </AbsoluteFill>
  );
}
