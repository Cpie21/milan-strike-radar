'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { tx, type Lang, type Mode } from '../../../lib/lab/model';
import { colourFor, LIMITS, loadDrawing, myColour, paintLeft, PAINT, strokeCost, uploadDrawing, type Stroke } from '../graffitiStore';
import { C, EASE, FILLED, MODE_COLOR, TONAL, TYPE } from '../theme';
import { boxBlur, ledText, PH, PW, sceneFor } from './pixelScene';
import { assignSlot, slotsFor, type Slot } from './slots';
import { drawSprite, rng, SPRITE_KINDS, spriteSize, type SpriteKind } from './sprites';

// The wall, in pixels. The vehicle is parked (it is a strike), everyone's
// marks are on it, and the button below hands you one can of paint in your
// own colour and one panel of the body (see slots.ts). Picking up the can
// zooms into your panel; paint lands only there, as hard pixels with a
// dithered edge; hold still and it drips; when the can is empty you are done.

type Phase = 'idle' | 'spray';
type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };
export type WallLink = { anticipate: (on: boolean) => void };

const BRUSH = 1; // a one-pixel nozzle: zoomed into a panel, that is detail
// The gauge's arc: the left third of a circle around the fingertip.
const ARC = (() => { const r = 38, a0 = (215 * Math.PI) / 180, a1 = (145 * Math.PI) / 180; return `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 0 0 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`; })();

type PixelTag = { kind: SpriteKind; x: number; y: number; flip: boolean; color: string; seed: string; scale: number };

function deviceId() {
  try { return localStorage.getItem('lab_device_id') || 'anon'; } catch { return 'anon'; }
}

// Your panel for this strike: claimed once, then kept. Until the server holds
// claims (AI_HANDOFF: graffiti slots), the others are simulated as having
// taken the first panels in centre-out order, as they would have.
function mySlot(slots: Slot[], storeKey: string, others: number): Slot {
  const key = `graffiti_slot_${storeKey}`;
  try {
    const kept = Number(localStorage.getItem(key));
    if (localStorage.getItem(key) !== null && slots[kept]) return slots[kept];
  } catch { /* storage blocked */ }
  const taken = new Map(slots.slice(0, Math.min(others, slots.length)).map((s, k) => [s.i, k]));
  const slot = assignSlot(slots, taken, deviceId());
  try { localStorage.setItem(key, String(slot.i)); } catch { /* storage blocked */ }
  return slot;
}

// Others' marks, one stencil per panel, centre-out. Past capacity, a newer
// mark replaces the oldest, as a buffed wall gets painted again.
function placeTags(slots: Slot[], mine: Slot | null, seed: string, count: number): PixelTag[] {
  const rand = rng(seed);
  const free = slots.filter(s => s.i !== mine?.i);
  return Array.from({ length: Math.min(count, free.length) }, (_, k) => {
    const slot = free[k];
    const kind = SPRITE_KINDS[Math.floor(rand() * SPRITE_KINDS.length)];
    const [w0, h0] = spriteSize(kind);
    // As big as the panel comfortably holds
    const scale = Math.max(1, Math.min(1.8, (slot.w * 0.72) / w0, (slot.h * 0.78) / h0));
    const w = w0 * scale, h = h0 * scale;
    return {
      kind, flip: rand() < 0.5, color: colourFor(`${seed}|${k}`), seed: `${seed}|${k}`, scale,
      x: slot.x + slot.w / 2 + (rand() - 0.5) * Math.max(0, slot.w - w - 2) * 0.7,
      y: slot.y + slot.h / 2 + (rand() - 0.5) * Math.max(0, slot.h - h - 2) * 0.7,
    };
  });
}

