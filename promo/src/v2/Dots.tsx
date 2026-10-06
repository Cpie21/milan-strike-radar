import { useLayoutEffect, useRef } from 'react';
import { interpolate, useVideoConfig } from 'remotion';
import { glyphColumns, GLYPH_ROWS } from '../pixelFont';
import { MONO } from './fonts';
import type { Lang } from '../scenes/Hook';

// The opening (and the loop's end): the app's amber dot matrix, and the
// Italian word everyone here learns first, lit dot by dot, with what it
// means underneath, as a dictionary would put it. `t` may be negative: the
// pre-roll the ending plays so its last frame runs into the first.
const PITCH = 18, WORD = 'SCIOPERO';
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function Dots({ t, lang, out = 0 }: { t: number; lang: Lang; out?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  const cols = Math.floor(width / PITCH), rows = Math.floor(height / PITCH);
  const glyph = glyphColumns(WORD);
  const gx0 = Math.floor((cols - glyph.length) / 2), gy0 = Math.floor(rows / 2) - 9;
  const grid = interpolate(t, [-14, -4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - out);
  useLayoutEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    const ox = (width - cols * PITCH) / 2 + PITCH / 2, oy = (height - rows * PITCH) / 2 + PITCH / 2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const gc = x - gx0, gr = y - gy0;
      const on = gc >= 0 && gc < glyph.length && gr >= 0 && gr < GLYPH_ROWS && (glyph[gc] >> gr & 1);
      // the word lights left to right, each dot with its own small delay
      const lit = on ? interpolate(t, [-6 + gc * 0.38 + hash(x, y) * 3, -3 + gc * 0.38 + hash(x, y) * 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - out) : 0;
      const tw = 0.05 + 0.05 * Math.max(0, Math.sin(t * 0.21 + hash(y, x) * 40)) * hash(x * 3, y);
      const cx = ox + x * PITCH, cy = oy + y * PITCH;
      if (lit > 0.01) {
        g.shadowColor = 'rgba(255,150,30,0.9)'; g.shadowBlur = 18 * lit;
        g.fillStyle = `rgba(255,${Math.round(150 + 60 * lit)},${Math.round(40 + 60 * lit)},${lit})`;
        g.beginPath(); g.arc(cx, cy, 6.2, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
      } else if (grid > 0) {
        g.fillStyle = `rgba(255,170,60,${tw * grid})`;
        g.beginPath(); g.arc(cx, cy, 5.4, 0, Math.PI * 2); g.fill();
      }
    }
  });
  const word = interpolate(t, [10, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - out);
  const mean = interpolate(t, [16, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * (1 - out);
  const top = (height - rows * PITCH) / 2 + (gy0 + GLYPH_ROWS + 3) * PITCH;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top, textAlign: 'center', fontFamily: MONO, color: '#E8E4DC' }}>
        <div style={{ fontSize: 38, opacity: word, letterSpacing: '0.02em' }}>sciopero <span style={{ color: 'rgba(232,228,220,0.45)' }}>/ʃoˈpɛː.ro/ · it.</span></div>
        <div style={{ marginTop: 18, fontSize: 40, opacity: mean, color: '#FFB14A' }}>{lang === 'zh' ? '罢工' : 'strike'}</div>
      </div>
    </div>
  );
}
