import { Easing, interpolate } from 'remotion';
import { DIM, hash, INK, SANS, type Lang } from './type';
import { LedMark } from './LedMark';

// 1. The night before: what's in your head, as it arrives — group chats,
// an Italian notice you can't quite read, a class at nine. Lowercase,
// half-typed, tilted, the words not sitting on one line (tangled). Then the
// face comes on, "理清中…", and everything straightens.
const MSGS = {
  zh: ['群里说周五全国大罢工？？真的假的', 'sciopero ATM venerdì 9 ottobre… 这写的啥', '9 点有课，地铁到底停不停', '小红书说 M1 正常运行，有人确认吗', 'fasce di garanzia 是保障时段吗', '周六还要去机场，会不会也罢工'],
  en: ["group chat says there's a general strike friday??", 'sciopero ATM venerdì 9 ottobre… what does this even say', 'class at 9. is the metro running or not', 'someone online said M1 is fine?', 'fasce di garanzia = guaranteed hours??', 'flying out saturday. airport too?'],
};
const PLACE: [number, number, number][] = [[60, 330, -2.2], [250, 560, 1.8], [80, 790, -1.2], [300, 1060, 2.4], [60, 1290, 1.4], [270, 1520, -1.8]]; // x, y, tilt
export const CHAOS_LEN = 168;
const UNTANGLE = 128;
export function Chaos({ f, lang }: { f: number; lang: Lang }) {
  const calm = interpolate(f, [UNTANGLE, UNTANGLE + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const out = interpolate(f, [CHAOS_LEN - 14, CHAOS_LEN], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {MSGS[lang].map((m, i) => {
        const at = i === 0 ? 0 : 6 + i * 15;
        const pop = interpolate(f, [at, at + 7], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
        if (pop <= 0) return null;
        const [x, y, tilt] = PLACE[i];
        // drift apart a little as they straighten, making room for the face
        const dy = calm * (y < 900 ? -90 : 110);
        const tokens = lang === 'zh' ? m.match(/[一-鿿？，。！]|[A-Za-z0-9.…:=?'’ ]+/g) ?? [m] : m.split(/(?<= )/);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y + dy, maxWidth: 740, padding: '28px 36px', borderRadius: 30, background: '#232427',
            transform: `rotate(${tilt * (1 - calm)}deg) scale(${0.9 + 0.1 * pop})`, opacity: pop * (1 - out) * (1 - calm * 0.35), transformOrigin: 'left center',
            fontFamily: SANS, fontSize: 48, lineHeight: 1.38, color: INK, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            {tokens.map((t, k) => {
              const wob = (hash(i * 31 + k) - 0.5) * 18 * (1 - calm) + Math.sin(f * 0.12 + k) * 2 * (1 - calm);
              return <span key={k} style={{ display: 'inline-block', whiteSpace: 'pre', transform: `translateY(${wob}px) rotate(${(hash(k * 7 + i) - 0.5) * 6 * (1 - calm)}deg)` }}>{t}</span>;
            })}
          </div>
        );
      })}
      {/* the face comes on in the middle of it */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 920, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26,
        opacity: interpolate(f, [UNTANGLE - 4, UNTANGLE + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - out) }}>
        <LedMark f={f - UNTANGLE} size={110} />
        <span style={{ fontFamily: SANS, fontSize: 54, color: INK }}>{lang === 'zh' ? '理清中…' : 'Sorting it out…'}</span>
      </div>
      <span style={{ display: 'none', color: DIM }} />
    </div>
  );
}
