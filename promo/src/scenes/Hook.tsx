import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Shader } from '../gl/Shader';
import { LED_FRAG } from '../gl/led.frag';
import { eyes, grid, textLine, toTexture } from '../board';

export type Lang = 'zh' | 'en';
// Short lines, so the whole question fits a portrait frame and the
// glyphs stay big; the board and the camera scale with the copy's width.
const COPY = { zh: ['明天', '地铁', '罢工?'], en: ['STRIKE', 'TOMORROW?'] };
const BOARD = { zh: { cols: 40, rows: 38, scale: 1.18 }, en: { cols: 72, rows: 26, scale: 2.35 } };

// Camera keys: position, target, roll, aperture, focal factor.
type Key = { f: number; ro: [number, number, number]; ta: [number, number, number]; roll: number; ap: number; fov: number };
// An orbit around the question, oblique left to oblique right, then a
// pull back to frame the eyes head-on.
const KEYS: Key[] = [
  { f: 0, ro: [-38, -16, 62], ta: [-2, 1, 0], roll: 0.18, ap: 0.06, fov: 1.55 },
  { f: 28, ro: [34, 12, 70], ta: [2, -1, 0], roll: -0.1, ap: 0.055, fov: 1.6 },
  { f: 36, ro: [3, 1, 82], ta: [0, 0, 0], roll: -0.02, ap: 0.03, fov: 1.75 },
  { f: 47, ro: [0, 0, 88], ta: [0, 0, 0], roll: 0, ap: 0.022, fov: 1.8 },
];
const ease = Easing.inOut(Easing.cubic);
function camera(f: number, k: number) {
  const i = Math.max(0, KEYS.findIndex((k, n) => n === KEYS.length - 1 || KEYS[n + 1].f > f));
  const a = KEYS[Math.min(i, KEYS.length - 1)], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const t = b.f === a.f ? 0 : ease(Math.min(1, Math.max(0, (f - a.f) / (b.f - a.f))));
  const mix = (x: number, y: number) => x + (y - x) * t;
  const ro = a.ro.map((v, k) => mix(v, b.ro[k])) as [number, number, number];
  const ta = a.ta.map((v, k) => mix(v, b.ta[k])) as [number, number, number];
  // the text-wide shots scale with the copy; the eyes framing doesn't
  const s = f >= 34 ? 1 : k;
  return { ro: ro.map(v => v * s) as [number, number, number], ta: ta.map(v => v * s) as [number, number, number], roll: mix(a.roll, b.roll), ap: mix(a.ap, b.ap) / s, fov: mix(a.fov, b.fov) };
}

export function Hook({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { cols: COLS, rows: ROWS, scale } = BOARD[lang];
  const g = grid(COLS, ROWS);
  // text: wiped on column by column, held, then cleared for the eyes
  const textOn = frame < 31;
  if (textOn) {
    const lines = COPY[lang];
    lines.forEach((t, k) => textLine(g, t, 2 + k * 12));
    // already powering up on the first frame, row by row with a flicker
    for (let y = 0; y < ROWS; y++) {
      const on = interpolate(frame, [y * 0.08 - 1.5, y * 0.08 + 1.5], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const flick = frame < 5 ? (Math.sin(y * 12.9 + frame * 7.3) > -0.3 ? 1 : 0.3) : 1;
      for (let x = 0; x < COLS; x++) g.data[y * COLS + x] *= on * flick;
    }
    if (frame > 27) g.data.forEach((v, i) => { g.data[i] = v * interpolate(frame, [27, 31], [1, 0]); });
  }
  // the eyes: open with a little overshoot, glance aside, then at you
  if (frame >= 31) {
    const open = interpolate(frame, [31, 35, 37], [0, 1.12, 1], { extrapolateRight: 'clamp' });
    const gx = interpolate(frame, [36, 39, 42, 44], [0, -0.7, -0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    eyes(g, open, gx);
  }
  const cam = camera(frame, scale);
  const focus = Math.hypot(cam.ta[0] - cam.ro[0], cam.ta[1] - cam.ro[1], cam.ta[2] - cam.ro[2]);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Shader frag={LED_FRAG} width={width} height={height} textures={{ uState: toTexture(g) }}
        uniforms={{ uGrid: [COLS, ROWS], uRo: cam.ro, uTa: cam.ta, uRoll: cam.roll, uFov: cam.fov, uFocus: focus, uAperture: cam.ap,
          uTime: frame / fps, uGrain: 0.045, uExposure: 1.35, uSheen: frame / 44, uTint: [1.0, 0.56, 0.1] }} />
    </AbsoluteFill>
  );
}
