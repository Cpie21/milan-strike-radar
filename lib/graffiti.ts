import { resolveCity } from './cities';
import { isIsoDate, addDaysIso } from './romeDate';
export const PALETTE = ['#FF4FA3', '#38D9F5', '#B6F23A', '#FFD93D', '#FF7A2E', '#A98BFF', '#F4F1EA', '#FF5C5C'];
export type Slot = { i: number; x: number; y: number; w: number; h: number };
export type Stroke = { c: string; w: number; p: number[]; d?: 1 };
// Matches Claude's committed v16 240x140 vehicle sides. Client-provided panel
// counts/geometry never grant permission; painting may bleed five pixels.
const BODIES = {
  SUBWAY: [26, 56, 188, 98], TRAIN: [2, 36, 172, 100],
  BUS: [30, 55, 188, 100], AIRPORT: [70, 68, 194, 88],
} as const;
export function parseWallKey(key: unknown, today: string) {
  if (typeof key !== 'string' || key.length > 180 || /[\u0000-\u001f]/.test(key)) return null;
  const parts = key.split('|');
  if (parts.length !== 4 || !parts[0].startsWith('doodled_')) return null;
  const city = resolveCity(parts[0].slice(8)); const date = parts[1]; const mode = parts[2];
  if (!city || parts[0] !== `doodled_${city.tag}` || !isIsoDate(date) || date < addDaysIso(today, -7) || date > addDaysIso(today, 120) || !Object.prototype.hasOwnProperty.call(BODIES, mode)) return null;
  if (parts[3].length > 60 || (mode !== 'AIRPORT' && parts[3] !== '')) return null;
  return { key, city: city.tag, date, mode: mode as keyof typeof BODIES };
}
export function wallSlots(mode: keyof typeof BODIES): Slot[] {
  const [x0,y0,x1,y1] = BODIES[mode]; const w = x1 - x0; const n = Math.max(1,Math.round(w/95));
  return Array.from({ length: n }, (_,i) => ({ x: x0+i*w/n,y:y0,w:w/n,h:y1-y0 }))
    .sort((a,b) => Math.abs(a.x+a.w/2-(x0+x1)/2)-Math.abs(b.x+b.w/2-(x0+x1)/2))
    .map((s,i) => ({ i,x:Math.round(s.x),y:s.y,w:Math.round(s.w),h:s.h }));
}
export function cleanStrokes(input: unknown, colour: string, slot: Slot): Stroke[] | null {
  if (!Array.isArray(input) || !input.length || input.length > 80) return null;
  let count = 0; const out: Stroke[] = [];
  for (const s of input) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.p) || s.p.length < 2 || s.p.length % 2 || !Number.isFinite(s.w) || s.w < 0.5 || s.w > 3 || (s.d !== undefined && s.d !== 1)) return null;
    count += s.p.length / 2; if (count > 4000) return null;
    for (let i = 0; i < s.p.length; i++) {
      const v = s.p[i]; const lo = i%2 ? Math.max(0,slot.y-5) : Math.max(0,slot.x-5);
      const hi = i%2 ? Math.min(140,slot.y+slot.h+5) : Math.min(240,slot.x+slot.w+5);
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return null;
    }
    out.push({ c:colour,w:s.w,p:s.p.map((v: number) => Math.round(v*2)/2),...(s.d === 1 ? { d:1 as const } : {}) });
  }
  return Buffer.byteLength(JSON.stringify(out)) <= 30000 ? out : null;
}
