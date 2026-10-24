import { Easing, interpolate } from 'remotion';

// A camera over the screen: where it looks (fx, fy in screen points) and
// how close (k: video px per point). Keys are eased like a dolly: slow in,
// slow out, never a cut in the middle of a move.
export type Cam = { f: number; fx: number; fy: number; k: number };
const ease = Easing.bezier(0.65, 0, 0.35, 1);
export function camAt(keys: Cam[], f: number) {
  if (f <= keys[0].f) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (f <= b.f) {
      const t = ease((f - a.f) / (b.f - a.f));
      // zoom in log space, so a push-in feels even
      const k = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * t);
      return { f, fx: a.fx + (b.fx - a.fx) * t, fy: a.fy + (b.fy - a.fy) * t, k };
    }
  }
  return keys[keys.length - 1];
}
export const fade = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