// A spray stamp: a solid core and a dithered fringe, in whole pixels.
function stamp(g: CanvasRenderingContext2D, x: number, y: number, w: number, rand: () => number) {
  const R = Math.ceil(w + 1.5);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= w * 0.8 || (d <= w + 1.3 && rand() < (w < 1.2 ? 0.07 : 0.28))) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
  }
}
function paintStroke(g: CanvasRenderingContext2D, s: Stroke, index: number) {
  g.fillStyle = s.c;
  if (s.d) {
    const [x, y, , y2] = s.p;
    g.fillRect(Math.round(x), Math.round(y), 1, Math.max(1, Math.round((y2 ?? y) - y)));
    g.fillRect(Math.round(x) - 1, Math.round(y2 ?? y), 3, 2);
    return;
  }
  const rand = rng(`${index}|${s.p.length}|${s.p[0]}`);
  for (let i = 0; i < s.p.length; i += 2) {
    const x = s.p[i], y = s.p[i + 1];
    if (i === 0) { stamp(g, x, y, s.w, rand); continue; }
    const px = s.p[i - 2], py = s.p[i - 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 0.8));
    for (let k = 1; k <= steps; k++) stamp(g, px + ((x - px) * k) / steps, py + ((y - py) * k) / steps, s.w, rand);
  }
}

