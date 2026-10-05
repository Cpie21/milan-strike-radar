'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { tx, type Lang, type Mode } from '../../../lib/lab/model';
import { rng, SYMBOLS, type SymbolKind } from '../graffitiMarks';
import { colourFor, LIMITS, loadDrawing, myColour, paintLeft, PAINT, strokeCost, uploadDrawing, type Stroke } from '../graffitiStore';
import { C, EASE, MODE_COLOR, TYPE } from '../theme';
import { boxBlur, ledText, PH, PW, sceneFor, type Scene } from './pixelScene';

// The wall, in pixels. The vehicle is parked (it is a strike), everyone's
// marks are on it, and the button below hands you one can of paint in your
// own colour. Spray lands only on the body, as hard pixels with a dithered
// edge; hold still and it drips; when the can is empty you are done.

type Phase = 'idle' | 'spray';
type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };
export type WallLink = { anticipate: (on: boolean) => void };

const BRUSH = 1.4; // thin enough that many people's lines still read as lines
const KINDS = Object.keys(SYMBOLS) as SymbolKind[];

type PixelTag = { kind: SymbolKind; x: number; y: number; s: number; r: number; color: string };

// Others' marks on a jittered grid over the body; your spot stays free.
function placeTags(scene: Scene, seed: string, count: number): PixelTag[] {
  const { x0, y0, x1, y1 } = scene.body;
  const rand = rng(seed);
  const cols = 6;
  const rows = y1 - y0 > 40 ? 2 : 1;
  const cw = (x1 - x0) / cols;
  const ch = (y1 - y0) / rows;
  const cells = Array.from({ length: cols * rows }, (_, i) => ({ x: x0 + (i % cols + 0.5) * cw, y: y0 + (Math.floor(i / cols) + 0.5) * ch }))
    .filter(c => Math.hypot(c.x - scene.spot.x, c.y - scene.spot.y) > cw * 0.8)
    .map(c => ({ c, k: rand() })).sort((a, b) => a.k - b.k).map(({ c }) => c);
  return cells.slice(0, Math.min(count, cells.length)).map((c, i) => ({
    kind: KINDS[Math.floor(rand() * KINDS.length)],
    x: c.x + (rand() - 0.5) * cw * 0.3, y: c.y + (rand() - 0.5) * ch * 0.2,
    s: 0.42 + rand() * 0.14, r: (rand() - 0.5) * 0.5,
    color: colourFor(`${seed}|${i}`),
  }));
}

