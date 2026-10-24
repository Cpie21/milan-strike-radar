'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { tx, type Lang, type Mode } from '../../../lib/lab/model';
import { claimPanel, colourFor, LIMITS, loadDrawing, loadWall, myColour, paintLeft, PAINT, savePiece, strokeCost, uploadDrawing, type Piece, type Stroke } from '../graffitiStore';
import { C, EASE, FILLED, MODE_COLOR, TONAL, TYPE } from '../theme';
import { boxBlur, PH, PW, sceneFor } from './pixelScene';
import { assignSlot, slotsFor, type Slot } from './slots';
import { paintTag, tagsFor } from './tags';
import { GLYPH_ROWS, glyphColumns } from './pixelFont';

// The wall. The vehicle is a pixel scene (parked: it is a strike); the
// paint on it is real spray paint, drawn at three times the scene's
// resolution with soft edges, overspray and drips, and lit by the vehicle
// (seams, glass and shadow show through, its shine lies over the paint).
// Others' pieces are already on it; the button below hands you one can in
// your own colour and one panel of the body (slots.ts). Picking up the can
// zooms into your panel; when the can is empty, or you say done, that's it.

type Phase = 'idle' | 'spray';
type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };
export type WallLink = { anticipate: (on: boolean) => void };

const K = 3; // paint resolution over the pixel scene
const MARGIN = 5; // wall px a piece may run past its panel, so neighbours meet like paint, not tiles
const DW = PW * K, DH = PH * K;
const BRUSH = 1.5; // wall pixels: a can's line, not a pen's
// Speed (wall px/ms) to line width: slow and full, fast and fine; in steps.
const widthFor = (v: number) => Number((Math.round(Math.max(1, Math.min(2.2, 2.3 - v * 5.5)) / 0.3) * 0.3).toFixed(1));
// The gauge's arc: the left third of a circle around the fingertip.
const ARC = (() => { const r = 38, a0 = (215 * Math.PI) / 180, a1 = (145 * Math.PI) / 180; return `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 0 0 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`; })();
const ART: Record<Mode, string> = { SUBWAY: 'metro', TRAIN: 'train', BUS: 'bus', AIRPORT: 'plane' };

function deviceId() {
  try { return localStorage.getItem('lab_device_id') || 'anon'; } catch { return 'anon'; }
}

// How many old pieces a wall starts with, the same on every device.
function seededCount(mode: Mode, seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return mode === 'AIRPORT' ? 3 + (h % 2) : 9 + (h % 4);
}

// Your panel for this strike: claimed once, then kept. Until the server holds
// claims (AI_HANDOFF: graffiti slots), the others are simulated as having
// taken the first panels in centre-out order, as they would have.
function mySlot(slots: Slot[], storeKey: string, others: number): Slot {
  const key = `graffiti_slot2_${storeKey}`;
  try {
    const kept = Number(localStorage.getItem(key));
    if (localStorage.getItem(key) !== null && slots[kept]) return slots[kept];
  } catch { /* storage blocked */ }
  const taken = new Map(slots.slice(0, Math.min(others, slots.length - 1)).map((s, k) => [s.i, k]));
  const slot = assignSlot(slots, taken, deviceId());
  try { localStorage.setItem(key, String(slot.i)); } catch { /* storage blocked */ }
  return slot;
}

// Drawn art for the vehicle (docs/design/pixel-brief), when it exists.
// Loaded once per mode for the whole page, so a day you come back to has it.
type Art = { veh: HTMLImageElement | null; mask: HTMLImageElement | null };
const NO_ART: Art = { veh: null, mask: null };
const artLoaded = new Map<Mode, Art>();
const artLoading = new Map<Mode, Promise<Art>>();
function loadArt(mode: Mode) {
  if (!artLoading.has(mode)) {
    const load = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    artLoading.set(mode, Promise.all([load(`/lab/wall/${ART[mode]}.png`), load(`/lab/wall/${ART[mode]}-mask.png`)]).then(([veh, mask]) => {
      const art = veh || mask ? { veh, mask } : NO_ART;
      artLoaded.set(mode, art);
      return art;
    }));
  }
  return artLoading.get(mode)!;
}
// `null` until known (drawn art or none): the wall is built once, not twice.
// A wall not built yet waits for the day's slide to finish, so the slide
// never stalls on it; one already built is there at once.
const layerKey = (mode: Mode, art: Art) => `${mode}|${art.veh ? 'art' : 'code'}`;
function useArt(mode: Mode) {
  const [art, setArt] = useState<Art | null>(() => { const a = artLoaded.get(mode); return a && layerCache.has(layerKey(mode, a)) ? a : null; });
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    loadArt(mode).then(a => {
      if (!alive) return;
      if (layerCache.has(layerKey(mode, a))) setArt(a);
      else timer = setTimeout(() => { if (alive) setArt(a); }, 420);
    });
    return () => { alive = false; clearTimeout(timer); };
  }, [mode]);
  return art;
}

