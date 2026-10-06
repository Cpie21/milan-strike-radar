import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Phone } from '../comp/Phone';
import { Stage, hex } from '../comp/Stage';
import { Caption } from '../comp/Caption';
import type { Lang } from './Hook';

// The payoff: the phone swings in out of the dark, already showing the
// answer, a strike card with its hours, in the metro's red light.
export const REVEAL_FRAMES = 54;
export function Reveal({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 70, mass: 1.1 } });
  const drift = interpolate(frame, [0, REVEAL_FRAMES], [0, 1]);
  const ry = interpolate(s, [0, 1], [-62, -16]) + drift * 8;
  const rx = interpolate(s, [0, 1], [24, 7]) - drift * 2;
  const z = interpolate(s, [0, 1], [-1400, -120]) + drift * 60;
  const y = interpolate(s, [0, 1], [380, 140]);
  const flash = interpolate(frame, [0, 2, 9], [0.9, 0.5, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 2400, overflow: 'hidden' }}>
      <Stage keyColor={hex('#FF5147')} power={interpolate(frame, [0, 14], [0.2, 1], { extrapolateRight: 'clamp' })} keyPos={[0.05, 0.1]} drift={drift * 0.3} />
      <AbsoluteFill style={{ transformStyle: 'preserve-3d' }}>
        <Phone src={`app/metro-${lang}.png`} rx={rx} ry={ry} rz={-3 + drift * 2} z={z} y={y} x={40} scale={1.02} />
      </AbsoluteFill>
      <Caption lang={lang} from={10} to={REVEAL_FRAMES + 4} top={190} accent="#FF6A5E"
        lines={lang === 'zh' ? ['意大利罢工 [一眼看懂]', '几点开始 · 几点结束 · 哪段有保障'] : ['Italian strikes, [at a glance]', 'Start · end · what still runs']} />
      <AbsoluteFill style={{ background: '#FFB24A', opacity: flash, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  );
}