// A spray stamp: a solid core and a dithered fringe, in whole pixels.
function stamp(g: CanvasRenderingContext2D, x: number, y: number, w: number, rand: () => number) {
  const R = Math.ceil(w + 1.5);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= w * 0.8 || (d <= w + 1.3 && rand() < 0.28)) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
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
  const tags = useMemo(() => placeTags(scene, seed, others), [scene, seed, others]);

  const live = useRef({ strokes, left, spraying, mine, onChange: (s: Stroke[]) => setDraft(s), onEmpty: () => {} });
  const ext = useRef({ onHint, onLink, marked: doodle.marked });
  useLayoutEffect(() => {
    live.current = { strokes, left, spraying, mine, onChange: s => setDraft(s), onEmpty: () => { setEmpty(true); setTimeout(() => setEmpty(false), 1600); } };
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
    const [graf, gctx] = make();
    const [tagLayer, tctx] = make();
    const [paintAlpha, pactx] = make();

    const redraw = (list: Stroke[]) => {
      // Tags: drawn smooth, then thresholded into hard pixels.
      tctx.clearRect(0, 0, PW, PH);
      const all = [...tags, ...(ext.current.marked && !list.length ? [{ kind: 'angry' as SymbolKind, x: scene.spot.x, y: scene.spot.y, s: 0.5, r: 0, color: live.current.mine }] : [])];
      all.forEach(t => {
        const sym = SYMBOLS[t.kind];
        const path = new Path2D(sym.d);
        tctx.save();
        tctx.translate(t.x, t.y); tctx.rotate(t.r); tctx.scale(t.s, t.s);
        tctx.lineCap = 'round'; tctx.lineJoin = 'round';
        tctx.strokeStyle = '#141517'; tctx.lineWidth = sym.w + 4.5; tctx.stroke(path);
        tctx.strokeStyle = t.color; tctx.lineWidth = sym.w + 1.2; tctx.stroke(path);
        tctx.restore();
      });
      const img = tctx.getImageData(0, 0, PW, PH);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 110 ? 255 : 0;
      tctx.putImageData(img, 0, 0);
      gctx.clearRect(0, 0, PW, PH);
      // Older marks are a little weathered; yours are fresh.
      gctx.globalAlpha = 0.85;
      gctx.drawImage(tagLayer, 0, 0);
      gctx.globalAlpha = 1;
      list.forEach((s, i) => paintStroke(gctx, s, i));
      gctx.globalCompositeOperation = 'destination-in';
      gctx.drawImage(mask, 0, 0);
      gctx.globalCompositeOperation = 'source-over';
      // A dark keyline around every painted area: scribbles read as pieces.
      const painted = gctx.getImageData(0, 0, PW, PH);
      const a = painted.data;
      const line: number[] = [];
      for (let y = 1; y < PH - 1; y++) for (let x = 1; x < PW - 1; x++) {
        const i = (y * PW + x) * 4;
        if (a[i + 3] > 0 || !onBody(x, y)) continue;
        if (a[i + 3 - 4] > 0 || a[i + 3 + 4] > 0 || a[i + 3 - PW * 4] > 0 || a[i + 3 + PW * 4] > 0) line.push(i);
      }
      line.forEach(i => { a[i] = 18; a[i + 1] = 19; a[i + 2] = 23; a[i + 3] = 200; });
      gctx.putImageData(painted, 0, 0);
      // Paint takes the body's light: multiply, then keep only painted pixels.
      pactx.clearRect(0, 0, PW, PH);
      pactx.drawImage(graf, 0, 0);
      gctx.globalCompositeOperation = 'multiply';
      gctx.drawImage(light, 0, 0);
      gctx.globalCompositeOperation = 'destination-in';
      gctx.drawImage(paintAlpha, 0, 0);
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
    const toPixel = (e: PointerEvent) => {
      const r = view.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * PW, ((e.clientY - r.top) / r.height) * PH] as [number, number];
    };
    const down = (e: PointerEvent) => {
      if (!live.current.spraying) return;
      const [x, y] = toPixel(e);
      pointer = { x, y };
      if (live.current.left <= 0.5 || live.current.strokes.length >= LIMITS.strokes) { live.current.onEmpty(); return; }
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
    const signText = 'SCIOPERO · SCIOPERO · ';
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
      // Headlights flash while you touch the button
      if (anticipate && Math.floor(t * 8) % 2 === 0) scene.lamps.forEach(([lx, ly]) => { ctx.fillStyle = '#FFF4D0'; ctx.fillRect(lx - 2, ly - 1, 5, 3); });
      ctx.drawImage(fg, 0, 0);
      // Dust
      if (!reduce) dust.forEach(d => { d.y += d.v; d.x += Math.sin(t + d.y) * 0.03; if (d.y > 104) { d.y = 0; d.x = Math.random() * PW; } ctx.fillStyle = 'rgba(255,220,170,0.35)'; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); });
      // An unspoken invitation: a puff from where the button is
      if (!reduce && !ext.current.marked && !live.current.spraying && t > nextHint) {
        nextHint = t + 7;
        const c = colourFor(`${seed}|hint|${Math.floor(t)}`);
        for (let i = 0; i < 26; i++) puffs.push({ x: PW - 30 + Math.random() * 6, y: PH - 4, vx: (scene.spot.x - PW + 30) * (0.9 + Math.random() * 0.3), vy: (scene.spot.y - PH) * (0.9 + Math.random() * 0.3), life: 0.55 + Math.random() * 0.2, c });
        ext.current.onHint?.();
      }
      // While spraying: mist from the can to the body, and the can itself
      // The paint gauge lives by your finger, like a stamina wheel: a ring
      // that drains as you spray, flashes when nearly empty, and fades out
      // shortly after you lift.
      if (live.current.spraying && pointer) {
        ring.x = pointer.x; ring.y = pointer.y; ring.until = t + 0.9;
        if (current) for (let i = 0; i < 3; i++) puffs.push({ x: pointer.x + (Math.random() - 0.5) * 3, y: pointer.y + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, life: 0.18, c: live.current.mine });
      }
      if (live.current.spraying && t < ring.until) {
        const level = Math.max(0, (live.current.left - spent - (current ? strokeCost(current) : 0)) / PAINT);
        const fadeOut = Math.min(1, (ring.until - t) / 0.3);
        const low = level < 0.2;
        const cx = Math.round(ring.x - 13), cy = Math.round(ring.y - 13);
        for (let k = 0; k < 40; k++) {
          const ang = -Math.PI / 2 + (k / 40) * Math.PI * 2;
          const px = Math.round(cx + Math.cos(ang) * 6), py = Math.round(cy + Math.sin(ang) * 6);
          const filled = k / 40 < level;
          ctx.globalAlpha = fadeOut * (filled ? (low && Math.floor(t * 6) % 2 ? 0.45 : 1) : 0.35);
          ctx.fillStyle = filled ? (low ? '#FF5C5C' : live.current.mine) : '#0B0C0E';
          ctx.fillRect(px, py, 1, 1);
          ctx.fillStyle = filled ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)';
          ctx.fillRect(Math.round(cx + Math.cos(ang) * 7), Math.round(cy + Math.sin(ang) * 7), 1, 1);
        }
        ctx.globalAlpha = 1;
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

  useEffect(() => { layers.current?.redraw(strokes); }, [strokes, tags, doodle.marked, mine]);
  useEffect(() => { if (canvas.current) canvas.current.style.touchAction = spraying ? 'none' : 'pan-y'; }, [spraying]);

  const pct = Math.round((left / PAINT) * 100);
  const caption = !doodle.loaded ? null
    : spraying ? (empty || left <= 0.5 ? tx(lang, '这罐漆用完了', 'This can is empty') : tx(lang, '在车身上拖动来喷，按住不动会流下漆痕', 'Drag on the body to spray; hold still and it drips'))
      : doodle.marked ? tx(lang, `你的涂鸦和 ${others} 人的一起留在车上`, `Your mark is on it, with ${others} others`) : null;

  return (
    <div className="relative overflow-hidden rounded-[20px]" style={{ background: '#0E0F12' }}>
      <canvas ref={canvas} width={PW} height={PH} className="block w-full" style={{ aspectRatio: `${PW} / ${PH}`, imageRendering: 'pixelated', cursor: spraying ? 'crosshair' : 'default' }} />
      {doodle.loaded && !spraying && (
        <span className={`absolute left-3 top-3 h-7 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 tabular-nums ${TYPE.caption}`} style={{ background: 'rgba(10,11,13,0.6)', color: C.text, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <span className="flex">{['#FF4FA3', '#38D9F5', '#FFD93D'].map(c => <i key={c} className="w-[6px] h-[6px] -mr-[1px]" style={{ background: c }} />)}</span>
          {tx(lang, `已有 ${doodle.count} 人在车上涂鸦`, `Sprayed by ${doodle.count} people`)}
        </span>
      )}
      <AnimatePresence initial={false}>
        {spraying && (
          <motion.div key="tools" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
            <div className="px-3 pt-2.5 pb-1 flex items-center gap-2.5">
              {/* Your colour and what's left in the can, as pixel cells */}
              <span className="flex items-center gap-1.5">
                <i className="w-3 h-3" style={{ background: mine }} />
                <span className="flex gap-[2px]" aria-label={tx(lang, `余量 ${pct}%`, `${pct}% left`)}>
                  {Array.from({ length: 10 }, (_, i) => <i key={i} className="w-[5px] h-3" style={{ background: i < Math.ceil(pct / 10) ? mine : '#2A2C31' }} />)}
                </span>
              </span>
              <button aria-label={tx(lang, '撤销', 'Undo')} onClick={() => setDraft(d => (d ?? saved).slice(0, -1))} disabled={!strokes.length} className="ml-auto w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-35" style={{ background: C.surface3, color: '#FFFFFF' }}>
                <ArrowCounterClockwise size={16} weight="bold" />
              </button>
              <button onClick={() => finish()} disabled={saving} className={`h-9 px-4 rounded-full flex items-center gap-1.5 whitespace-nowrap ${TYPE.label} font-semibold disabled:opacity-60`} style={{ background: color.deep, color: '#FFFFFF' }}>
                <Check size={14} weight="bold" />{saving ? tx(lang, '保存中…', 'Saving…') : tx(lang, '完成', 'Done')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
      {footer && <div className="p-2.5 pt-2">{footer}</div>}
    </div>
  );
}