export default function PixelWall({ mode, seed, storeKey, doodle, lang, open, onOpen, onClose, onLink, onHint, footer }: {
  mode: Mode; seed: string; storeKey: string; doodle: Doodle; lang: Lang; open: boolean; onOpen: () => void; onClose: () => void;
  onLink?: (link: WallLink | null) => void; onHint?: () => void; footer?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const color = MODE_COLOR[mode];
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [saved, setSaved] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke[] | null>(null);
  const [mine, setMine] = useState('#FF4FA3');
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const spraying = phase === 'spray';
  const strokes = spraying ? draft ?? saved : saved;
  const left = paintLeft(strokes);
  const others = Math.max(doodle.count - (doodle.marked ? 1 : 0), 0);
  const scene = useMemo(() => sceneFor(mode, color.main), [mode, color.main]);
  const slots = useMemo(() => slotsFor(scene.body), [scene]);
  const [slot, setSlot] = useState<Slot | null>(null);
  // Claimed once the count is known, so the simulated claims are right.
  useEffect(() => {
    if (!doodle.loaded) return;
    const t = setTimeout(() => setSlot(mySlot(slots, storeKey, others)), 0);
    return () => clearTimeout(t);
  }, [slots, storeKey, others, doodle.loaded]);
  const tags = useMemo(() => placeTags(slots, slot, seed, others), [slots, slot, seed, others]);

  const live = useRef({ strokes, left, spraying, mine, slot, onChange: (s: Stroke[]) => setDraft(s), onEmpty: () => {} });
  const ext = useRef({ onHint, onLink, marked: doodle.marked });
  useLayoutEffect(() => {
    live.current = { strokes, left, spraying, mine, slot, onChange: s => setDraft(s), onEmpty: () => { setEmpty(true); setTimeout(() => setEmpty(false), 1600); } };
    ext.current = { onHint, onLink, marked: doodle.marked };
  });

  useEffect(() => { const t = setTimeout(() => { setSaved(loadDrawing(storeKey) ?? []); setMine(myColour()); }, 0); return () => clearTimeout(t); }, [storeKey]);
  useEffect(() => {
    if (open && doodle.marked && phase === 'idle') { const t = setTimeout(() => setPhase('spray'), 0); return () => clearTimeout(t); }
  }, [open, doodle.marked, phase]);

  const finish = async (list = draft) => {
    if (list) {
      setSaving(true);
      await uploadDrawing(storeKey, list);
      setSaved(list);
      setDraft(null);
      setSaving(false);
    }
    onClose();
    setPhase('idle');
  };
  // An empty can ends the session by itself.
  const finishRef = useRef(finish);
  useLayoutEffect(() => { finishRef.current = finish; });
  useEffect(() => {
    if (!spraying || !draft?.length || left > 0.5) return;
    const t = setTimeout(() => finishRef.current(draft), 900);
    return () => clearTimeout(t);
  }, [spraying, draft, left]);

  // ── Layers and loop ──
  const layers = useRef<{ redraw: (s: Stroke[]) => void } | null>(null);
  const gauge = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = canvas.current;
    const ctx = view?.getContext('2d');
    if (!view || !ctx) return;
    const make = () => { const c = document.createElement('canvas'); c.width = PW; c.height = PH; return [c, c.getContext('2d', { willReadFrequently: true })!] as const; };
    const [bg, bctx] = make();
    scene.background(bctx);
    const [nb, nctx] = make();
    scene.neighbours(nctx);
    boxBlur(nctx, 2);
    bctx.drawImage(nb, 0, 0);
    const [veh, vctx] = make();
    scene.vehicle(vctx);
    const [mask, mctx] = make();
    scene.mask(mctx);
    const maskData = mctx.getImageData(0, 0, PW, PH).data;
    const onBody = (x: number, y: number) => x >= 0 && y >= 0 && x < PW && y < PH && maskData[(Math.floor(y) * PW + Math.floor(x)) * 4 + 3] > 0;
    const [fg, fctx] = make();
    scene.foreground(fctx);
    // Both edges fade into the card, so the scene has no hard sides.
    const [edges, ectx] = make();
    const fade = ectx.createLinearGradient(0, 0, PW, 0);
    fade.addColorStop(0, 'rgba(14,15,18,1)'); fade.addColorStop(0.07, 'rgba(14,15,18,0)'); fade.addColorStop(0.93, 'rgba(14,15,18,0)'); fade.addColorStop(1, 'rgba(14,15,18,1)');
    ectx.fillStyle = fade; ectx.fillRect(0, 0, PW, PH);
    // How lit the body is at each pixel, so paint can sit *on* it: seams,
    // window frames and door edges darken the paint over them, glass makes
    // it duskier. Mid silver maps to ~white, so bright paint stays bright.
    const [light, lctx] = make();
    {
      const v = vctx.getImageData(0, 0, PW, PH);
      const out = lctx.createImageData(PW, PH);
      for (let i = 0; i < v.data.length; i += 4) {
        const l = (v.data[i] * 0.3 + v.data[i + 1] * 0.59 + v.data[i + 2] * 0.11) / 255;
        const k = Math.min(255, Math.round(255 * Math.min(1, 0.35 + l * 1.25)));
        out.data[i] = out.data[i + 1] = out.data[i + 2] = k; out.data[i + 3] = 255;
      }
      lctx.putImageData(out, 0, 0);
    }
    // The body's own highlights (the roof's shine, lamp streaks): laid back
    // over the paint so it sits on curved, lit metal and keeps its gloss.
    const [gloss, glctx] = make();
    {
      const v = vctx.getImageData(0, 0, PW, PH);
      const out = glctx.createImageData(PW, PH);
      for (let i = 0; i < v.data.length; i += 4) {
        const l = (v.data[i] * 0.3 + v.data[i + 1] * 0.59 + v.data[i + 2] * 0.11) / 255;
        if (l > 0.7) { out.data[i] = 255; out.data[i + 1] = 246; out.data[i + 2] = 228; out.data[i + 3] = Math.round(((l - 0.7) / 0.3) * 110); }
      }
      glctx.putImageData(out, 0, 0);
    }
    const [graf, gctx] = make();
    const [tagLayer, tctx] = make();
    const [strokeLayer, sctx] = make();
    const [paintAlpha, pactx] = make();

    const redraw = (list: Stroke[]) => {
      // Others' pieces (each has its own outline, shine and drips)
      tctx.clearRect(0, 0, PW, PH);
      const own = live.current.slot;
      tags.forEach(t => drawSprite(tctx, t.kind, t.x, t.y, t.color, t.flip, t.seed, t.scale));
      // Marked but not yet painted: a fist in your colour holds your panel.
      if (own && ext.current.marked && !list.length) drawSprite(tctx, 'fist', own.x + own.w / 2, own.y + own.h / 2, live.current.mine, false, 'mine', Math.max(1, Math.min(1.6, (own.h * 0.7) / 24)));
      // Your strokes, inside your panel, with a dark keyline so they read
      sctx.clearRect(0, 0, PW, PH);
      sctx.save();
      if (own) { sctx.beginPath(); sctx.rect(own.x, own.y, own.w, own.h); sctx.clip(); }
      list.forEach((s, i) => paintStroke(sctx, s, i));
      sctx.restore();
      const painted = sctx.getImageData(0, 0, PW, PH);
      const a = painted.data;
      const line: number[] = [];
      for (let y = 1; y < PH - 1; y++) for (let x = 1; x < PW - 1; x++) {
        const i = (y * PW + x) * 4;
        if (a[i + 3] > 0 || !onBody(x, y)) continue;
        if (a[i + 3 - 4] > 0 || a[i + 3 + 4] > 0 || a[i + 3 - PW * 4] > 0 || a[i + 3 + PW * 4] > 0) line.push(i);
      }
      line.forEach(i => { a[i] = 18; a[i + 1] = 19; a[i + 2] = 23; a[i + 3] = 200; });
      sctx.putImageData(painted, 0, 0);
      gctx.clearRect(0, 0, PW, PH);
      gctx.globalAlpha = 0.92; // others' pieces a little weathered; yours fresh
      gctx.drawImage(tagLayer, 0, 0);
      gctx.globalAlpha = 1;
      gctx.drawImage(strokeLayer, 0, 0);
      gctx.globalCompositeOperation = 'destination-in';
      gctx.drawImage(mask, 0, 0);
      gctx.globalCompositeOperation = 'source-over';
      // Paint takes the body's light: multiply, then keep only painted pixels.
      pactx.clearRect(0, 0, PW, PH);
      pactx.drawImage(graf, 0, 0);
      gctx.globalCompositeOperation = 'multiply';
      gctx.drawImage(light, 0, 0);
      gctx.globalCompositeOperation = 'destination-in';
      gctx.drawImage(paintAlpha, 0, 0);
      gctx.globalCompositeOperation = 'source-atop';
      gctx.drawImage(gloss, 0, 0);
      gctx.globalCompositeOperation = 'source-over';
    };
    layers.current = { redraw };
    redraw(live.current.strokes);

    // Ambient life, nothing that drives away: the strike sign, dust in the light.
    const dust = Array.from({ length: 14 }, () => ({ x: Math.random() * PW, y: Math.random() * 100, v: 0.02 + Math.random() * 0.05 }));
    const puffs: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
    let anticipate = false;
    let t = 0;
    let nextHint = 2.5;
    let pointer: { x: number; y: number } | null = null;
    const ring = { x: 0, y: 0, until: 0 };

    // Spraying
    let current: Stroke | null = null;
    let runs: Stroke[] = [];
    let spent = 0;
    let drip: { stroke: Stroke; timer: ReturnType<typeof setTimeout> | null; grow: ReturnType<typeof setInterval> | null } | null = null;
    const liveList = () => [...live.current.strokes, ...runs, ...(current ? [current] : []), ...(drip ? [drip.stroke] : [])];
    const stopDrip = (keep = true) => {
      if (!drip) return;
      if (drip.timer) clearTimeout(drip.timer);
      if (drip.grow) clearInterval(drip.grow);
      if (keep && drip.stroke.p.length > 2) { spent += strokeCost(drip.stroke); runs.push(drip.stroke); }
      drip = null;
    };
    const armDrip = (x: number, y: number) => {
      stopDrip();
      const stroke: Stroke = { c: live.current.mine, w: 1, p: [x, y], d: 1 };
      const d = { stroke, timer: null as ReturnType<typeof setTimeout> | null, grow: null as ReturnType<typeof setInterval> | null };
      d.timer = setTimeout(() => {
        d.grow = setInterval(() => {
          const len = stroke.p.length > 2 ? stroke.p[3] - y : 0;
          if (len > 12 || spent + strokeCost(stroke) >= live.current.left || !onBody(x, y + len + 1)) { if (d.grow) clearInterval(d.grow); return; }
          stroke.p = [x, y, x, y + len + 1];
          redraw(liveList());
        }, 90);
      }, 380);
      drip = d;
    };
    let screen = { x: 0, y: 0 };
    const toPixel = (e: PointerEvent) => {
      const frame = view.parentElement?.getBoundingClientRect();
      if (frame) screen = { x: e.clientX - frame.left, y: e.clientY - frame.top };
      const r = view.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * PW, ((e.clientY - r.top) / r.height) * PH] as [number, number];
    };
    const down = (e: PointerEvent) => {
      if (!live.current.spraying) return;
      const [x, y] = toPixel(e);
      pointer = { x, y };
      if (live.current.left <= 0.5 || live.current.strokes.length >= LIMITS.strokes) { live.current.onEmpty(); return; }
      const own = live.current.slot;
      if (own && (x < own.x - 2 || x > own.x + own.w + 2 || y < own.y - 2 || y > own.y + own.h + 2)) return;
      try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
      e.preventDefault();
      spent = 0; runs = [];
      current = { c: live.current.mine, w: BRUSH, p: [x, y] };
      armDrip(x, y);
      redraw(liveList());
    };
    const move = (e: PointerEvent) => {
      if (!live.current.spraying) return;
      const [x, y] = toPixel(e);
      pointer = { x, y };
      if (!current) return;
      const total = live.current.strokes.reduce((n, s) => n + s.p.length / 2, 0);
      if (total + current.p.length / 2 >= LIMITS.points) return;
      const [lx, ly] = current.p.slice(-2);
      if (Math.hypot(x - lx, y - ly) < 0.8) return;
      if (spent + strokeCost({ ...current, p: [...current.p, x, y] }) >= live.current.left) { live.current.onEmpty(); return; }
      stopDrip();
      current.p.push(x, y);
      armDrip(x, y);
      redraw(liveList());
    };
    const up = () => {
      pointer = null;
      if (!current && !drip) return;
      const d = drip;
      if (d) { if (d.timer) clearTimeout(d.timer); if (d.grow) clearInterval(d.grow); }
      const add = [...runs, ...(current ? [current] : []), ...(d && d.stroke.p.length > 2 ? [d.stroke] : [])];
      drip = null; current = null; runs = [];
      if (add.length) live.current.onChange([...live.current.strokes, ...add]);
    };
    view.addEventListener('pointerdown', down);
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    ext.current.onLink?.({ anticipate: on => { anticipate = on; } });

    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '40px' });
    io.observe(view);
    let raf = 0;
    let last = performance.now();
    const signText = ' !  !  !  ';
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0);
      // The sign: amber dots scrolling, or "!!!" while you press the button
      const s = scene.sign;
      ctx.fillStyle = '#060606'; ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, 11);
      ctx.fillStyle = '#2B2D32'; ctx.fillRect(s.x - 2, s.y - 3, s.w + 4, 1);
      const offset = reduce ? 0 : Math.floor(t * 14) % (signText.length * 6);
      if (anticipate) ledText(ctx, '!!!', s.x + s.w / 2 - 9, s.y, '#FFB12E', '#24170A');
      else {
        ledText(ctx, ' '.repeat(Math.ceil(s.w / 6) + 1), s.x, s.y, '#FFB12E', '#24170A', { x: s.x, w: s.w });
        ledText(ctx, signText + signText, s.x - offset, s.y, '#FFB12E', undefined, { x: s.x, w: s.w });
      }
      ctx.drawImage(veh, 0, 0);
      ctx.drawImage(graf, 0, 0);
      // Spraying: everything but your panel steps back, and the panel's edge
      // marches, so you know where your paint will land.
      const own = live.current.slot;
      if (live.current.spraying && own) {
        ctx.fillStyle = 'rgba(8,9,11,0.55)';
        ctx.fillRect(0, 0, PW, own.y); ctx.fillRect(0, own.y + own.h, PW, PH - own.y - own.h);
        ctx.fillRect(0, own.y, own.x, own.h); ctx.fillRect(own.x + own.w, own.y, PW - own.x - own.w, own.h);
        const march = reduce ? 0 : Math.floor(t * 8);
        const edge: [number, number][] = [];
        for (let x = own.x - 1; x <= own.x + own.w; x++) edge.push([x, own.y - 1]);
        for (let y = own.y; y <= own.y + own.h; y++) edge.push([own.x + own.w, y]);
        for (let x = own.x + own.w - 1; x >= own.x - 1; x--) edge.push([x, own.y + own.h]);
        for (let y = own.y + own.h - 1; y >= own.y; y--) edge.push([own.x - 1, y]);
        edge.forEach(([x, y], k) => { ctx.fillStyle = (k + march) % 4 < 2 ? live.current.mine : 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, 1, 1); });
      }
      // Headlights flash while you touch the button
      if (anticipate && Math.floor(t * 8) % 2 === 0) scene.lamps.forEach(([lx, ly]) => { ctx.fillStyle = '#FFF4D0'; ctx.fillRect(lx - 2, ly - 1, 5, 3); });
      ctx.drawImage(fg, 0, 0);
      // Dust
      if (!reduce) dust.forEach(d => { d.y += d.v; d.x += Math.sin(t + d.y) * 0.03; if (d.y > 104) { d.y = 0; d.x = Math.random() * PW; } ctx.fillStyle = 'rgba(255,220,170,0.35)'; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); });
      // An unspoken invitation: a puff from where the button is
      if (!reduce && !ext.current.marked && !live.current.spraying && t > nextHint) {
        nextHint = t + 7;
        const c = colourFor(`${seed}|hint|${Math.floor(t)}`);
        const to = live.current.slot ?? { x: PW / 2, y: PH / 2, w: 0, h: 0 };
        const tx0 = to.x + to.w / 2, ty0 = to.y + to.h / 2;
        for (let i = 0; i < 26; i++) puffs.push({ x: PW - 30 + Math.random() * 6, y: PH - 4, vx: (tx0 - PW + 30) * (0.9 + Math.random() * 0.3), vy: (ty0 - PH) * (0.9 + Math.random() * 0.3), life: 0.55 + Math.random() * 0.2, c });
        ext.current.onHint?.();
      }
      // While spraying: mist at the nozzle.
      if (live.current.spraying && pointer) {
        ring.until = t + 0.9;
        if (current) for (let i = 0; i < 2; i++) puffs.push({ x: pointer.x + (Math.random() - 0.5) * 2, y: pointer.y + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 0.15, c: live.current.mine });
      }
      // The paint gauge: a thick arc to the left of your finger, like a
      // stamina bar in a game, out from under the thumb. It drains as you
      // spray, flashes when nearly empty, fades shortly after you lift.
      const g = gauge.current;
      if (g) {
        const on = live.current.spraying && t < ring.until;
        const level = Math.max(0, (live.current.left - spent - (current ? strokeCost(current) : 0)) / PAINT);
        const low = level < 0.2;
        g.style.opacity = on ? String(Math.min(1, (ring.until - t) / 0.3)) : '0';
        if (on) {
          g.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
          const fill = g.querySelector<SVGPathElement>('[data-level]');
          if (fill) { fill.style.strokeDasharray = `${level} 1`; fill.style.stroke = low ? (Math.floor(t * 6) % 2 ? '#FF5C5C' : '#FF9A9A') : live.current.mine; }
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) { puffs.splice(i, 1); continue; }
        ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life * 3); ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); ctx.globalAlpha = 1;
      }
      ctx.drawImage(edges, 0, 0);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      stopDrip(false);
      view.removeEventListener('pointerdown', down);
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
      view.removeEventListener('pointercancel', up);
      ext.current.onLink?.(null);
      layers.current = null;
    };
  }, [scene, tags, seed, mode, reduce]);

  useEffect(() => { layers.current?.redraw(strokes); }, [strokes, tags, doodle.marked, mine, slot]);
  useEffect(() => { if (canvas.current) canvas.current.style.touchAction = spraying ? 'none' : 'pan-y'; }, [spraying]);

  const pct = Math.round((left / PAINT) * 100);
  // Zoom so your panel fills most of the frame, kept inside the scene.
  const zoom = (() => {
    if (!spraying || !slot) return { x: '0%', y: '0%', scale: 1 };
    const s = Math.max(2, Math.min(4, Math.min(PW / slot.w, PH / slot.h) * 0.7));
    const fx = (slot.x + slot.w / 2) / PW, fy = (slot.y + slot.h / 2) / PH;
    const clamp = (v: number) => Math.min(0, Math.max(1 - s, v));
    return { x: `${clamp(0.5 - fx * s) * 100}%`, y: `${clamp(0.5 - fy * s) * 100}%`, scale: s };
  })();
  const caption = !doodle.loaded ? null
    : spraying ? (empty || left <= 0.5 ? tx(lang, '这罐漆用完了', 'This can is empty') : tx(lang, '这块车身归你：喷几笔，把火气留在车上', 'This panel is yours: spray, and leave your anger on the train'))
      : doodle.marked ? tx(lang, `你的涂鸦和 ${others} 人的一起留在车上`, `Your mark is on it, with ${others} others`) : null;

  return (
    <div className="relative overflow-hidden rounded-[20px]" style={{ background: '#0E0F12' }}>
      <div className="relative overflow-hidden" style={{ aspectRatio: `${PW} / ${PH}` }}>
        <motion.canvas ref={canvas} width={PW} height={PH} className="block w-full" initial={false} animate={zoom} transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE }}
          style={{ aspectRatio: `${PW} / ${PH}`, imageRendering: 'pixelated', cursor: spraying ? 'crosshair' : 'default', transformOrigin: '0 0' }} />
        {/* Zoomed in, the frame fades out on every side, as the scene's own sides do */}
        <motion.span aria-hidden className="absolute inset-0 pointer-events-none" initial={false} animate={{ opacity: spraying ? 1 : 0 }} transition={{ duration: 0.4 }}
          style={{ background: 'linear-gradient(180deg, #0E0F12 0%, rgba(14,15,18,0) 16%, rgba(14,15,18,0) 84%, #0E0F12 100%), linear-gradient(90deg, #0E0F12 0%, rgba(14,15,18,0) 10%, rgba(14,15,18,0) 90%, #0E0F12 100%)' }} />
        <div ref={gauge} aria-hidden className="absolute left-0 top-0 pointer-events-none" style={{ opacity: 0, transition: 'opacity 0.2s' }}>
          <svg width="96" height="96" viewBox="-48 -48 96 96" className="absolute -left-12 -top-12 overflow-visible">
            <path d={ARC} fill="none" stroke="rgba(10,11,13,0.55)" strokeWidth="9" strokeLinecap="round" />
            <path d={ARC} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6" strokeLinecap="round" pathLength={1} />
            <path data-level d={ARC} fill="none" stroke={mine} strokeWidth="6" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: '1 1' }} />
          </svg>
        </div>
      </div>
      {doodle.loaded && !spraying && (
        <span className={`absolute left-3 top-3 h-7 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 tabular-nums ${TYPE.caption}`} style={{ background: 'rgba(10,11,13,0.6)', color: C.text, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <span className="flex">{['#FF4FA3', '#38D9F5', '#FFD93D'].map(c => <i key={c} className="w-[6px] h-[6px] -mr-[1px]" style={{ background: c }} />)}</span>
          {tx(lang, `已有 ${doodle.count} 人在车上涂鸦`, `Sprayed by ${doodle.count} people`)}
        </span>
      )}
      {(caption || (!spraying && doodle.marked && left > 0.5)) && (
        <div className="px-4 pt-2 pb-1 flex items-center justify-center gap-2 text-center">
          {caption && <p className={TYPE.label} style={{ color: empty ? color.main : C.text2 }}>{caption}</p>}
          {!spraying && doodle.marked && left > 0.5 && (
            <button onClick={onOpen} className={`shrink-0 h-7 px-2.5 rounded-full ${TYPE.caption} font-semibold`} style={{ background: C.surface3, color: '#FFFFFF' }}>
              {saved.length ? tx(lang, `继续喷 · 剩 ${pct}%`, `Spray more · ${pct}%`) : tx(lang, '拿起喷罐', 'Pick up the can')}
            </button>
          )}
        </div>
      )}
      {/* While spraying, the card's two buttons become the can's two: the
          same size and places, so the hand doesn't have to look for them. */}
      <div className="p-2.5 pt-2">
        {spraying ? (
          <div className="flex gap-2.5">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setDraft(d => (d ?? saved).slice(0, -1))} disabled={!strokes.length} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 disabled:opacity-40 ${TYPE.action}`} style={TONAL}>
              <ArrowCounterClockwise size={17} weight="bold" />{tx(lang, '撤销一笔', 'Undo')}
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => finish()} disabled={saving} className={`flex-[1.35] h-12 rounded-[14px] flex items-center justify-center gap-1.5 disabled:opacity-60 ${TYPE.action}`} style={FILLED(color.deep)}>
              <Check size={17} weight="bold" />{saving ? tx(lang, '保存中…', 'Saving…') : tx(lang, `喷好了 · 余漆 ${pct}%`, `Done · ${pct}% left`)}
            </motion.button>
          </div>
        ) : footer}
      </div>
    </div>
  );
}
