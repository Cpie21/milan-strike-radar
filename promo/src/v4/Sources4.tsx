import { Easing } from 'remotion';
import { AMBER, DIM, INK, MONO, SANS, type Lang } from '../v3/type';
import { Board } from './Board';
import { b, lin, ramp, snap } from './beat';
import { SAFE_CX } from './safe';

// Inside the board: we arrive through its dots and pull back; it reads the
// three official Italian sources (one per beat), and the lines come back
// together as the answer. Nothing about how it reads the question.
const T = {
  zh: { reading: '官方记录', src: [['MIT', '交通部罢工登记'], ['ATM', '运营方公告'], ['CGSSE', '罢工保障委员会']], ans: ['M1 · 周五 09:00', '在罢工时段内'] },
  en: { reading: 'CHECKING', src: [['MIT', 'strike register'], ['ATM', 'operator notice'], ['CGSSE', 'guarantee body']], ans: ['M1 · Fri 09:00', 'inside the strike hours'] },
};
const BOARD_TOP = 300, CARD_Y = 880, ANS_Y = 1200;
const CARDS = [SAFE_CX - 290, SAFE_CX, SAFE_CX + 290];
export function Sources4({ f, lang }: { f: number; lang: Lang }) {
  const t = T[lang];
  // arrive through the dots: from deep inside the panel to the whole board
  const back = ramp(f, 0, 14, Easing.out(Easing.cubic));
  const scale = 7 - 6 * back;
  const show = f < b(1) ? { kind: 'eyes' as const, gy: 0.5 } : f < b(5) ? { kind: 'text' as const, text: t.reading } : { kind: 'eyes' as const, open: 1.05, gy: 0.2 };
  const whip = ramp(f, b(7.4), b(8), snap);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-whip * 1900}px)` }}>
        <div style={{ position: 'absolute', left: SAFE_CX - 360, top: BOARD_TOP, transform: `scale(${scale})`, transformOrigin: '50% 62%' }}>
          <Board show={show} width={720} swing={Math.sin(f * 0.08) * 0.6} glow={1.1} />
        </div>
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
          {CARDS.map((x, i) => {
            const at = b(2 + i); const p = ramp(f, at - 4, at + 2, Easing.out(Easing.cubic));
            const q = ramp(f, b(5), b(5.75), Easing.inOut(Easing.cubic));
            const L1 = `M ${SAFE_CX} 640 C ${SAFE_CX} 760, ${x} 740, ${x} ${CARD_Y - 10}`;
            const L2 = `M ${x} ${CARD_Y + 170} C ${x} ${CARD_Y + 260}, ${SAFE_CX} ${ANS_Y - 120}, ${SAFE_CX} ${ANS_Y - 10}`;
            return <g key={i} fill="none" strokeWidth={3} strokeDasharray="14 12">
              <path d={L1} stroke="rgba(236,232,223,0.7)" pathLength={1} style={{ strokeDasharray: `${p} 1` }} />
              <path d={L2} stroke={AMBER} pathLength={1} style={{ strokeDasharray: `${q} 1` }} />
            </g>;
          })}
        </svg>
        {CARDS.map((x, i) => {
          const at = b(2 + i); const pop = ramp(f, at, at + 6, Easing.bezier(0.3, 1.6, 0.5, 1)); const ok = lin(f, at + 6, at + 9);
          if (pop <= 0) return null;
          const [tag, label] = t.src[i];
          return <div key={i} style={{ position: 'absolute', left: x, top: CARD_Y, width: 250, transform: `translateX(-50%) scale(${0.6 + 0.4 * pop})`, opacity: pop,
            border: '2px solid rgba(236,232,223,0.5)', borderRadius: 22, padding: '22px 10px', textAlign: 'center', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontFamily: MONO, fontSize: 44, color: INK }}>{tag}<span style={{ color: AMBER, opacity: ok, marginLeft: 10 }}>✓</span></div>
            <div style={{ fontFamily: SANS, fontSize: 26, marginTop: 10, color: DIM, whiteSpace: 'nowrap' }}>{label}</div>
          </div>;
        })}
        {(() => {
          const a = ramp(f, b(5.75), b(6.25), Easing.bezier(0.3, 1.6, 0.5, 1));
          return <div style={{ position: 'absolute', left: SAFE_CX, top: ANS_Y, transform: `translateX(-50%) scale(${0.7 + 0.3 * a})`, opacity: a, padding: '30px 48px', borderRadius: 30,
            border: `2.5px solid ${AMBER}`, background: 'rgba(255,177,74,0.1)', textAlign: 'center', whiteSpace: 'nowrap', boxShadow: `0 0 ${60 * a}px rgba(255,150,30,0.35)` }}>
            <div style={{ fontFamily: MONO, fontSize: 36, color: INK }}>{t.ans[0]}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52, marginTop: 8, color: AMBER }}>{t.ans[1]}</div>
          </div>;
        })()}
      </div>
    </div>
  );
}
