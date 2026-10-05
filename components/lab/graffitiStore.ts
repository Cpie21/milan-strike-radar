// Drawings are lists of strokes on the 240×140 pixel wall, a few KB as JSON.
//
// Lab only: uploads stay on this device until the backend endpoint exists
// (contract in AI_HANDOFF.md, "Graffiti drawing upload"). Swap
// `uploadDrawing` for the real POST when it lands.

export type Stroke = { c: string; w: number; p: number[]; d?: 1 }; // p = x0,y0,x1,y1… in wall pixels; d = a drip

export const LIMITS = { strokes: 80, points: 4000 };

// One can per strike per person. Paint is spent by length × width; undo
// gives it back. About enough to fill your panel once.
export const PAINT = 40;
export function strokeCost(s: Stroke) {
  let length = 0;
  for (let i = 2; i < s.p.length; i += 2) length += Math.hypot(s.p[i] - s.p[i - 2], s.p[i + 1] - s.p[i - 1]);
  return (Math.max(length, 1.5) * s.w) / 12;
}
export const paintLeft = (strokes: Stroke[]) => Math.max(0, PAINT - strokes.reduce((n, s) => n + strokeCost(s), 0));

// Colours chosen to sit together on grey, silver and orange bodies, so a
// wall sprayed by many people still looks deliberate. Each person gets one
// (the backend should key this by IP; the lab keys it by device).
export const PALETTE = ['#FF4FA3', '#38D9F5', '#B6F23A', '#FFD93D', '#FF7A2E', '#A98BFF', '#F4F1EA', '#FF5C5C'];

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function myColour(): string {
  try {
    let id = localStorage.getItem('lab_device_id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('lab_device_id', id); }
    return PALETTE[hash(id) % PALETTE.length];
  } catch { return PALETTE[0]; }
}
export const colourFor = (seed: string) => PALETTE[hash(seed) % PALETTE.length];

const storageKey = (key: string) => `graffiti_px_${key}`;

export function loadDrawing(key: string): Stroke[] | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as Stroke[]) : null;
  } catch { return null; }
}

export async function uploadDrawing(key: string, strokes: Stroke[]): Promise<void> {
  const payload = strokes.slice(0, LIMITS.strokes).map(s => ({ c: s.c, w: s.w, p: s.p.map(v => Math.round(v * 2) / 2), ...(s.d ? { d: 1 as const } : {}) }));
  try { localStorage.setItem(storageKey(key), JSON.stringify(payload)); } catch { /* storage blocked: keep in memory only */ }
  await new Promise(resolve => setTimeout(resolve, 350));
}
