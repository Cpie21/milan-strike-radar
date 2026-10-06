// The stage behind the phone: night air in a station. A soft key light
// falls from above in the scene's colour, haze drifts through it, and the
// station's lamps hang far behind as large out-of-focus discs (bokeh).
export const STAGE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes; uniform float uTime;
uniform vec3 uKey; uniform vec3 uFill; uniform float uKeyPower; uniform vec2 uKeyPos;
uniform float uBokeh; uniform float uDrift; uniform float uGrain;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec2 fc = vUv * uRes;
  vec2 p = (fc - 0.5 * uRes) / uRes.y;   // y up, -0.5..0.5
  vec3 col = vec3(0.012, 0.013, 0.016);
  // key light: a wide soft cone from above
  vec2 k = p - uKeyPos;
  float cone = exp(-pow(k.x / (0.28 + max(0.0, -k.y) * 0.55), 2.0)) * smoothstep(0.65, -0.2, -k.y * -1.0 + 0.2);
  float pool = exp(-dot(k * vec2(1.0, 1.5), k * vec2(1.0, 1.5)) * 5.5);
  float haze = fbm(p * 2.2 + vec2(uTime * 0.04 + uDrift, -uTime * 0.02));
  col += uKey * (pool * 0.42 + cone * 0.16) * (0.45 + 1.0 * haze) * uKeyPower;
  // a cooler fill from below, so the dark is never flat
  col += uFill * exp(-dot(p - vec2(0.3, -0.6), p - vec2(0.3, -0.6)) * 2.5) * 0.18;
  // bokeh: station lamps far behind, out of focus
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    vec2 c = vec2(hash(vec2(fi, 1.3)) * 1.3 - 0.65, hash(vec2(fi, 7.1)) * 1.1 - 0.55);
    c.x += sin(uTime * 0.15 + fi) * 0.02 + uDrift * (0.1 + 0.2 * hash(vec2(fi, 3.0)));
    float r = 0.025 + 0.06 * hash(vec2(fi, 9.2));
    float d = length(p - c);
    float disc = smoothstep(r, r * 0.82, d) * (0.6 + 0.4 * smoothstep(r * 0.55, r, d)); // brighter rim, like a lens
    vec3 tint = mix(uKey, vec3(1.0, 0.78, 0.5), hash(vec2(fi, 4.4)));
    col += tint * disc * 0.045 * uBokeh * (0.4 + 0.6 * hash(vec2(fi, 2.2)));
  }
  float vig = smoothstep(1.05, 0.2, length(p * vec2(1.25, 0.95)));
  col *= mix(0.25, 1.0, vig);
  col = 1.0 - exp(-col * 1.6);
  col += (hash(fc + fract(uTime) * 61.3) - 0.5) * uGrain;
  outColor = vec4(col, 1.0);
}`;
