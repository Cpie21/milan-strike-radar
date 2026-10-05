// Spray slots: each person paints one panel of the vehicle, zoomed in, so a
// crowded wall is many small finished pieces rather than one tangle.
//
// Allocation (the same rules on the client preview and, later, the server):
// 1. The paintable side is cut into a grid of panels about 30×22 pixels.
// 2. Panels are ranked centre-out, so the first pieces land where they're
//    seen and the wall fills like a real one, from the middle.
// 3. A person's slot is the first free panel in that order, offset by a hash
//    of their id among the first few free panels, so people arriving at the
//    same moment usually ask for different panels.
// 4. The claim is atomic on the server (unique strike + panel). On a
//    conflict the client takes the next free panel in order and retries.
// 5. When every panel is taken, the oldest piece is painted over ("buffed"),
//    as happens on real trains; it stays faintly under the new one.
// A person keeps their panel for that strike; reopening the can returns
// them to it.

export type Slot = { i: number; x: number; y: number; w: number; h: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

export function slotsFor(body: Box): Slot[] {
  const W = body.x1 - body.x0, H = body.y1 - body.y0;
  const cols = Math.max(1, Math.round(W / 30)), rows = Math.max(1, Math.round(H / 22));
  const w = W / cols, h = H / rows;
  const cx = body.x0 + W / 2, cy = body.y0 + H / 2;
  return Array.from({ length: cols * rows }, (_, k) => ({ x: body.x0 + (k % cols) * w, y: body.y0 + Math.floor(k / cols) * h, w, h }))
    .map(s => ({ ...s, d: Math.hypot((s.x + s.w / 2 - cx) / W, (s.y + s.h / 2 - cy) / H * 0.6) }))
    .sort((a, b) => a.d - b.d)
    .map(({ x, y, w: sw, h: sh }, i) => ({ i, x: Math.round(x), y: Math.round(y), w: Math.round(sw), h: Math.round(sh) }));
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** taken: slot index → claim time (ms). Returns the slot to paint. */
export function assignSlot(slots: Slot[], taken: Map<number, number>, who: string): Slot {
  const free = slots.filter(s => !taken.has(s.i));
  if (free.length) return free[hash(who) % Math.min(3, free.length)];
  // All taken: paint over the oldest piece.
  const oldest = [...taken.entries()].sort((a, b) => a[1] - b[1])[0][0];
  return slots.find(s => s.i === oldest) ?? slots[0];
}
