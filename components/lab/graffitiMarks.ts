// Graffiti marks shared by the wall: symbols anyone reads the same way, in
// any language, and a small seeded random source so the same strike always
// shows the same wall.

// Marks anyone reads the same way, in any language: an angry face, "!!",
// "?!", a cross, the manga anger vein, a broken heart, a stopped clock.
export const SYMBOLS = {
  angry: { d: 'M -13 0 A 13 13 0 1 0 13 0 A 13 13 0 1 0 -13 0 M -8 -6 L -3 -3 M 8 -6 L 3 -3 M -6 7 Q 0 2 6 7', w: 3.4 },
  bang: { d: 'M -5 -13 L -5 4 M 5 -13 L 5 4 M -5 11 L -5 11.5 M 5 11 L 5 11.5', w: 4.6 },
  what: { d: 'M -12 -7 Q -12 -14 -6 -14 Q 0 -14 0 -8 Q 0 -3 -6 -1 L -6 4 M -6 11 L -6 11.5 M 8 -14 L 8 4 M 8 11 L 8 11.5', w: 4 },
  cross: { d: 'M -11 -11 L 11 11 M 11 -11 L -11 11', w: 5 },
  vein: { d: 'M -12 -4 Q -5 -5 -4 -12 M 4 -12 Q 5 -5 12 -4 M 12 4 Q 5 5 4 12 M -4 12 Q -5 5 -12 4', w: 3.4 },
  heart: { d: 'M 0 12 L -12 0 Q -16 -10 -7 -12 Q -2 -12 0 -7 Q 2 -12 7 -12 Q 16 -10 12 0 Z M 0 -7 L -3 -1 L 2 2 L -1 8', w: 3 },
  clock: { d: 'M -12 0 A 12 12 0 1 0 12 0 A 12 12 0 1 0 -12 0 M 0 0 L 0 -8 M 0 0 L 6 3 M -16 -16 L 16 16', w: 3 },
  swirl: { d: 'M -20 0 C -10 -18 12 -18 14 -2 C 16 12 -6 14 -8 2 C -9 -6 4 -8 6 0', w: 4.5 },
  zig: { d: 'M -22 4 L -12 -8 L -2 6 L 8 -8 L 18 6', w: 4 },
};
export type SymbolKind = keyof typeof SYMBOLS;

export function rng(seed: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

