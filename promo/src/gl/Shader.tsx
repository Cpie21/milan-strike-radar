import { useLayoutEffect, useRef } from 'react';

// A full-frame fragment shader, redrawn synchronously on every frame so the
// render is deterministic (Remotion screenshots after layout).
export type Uniform = number | [number, number] | [number, number, number] | [number, number, number, number];
export type DataTexture = { data: Uint8Array; width: number; height: number };

const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

type GLState = { gl: WebGL2RenderingContext; prog: WebGLProgram; tex: Map<string, WebGLTexture> };

export function Shader({ frag, width, height, uniforms, textures = {}, style }: {
  frag: string; width: number; height: number; uniforms: Record<string, Uniform>; textures?: Record<string, DataTexture>; style?: React.CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<GLState | null>(null);
  useLayoutEffect(() => {
    const c = canvas.current!;
    if (!state.current) {
      const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false })!;
      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      state.current = { gl, prog, tex: new Map() };
    }
    const { gl, prog, tex } = state.current;
    gl.viewport(0, 0, width, height);
    gl.useProgram(prog);
    let unit = 0;
    for (const [name, t] of Object.entries(textures)) {
      let handle = tex.get(name);
      if (!handle) { handle = gl.createTexture()!; tex.set(name, handle); }
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, t.width, t.height, 0, gl.RED, gl.UNSIGNED_BYTE, t.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog, name), unit++);
    }
    gl.uniform2f(gl.getUniformLocation(prog, 'uRes'), width, height);
    for (const [name, v] of Object.entries(uniforms)) {
      const l = gl.getUniformLocation(prog, name);
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });
  return <canvas ref={canvas} width={width} height={height} style={{ width, height, display: 'block', ...style }} />;
}
