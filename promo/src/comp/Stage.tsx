import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Shader } from '../gl/Shader';
import { STAGE_FRAG } from '../gl/stage.frag';

export type RGB = [number, number, number];
export const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function Stage({ keyColor, power = 1, keyPos = [0, 0.32], drift = 0, bokeh = 1 }: { keyColor: RGB; power?: number; keyPos?: [number, number]; drift?: number; bokeh?: number }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  return (
    <Shader frag={STAGE_FRAG} width={width} height={height} style={{ position: 'absolute', inset: 0 }}
      uniforms={{ uTime: frame / fps, uKey: keyColor, uFill: [0.25, 0.3, 0.45], uKeyPower: power, uKeyPos: keyPos, uBokeh: bokeh, uDrift: drift, uGrain: 0.035 }} />
  );
}
