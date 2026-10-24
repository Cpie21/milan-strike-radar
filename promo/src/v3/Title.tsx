import { Easing, interpolate } from 'remotion';
import { INK, SERIF, type Lang } from './type';

// 2 / 9. The film speaking: serif on black, one word set heavier.
export function Title({ f, len, lang, lines, delay = 0, clear = false }: { f: number; len: number; lang: Lang; lines: React.ReactNode[]; delay?: number; clear?: boolean }) {
  const out = interpolate(f, [len - 10, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: clear ? 'transparent' : '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: SERIF[lang], color: INK, fontSize: lang === 'zh' ? 80 : 84, lineHeight: 1.32, textAlign: 'center', letterSpacing: lang === 'zh' ? '0.04em' : '-0.01em', opacity: out }}>
      {lines.map((l, i) => {
        const a = interpolate(f, [4 + i * delay, 16 + i * delay], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
        return <div key={i} style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px)`, filter: `blur(${(1 - a) * 6}px)` }}>{l}</div>;
      })}
    </div>
  );
}
export const B = ({ children }: { children: React.ReactNode }) => <b style={{ fontWeight: 700 }}>{children}</b>;
