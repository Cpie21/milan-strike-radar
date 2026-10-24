import { useLayoutEffect, useRef } from 'react';
import { eyes, grid } from '../board';
import { SANS } from '../v2/fonts';

// The assistant as what it is in the app: a station departure board. A rail,
// two hangers, a dark anodised housing with four screws, a recessed panel of
// amber dots behind glass. It shows its eyes, or text in its own dots.
export type BoardShow = { kind: 'eyes'; open?: number; gx?: number; gy?: number } | { kind: 'text'; text: string; scroll?: number } | { kind: 'noise'; amount: number; seed: number };
const COLS = 64, ROWS = 18;
const textCache = new Map<string, Uint8Array>();
function textDots(text: string) {
  const hit = textCache.get(text); if (hit) return hit;
  const c = document.createElement('canvas'); const g = c.getContext('2d')!;
  // as large as the panel's height allows, smaller if the text is long
  let size = ROWS * 0.8; g.font = `700 ${size}px ${SANS}`;
  const fit = (COLS - 4) / g.measureText(text).width; if (fit < 1) size = Math.max(9, size * fit);
  g.font = `700 ${size}px ${SANS}`;
  const w = Math.ceil(g.measureText(text).width) + 2; c.width = w; c.height = ROWS;
  g.font = `700 ${size}px ${SANS}`; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 1, ROWS / 2 + 1);
  const px = g.getImageData(0, 0, w, ROWS).data; const out = new Uint8Array(w * ROWS + 1); out[w * ROWS] = 0;
  for (let i = 0; i < w * ROWS; i++) out[i] = px[i * 4 + 3] > 120 ? 1 : 0;
  const res = Object.assign(out, { w }); textCache.set(text, res); return res;
}
export function Board({ show, width = 720, swing = 0, glow = 1, rail = true }: { show: BoardShow; width?: number; swing?: number; glow?: number; rail?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pad = width * 0.034, P = (width - pad * 2) / COLS, H = ROWS * P + pad * 2;
  useLayoutEffect(() => {
    const cv = ref.current!, g = cv.getContext('2d')!;
    const D = 2; cv.width = COLS * P * D; cv.height = ROWS * P * D;
    const lit = new Float32Array(COLS * ROWS);
    if (show.kind === 'eyes') { const gr = grid(COLS, ROWS); eyes(gr, show.open ?? 1, show.gx ?? 0, show.gy ?? 0); lit.set(gr.data); }
    else if (show.kind === 'text') {
      const t = textDots(show.text) as Uint8Array & { w: number };
      const x0 = show.scroll === undefined ? Math.floor((COLS - t.w) / 2) : Math.round(COLS - show.scroll);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const tx = x - x0; if (tx >= 0 && tx < t.w && t[y * t.w + tx]) lit[y * COLS + x] = 1; }
    } else for (let i = 0; i < lit.length; i++) { const h = Math.sin(i * 12.9898 + show.seed * 78.233) * 43758.5453; lit[i] = h - Math.floor(h) < show.amount ? 1 : 0; }
    g.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = lit[y * COLS + x], cx = (x + 0.5) * P * D, cy = (y + 0.5) * P * D;
      if (v > 0.05) { g.shadowColor = `rgba(255,150,30,${0.9 * glow})`; g.shadowBlur = P * D * 0.9 * v * glow; g.fillStyle = `rgba(255,${175 + Math.round(45 * v)},${70 + Math.round(40 * v)},${0.3 + 0.7 * v})`; }
      else { g.shadowBlur = 0; g.fillStyle = 'rgba(255,150,40,0.09)'; }
      g.beginPath(); g.arc(cx, cy, P * D * 0.37, 0, Math.PI * 2); g.fill();
    }
    g.shadowBlur = 0;
  });
  const screw = (s: React.CSSProperties) => <i style={{ position: 'absolute', width: pad * 0.46, height: pad * 0.46, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #b9bcc2, #4b4d52 60%, #232427)', boxShadow: '0 1px 1px rgba(0,0,0,0.6)', ...s }} />;
  return (
    <div style={{ position: 'relative', width, height: H + (rail ? width * 0.14 : 0), transform: `rotate(${swing}deg)`, transformOrigin: '50% 0%' }}>
      {rail && <>
        <div style={{ position: 'absolute', left: -width * 0.06, right: -width * 0.06, top: 0, height: width * 0.018, borderRadius: 4, background: 'linear-gradient(180deg,#8d9096,#45474c 60%,#2b2c30)' }} />
        {[0.22, 0.78].map(x => <div key={x} style={{ position: 'absolute', left: width * x - 2, top: width * 0.018, width: 4, height: width * 0.122, background: 'linear-gradient(90deg,#3b3d42,#9a9da3,#3b3d42)' }} />)}
      </>}
      <div style={{ position: 'absolute', left: 0, top: rail ? width * 0.14 : 0, width, height: H, borderRadius: width * 0.04,
        background: 'linear-gradient(180deg,#3a3c41 0%,#1d1e22 55%,#141518 100%)', boxShadow: `inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -2px 0 rgba(0,0,0,0.6), 0 30px 60px rgba(0,0,0,0.6), 0 0 ${80 * glow}px rgba(255,140,20,${0.18 * glow})` }}>
        {screw({ left: pad * 0.27, top: pad * 0.27 })}{screw({ right: pad * 0.27, top: pad * 0.27 })}{screw({ left: pad * 0.27, bottom: pad * 0.27 })}{screw({ right: pad * 0.27, bottom: pad * 0.27 })}
        <div style={{ position: 'absolute', left: pad, top: pad, width: COLS * P, height: ROWS * P, borderRadius: width * 0.014, background: '#050505', boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.95)', overflow: 'hidden' }}>
          <canvas ref={ref} style={{ width: COLS * P, height: ROWS * P, display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 38%, transparent 40%)' }} />
        </div>
      </div>
    </div>
  );
}
