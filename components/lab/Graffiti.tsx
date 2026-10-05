'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { tx, type Lang, type Mode } from '../../lib/lab/model';
import { H, makeTags, mySpot, rng, SPRAY, SprayFilter, TagMark, VEHICLES, VehicleBase, VehicleFront, W } from './graffitiArt';
import { LIMITS, loadDrawing, paintLeft, PAINT, strokeCost, uploadDrawing, type Stroke } from './graffitiStore';
import { C, EASE, MODE_COLOR, TYPE } from './theme';

const UNIT: Record<Mode, [string, string]> = { TRAIN: ['列火车', 'train'], SUBWAY: ['节地铁', 'metro car'], BUS: ['辆公交', 'bus'], AIRPORT: ['架飞机', 'plane'] };
const SIZES = [4, 8, 14];

// Motion is transform-only and stops when the wall is off screen.
const CSS = `
.gf-run .gf-spin{animation:gf-spin .5s linear infinite;transform-box:fill-box;transform-origin:center}
.gf-run .gf-ground{animation:gf-ground .32s linear infinite}
.gf-run .gf-sweep{animation:gf-sweep 3.2s ease-in-out infinite}
.gf-run .gf-bob{animation:gf-bob .7s ease-in-out infinite alternate}
.gf-run .gf-streak{animation:gf-streak var(--d,1.1s) linear infinite}
.gf-paused *{animation-play-state:paused!important}
@keyframes gf-spin{to{transform:rotate(360deg)}}
@keyframes gf-ground{to{transform:translateX(20px)}}
@keyframes gf-sweep{0%{transform:translateX(0) skewX(-20deg)}60%,100%{transform:translateX(520px) skewX(-20deg)}}
@keyframes gf-bob{to{transform:translateY(-1.2px)}}
@keyframes gf-streak{from{transform:translateX(120%)}to{transform:translateX(-120%)}}
`;

type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };

