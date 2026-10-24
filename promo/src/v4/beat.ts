import { Easing, interpolate } from 'remotion';

// Everything sits on one grid: 120 BPM at 30 fps, a beat every 15 frames.
export const BEAT = 15;
export const b = (beats: number) => Math.round(beats * BEAT);
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
export const ramp = (f: number, a: number, z: number, e = Easing.inOut(Easing.cubic)) => interpolate(f, [a, z], [0, 1], { ...clamp, easing: e });
export const lin = (f: number, a: number, z: number) => interpolate(f, [a, z], [0, 1], clamp);
export const springy = Easing.bezier(0.34, 1.56, 0.64, 1); // a quick overshoot
export const snap = Easing.bezier(0.7, 0, 0.2, 1); // whip moves: slow-fast-slow, hard in the middle
// The sections, in beats (120 BPM): 62 beats = 31 s.
export const SECTIONS = [
  ['chaos', 10], ['title', 4], ['ask', 8], ['dive', 2], ['sources', 8], ['answer', 6], ['day', 6], ['italy', 8], ['payoff', 6], ['logo', 4],
] as const;
export type Section = (typeof SECTIONS)[number][0];
export const START: Record<string, number> = {};
SECTIONS.reduce((t, [n, beats]) => { START[n] = t; return t + b(beats); }, 0);
export const FILM4_FRAMES = SECTIONS.reduce((n, [, beats]) => n + b(beats), 0);
