// Drawings are lists of strokes on the 240×140 pixel wall, a few KB as JSON.
//
// Each person's piece is kept on the device and, once the `lab_graffiti`
// table exists, on the shared wall (loadWall / claimPanel / savePiece).

export type Stroke = { c: string; w: number; p: number[]; d?: 1 }; // p = x0,y0,x1,y1… in wall pixels; d = a drip

export const LIMITS = { strokes: 80, points: 4000 };

// One can per strike per person. Paint is spent by length × width; undo
// gives it back. Enough for a tag and a bit more, not to fill the panel:
// a can, not a bucket.
export const PAINT = 55;
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

// ── The shared wall (app/api/doodles/wall) ──
// Answers {available:false} until the table exists; the wall then stays on
// this device as before.
export type Piece = { slot: number; colour: string; strokes: Stroke[]; claimed_at: string; mine: boolean };
export function deviceId(): string {
  try {
    let id = localStorage.getItem('lab_device_id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('lab_device_id', id); }
    return id;
  } catch { return 'anonymous-device'; }
}
export async function loadWall(key: string): Promise<{ available: boolean; pieces: Piece[] }> {
  try {
    const res = await fetch(`/api/doodles/wall?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId())}`, { cache: 'no-store' });
    const json = await res.json();
    return { available: !!json.available, pieces: Array.isArray(json.pieces) ? json.pieces : [] };
  } catch { return { available: false, pieces: [] }; }
}
export async function claimPanel(key: string, slots: number): Promise<{ slot: number; colour: string; done: boolean } | null> {
  try {
    const res = await fetch('/api/doodles/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim', key, deviceId: deviceId(), slots }) });
    const json = await res.json();
    return json.available && typeof json.slot === 'number' ? { slot: json.slot, colour: json.colour, done: !!json.done } : null;
  } catch { return null; }
}
export async function savePiece(key: string, strokes: Stroke[]): Promise<boolean> {
  try {
    const res = await fetch('/api/doodles/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', key, deviceId: deviceId(), strokes }) });
    return res.ok;
  } catch { return false; }
}
