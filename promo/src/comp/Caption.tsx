import { interpolate, useCurrentFrame, Easing } from 'remotion';
import { loadFont as loadSC } from '@remotion/google-fonts/NotoSansSC';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

const sc = loadSC('normal', { weights: ['700', '900'], ignoreTooManyRequestsWarning: true });
const inter = loadInter('normal', { weights: ['700', '800'] });
export const FONT = { zh: `${sc.fontFamily}, ${inter.fontFamily}, sans-serif`, en: `${inter.fontFamily}, sans-serif` };

// A headline that rises out of a soft blur, one line after another, and
// leaves the same way. `accent` words are lit in the scene colour.
export function Caption({ lines, lang, from, to, top = 250, accent = '#FFFFFF', size = 86 }: {
  lines: string[]; lang: 'zh' | 'en'; from: number; to: number; top?: number; accent?: string; size?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', fontFamily: FONT[lang], fontWeight: lang === 'zh' ? 900 : 800, letterSpacing: lang === 'zh' ? '0.02em' : '-0.02em' }}>
      {lines.map((line, i) => {
        const a = interpolate(frame, [from + i * 4, from + i * 4 + 9, to - 6, to], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
        const parts = line.split(/(\[[^\]]+\])/);
        return (
          <div key={i} style={{ fontSize: size * (i ? 0.62 : 1), lineHeight: 1.18, color: i ? 'rgba(255,255,255,0.72)' : '#FFFFFF', opacity: a,
            transform: `translateY(${(1 - a) * 34}px)`, filter: `blur(${(1 - a) * 12}px)`, textShadow: '0 6px 40px rgba(0,0,0,0.6)' }}>
            {parts.map((p, k) => p.startsWith('[') ? <span key={k} style={{ color: accent }}>{p.slice(1, -1)}</span> : <span key={k}>{p}</span>)}
          </div>
        );
      })}
    </div>
  );
}
