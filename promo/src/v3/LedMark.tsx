import { useLayoutEffect, useRef } from 'react';
import { eyes, grid } from '../board';

// The assistant's face as a small mark: the amber dot panel with two eyes,
// alive (it blinks and glances). Used where Claude's star sits in the
// reference: next to what it's doing.
export function LedMark({ f, size = 92, look = 0 }: { f: number; size?: number; look?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cols = 25, rows = 15, W = size * 1.7, H = size;
  useLayoutEffect(() => {
    const g = grid(cols, rows);
    const blink = f % 70 > 64 ? Math.abs(f % 70 - 67) / 3 : 1;
    const gx = look + Math.sin(f * 0.05) * 0.25;
    eyes(g, Math.max(0.1, blink) * Math.min(1, Math.max(0, f / 6)), gx * 0.6, 0);
    const c = ref.current!.getContext('2d')!;
    c.clearRect(0, 0, W * 2, H * 2);
    c.fillStyle = '#070605'; c.beginPath(); c.roundRect(0, 0, W * 2, H * 2, H * 0.36); c.fill();
    const px = (W * 2 - 16) / cols, py = (H * 2 - 16) / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = g.data[y * cols + x];
      const cx = 8 + (x + 0.5) * px, cy = 8 + (y + 0.5) * py;
      if (v > 0.05) { c.shadowColor = 'rgba(255,150,30,0.9)'; c.shadowBlur = px * 0.9 * v; c.fillStyle = `rgba(255,${170 + Math.round(40 * v)},70,${0.25 + 0.75 * v})`; }
      else { c.shadowBlur = 0; c.fillStyle = 'rgba(255,150,40,0.10)'; }
      c.beginPath(); c.arc(cx, cy, px * 0.36, 0, Math.PI * 2); c.fill();
    }
    c.shadowBlur = 0;
  });
  return <canvas ref={ref} width={W * 2} height={H * 2} style={{ width: W, height: H, display: 'block' }} />;
}
