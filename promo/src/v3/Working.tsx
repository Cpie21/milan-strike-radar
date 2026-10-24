import { useLayoutEffect, useRef } from 'react';
import { interpolate, useVideoConfig } from 'remotion';
import { hash, INK, SANS, type Lang } from './type';
import { LedMark } from './LedMark';

// 4. The question goes in; the screen comes apart into the board's amber
// dots, which drift and sparkle while it works. A line drops into what's next.
export function Working({ f, len, lang }: { f: number; len: number; lang: Lang }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  const P = 22;
  useLayoutEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    const cols = Math.ceil(width / P), rows = Math.ceil(height / P);
    // the screen's dots come apart over the first frames, then a sparse field breathes
    const grid = interpolate(f, [0, 16], [0.9, 0], { extrapolateRight: 'clamp' });
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const h = hash(x * 131 + y * 7);
      const spark = Math.max(0, Math.sin(f * 0.18 + h * 40)) ** 8 * (h > 0.82 ? 1 : 0);
      const a = Math.max(grid * (0.15 + 0.4 * h), spark * 0.9);
      if (a < 0.02) continue;
      g.fillStyle = `rgba(255,${170 + Math.round(60 * h)},${90 + Math.round(80 * h)},${a})`;
      const s = spark > 0.3 ? 5 : 3;
      g.fillRect(x * P + P / 2 - s / 2, y * P + P / 2 - s / 2, s, s);
    }
  });
  const label = interpolate(f, [10, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * interpolate(f, [len - 14, len - 6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drop = interpolate(f, [len - 12, len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: label }}>
        <LedMark f={f + 40} size={110} look={0.6} />
        <span style={{ fontFamily: SANS, fontSize: 50, color: INK }}>{lang === 'zh' ? '正在查官方记录…' : 'Checking the official records…'}</span>
      </div>
      {/* the line that drops into the explanation */}
      <div style={{ position: 'absolute', left: 539, top: 0, width: 2, height: 960 * drop, background: 'repeating-linear-gradient(180deg, rgba(236,232,223,0.8) 0 14px, transparent 14px 26px)' }} />
    </div>
  );
}
