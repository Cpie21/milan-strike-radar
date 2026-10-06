import { useLayoutEffect, useRef } from 'react';
import { Easing, interpolate, useVideoConfig } from 'remotion';
import { AMBER, DIM, hash, INK, MONO, SANS, type Lang } from './type';

// 8. Not just Milan: Italy, drawn in the board's dots, and its twenty
// cities lighting up one by one.
const MAINLAND: [number, number][] = [[7.53, 43.79], [6.9, 44.5], [7.0, 45.2], [6.8, 45.8], [7.9, 46.0], [8.4, 46.45], [8.8, 46.1], [9.3, 46.5], [10.1, 46.6], [10.5, 46.9], [11.2, 47.0], [12.2, 47.1], [13.0, 46.6], [13.7, 46.5], [13.6, 45.8], [13.77, 45.6],
  [13.1, 45.7], [12.4, 45.4], [12.3, 44.9], [12.5, 44.9], [12.3, 44.4], [12.6, 44.06], [13.5, 43.6], [14.2, 42.5], [14.7, 42.1], [15.2, 41.95], [16.2, 41.9], [15.9, 41.5], [16.9, 41.1], [17.9, 40.6], [18.5, 40.1], [18.35, 39.8],
  [17.98, 40.05], [17.2, 40.45], [16.6, 40.1], [16.5, 39.6], [17.1, 39.1], [16.55, 38.75], [16.5, 38.4], [16.06, 37.92], [15.65, 38.0], [15.7, 38.25], [15.9, 38.45], [16.15, 38.75], [16.0, 39.35], [15.78, 39.9], [15.6, 40.07],
  [15.0, 40.2], [14.75, 40.65], [14.35, 40.6], [14.25, 40.83], [13.57, 41.2], [12.6, 41.45], [12.2, 41.75], [11.8, 42.1], [11.2, 42.45], [10.5, 42.95], [10.3, 43.55], [10.25, 43.85], [9.85, 44.1], [8.93, 44.4], [8.48, 44.3], [8.0, 43.88]];
const SICILY: [number, number][] = [[12.4, 37.8], [12.5, 38.1], [13.1, 38.2], [13.36, 38.12], [14.0, 38.02], [15.1, 38.15], [15.55, 38.27], [15.25, 37.8], [15.1, 37.5], [15.3, 37.05], [15.1, 36.68], [14.5, 36.8], [14.25, 37.06], [13.55, 37.28], [12.9, 37.55]];
const SARDINIA: [number, number][] = [[8.2, 40.9], [9.2, 41.25], [9.8, 40.9], [9.7, 40.0], [9.6, 39.2], [9.1, 39.2], [8.5, 38.9], [8.4, 39.4], [8.5, 40.0], [8.2, 40.5]];
const CITIES: [string, string, number, number][] = [['MILANO', '米兰', 45.46, 9.19], ['ROMA', '罗马', 41.9, 12.5], ['TORINO', '都灵', 45.07, 7.69], ['NAPOLI', '那不勒斯', 40.85, 14.27], ['FIRENZE', '佛罗伦萨', 43.77, 11.25],
  ['BOLOGNA', '博洛尼亚', 44.49, 11.34], ['VENEZIA', '威尼斯', 45.44, 12.32], ['GENOVA', '热那亚', 44.41, 8.93], ['PALERMO', '巴勒莫', 38.12, 13.36], ['BARI', '巴里', 41.12, 16.87], ['CATANIA', '卡塔尼亚', 37.5, 15.09],
  ['VERONA', '维罗纳', 45.44, 10.99], ['PADOVA', '帕多瓦', 45.41, 11.88], ['TRIESTE', '的里雅斯特', 45.65, 13.78], ['CAGLIARI', '卡利亚里', 39.22, 9.12], ['BERGAMO', '贝加莫', 45.7, 9.67], ['BRESCIA', '布雷西亚', 45.54, 10.21],
  ['PISA', '比萨', 43.72, 10.4], ['MESSINA', '墨西拿', 38.19, 15.55], ['PERUGIA', '佩鲁贾', 43.11, 12.39]];
const LABELLED = new Set(['MILANO', 'ROMA', 'NAPOLI', 'TORINO', 'VENEZIA', 'FIRENZE', 'PALERMO', 'BARI', 'CAGLIARI']);
const S = 104, OX = 70, OY = 330;
const proj = (lon: number, lat: number): [number, number] => [OX + (lon - 6.5) * 0.743 * S, OY + (47.2 - lat) * S];
const inside = (pt: [number, number], poly: [number, number][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const POLYS = [MAINLAND, SICILY, SARDINIA].map(p => p.map(([lo, la]) => proj(lo, la)));
export const ITALY_LEN = 156;
export function Italy({ f, lang }: { f: number; lang: Lang }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  const P = 15;
  useLayoutEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    for (let y = OY - 20; y < OY + 1150; y += P) for (let x = 20; x < width - 20; x += P) {
      const inIt = POLYS.some(p => inside([x, y], p));
      if (!inIt) continue;
      // the land lights top to bottom, like a board coming on
      const a = interpolate(f, [(y - OY) / 1150 * 30, (y - OY) / 1150 * 30 + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      g.fillStyle = `rgba(255,170,70,${(0.3 + 0.12 * hash(x * 3 + y)) * a})`;
      g.beginPath(); g.arc(x, y, 3.8, 0, Math.PI * 2); g.fill();
    }
    CITIES.forEach(([, , la, lo], i) => {
      const a = interpolate(f, [34 + i * 3.2, 40 + i * 3.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      if (a <= 0) return;
      const [x, y] = proj(lo, la);
      g.shadowColor = 'rgba(255,150,30,1)'; g.shadowBlur = 24 * a;
      g.fillStyle = `rgba(255,205,120,${a})`; g.beginPath(); g.arc(x, y, 8 + 6 * (1 - a), 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    });
  });
  const shown = Math.min(20, Math.max(0, Math.floor((f - 34) / 3.2) + 1));
  const out = interpolate(f, [ITALY_LEN - 12, ITALY_LEN], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: out }}>
      <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', inset: 0 }} />
      {CITIES.map(([it, zh, la, lo], i) => {
        if (!LABELLED.has(it)) return null;
        const a = interpolate(f, [38 + i * 3.2, 46 + i * 3.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const [x, y] = proj(lo, la);
        const left = ['TORINO', 'CAGLIARI', 'GENOVA'].includes(it);
        return <div key={it} style={{ position: 'absolute', top: y - 17, ...(left ? { right: width - x + 18, textAlign: 'right' } : { left: x + 18 }), fontFamily: MONO, fontSize: 30, color: INK, opacity: a, whiteSpace: 'nowrap' }}>
          {lang === 'zh' ? zh : it.charAt(0) + it.slice(1).toLowerCase()}
        </div>;
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1560, textAlign: 'center', opacity: interpolate(f, [36, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }) }}>
        <div style={{ fontFamily: SANS, fontSize: 64, fontWeight: 600, color: INK }}><span style={{ color: AMBER, fontVariantNumeric: 'tabular-nums' }}>{shown}</span>{lang === 'zh' ? ' 个城市' : shown === 1 ? ' city' : ' cities'}</div>
        <div style={{ fontFamily: MONO, fontSize: 30, marginTop: 14, color: DIM }}>{lang === 'zh' ? '地铁 · 公交 · 火车 · 机场' : 'metro · bus · train · airport'}</div>
      </div>
    </div>
  );
}