// The wall. Before you react, the vehicle is running — seen at an angle,
// wheels turning, light sliding over the glass — with everyone else's marks
// on it. "我受影响了" (below) stops it: it brakes, swings square to you and
// hands you one can of paint. Marks are symbols, not words, so they read in
// any language; the can is finite, so each mark is a choice.
export default function Graffiti({ mode, seed, storeKey, doodle, lang, open, onOpen, onClose }: { mode: Mode; seed: string; storeKey: string; doodle: Doodle; lang: Lang; open: boolean; onOpen: () => void; onClose: () => void }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const color = MODE_COLOR[mode];
  const others = Math.max(doodle.count - (doodle.marked ? 1 : 0), 0);
  const tags = useMemo(() => makeTags(mode, seed, others), [mode, seed, others]);
  const spot = useMemo(() => mySpot(mode, seed), [mode, seed]);
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [saved, setSaved] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke[] | null>(null);
  const [brush, setBrush] = useState({ c: color.main, w: SIZES[1] });
  const [parked, setParked] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawing = open && doodle.marked;
  const strokes = drawing ? draft ?? saved : saved;
  const left = paintLeft(strokes);

  useEffect(() => { const t = setTimeout(() => setSaved(loadDrawing(storeKey) ?? []), 0); return () => clearTimeout(t); }, [storeKey]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const stopped = doodle.marked;
  const running = !stopped && !reduce;
  const finish = async () => {
    if (draft) {
      setSaving(true);
      await uploadDrawing(storeKey, draft);
      setSaved(draft);
      setDraft(null);
      setSaving(false);
    }
    onClose();
  };

  const unit = tx(lang, UNIT[mode][0], UNIT[mode][1]);
  const caption = !doodle.loaded ? ' '
    : !doodle.marked ? tx(lang, `已有 ${others} 人在这${unit}上留下不满 · 点下方「我受影响了」让它停下`, `${others} people have marked this ${unit} · tap “I am affected” to stop it`)
      : drawing ? (empty ? tx(lang, '这罐漆用完了', 'This can is empty') : tx(lang, '在车身上拖动来喷；按住不动会流下漆痕', 'Drag on the body to spray; hold still and it drips'))
        : saved.length ? tx(lang, `你的涂鸦已经留在车上了 · 和 ${others} 人一起`, `Your mark is on it · with ${others} others`)
          : tx(lang, `你和 ${others} 人一起让它停了下来`, `You and ${others} others stopped it`);

  return (
    <div ref={wrap} className={`relative overflow-hidden rounded-[20px] ${running && visible ? 'gf-run' : ''} ${visible ? '' : 'gf-paused'}`}
      style={{ background: `radial-gradient(80% 70% at 50% 62%, ${color.soft}, transparent 72%), linear-gradient(180deg, #121419, ${C.surface2})` }}>
      <style>{CSS}</style>
      {/* Speed streaks: only while it runs */}
      <AnimatePresence>
        {running && (
          <motion.div aria-hidden className="absolute inset-0 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
            {[18, 34, 71, 86].map((top, i) => (
              <span key={top} className="gf-streak absolute h-px w-[38%]" style={{ top: `${top}%`, left: 0, ['--d' as string]: `${0.9 + i * 0.35}s`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)' }} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative" style={{ aspectRatio: `${W} / ${H + 14}`, perspective: 900 }}>
        <motion.div className="absolute inset-x-0 top-[6px]" style={{ aspectRatio: `${W} / ${H}`, transformStyle: 'preserve-3d' }}
          initial={false}
          animate={reduce ? {} : stopped ? { rotateY: 0, rotateX: 0, scale: 1, x: 0 } : { rotateY: -26, rotateX: 7, scale: 0.88, x: -4 }}
          transition={{ type: 'spring', stiffness: 60, damping: 16, mass: 1.2 }}
          onAnimationComplete={() => setParked(stopped)}>
          <div className="gf-bob absolute inset-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
              <defs>
                <clipPath id={`body-${uid}`}><path d={VEHICLES[mode].body} /></clipPath>
                <linearGradient id="lab-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} /><stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></linearGradient>
                <SprayFilter id={`spray-${uid}`} />
              </defs>
              <ellipse cx={W / 2} cy={H - 6} rx={W * 0.46} ry={6} fill="rgba(0,0,0,0.45)" />
              <VehicleBase mode={mode} accent={color.main} clipId={`body-${uid}`} />
              <g clipPath={`url(#body-${uid})`}>
                <g filter={`url(#spray-${uid})`}>{tags.map((t, i) => <TagMark key={i} tag={t} />)}</g>
                {doodle.marked && (
                  <motion.g filter={`url(#spray-${uid})`} initial={doodle.spraying && !reduce ? { opacity: 0, scale: 0.4 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: EASE, delay: 0.5 }} style={{ transformOrigin: `${spot.x}px ${spot.y}px` }}>
                    <TagMark tag={{ kind: 'angry', x: spot.x, y: spot.y, r: spot.r, s: spot.s, color: color.main, drips: [-6, 7] }} />
                  </motion.g>
                )}
              </g>
              <VehicleFront mode={mode} />
              {doodle.loaded && !doodle.marked && !reduce && (
                <motion.g animate={{ opacity: [0.3, 0.85, 0.3] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
                  <circle cx={spot.x} cy={spot.y} r={16 * spot.s} fill="none" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="3 4" />
                </motion.g>
              )}
              <AnimatePresence>
                {doodle.spraying && !reduce && Array.from({ length: 10 }, (_, i) => {
                  const a = (i / 10) * Math.PI * 2;
                  return <motion.circle key={i} cx={spot.x} cy={spot.y} r={3} fill={color.main}
                    initial={{ opacity: 0.85, cx: spot.x, cy: spot.y }} animate={{ opacity: 0, cx: spot.x + Math.cos(a) * 44, cy: spot.y + Math.sin(a) * 24, r: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.5 }} />;
                })}
              </AnimatePresence>
            </svg>
            {strokes.length > 0 || drawing ? (
              <Pad mode={mode} strokes={strokes} brush={brush} live={drawing && (parked || !!reduce) && left > 0}
                onChange={setDraft} onEmpty={() => { setEmpty(true); setTimeout(() => setEmpty(false), 1600); }} budget={left} />
            ) : null}
          </div>
        </motion.div>

      </div>

      <AnimatePresence initial={false}>
        {drawing && (
          <motion.div key="tools" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
            <div className="px-3 pt-1 pb-1 flex items-center gap-2">
              <div className="flex gap-1.5" role="radiogroup" aria-label={tx(lang, '颜色', 'Colour')}>
                {[color.main, ...SPRAY].map(c => (
                  <button key={c} role="radio" aria-checked={brush.c === c} aria-label={c} onClick={() => setBrush(b => ({ ...b, c }))}
                    className="w-[26px] h-[26px] rounded-full transition-transform" style={{ background: c, transform: brush.c === c ? 'scale(1.12)' : 'none', boxShadow: brush.c === c ? `0 0 0 2px #15171B, 0 0 0 3.5px #FFFFFF` : 'none' }} />
                ))}
              </div>
            </div>
            <div className="px-3 pt-2 pb-3 flex items-center gap-2">
              <div className="flex items-center gap-0.5 h-9 px-1 rounded-full" style={{ background: C.surface3 }} role="radiogroup" aria-label={tx(lang, '粗细', 'Size')}>
                {SIZES.map(w => (
                  <button key={w} role="radio" aria-checked={brush.w === w} aria-label={`${w}`} onClick={() => setBrush(b => ({ ...b, w }))} className="w-8 h-7 rounded-full flex items-center justify-center" style={{ background: brush.w === w ? '#3A3F48' : 'transparent' }}>
                    <i className="rounded-full" style={{ width: 3 + w / 1.5, height: 3 + w / 1.5, background: '#FFFFFF' }} />
                  </button>
                ))}
              </div>
              <button aria-label={tx(lang, '撤销', 'Undo')} onClick={() => setDraft(d => (d ?? saved).slice(0, -1))} disabled={!strokes.length} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-35" style={{ background: C.surface3, color: '#FFFFFF' }}>
                <ArrowCounterClockwise size={16} weight="bold" />
              </button>
              {/* The can from the button lands here; its level is what's left */}
              <motion.div layoutId={`can-${seed}`} className="ml-auto flex items-center gap-1.5" transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <Can level={left / PAINT} color={brush.c} shaking={empty} />
                <span className="w-8 text-[11.5px] font-semibold tabular-nums" style={{ color: left < PAINT * 0.15 ? color.main : C.text3, fontFamily: 'var(--font-num)' }}>{Math.round((left / PAINT) * 100)}%</span>
              </motion.div>
              <button onClick={finish} disabled={saving} className={`h-9 px-4 rounded-full flex items-center gap-1.5 whitespace-nowrap ${TYPE.label} font-semibold disabled:opacity-60`} style={{ background: color.deep, color: '#FFFFFF' }}>
                <Check size={14} weight="bold" />{saving ? tx(lang, '上传中…', 'Uploading…') : tx(lang, '完成', 'Done')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-3.5 pt-0.5 flex items-center justify-center gap-2 text-center">
        <p className={TYPE.label} style={{ color: empty ? color.main : C.text2 }}>{caption}</p>
        {doodle.marked && !drawing && left > 0.5 && (
          <button onClick={onOpen} className={`shrink-0 h-7 px-2.5 rounded-full ${TYPE.caption} font-semibold`} style={{ background: C.surface3, color: '#FFFFFF' }}>
            {saved.length ? tx(lang, `继续喷 · 剩 ${Math.round((left / PAINT) * 100)}%`, `Spray more · ${Math.round((left / PAINT) * 100)}% left`) : tx(lang, '拿起喷罐', 'Pick up the can')}
          </button>
        )}
      </div>
    </div>
  );
}

// A small can whose paint level drops as you spray.
function Can({ level, color, shaking }: { level: number; color: string; shaking: boolean }) {
  return (
    <motion.svg width={22} height={34} viewBox="0 0 22 34" animate={shaking ? { rotate: [0, -12, 10, -8, 6, 0] } : { rotate: 0 }} transition={{ duration: 0.5 }} aria-hidden>
      <rect x={8} y={0} width={6} height={4} rx={1} fill="#C9CDD4" />
      <rect x={6} y={4} width={10} height={4} rx={1.5} fill="#8A9099" />
      <rect x={2} y={8} width={18} height={25} rx={4} fill="#2C3036" stroke="rgba(255,255,255,0.18)" />
      <clipPath id="can-body"><rect x={2} y={8} width={18} height={25} rx={4} /></clipPath>
      <rect x={2} y={8 + 25 * (1 - level)} width={18} height={25 * level} fill={color} clipPath="url(#can-body)" style={{ transition: 'y .2s, height .2s' }} />
      <rect x={5} y={11} width={2} height={18} rx={1} fill="rgba(255,255,255,0.25)" />
    </motion.svg>
  );
}

// ── Drawing pad ────────────────────────────────────────────────────────
// Strokes are clipped to the body and drawn as spray: halo, solid core,
// speckle. Holding still lets paint run: a drip grows under the nozzle.

function Pad({ mode, strokes, brush, live, budget, onChange, onEmpty }: { mode: Mode; strokes: Stroke[]; brush: { c: string; w: number }; live: boolean; budget: number; onChange: (s: Stroke[]) => void; onEmpty: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);
  const drip = useRef<{ stroke: Stroke; timer: ReturnType<typeof setTimeout> | null; grow: ReturnType<typeof setInterval> | null } | null>(null);
  const spent = useRef(0);
  const runs = useRef<Stroke[]>([]); // drips finished during the current stroke
  const [scale, setScale] = useState(1);
  const body = useMemo(() => (typeof Path2D === 'undefined' ? null : new Path2D(VEHICLES[mode].body)), [mode]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => setScale(el.clientWidth / W);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paint = useCallback((list: Stroke[]) => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !body) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(W * scale * dpr);
    el.height = Math.round(H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.save();
    ctx.clip(body);
    list.forEach((s, i) => drawStroke(ctx, s, i, scale * dpr));
    ctx.restore();
  }, [body, scale]);

  useEffect(() => { paint(strokes); }, [paint, strokes]);

  const point = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
  };
  const live2 = () => [...strokes, ...runs.current, ...(current.current ? [current.current] : []), ...(drip.current ? [drip.current.stroke] : [])];
  const stopDrip = () => {
    const d = drip.current;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    if (d.grow) clearInterval(d.grow);
    if (d.stroke.p.length > 2) { spent.current += strokeCost(d.stroke); runs.current.push(d.stroke); }
    drip.current = null;
  };
  // Paint runs if the nozzle stays put.
  const armDrip = (x: number, y: number) => {
    stopDrip();
    const stroke: Stroke = { c: brush.c, w: Math.max(1.6, brush.w * 0.32), p: [x, y], d: 1 };
    const d = { stroke, timer: null as ReturnType<typeof setTimeout> | null, grow: null as ReturnType<typeof setInterval> | null };
    d.timer = setTimeout(() => {
      d.grow = setInterval(() => {
        const len = stroke.p.length > 2 ? stroke.p[3] - y : 0;
        if (len > 26 || spent.current + strokeCost(stroke) >= budget) { if (d.grow) clearInterval(d.grow); return; }
        stroke.p = [x, y, x, y + len + 1.6];
        paint(live2());
      }, 60);
    }, 380);
    drip.current = d;
  };
  const total = strokes.reduce((n, s) => n + s.p.length / 2, 0);

  return (
    <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ touchAction: live ? 'none' : 'auto', cursor: live ? 'crosshair' : 'default', pointerEvents: live ? 'auto' : 'none' }}
      aria-label={live ? '涂鸦画布' : undefined}
      onPointerDown={e => {
        if (!live || strokes.length >= LIMITS.strokes) return;
        if (budget <= 0.5) { onEmpty(); return; }
        e.currentTarget.setPointerCapture(e.pointerId);
        spent.current = 0;
        runs.current = [];
        const [x, y] = point(e);
        current.current = { c: brush.c, w: brush.w, p: [x, y] };
        armDrip(x, y);
        paint(live2());
      }}
      onPointerMove={e => {
        const s = current.current;
        if (!s || total + s.p.length / 2 >= LIMITS.points) return;
        const [x, y] = point(e);
        const [lx, ly] = s.p.slice(-2);
        if (Math.hypot(x - lx, y - ly) < 1.5) return;
        if (spent.current + strokeCost({ ...s, p: [...s.p, x, y] }) >= budget) { onEmpty(); return; }
        stopDrip();
        s.p.push(x, y);
        armDrip(x, y);
        paint(live2());
      }}
      onPointerUp={() => {
        const d = drip.current;
        if (d) { if (d.timer) clearTimeout(d.timer); if (d.grow) clearInterval(d.grow); }
        const add = [...runs.current, ...(current.current ? [current.current] : []), ...(d && d.stroke.p.length > 2 ? [d.stroke] : [])];
        drip.current = null;
        current.current = null;
        runs.current = [];
        if (add.length) onChange([...strokes, ...add]);
      }}
      onPointerCancel={() => { stopDrip(); current.current = null; runs.current = []; paint(strokes); }}
    />
  );
}

function trace(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) ctx.lineTo(p[0] + 0.1, p[1]);
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  if (p.length > 2) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, index: number, px: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  if (s.d) {
    // A run of paint: thin line, round bead at the end.
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = s.w;
    trace(ctx, s.p);
    ctx.stroke();
    const [x, y] = s.p.slice(-2);
    ctx.beginPath(); ctx.arc(x, y, s.w * 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const rand = rng(`${index}|${s.p.length}|${s.p[0]}`);
  // Halo (shadowBlur is in device pixels, so scale it by hand)
  ctx.globalAlpha = 0.3;
  ctx.shadowColor = s.c;
  ctx.shadowBlur = s.w * 1.4 * px;
  ctx.lineWidth = s.w * 1.5;
  trace(ctx, s.p);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Core
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = s.w;
  trace(ctx, s.p);
  ctx.stroke();
  // Speckle
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < s.p.length; i += 6) {
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      const d = s.w * (0.8 + rand() * 0.9);
      ctx.beginPath();
      ctx.arc(s.p[i] + Math.cos(a) * d, s.p[i + 1] + Math.sin(a) * d, 0.35 + rand() * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
