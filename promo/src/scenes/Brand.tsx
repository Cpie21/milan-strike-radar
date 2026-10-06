import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage, hex } from '../comp/Stage';
import { FONT } from '../comp/Caption';
import { Hook, type Lang } from './Hook';

// The name: the cone (in the Italian flag's colours) swings in under a
// light sweep, with the wordmark. Then the camera flies into the dark and
// the board powers up again: the last frame runs into the first.
export const BRAND_FRAMES = 40;
const PRE = 16; // frames of the hook's pre-roll at the end
export function Brand({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const out = interpolate(frame, [BRAND_FRAMES - PRE - 2, BRAND_FRAMES - 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const sweep = interpolate(frame, [4, 18], [-40, 140], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const word = interpolate(frame, [6, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const preFrame = frame - BRAND_FRAMES; // -PRE .. -1 over the last PRE frames
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 1600, overflow: 'hidden' }}>
      {preFrame >= -PRE && <AbsoluteFill style={{ opacity: interpolate(preFrame, [-PRE, -PRE + 8], [0, 1], { extrapolateRight: 'clamp' }) }}><Hook lang={lang} offset={-BRAND_FRAMES} /></AbsoluteFill>}
      <AbsoluteFill style={{ opacity: 1 - out }}>
        <Stage keyColor={hex('#E9E6DF')} power={0.42} keyPos={[0, 0.12]} drift={1.8} bokeh={0.5} />
        <div style={{ position: 'absolute', left: '50%', top: 640, width: 440, height: 440, marginLeft: -220,
          transform: `translateZ(${interpolate(s, [0, 1], [-700, 0]) + out * 1400}px) rotateY(${interpolate(s, [0, 1], [-50, 0])}deg) rotateX(${interpolate(s, [0, 1], [20, 0])}deg)`,
          filter: `blur(${out * 18}px)` }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 100, overflow: 'hidden', boxShadow: '0 60px 120px rgba(0,0,0,0.6)' }}>
            <Img src={staticFile('app-icon.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,255,255,0) ${sweep - 16}%, rgba(255,255,255,0.55) ${sweep}%, rgba(255,255,255,0) ${sweep + 12}%)`, mixBlendMode: 'overlay' }} />
          </div>
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 1150, textAlign: 'center', fontFamily: FONT[lang], color: '#fff', opacity: word * (1 - out), transform: `translateY(${(1 - word) * 30}px)` }}>
          <div style={{ fontSize: 92, fontWeight: lang === 'zh' ? 900 : 800, letterSpacing: lang === 'zh' ? '0.04em' : '-0.02em' }}>{lang === 'zh' ? '意大利罢工查询' : 'Italy Strike Radar'}</div>
          <div style={{ marginTop: 16, fontSize: 40, fontWeight: 700, color: 'rgba(255,255,255,0.62)' }}>{lang === 'zh' ? '罢工那天，先问它' : 'Before you go, ask it'}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
