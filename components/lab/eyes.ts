// The face's eyes, as living shapes rather than bitmaps.
//
// After the robot faces people find alive (Anki's Vector, Living.ai's EMO,
// the two-eyed assistants in the references): each eye is a soft rounded
// shape with a position, an openness, a slant of the upper lid and a smile
// cut from below. Everything moves on springs: the gaze darts (a saccade
// with a little overshoot) and settles, lids close fast and open slower,
// the eyes squash a touch as they blink. Drawn into the LED grid by
// coverage, so a shape between two dots lights both partly, and movement
// stays smooth even on a 9-dot-high panel.
//
// Expressions are about the assistant, not the strike: on a strike day it
// is concerned and attentive (inner corners raised, glancing up at the
// card, back to you), never cross.

export type Expr = 'idle' | 'happy' | 'thinking' | 'concerned' | 'alarm' | 'unsure' | 'sorry' | 'sleepy' | 'off';

type Lid = { open: number; tilt: number; smile: number; scale: number };
const LID = (open = 1, tilt = 0, smile = 0, scale = 1): Lid => ({ open, tilt, smile, scale });

// Per expression: both lids, and where the gaze rests.
const PRESET: Record<Expr, { L: Lid; R: Lid; gy: number }> = {
  idle: { L: LID(), R: LID(), gy: 0 },
  happy: { L: LID(0.95, 0, 1), R: LID(0.95, 0, 1), gy: -0.15 },
  thinking: { L: LID(0.8, 0.1), R: LID(0.8, 0.1), gy: -0.7 },
  concerned: { L: LID(1, 0.45, 0, 1.04), R: LID(1, 0.45, 0, 1.04), gy: 0 },
  alarm: { L: LID(1.08, 0.35, 0, 1.1), R: LID(1.08, 0.35, 0, 1.1), gy: 0 },
  unsure: { L: LID(1, 0.15), R: LID(0.55, -0.1), gy: -0.2 },
  sorry: { L: LID(0.62, 0.6), R: LID(0.62, 0.6), gy: 0.55 },
  sleepy: { L: LID(0.18, 0.1), R: LID(0.18, 0.1), gy: 0.4 },
  off: { L: LID(0), R: LID(0), gy: 0 },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class EyeLife {
  cols: number; rows: number;
  expr: Expr = 'idle';
  visible = 0; visTarget = 1;
  gx = 0; gy = 0; vx = 0; vy = 0; tx = 0; ty = 0;
  L: Lid = LID(); R: Lid = LID();
  private blink = -1; private nextBlink = 1.2; private nextLook = 0.8; private hold = 0; private t = 0;
  private out: Float32Array;

  constructor(cols: number, rows: number) {
    this.cols = cols; this.rows = rows;
    this.out = new Float32Array(cols * rows);
  }
  resize(cols: number) { if (cols !== this.cols) { this.cols = cols; this.out = new Float32Array(cols * this.rows); } }
  setExpr(e: Expr) {
    if (e === this.expr) return;
    this.expr = e;
    this.visTarget = e === 'off' ? 0 : 1;
    this.nextLook = 0; // react at once
    if (e === 'alarm') this.blink = 0; // a startled blink
  }
  show(on: boolean) { this.visTarget = on ? 1 : 0; }
  // Look somewhere on purpose (a tram, the input) and stay for `ms`.
  look(gx: number, gy: number, ms = 900) { this.tx = gx; this.ty = gy; this.hold = ms / 1000; }

  step(dt: number) {
    this.t += dt;
    const p = PRESET[this.expr];
    // Gaze: choose a new point now and then, by temperament.
    this.hold -= dt;
    this.nextLook -= dt;
    if (this.hold <= 0 && this.nextLook <= 0) {
      switch (this.expr) {
        case 'thinking': this.tx = this.tx > 0 ? rand(-0.9, -0.5) : rand(0.5, 0.9); this.ty = rand(-0.9, -0.5); this.nextLook = rand(0.35, 0.7); break;
        case 'concerned': {
          // up at the card, then back to you
          const up = this.ty > -0.3;
          this.tx = up ? rand(-0.2, 0.2) : rand(-0.35, 0.35); this.ty = up ? -0.85 : 0;
          this.nextLook = up ? rand(1.1, 1.8) : rand(1.6, 2.8); break;
        }
        case 'sorry': case 'sleepy': this.tx = rand(-0.3, 0.3); this.ty = p.gy; this.nextLook = rand(2, 3.5); break;
        case 'happy': this.tx = rand(-0.2, 0.2); this.ty = p.gy; this.nextLook = rand(1.2, 2.2); break;
        default: {
          const far = Math.random() < 0.38;
          this.tx = far ? (Math.random() < 0.5 ? -1 : 1) * rand(0.55, 1) : rand(-0.25, 0.25);
          this.ty = far ? rand(-0.5, 0.35) : rand(-0.2, 0.2) + p.gy;
          this.nextLook = far ? rand(0.6, 1.3) : rand(1.2, 3.2);
        }
      }
    }
    // A saccade: a stiff, slightly under-damped spring — darts, overshoots a hair, settles.
    const k = 520, c = 2 * Math.sqrt(k) * 0.62;
    this.vx += (k * (this.tx - this.gx) - c * this.vx) * dt; this.gx += this.vx * dt;
    this.vy += (k * (this.ty - this.gy) - c * this.vy) * dt; this.gy += this.vy * dt;
    // Lids ease toward the expression.
    const ease = 1 - Math.exp(-dt * 12);
    for (const [cur, tgt] of [[this.L, p.L], [this.R, p.R]] as const) {
      cur.open += (tgt.open - cur.open) * ease; cur.tilt += (tgt.tilt - cur.tilt) * ease;
      cur.smile += (tgt.smile - cur.smile) * ease; cur.scale += (tgt.scale - cur.scale) * ease;
    }
    this.visible += (this.visTarget - this.visible) * (1 - Math.exp(-dt * (this.visTarget ? 9 : 14)));
    // Blinks: now and then, sometimes twice; never while closed anyway.
    this.nextBlink -= dt;
    if (this.blink < 0 && this.nextBlink <= 0 && this.expr !== 'off' && this.expr !== 'sleepy') {
      this.blink = 0;
      this.nextBlink = Math.random() < 0.18 ? 0.28 : rand(2.2, 5.5);
    }
    if (this.blink >= 0) { this.blink += dt / 0.17; if (this.blink >= 1) this.blink = -1; }
  }

  // Alpha per dot, 0..1.
  field(): Float32Array {
    const { cols, rows, out } = this;
    out.fill(0);
    if (this.visible < 0.01) return out;
    const b = this.blink < 0 ? 1 : this.blink < 0.35 ? 1 - this.blink / 0.35 : (this.blink - 0.35) / 0.65; // close fast, open slower
    const small = rows <= 9 && cols < 24;
    const w = small ? 4.2 : 5.2, h = small ? 6.2 : 7, sep = small ? 3.9 : 4.9;
    const reach = small ? 1.6 : Math.min(cols / 2 - sep - w / 2 - 0.5, 5.5);
    const cx0 = cols / 2 + this.gx * reach, cy0 = rows / 2 + this.gy * 1.1;
    const eye = (cx: number, lid: Lid, side: number, x: number, y: number) => {
      const open = Math.max(0.06, lid.open * b * this.visible);
      // perspective: the eye on the side you look toward grows a touch
      const persp = 1 + this.gx * side * -0.06;
      const hw = (w / 2) * lid.scale * persp * (1 + (1 - b) * 0.12), hh = (h / 2) * lid.scale * persp * open;
      const r = Math.min(hw, hh) * 0.92;
      const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy0) - (hh - r);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      let a = clamp01(0.55 - sd);
      if (a <= 0) return 0;
      // upper lid slant: inner corners up (concern) for tilt > 0
      if (lid.tilt) {
        const u = ((x - cx) / hw) * side; // +1 at the inner corner
        const cut = cy0 - hh + lid.tilt * hh * 1.1 * (1 - u) / 2;
        a *= clamp01(y - cut + 0.5);
      }
      // smile: a circle bites the lower part away, leaving an arch
      if (lid.smile > 0.02) {
        const d = Math.hypot(x - cx, y - (cy0 + hh * 1.05));
        a *= clamp01(d - hh * 1.25 * lid.smile + 0.5);
      }
      return a;
    };
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = Math.max(eye(cx0 - sep, this.L, 1, px, py), eye(cx0 + sep, this.R, -1, px, py));
      if (a > 0.04) out[y * cols + x] = a;
    }
    return out;
  }
}
