import { interpolate } from 'remotion';
import { MONO } from './fonts';
import type { Lang } from '../scenes/Hook';

// What happens between asking and the answer, as the work itself reads:
// a checklist on black, each step ticked with what it found.
const STEPS = {
  zh: { q: '周五早上 9 点坐 M1 会受影响吗？', items: [['读懂问题', '10月9日 周五 · 09:00 · M1 · 米兰'], ['查意大利交通部登记', 'scioperi.mit.gov.it · 4 条'], ['核对运营方公告', 'ATM Milano · cgsse.it'], ['逐条判断', '1 条相关 · 0 条排除']] },
  en: { q: 'Will the M1 be affected on Friday at 9am?', items: [['read the question', 'Fri 9 Oct · 09:00 · M1 · Milan'], ['official strike register', 'scioperi.mit.gov.it · 4 records'], ['operator notices', 'ATM Milano · cgsse.it'], ['judge each record', '1 relevant · 0 excluded']] },
};
export function Process({ f, lang, len }: { f: number; lang: Lang; len: number }) {
  const s = STEPS[lang];
  const outA = interpolate(f, [len - 8, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const inA = interpolate(f, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const type = (text: string, at: number, cps = 2.2) => [...text].slice(0, Math.max(0, Math.floor((f - at) * cps))).join('');
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', fontFamily: MONO, color: '#E8E4DC', opacity: inA * outA }}>
      {/* a little cluster of amber dots, breathing while it works */}
      <div style={{ position: 'absolute', left: 850, top: 560, display: 'grid', gridTemplateColumns: 'repeat(5, 16px)', gap: 9 }}>
        {Array.from({ length: 25 }, (_, i) => <i key={i} style={{ width: 16, height: 16, borderRadius: 8, background: '#FF9A1A', opacity: 0.15 + 0.85 * Math.max(0, Math.sin(f * 0.35 + i * 1.7)) ** 3 }} />)}
      </div>
      <div style={{ position: 'absolute', left: 84, right: 84, top: 560 }}>
        <div style={{ fontSize: 38, color: 'rgba(232,228,220,0.45)', minHeight: 56, lineHeight: 1.35 }}>&gt; {type(s.q, 0, 3)}</div>
        <div style={{ height: 60 }} />
        {s.items.map(([label, value], i) => {
          const at = 10 + i * 9;
          const shown = f >= at, done = f >= at + 6;
          return (
            <div key={i} style={{ marginBottom: 44, opacity: shown ? 1 : 0 }}>
              <div style={{ fontSize: 48 }}><span style={{ color: done ? '#FFB14A' : 'rgba(232,228,220,0.5)' }}>{done ? '[x]' : '[ ]'}</span> {label}</div>
              <div style={{ fontSize: 36, marginTop: 10, marginLeft: 102, color: 'rgba(232,228,220,0.55)', minHeight: 46 }}>{type(value, at + 4)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