// The static layers of a scene: built once per vehicle and kept for the
// page, so switching between days only has to compose them.
type Layers = { bgHi: HTMLCanvasElement; vehHi: HTMLCanvasElement; fgHi: HTMLCanvasElement; maskHi: HTMLCanvasElement; lightHi: HTMLCanvasElement; glossHi: HTMLCanvasElement; maskData: Uint8ClampedArray };
const layerCache = new Map<string, Layers>();
const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })!] as const; };
let grainCanvas: HTMLCanvasElement | null = null;
// Paint on metal is never flat: one faint mottle, shared by every wall.
function grain() {
  if (grainCanvas) return grainCanvas;
  const [c, g] = canvasOf(DW, DH);
  const img = g.createImageData(DW, DH);
  for (let i = 0; i < img.data.length; i += 4) { const v = 225 + Math.floor(Math.random() * 30); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return (grainCanvas = c);
}
// Composed paint per wall, so a day you come back to is there at once.
const paintCache = new Map<string, HTMLCanvasElement>();
// While the days slide, walls hold their last frame instead of animating.
let holdUntil = 0;
export function holdWalls(ms: number) { holdUntil = performance.now() + ms; }

function layersFor(mode: Mode, scene: ReturnType<typeof sceneFor>, art: Art): Layers {
  const key = layerKey(mode, art);
  const hit = layerCache.get(key);
  if (hit) return hit;
  const make = (w = PW, h = PH) => canvasOf(w, h);
  const [bg, bctx] = make();
  scene.background(bctx);
  const [nb, nctx] = make();
  scene.neighbours(nctx);
  boxBlur(nctx, 2);
  bctx.drawImage(nb, 0, 0);
  const [veh, vctx] = make();
  if (art.veh) vctx.drawImage(art.veh, 0, 0, PW, PH); else scene.vehicle(vctx);
  const [mask, mctx] = make();
  scene.mask(mctx);
  if (art.mask) { mctx.clearRect(0, 0, PW, PH); mctx.drawImage(art.mask, 0, 0, PW, PH); }
  else if (art.veh) { mctx.globalCompositeOperation = 'destination-in'; mctx.drawImage(art.veh, 0, 0, PW, PH); mctx.globalCompositeOperation = 'source-over'; }
  const [fg, fctx] = make();
  scene.foreground(fctx);
  // How lit the body is at each point, so paint sits *on* it: seams, frames
  // and glass darken the paint over them. Smoothed when scaled up.
  const [light, lctx] = make();
  const [gloss, glctx] = make();
  {
    const v = vctx.getImageData(0, 0, PW, PH);
    const lo = lctx.createImageData(PW, PH), go = glctx.createImageData(PW, PH);
    for (let i = 0; i < v.data.length; i += 4) {
      const l = (v.data[i] * 0.3 + v.data[i + 1] * 0.59 + v.data[i + 2] * 0.11) / 255;
      const k = Math.min(255, Math.round(255 * Math.min(1, 0.38 + l * 1.2)));
      lo.data[i] = lo.data[i + 1] = lo.data[i + 2] = k; lo.data[i + 3] = 255;
      if (l > 0.7) { go.data[i] = 255; go.data[i + 1] = 246; go.data[i + 2] = 228; go.data[i + 3] = Math.round(((l - 0.7) / 0.3) * 90); }
    }
    lctx.putImageData(lo, 0, 0); glctx.putImageData(go, 0, 0);
  }
  // High-res layers: the scene scaled up in hard pixels, the paint in soft.
  const up = (src: HTMLCanvasElement, smooth: boolean) => { const [c, g] = make(DW, DH); g.imageSmoothingEnabled = smooth; g.drawImage(src, 0, 0, DW, DH); return c; };
  const layers = { bgHi: up(bg, false), vehHi: up(veh, false), fgHi: up(fg, false), maskHi: up(mask, false), lightHi: up(light, true), glossHi: up(gloss, true), maskData: mctx.getImageData(0, 0, PW, PH).data };
  layerCache.set(key, layers);
  return layers;
}

// A stroke as a can lays it: a solid core, a soft overspray halo, round ends.
function paintStroke(g: CanvasRenderingContext2D, s: Stroke) {
  g.save();
  g.strokeStyle = s.c; g.fillStyle = s.c; g.lineCap = 'round'; g.lineJoin = 'round';
  if (s.d) {
    const [x, y, , y2] = s.p;
    const end = (y2 ?? y) * K;
    g.lineWidth = K * 0.7;
    g.beginPath(); g.moveTo(x * K, y * K); g.lineTo(x * K, end); g.stroke();
    g.beginPath(); g.ellipse(x * K, end + K * 0.3, K * 0.55, K * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    return;
  }
  const path = new Path2D();
  path.moveTo(s.p[0] * K, s.p[1] * K);
  if (s.p.length === 2) path.lineTo(s.p[0] * K + 0.01, s.p[1] * K);
  for (let i = 2; i < s.p.length; i += 2) {
    const mx = ((s.p[i - 2] + s.p[i]) / 2) * K, my = ((s.p[i - 1] + s.p[i + 1]) / 2) * K;
    path.quadraticCurveTo(s.p[i - 2] * K, s.p[i - 1] * K, mx, my);
  }
  path.lineTo(s.p[s.p.length - 2] * K, s.p[s.p.length - 1] * K);
  g.globalAlpha = 0.35; g.shadowColor = s.c; g.shadowBlur = K * 2.4; g.lineWidth = s.w * K * 1.5; g.stroke(path);
  g.globalAlpha = 1; g.shadowBlur = K * 0.8; g.lineWidth = s.w * K; g.stroke(path);
  g.restore();
}

export default function PixelWall({ mode, seed, storeKey, doodle, lang, open, onOpen, onClose, onLink, onHint, footer, note }: {
  mode: Mode; seed: string; storeKey: string; doodle: Doodle; lang: Lang; open: boolean; onOpen: () => void; onClose: () => void;
  onLink?: (link: WallLink | null) => void; onHint?: () => void; footer?: React.ReactNode; note?: string;
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
  const done = saved.length > 0; // one can per strike: once it's up, it's up
  const others = Math.max(doodle.count - (doodle.marked ? 1 : 0), 0);
  const scene = useMemo(() => sceneFor(mode, color.main), [mode, color.main]);
  const slots = useMemo(() => slotsFor(scene.body), [scene]);
  const art = useArt(mode);
  const [slot, setSlot] = useState<Slot | null>(null);
  // Claimed once the count is known, so the simulated claims are right.
  useEffect(() => {
    if (!doodle.loaded) return;
    const t = setTimeout(() => setSlot(mySlot(slots, storeKey, others)), 0);
    return () => clearTimeout(t);
  }, [slots, storeKey, others, doodle.loaded]);
  // The shared wall: everyone's real pieces, when the server keeps them.
  const [wall, setWall] = useState<{ available: boolean; pieces: Piece[] }>({ available: false, pieces: [] });
  const pieces = useMemo(() => wall.pieces.filter(p => !p.mine && p.strokes.length), [wall]);
  // A wall is never bare: it starts with its own seeded set of old pieces,
  // the same for everyone (more on buses, trains and metros, a couple on a
  // plane), and real pieces take their place as people spray.
  const tags = useMemo(() => tagsFor(seed, Math.max(0, seededCount(mode, seed) - pieces.length), scene.body, K), [seed, mode, pieces.length, scene]);

  const live = useRef({ strokes, left, spraying, mine, slot, pieces, onChange: (s: Stroke[]) => setDraft(s), onEmpty: () => {} });
  const ext = useRef({ onHint, onLink, marked: doodle.marked });
  useLayoutEffect(() => {
    live.current = { strokes, left, spraying, mine, slot, pieces, onChange: s => setDraft(s), onEmpty: () => { setEmpty(true); setTimeout(() => setEmpty(false), 1600); } };
    ext.current = { onHint, onLink, marked: doodle.marked };
  });

  // Shared by everyone: loaded on arrival, then refreshed every 30 seconds
  // while the wall is on screen, so other people's pieces turn up.
  const wallSig = useRef('');
  useEffect(() => {
    let alive = true, inView = true;
    const io = new IntersectionObserver(([en]) => { inView = en.isIntersecting; });
    if (canvas.current) io.observe(canvas.current);
    const load = async (first: boolean) => {
      if (!first && (document.visibilityState !== 'visible' || !inView || live.current.spraying)) return;
      const w = await loadWall(storeKey);
      if (!alive) return;
      const sig = JSON.stringify(w.pieces.map(p => [p.slot, p.claimed_at, p.strokes.length]));
      if (!first && sig === wallSig.current) return;
      wallSig.current = sig;
      setWall(w);
      const own = w.pieces.find(p => p.mine);
      if (first && own) { setMine(own.colour); if (slots[own.slot]) setSlot(slots[own.slot]); if (own.strokes.length) setSaved(own.strokes); }
    };
    const t = setTimeout(() => load(true), 0);
    const every = setInterval(() => load(false), 30_000);
    return () => { alive = false; clearTimeout(t); clearInterval(every); io.disconnect(); };
  }, [storeKey, slots]);

  useEffect(() => { const t = setTimeout(() => { setSaved(loadDrawing(storeKey) ?? []); setMine(myColour()); }, 0); return () => clearTimeout(t); }, [storeKey]);
  useEffect(() => {
    // only once your panel is known: before that there is nowhere to paint
    if (open && doodle.marked && !done && slot && phase === 'idle') { const t = setTimeout(() => setPhase('spray'), 0); return () => clearTimeout(t); }
  }, [open, doodle.marked, done, phase, slot]);

  // On the shared wall, the server gives out the panel and the colour.
  useEffect(() => {
    if (!spraying || !wall.available) return;
    let alive = true;
    claimPanel(storeKey, slots.length).then(res => {
      if (!alive || !res) return;
      if (slots[res.slot]) setSlot(slots[res.slot]);
      setMine(res.colour);
      if (res.done) { onClose(); setPhase('idle'); }
    });
    return () => { alive = false; };
  }, [spraying, wall.available, storeKey, slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (list = draft) => {
    if (list?.length) {
      setSaving(true);
      if (wall.available) await savePiece(storeKey, list.map(s => ({ ...s, c: mine })));
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
  // Leaving the page mid-spray keeps what was sprayed.
  useEffect(() => {
    if (!spraying || !draft?.length) return;
    const keep = (e: Event) => { if (e.type === 'pagehide' || document.visibilityState === 'hidden') finishRef.current(draft); };
    document.addEventListener('visibilitychange', keep);
    window.addEventListener('pagehide', keep);
    return () => { document.removeEventListener('visibilitychange', keep); window.removeEventListener('pagehide', keep); };
  }, [spraying, draft]);
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
    if (!art) return;
    const { bgHi, vehHi, fgHi, maskHi, lightHi, glossHi, maskData } = layersFor(mode, scene, art);
    const make = (w = PW, h = PH) => canvasOf(w, h);
    // Others' pieces, painted once
    const [tagsHi, tgctx] = make(DW, DH);
    tags.forEach(t => paintTag(tgctx, t));
    const [paint, pctx] = make(DW, DH);
    const [alpha, actx] = make(DW, DH);
    const onBody = (x: number, y: number) => x >= 0 && y >= 0 && x < PW && y < PH && maskData[(Math.floor(y) * PW + Math.floor(x)) * 4 + 3] > 0;

    const redraw = (list: Stroke[]) => {
      pctx.clearRect(0, 0, DW, DH);
      pctx.drawImage(tagsHi, 0, 0);
      // Everyone's real pieces, oldest first, each in its panel (a little past it)
      const panel = (sl: Slot | undefined) => { if (!sl) return; pctx.beginPath(); pctx.rect((sl.x - MARGIN) * K, (sl.y - MARGIN) * K, (sl.w + MARGIN * 2) * K, (sl.h + MARGIN * 2) * K); pctx.clip(); };
      live.current.pieces.forEach(p => { pctx.save(); pctx.globalAlpha = 0.95; panel(slots[p.slot]); p.strokes.forEach(s => paintStroke(pctx, s)); pctx.restore(); });
      const own = live.current.slot;
      pctx.save();
      if (own) panel(own);
      list.forEach(s => paintStroke(pctx, s));
      pctx.restore();
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(maskHi, 0, 0);
      // lit by the vehicle, mottled by its surface, then its shine on top
      actx.clearRect(0, 0, DW, DH); actx.drawImage(paint, 0, 0);
      pctx.globalCompositeOperation = 'multiply';
      pctx.drawImage(lightHi, 0, 0);
      pctx.drawImage(grain(), 0, 0);
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(alpha, 0, 0);
      pctx.globalCompositeOperation = 'source-atop';
      pctx.drawImage(glossHi, 0, 0);
      pctx.globalCompositeOperation = 'source-over';
    };
    // The paint's identity: what is on this wall right now.
    const sig = (list: Stroke[]) => `${storeKey}|${art.veh ? 1 : 0}|${tags.length}|${live.current.pieces.map(p => `${p.slot}:${p.strokes.length}`).join(',')}|${live.current.slot?.i ?? '-'}|${list.length}:${list.reduce((n, s) => n + s.p.length, 0)}`;
    let paintAt = -1; // when the paint appeared; it fades in the first time
    const keep = (list: Stroke[]) => {
      if (live.current.spraying) return;
      const [copy, cctx] = make(DW, DH); cctx.drawImage(paint, 0, 0);
      paintCache.set(sig(list), copy);
      if (paintCache.size > 24) paintCache.delete(paintCache.keys().next().value!);
    };
    const settle = (list: Stroke[]) => { redraw(list); keep(list); };
    layers.current = { redraw: list => { if (paintAt < 0) return; settle(list); } };
    const cached = paintCache.get(sig(live.current.strokes));
    let first: ReturnType<typeof setTimeout> | undefined;
    if (cached) { pctx.drawImage(cached, 0, 0); paintAt = 0; }
    // composed after the slide, not during it
    else first = setTimeout(() => { settle(live.current.strokes); paintAt = performance.now(); }, 420);

    // Ambient life, nothing that drives away: dust in the light.
    const dust = Array.from({ length: 14 }, () => ({ x: Math.random() * PW, y: Math.random() * 100, v: 0.02 + Math.random() * 0.05 }));
    const puffs: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
    let anticipate = false;
    let t = 0;
    let nextHint = 2.5;
    let pointer: { x: number; y: number } | null = null;
    const ring = { until: 0 };

    // Spraying
    let current: Stroke | null = null;
    let pace = { t: 0, v: 0.08 }; // wall px per ms, smoothed
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
      }, 420);
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
      if (own && (x < own.x - MARGIN || x > own.x + own.w + MARGIN || y < own.y - MARGIN || y > own.y + own.h + MARGIN)) return;
      try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or lost pointer */ }
      e.preventDefault();
      if (paintAt < 0) { clearTimeout(first); paintAt = 0; }
      spent = 0; runs = [];
      current = { c: live.current.mine, w: BRUSH, p: [x, y] };
      pace = { t: e.timeStamp, v: 0.08 };
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
      if (Math.hypot(x - lx, y - ly) < 0.6) return;
      if (spent + strokeCost({ ...current, p: [...current.p, x, y] }) >= live.current.left) { live.current.onEmpty(); return; }
      stopDrip();
      // A can sprayed slowly lays a fuller line, swept fast a thinner one.
      // The width is quantised and a change starts a new segment from the
      // same point (the stored format has one width per stroke).
      const dt = Math.max(8, e.timeStamp - pace.t);
      pace = { t: e.timeStamp, v: pace.v * 0.75 + (Math.hypot(x - lx, y - ly) / dt) * 0.25 };
      const want = widthFor(pace.v);
      if (want !== current.w && current.p.length >= 6 && live.current.strokes.length + runs.length < LIMITS.strokes - 6) {
        spent += strokeCost(current); runs.push(current);
        current = { c: live.current.mine, w: want, p: [lx, ly] };
      }
      current.p.push(x, y);
      armDrip(x, y);
      redraw(liveList());
    };
    const lift = () => {
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
    view.addEventListener('pointerup', lift);
    view.addEventListener('pointercancel', lift);
    ext.current.onLink?.({ anticipate: on => { anticipate = on; } });

    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '40px' });
    io.observe(view);
    let raf = 0, drawn = false;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 33 || (drawn && now < holdUntil)) return;
      drawn = true;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bgHi, 0, 0);
      ctx.drawImage(vehHi, 0, 0);
      if (paintAt >= 0) { ctx.globalAlpha = Math.min(1, paintAt ? (now - paintAt) / 260 : 1); ctx.drawImage(paint, 0, 0); ctx.globalAlpha = 1; }
      // Headlights flash while you touch the button
      if (anticipate && Math.floor(t * 8) % 2 === 0) scene.lamps.forEach(([lx, ly]) => { ctx.fillStyle = '#FFF4D0'; ctx.fillRect((lx - 2) * K, (ly - 1) * K, 5 * K, 3 * K); });
      ctx.drawImage(fgHi, 0, 0);
      // Spraying: the rest of the wall falls softly into shadow (no frame),
      // and four faint corner marks in your colour say where the can reaches.
      const own = live.current.slot;
      if (live.current.spraying && own) {
        const [x, y, w, h] = [(own.x - MARGIN) * K, (own.y - MARGIN) * K, (own.w + MARGIN * 2) * K, (own.h + MARGIN * 2) * K];
        const dim = 'rgba(8,9,11,0.42)', clear = 'rgba(8,9,11,0)', soft = K * 7;
        const band = (x0: number, y0: number, x1: number, y1: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
          const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, dim); g.addColorStop(1, clear);
          ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        };
        ctx.fillStyle = dim;
        ctx.fillRect(0, 0, DW, Math.max(0, y - soft)); ctx.fillRect(0, y + h + soft, DW, DH);
        ctx.fillRect(0, y - soft, Math.max(0, x - soft), h + soft * 2); ctx.fillRect(x + w + soft, y - soft, DW, h + soft * 2);
        band(x - soft, y - soft, x + w + soft, y, 0, y - soft, 0, y);
        band(x - soft, y + h, x + w + soft, y + h + soft, 0, y + h + soft, 0, y + h);
        band(x - soft, y, x, y + h, x - soft, 0, x, 0);
        band(x + w, y, x + w + soft, y + h, x + w + soft, 0, x + w, 0);
        ctx.save();
        ctx.globalAlpha = 0.55; ctx.strokeStyle = live.current.mine; ctx.lineWidth = K * 0.5; ctx.lineCap = 'round';
        const arm = K * 3;
        for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
          ctx.beginPath(); ctx.moveTo(cx + sx * arm, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * arm); ctx.stroke();
        }
        ctx.restore();
      }
      if (!reduce) dust.forEach(d => { d.y += d.v; d.x += Math.sin(t + d.y) * 0.03; if (d.y > 104) { d.y = 0; d.x = Math.random() * PW; } ctx.fillStyle = 'rgba(255,220,170,0.35)'; ctx.fillRect(Math.round(d.x) * K, Math.round(d.y) * K, K, K); });
      // An unspoken invitation: a puff from where the button is
      if (!reduce && !ext.current.marked && !live.current.spraying && t > nextHint) {
        nextHint = t + 7;
        const c = colourFor(`${seed}|hint|${Math.floor(t)}`);
        const to = live.current.slot ?? { x: PW / 2, y: PH / 2, w: 0, h: 0 };
        const tx0 = to.x + to.w / 2, ty0 = to.y + to.h / 2;
        for (let i = 0; i < 26; i++) puffs.push({ x: PW - 30 + Math.random() * 6, y: PH - 4, vx: (tx0 - PW + 30) * (0.9 + Math.random() * 0.3), vy: (ty0 - PH) * (0.9 + Math.random() * 0.3), life: 0.55 + Math.random() * 0.2, c });
        ext.current.onHint?.();
      }
      if (live.current.spraying && pointer) {
        ring.until = t + 0.9;
        if (current) for (let i = 0; i < 2; i++) puffs.push({ x: pointer.x + (Math.random() - 0.5) * 2, y: pointer.y + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 0.15, c: live.current.mine });
      }
      // The paint gauge: a thick arc to the left of the finger, like a game's
      // stamina bar, out from under the thumb.
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
      ctx.imageSmoothingEnabled = true;
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life <= 0) { puffs.splice(i, 1); continue; }
        ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life * 3) * 0.8;
        ctx.beginPath(); ctx.arc(p.x * K, p.y * K, K * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Both sides fade into the card
      const fade = ctx.createLinearGradient(0, 0, DW, 0);
      fade.addColorStop(0, 'rgba(14,15,18,1)'); fade.addColorStop(0.07, 'rgba(14,15,18,0)'); fade.addColorStop(0.93, 'rgba(14,15,18,0)'); fade.addColorStop(1, 'rgba(14,15,18,1)');
      ctx.fillStyle = fade; ctx.fillRect(0, 0, DW, DH);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(first);
      io.disconnect();
      stopDrip(false);
      view.removeEventListener('pointerdown', down);
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', lift);
      view.removeEventListener('pointercancel', lift);
      ext.current.onLink?.(null);
      layers.current = null;
    };
  }, [scene, tags, seed, mode, reduce, art, slots, storeKey]);

  useEffect(() => { layers.current?.redraw(strokes); }, [strokes, tags, mine, slot, pieces]);
  useEffect(() => { if (canvas.current) canvas.current.style.touchAction = spraying ? 'none' : 'pan-y'; }, [spraying]);

  // Zoom so your panel fills most of the frame, kept inside the scene.
  const zoom = (() => {
    if (!spraying || !slot) return { x: '0%', y: '0%', scale: 1 };
    const s = Math.max(1.3, Math.min(3, Math.min(PW / slot.w, PH / slot.h) * 0.85));
    const fx = (slot.x + slot.w / 2) / PW, fy = (slot.y + slot.h / 2) / PH;
    const clamp = (v: number) => Math.min(0, Math.max(1 - s, v));
    return { x: `${clamp(0.5 - fx * s) * 100}%`, y: `${clamp(0.5 - fy * s) * 100}%`, scale: s };
  })();
  const caption = !doodle.loaded ? null
    : spraying ? (empty || left <= 0.5 ? tx(lang, '这罐漆用完了', 'This can is empty') : tx(lang, '这块车身归你：喷几笔，把火气留在车上', 'This panel is yours: spray, and leave your anger on the train'))
      : null;
  // The station sign carries the wall's news, readable, in the sign's amber.
  const sign = scene.sign;
  const signLines = [
    doodle.loaded ? tx(lang, `已有 ${doodle.count} 人在车上涂鸦`, `${doodle.count} people sprayed this`) : '',
    note ?? '',
  ].filter(Boolean);

  return (
    <div className="relative overflow-hidden rounded-[20px]" style={{ background: '#0E0F12' }}>
      <div className="relative overflow-hidden" style={{ aspectRatio: `${PW} / ${PH}` }}>
        <motion.canvas ref={canvas} width={DW} height={DH} className="block w-full" initial={false} animate={zoom} transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE }}
          style={{ aspectRatio: `${PW} / ${PH}`, cursor: spraying ? 'crosshair' : 'default', transformOrigin: '0 0', opacity: art ? 1 : 0, transition: 'opacity 0.3s ease' }} />
        <AnimatePresence>
          {!spraying && signLines.length > 0 && (
            <motion.div key="sign" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute" style={{ left: `${(Math.max(16, Math.min(sign.x, PW - 150)) / PW) * 100}%`, top: `${(Math.max(2, sign.y - 4) / PH) * 100}%`, width: `${(134 / PW) * 100}%` }}>
              <LedSign lines={signLines} />
            </motion.div>
          )}
        </AnimatePresence>
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
      {(caption || (!spraying && doodle.marked && !done)) && (
        <div className="px-4 pt-2 pb-1 flex items-center justify-center gap-2 text-center">
          {caption && <p className={TYPE.label} style={{ color: empty ? color.main : C.text2 }}>{caption}</p>}
          {!spraying && doodle.marked && !done && (
            <button onClick={onOpen} className={`shrink-0 h-7 px-2.5 rounded-full ${TYPE.caption} font-semibold`} style={{ background: C.surface3, color: '#FFFFFF' }}>
              {tx(lang, '拿起喷罐', 'Pick up the can')}
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
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => finish()} disabled={saving} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 disabled:opacity-60 ${TYPE.action}`} style={FILLED(color.deep)}>
              <Check size={17} weight="bold" />{saving ? tx(lang, '保存中…', 'Saving…') : tx(lang, '喷好了', 'Done')}
            </motion.button>
          </div>
        ) : footer}
      </div>
    </div>
  );
}

// A platform LED board, made the way real ones are: the text is set in a
// pixel typeface drawn for 10-dot screens (pixelFont.ts, thin one-dot
// strokes, as Chinese station and bus boards are lettered), every dot is a
// real lamp, lit or dim, and the message crawls from right to left one
// column at a time, round and round.
const SIGN_ROWS = GLYPH_ROWS + 2;
function LedSign({ lines }: { lines: string[] }) {
  const reduce = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = lines.join('   ·   ');
  useEffect(() => {
    const view = canvas.current;
    const ctx = view?.getContext('2d');
    if (!view || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = view.clientWidth, cssH = view.clientHeight;
    const pitch = cssH / SIGN_ROWS;
    const cols = Math.floor(cssW / pitch);
    view.width = Math.round(cssW * dpr); view.height = Math.round(cssH * dpr);
    // Set the message in the pixel face, one column of dots at a time.
    const glyphs = glyphColumns(text);
    const width = glyphs.length;
    const fits = width <= cols;
    const gap = Math.max(12, Math.floor(cols / 3));
    const loop = fits ? width : width + gap;
    const on = (x: number, y: number) => {
      const k = fits ? x - Math.floor((cols - width) / 2) : ((x % loop) + loop) % loop;
      return k >= 0 && k < width && y >= 1 && y <= GLYPH_ROWS && ((glyphs[k] >> (y - 1)) & 1) === 1;
    };
    // one lamp, lit and unlit, drawn once
    const s = Math.ceil(pitch * dpr * 2.2), r = pitch * dpr * 0.36;
    const lamp = (lit: boolean) => {
      const c = document.createElement('canvas'); c.width = c.height = s;
      const g = c.getContext('2d')!;
      if (lit) {
        const halo = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        halo.addColorStop(0, 'rgba(255,170,40,0.45)'); halo.addColorStop(1, 'rgba(255,120,0,0)');
        g.fillStyle = halo; g.fillRect(0, 0, s, s);
      }
      const body = g.createRadialGradient(s / 2 - r * 0.3, s / 2 - r * 0.3, 0, s / 2, s / 2, r);
      if (lit) { body.addColorStop(0, '#FFF2C8'); body.addColorStop(0.55, '#FFB12E'); body.addColorStop(1, '#E07B00'); }
      else { body.addColorStop(0, '#2E2110'); body.addColorStop(1, '#170F06'); }
      g.fillStyle = body; g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.fill();
      return c;
    };
    const litLamp = lamp(true), offLamp = lamp(false);
    let shift = 0, raf = 0, last = 0;
    const draw = (now: number) => {
      if (!fits && !reduce) raf = requestAnimationFrame(draw);
      if (now - last < 55 && last) return;
      last = now;
      ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, view.width, view.height);
      for (let y = 0; y < SIGN_ROWS; y++) for (let x = 0; x < cols; x++) {
        const px = (x + 0.5) * pitch * dpr - s / 2 + (cssW - cols * pitch) * dpr / 2, py = (y + 0.5) * pitch * dpr - s / 2;
        ctx.drawImage(on(x + shift, y) ? litLamp : offLamp, px, py);
      }
      shift = (shift + 1) % loop;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [text, reduce]);
  return (
    <div className="relative rounded-[2px] px-[3px] py-[2px]" style={{ background: '#050505', boxShadow: '0 0 0 1px #3A3D43, 0 0 0 2px #121316, 0 2px 5px rgba(0,0,0,0.55)' }}>
      <canvas ref={canvas} role="img" aria-label={text} className="block w-full h-[17px]" />
    </div>
  );
}
