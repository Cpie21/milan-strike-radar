// The LED board as a physical object seen through a lens.
// A ray from the camera meets the board (the z = 0 plane, one unit per
// lamp); each lamp is a disc that blurs with its distance from the focal
// plane (depth of field, so far lamps become soft bokeh), lit lamps bloom
// into their neighbours, the lens fringes colour toward the edges, and the
// frame gets a filmic tone curve, vignette and grain.
export const LED_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes;
uniform sampler2D uState;
uniform vec2 uGrid;
uniform vec3 uRo; uniform vec3 uTa; uniform float uRoll; uniform float uFov;
uniform float uFocus; uniform float uAperture;
uniform float uTime; uniform float uGrain; uniform float uExposure; uniform float uSheen;
uniform vec3 uTint;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lit(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) return 0.0;
  return texture(uState, (cell + 0.5) / uGrid).r;
}
vec3 shade(vec2 fc) {
  vec2 q = (fc - 0.5 * uRes) / uRes.y;
  vec3 ww = normalize(uTa - uRo);
  vec3 up = vec3(sin(uRoll), cos(uRoll), 0.0);
  vec3 uu = normalize(cross(ww, up)); vec3 vv = cross(uu, ww);
  vec3 rd = normalize(q.x * uu + q.y * vv + uFov * ww);
  if (rd.z >= -1e-4) return vec3(0.0);
  float t = -uRo.z / rd.z;
  vec3 hit = uRo + t * rd;
  vec2 g = hit.xy + uGrid * 0.5;
  vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
  float coc = uAperture * abs(t - uFocus) / max(t, 0.001);
  float px = t / (uFov * uRes.y);
  float soft = px * 1.2 + coc * 0.9;
  float inside = step(0.0, g.x) * step(0.0, g.y) * step(g.x, uGrid.x) * step(g.y, uGrid.y);
  float r = 0.37;
  float d = length(f);
  float disc = 1.0 - smoothstep(r - soft, r + soft, d);
  float b = lit(cell) * inside;
  float v = 0.86 + 0.14 * hash(cell);
  vec3 amber = uTint;
  vec3 hot = mix(amber, vec3(1.0, 0.94, 0.8), 0.6);
  vec3 lens = amber * 0.055 + vec3(0.012);
  vec3 led = mix(amber, hot, smoothstep(0.0, r, r - d)) * 1.7 * v;
  vec3 col = inside * disc * mix(lens, led, b) / (1.0 + coc * 0.6);
  // bloom: the light of lit lamps spilling over the panel
  float sigma = 1.0 + coc * 1.4;
  float glow = 0.0;
  for (int j = -3; j <= 3; j++) for (int i = -3; i <= 3; i++) {
    vec2 c2 = cell + vec2(float(i), float(j));
    float bn = lit(c2);
    if (bn <= 0.0) continue;
    vec2 dd = g - (c2 + 0.5);
    glow += bn * exp(-dot(dd, dd) / (sigma * sigma));
  }
  col += amber * glow * 0.2 / (1.0 + coc * 0.5);
  // the housing around the panel: dark anodised metal
  vec2 out2 = max(-g, g - uGrid); float od = max(out2.x, out2.y);
  float housing = (1.0 - inside) * (1.0 - smoothstep(1.6, 1.9, od));
  float bevel = (1.0 - inside) * smoothstep(1.2, 1.55, od) * (1.0 - smoothstep(1.55, 1.9, od));
  col += housing * vec3(0.035, 0.035, 0.04) + bevel * vec3(0.18, 0.18, 0.2) * (0.5 + 0.5 * dot(normalize(vec3(-1.0, 1.0, 1.0)), -rd));
  // a slow sheen across the glass
  float sheen = exp(-pow((g.x * 0.12 - g.y * 0.5) - (uSheen * 26.0 - 6.0), 2.0) / 3.0);
  col += inside * vec3(0.05, 0.05, 0.06) * sheen;
  col *= exp(-max(t - uFocus * 1.8, 0.0) * 0.015);
  return col;
}
void main() {
  vec2 fc = vUv * uRes;
  vec2 cdir = (fc - 0.5 * uRes) / uRes.y;
  float ca = 6.0 * dot(cdir, cdir);
  vec3 col;
  col.r = shade(fc + cdir * ca).r;
  col.g = shade(fc).g;
  col.b = shade(fc - cdir * ca).b;
  col = 1.0 - exp(-col * uExposure);
  float vig = smoothstep(1.15, 0.25, length(cdir * vec2(1.0, 0.85)));
  col *= mix(0.35, 1.0, vig);
  col += (hash(fc + fract(uTime) * 91.7) - 0.5) * uGrain;
  outColor = vec4(pow(max(col, 0.0), vec3(0.95)), 1.0);
}`;
