import { Easing, interpolate } from 'remotion';
import { AMBER, DIM, INK, MONO, type Lang } from './type';

// 5. How it knows, drawn the way the reference draws work: a monospace
// checklist, then dashed lines branching to the official Italian sources
// it reads, and coming back together as one answer.
const T = {
  zh: { q: '周五早上 9 点坐 M1 会受影响吗？', s1: ['读懂问题', '10月9日 周五 · 09:00 · M1 · 米兰'], s2: ['去哪里查', '3 个官方来源'],
    boxes: [['#01', '//mit', '意大利交通部', '罢工登记 · 4 条'], ['#02', '//atm', '运营方公告', '08:45–15:00'], ['#03', '//cgsse', '罢工保障委员会', '保障时段']],
    result: ['1 条相关', 'M1 · 09:00 · 在罢工时段内'] },
  en: { q: 'Will the M1 be affected on Friday at 9am?', s1: ['read the question', 'Fri 9 Oct · 09:00 · M1 · Milan'], s2: ['where to look', '3 official sources'],
    boxes: [['#01', '//mit', 'Ministry of', 'Transport · 4'], ['#02', '//atm', 'operator', 'notice'], ['#03', '//cgsse', 'strike', 'commission']],
    result: ['1 relevant', 'M1 · 09:00 · inside the strike'] },
};
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
export const HOW_LEN = 222;
export function How({ f, lang }: { f: number; lang: Lang }) {
  const t = T[lang];
  const type = (s: string, at: number, cps = 1.6) => [...s].slice(0, Math.max(0, Math.floor((f - at) * cps))).join('');
  const out = interpolate(f, [HOW_LEN - 12, HOW_LEN], [1, 0], clamp);
  const step = (label: string, value: string, at: number, y: number) => {
    if (f < at) return null;
    const done = f >= at + 10;
    return (
      <div style={{ position: 'absolute', left: 90, top: y }}>
        <div style={{ fontSize: 44 }}><span style={{ color: done ? AMBER : DIM }}>{done ? '[x]' : '[-]'}</span> {label}</div>
        <div style={{ fontSize: 32, marginTop: 10, marginLeft: 94, color: DIM }}>{type(value, at + 6, 2)}</div>
      </div>
    );
  };
  const BOX = [[70, 1010], [395, 1010], [720, 1010]]; // left, top; 290 × 190
  const branch = interpolate(f, [92, 122], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const join = interpolate(f, [158, 184], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const res = interpolate(f, [182, 192], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', fontFamily: MONO, color: INK, opacity: out }}>
      {/* the line arriving from above */}
      <div style={{ position: 'absolute', left: 539, top: 0, width: 2, height: interpolate(f, [0, 10], [960, 0], clamp), background: 'repeating-linear-gradient(180deg, rgba(236,232,223,0.8) 0 14px, transparent 14px 26px)' }} />
      <div style={{ position: 'absolute', left: 90, right: 90, top: 400, fontSize: 32, color: DIM }}>&gt; {type(t.q, 6, 2.4)}</div>
      {step(t.s1[0], t.s1[1], 30, 540)}
      {step(t.s2[0], t.s2[1], 62, 720)}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <clipPath id="br"><rect x={0} y={880} width={1080} height={130 * branch} /></clipPath>
          <clipPath id="jn"><rect x={0} y={1200} width={1080} height={220 * join} /></clipPath>
        </defs>
        <g clipPath="url(#br)" stroke="rgba(236,232,223,0.75)" strokeWidth={2.5} strokeDasharray="12 12" fill="none">
          {BOX.map(([x], i) => <path key={i} d={`M 540 880 C 540 950, ${x + 145} 930, ${x + 145} 1010`} />)}
        </g>
        <g clipPath="url(#jn)" stroke="rgba(255,177,74,0.8)" strokeWidth={2.5} strokeDasharray="12 12" fill="none">
          {BOX.map(([x], i) => <path key={i} d={`M ${x + 145} 1200 C ${x + 145} 1300, 540 1300, 540 1420`} />)}
        </g>
      </svg>
      {BOX.map(([x, y], i) => {
        const at = 112 + i * 12, [n, tag, l1, l2] = t.boxes[i];
        const a = interpolate(f, [at, at + 8], [0, 1], clamp);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: 290, height: 190, opacity: a, border: '2px dashed rgba(236,232,223,0.55)', borderRadius: 18, padding: '22px 22px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: 26, color: DIM }}>{n}</div>
            <div style={{ fontSize: 34, marginTop: 2 }}>{tag}</div>
            <div style={{ fontSize: 23, marginTop: 14, color: DIM, lineHeight: 1.35 }}>{type(l1, at + 4, 2)}<br />{type(l2, at + 10, 2)}</div>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 190, right: 190, top: 1420, padding: '30px 36px', borderRadius: 22, border: `2px solid ${AMBER}`, background: 'rgba(255,177,74,0.08)',
        opacity: res, transform: `scale(${0.92 + 0.08 * res})`, textAlign: 'center' }}>
        <div style={{ fontSize: 44, color: AMBER }}>{t.result[0]}</div>
        <div style={{ fontSize: 28, marginTop: 10, color: INK }}>{t.result[1]}</div>
      </div>
    </div>
  );
}
