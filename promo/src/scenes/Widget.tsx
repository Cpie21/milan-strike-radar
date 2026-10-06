import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage, hex } from '../comp/Stage';
import { Caption } from '../comp/Caption';
import type { Lang } from './Hook';

// On the Home Screen: the widget floats up out of the light, already saying
// today's hours, before you've opened anything.
export const WIDGET_FRAMES = 41;
export function Widget({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 90 } });
  // the camera keeps moving through the shot: a slow orbit and push
  const ry = interpolate(s, [0, 1], [38, 8]) - frame * 0.7;
  const rz = interpolate(frame, [0, WIDGET_FRAMES], [-4, 3]);
  const z = interpolate(s, [0, 1], [-500, 60]) + frame * 3;
  // the day turns: the calm widget flips over to the strike one
  const flip = interpolate(frame, [11, 22], [0, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const sheen = interpolate(frame, [18, 34], [-30, 130], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const face = (src: string, back: boolean) => (
    <div style={{ position: back ? 'absolute' : 'relative', inset: 0, borderRadius: 64, overflow: 'hidden', backfaceVisibility: 'hidden', transform: back ? 'rotateX(180deg)' : undefined,
      boxShadow: '0 70px 140px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.1)' }}>
      <Img src={staticFile(src)} style={{ width: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(110deg, rgba(255,255,255,0) ${sheen - 18}%, rgba(255,255,255,0.18) ${sheen}%, rgba(255,255,255,0) ${sheen + 14}%)`, mixBlendMode: 'screen' }} />
    </div>
  );
  const red = interpolate(flip, [60, 140], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 1800, overflow: 'hidden' }}>
      <Stage keyColor={[0.35 + 0.65 * red, 0.42 - 0.1 * red, 0.5 - 0.3 * red]} power={0.75} keyPos={[0, 0]} drift={1.4} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: 780, transform: `translateZ(${z}px) rotateY(${ry}deg) rotateX(${interpolate(s, [0, 1], [30, 8])}deg) rotateZ(${rz}deg)`, transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${flip}deg)` }}>
          {face(`app/widget-calm-${lang}.png`, false)}
          {face(`app/widget-strike-${lang}.png`, true)}
        </div>
      </div>
      <Caption lang={lang} from={2} to={WIDGET_FRAMES + 3} top={190} accent="#FF6A5E"
        lines={lang === 'zh' ? ['出门前，[桌面就知道]', '不用打开，也不用翻群'] : ['Know [before you leave]', 'Right on your Home Screen']} />
    </AbsoluteFill>
  );
}
