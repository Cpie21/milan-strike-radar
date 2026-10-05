// Free drawings are vector strokes on the 360×150 vehicle stage, a few KB as
// JSON — far lighter than images and redrawable at any size.
//
// Lab only: uploads stay on this device until the backend endpoint exists
// (contract in AI_HANDOFF.md, "Graffiti drawing upload"). Swap
// `uploadDrawing` for the real POST when it lands.

export type Stroke = { c: string; w: number; p: number[]; d?: 1 }; // p = x0,y0,x1,y1… in stage units; d = a drip

export const LIMITS = { strokes: 80, points: 4000 };

// One can per strike per person. Paint is spent by length × width, so a
// fat line empties it fast and a fine one goes further; undo gives it back.
export const PAINT = 160; // ≈ two and a half medium lines end to end, or a handful of marks
export function strokeCost(s: Stroke) {
  let length = 0;
  for (let i = 2; i < s.p.length; i += 2) length += Math.hypot(s.p[i] - s.p[i - 2], s.p[i + 1] - s.p[i - 1]);
  return Math.max(length, 2) * s.w / 48;
}
export const paintLeft = (strokes: Stroke[]) => Math.max(0, PAINT - strokes.reduce((n, s) => n + strokeCost(s), 0));

const storageKey = (key: string) => `graffiti_drawing_${key}`;

export function loadDrawing(key: string): Stroke[] | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as Stroke[]) : null;
  } catch { return null; }
}

export async function uploadDrawing(key: string, strokes: Stroke[]): Promise<void> {
  const payload = strokes.slice(0, LIMITS.strokes).map(s => ({ c: s.c, w: s.w, p: s.p.map(v => Math.round(v * 2) / 2), ...(s.d ? { d: 1 as const } : {}) }));
  try { localStorage.setItem(storageKey(key), JSON.stringify(payload)); } catch { /* storage blocked: keep in memory only */ }
  await new Promise(resolve => setTimeout(resolve, 450));
}
