import { Easing, interpolate } from 'remotion';
import { INK, SANS, type Lang } from '../v3/type';
import { Board } from './Board';
import { b, lin, ramp, snap } from './beat';
import { SAFE_CX } from './safe';

// The night before, on the beat: messages land one after another, faster,
// piling up (each a little tilted, all the same size, in the middle of the
// safe area); the board drops in on its hangers, swinging, and pulls every
// one of them into its dots: "理清中…".
const MSGS = {
  zh: ['群里说周五全国大罢工？？', 'sciopero ATM venerdì… 这写的啥', '9 点有课，地铁到底停不停', '小红书说 M1 正常运行？', 'fasce di garanzia 是啥', '周六还要去机场…'],
  en: ["group chat says general strike friday??", 'sciopero ATM venerdì… what does it say', 'class at 9. is the metro running?', 'someone online said M1 is fine?', 'fasce di garanzia???', 'flying out saturday too…'],
};
const AT = [0, b(1), b(2), b(3), b(3.5), b(4)];            // they come faster
const POS: [number, number, number][] = [[-70, 440, -3], [60, 600, 2.5], [-40, 760, -1.5], [70, 920, 3], [-60, 1080, -2.5], [40, 1240, 1.8]];
const DROP = b(5), PULL = b(6.5), SHOW = b(7.5);
const BOARD_Y = 640;
export function Chaos4({ f, lang }: { f: number; lang: Lang }) {
  // the frame breathes in as the pile grows, and jolts a little on each landing
  const push = 1 + 0.05 * lin(f, 0, DROP);
  const jolt = AT.reduce((s, a) => s + (f >= a && f < a + 6 ? Math.sin((f - a) * 2.4) * (6 - (f - a)) * 1.2 : 0), 0);
  // the board: drops from above with a spring, swings on its hangers
  const d = ramp(f, DROP, DROP + 10, Easing.bezier(0.2, 1.4, 0.4, 1));
  const t = Math.max(0, f - DROP) / 30;
  const swing = f < DROP ? 0 : 9 * Math.exp(-2.6 * t) * Math.sin(t * 9);
  const boardShow = f < PULL ? { kind: 'eyes' as const, open: lin(f, DROP + 4, DROP + 10), gx: 0, gy: 0.4 }
    : f < SHOW ? { kind: 'noise' as const, amount: 0.15 + 0.35 * lin(f, PULL, SHOW), seed: f }
    : { kind: 'text' as const, text: lang === 'zh' ? '理清中…' : 'SORTING…' };
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(90% 60% at 50% 45%, #121214 0%, #000 70%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push}) translateY(${jolt}px)` }}>
        {MSGS[lang].map((m, i) => {
          const pop = ramp(f, AT[i], AT[i] + 7, Easing.bezier(0.3, 1.6, 0.5, 1));
          if (pop <= 0) return null;
          const [dx, y, tilt] = POS[i];
          // pulled into the board, one after another
          const s = ramp(f, PULL + i * 1.5, PULL + i * 1.5 + 9, snap);
          const tx = (SAFE_CX + dx) * (1 - s) + SAFE_CX * s, ty = y * (1 - s) + (BOARD_Y + 130) * s;
          return (
            <div key={i} style={{ position: 'absolute', left: tx, top: ty, transform: `translate(-50%,-50%) rotate(${tilt * (1 - s) + s * 30 * (i % 2 ? 1 : -1)}deg) scale(${(0.7 + 0.3 * pop) * (1 - 0.92 * s)})`,
              opacity: pop * (1 - lin(f, PULL + i * 1.5 + 6, PULL + i * 1.5 + 9)), padding: '26px 36px', borderRadius: 32, background: '#26272B', color: INK,
              fontFamily: SANS, fontSize: 46, lineHeight: 1.3, width: 'max-content', maxWidth: 720, boxSizing: 'border-box', boxShadow: '0 22px 44px rgba(0,0,0,0.55)' }}>{m}</div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: SAFE_CX - 360, top: interpolate(d, [0, 1], [-560, BOARD_Y - 100]) }}>
        <Board show={boardShow} width={720} swing={swing} glow={f >= SHOW ? 1.2 : 0.9} />
      </div>
    </div>
  );
}
