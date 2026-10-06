import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Phone } from '../comp/Phone';
import { Stage, hex } from '../comp/Stage';
import { Caption, FONT } from '../comp/Caption';
import type { Lang } from './Hook';

// The group-chat rumour everyone has received: it pops in as a chat
// bubble, then the phone rises with the answer checked against the records.
export const RUMOR_FRAMES = 54;
export function Rumor({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 2, fps, config: { damping: 12, stiffness: 160 } });
  const rise = spring({ frame: frame - 14, fps, config: { damping: 20, stiffness: 80 } });
  const leave = interpolate(frame, [14, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.cubic) });
  const typed = Math.floor(interpolate(frame, [3, 13], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * 100);
  const msg = lang === 'zh' ? '群里说 12 月 4 号火车全停，是真的吗？' : 'Group chat says ALL trains stop on 4 Dec. True??';
  const shown = msg.slice(0, Math.ceil(msg.length * typed / 100));
  return (
    <AbsoluteFill style={{ background: '#000', perspective: 2200, overflow: 'hidden' }}>
      <Stage keyColor={hex('#F5B544')} power={0.85} keyPos={[0, 0.15]} drift={0.6} />
      {/* the rumour, as a chat bubble */}
      <div style={{ position: 'absolute', left: 90, right: 90, top: 760, transform: `translateY(${-leave * 380}px) rotateX(${(1 - pop) * 40}deg) scale(${0.7 + 0.3 * pop - leave * 0.1})`,
        opacity: pop * (1 - leave * 0.8), filter: `blur(${leave * 10}px)`, display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        <div style={{ width: 96, height: 96, borderRadius: 22, background: 'linear-gradient(135deg,#3a3d44,#22252b)', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 50 }}>💬</div>
        <div style={{ background: '#2B2E34', color: '#fff', borderRadius: '8px 34px 34px 34px', padding: '30px 38px', fontFamily: FONT[lang], fontWeight: 700, fontSize: 54, lineHeight: 1.3, boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
          {shown}<span style={{ opacity: frame % 10 < 5 && typed < 100 ? 1 : 0 }}>|</span>
        </div>
      </div>
      {/* the answer: the phone rises, the camera close on the verdict */}
      <Phone src={`app/ask-${lang}.png`} rx={interpolate(rise, [0, 1], [38, 10])} ry={interpolate(rise, [0, 1], [-14, 6]) + frame * 0.06} rz={2}
        z={interpolate(rise, [0, 1], [-600, 260])} y={interpolate(rise, [0, 1], [1500, 560])} x={0} />
      <Caption lang={lang} from={16} to={RUMOR_FRAMES + 3} top={190} accent="#FFC75A"
        lines={lang === 'zh' ? ['群里的传言？[帮你核实]', '对照意大利交通部的官方记录'] : ['Chat rumour? [Checked.]', "Against Italy's official strike register"]} />
    </AbsoluteFill>
  );
}
