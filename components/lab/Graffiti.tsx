'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, PencilSimple, SprayBottle, Trash } from '@phosphor-icons/react';
import { modeName, tx, type Lang, type Mode } from '../../lib/lab/model';
import { H, makeTags, mySpot, rng, SPRAY, SprayFilter, TagMark, VEHICLES, VehicleBase, VehicleFront, W } from './graffitiArt';
import { LIMITS, loadDrawing, uploadDrawing, type Stroke } from './graffitiStore';
import { C, EASE, FILLED, MODE_COLOR, TONAL, TYPE } from './theme';

const UNIT: Record<Mode, [string, string]> = { TRAIN: ['列火车', 'train'], SUBWAY: ['节地铁', 'metro car'], BUS: ['辆公交', 'bus'], AIRPORT: ['架飞机', 'plane'] };
const SIZES = [4, 8, 14];

type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };

// The wall: the vehicle everyone affected paints on. Open from the start —
// others' tags and an empty spot for yours — and tied to "我受影响了" above
// by a notch under that button. After marking, you can draw your own.
export default function Graffiti({ mode, seed, storeKey, doodle, lang }: { mode: Mode; seed: string; storeKey: string; doodle: Doodle; lang: Lang }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const color = MODE_COLOR[mode];
  const others = Math.max(doodle.count - (doodle.marked ? 1 : 0), 0);
  const tags = useMemo(() => makeTags(mode, seed, others), [mode, seed, others]);
  const spot = useMemo(() => mySpot(mode, seed), [mode, seed]);
  const [mine, setMine] = useState<Stroke[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState({ c: SPRAY[0], w: SIZES[1] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMine(loadDrawing(storeKey)), 0); return () => clearTimeout(t); }, [storeKey]);

  const start = () => { setDraft(mine ?? []); setDrawing(true); };
  const save = async () => {
    setSaving(true);
    await uploadDrawing(storeKey, draft);
    setMine(draft.length ? draft : null);
    setSaving(false);
    setDrawing(false);
  };

  const unit = tx(lang, UNIT[mode][0], UNIT[mode][1]);
  const caption = !doodle.loaded ? '' : !doodle.marked
    ? tx(lang, `已有 ${others} 人在这${unit}上涂鸦 · 点上方「我受影响了」加入`, `${others} people have tagged this ${unit} · tap “I am affected” to join`)
    : mine ? tx(lang, '你的涂鸦已经喷上去了', 'Your drawing is on the wall')
      : null;

  return (
    <div className="relative mt-3">
      {/* Notch under "我受影响了" (the right button, flex 1.35 of 2.35) */}
      <span aria-hidden className="absolute -top-[5px] w-[12px] h-[12px] rotate-45 rounded-[2px]" style={{ background: C.surface2, right: 'calc((100% - 10px) * 1.35 / 2.35 / 2 - 6px)' }} />
      <div className="relative overflow-hidden rounded-[18px]" style={{ background: `radial-gradient(90% 80% at 50% 45%, ${color.soft}, transparent 70%), ${C.surface2}` }}>
        <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
            <defs>
              <clipPath id={`body-${uid}`}><path d={VEHICLES[mode].body} /></clipPath>
              <linearGradient id="lab-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity={0.07} /><stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></linearGradient>
              <SprayFilter id={`spray-${uid}`} />
            </defs>
            <VehicleBase mode={mode} accent={color.main} clipId={`body-${uid}`} />
            <g clipPath={`url(#body-${uid})`}>
              <g filter={`url(#spray-${uid})`} opacity={doodle.marked ? 1 : 0.85}>
                {tags.map((t, i) => <TagMark key={i} tag={t} />)}
              </g>
              {doodle.marked && !mine && (
                <motion.g filter={`url(#spray-${uid})`} initial={doodle.spraying && !reduce ? { opacity: 0, scale: 0.6 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} style={{ transformOrigin: `${spot.x}px ${spot.y}px` }}>
                  <TagMark tag={{ kind: 'word', x: spot.x, y: spot.y, r: spot.r, s: spot.s, color: color.main, word: 'BASTA!', drips: [-12, 10] }} />
                </motion.g>
              )}
            </g>
            <VehicleFront mode={mode} />
            {/* Your empty spot, waiting */}
            {doodle.loaded && !doodle.marked && !reduce && (
              <motion.g animate={{ opacity: [0.35, 0.9, 0.35] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
                <ellipse cx={spot.x} cy={spot.y} rx={34 * spot.s} ry={14 * spot.s} fill="none" stroke="#FFFFFF" strokeWidth={1.2} strokeDasharray="4 4" />
                <path d={`M ${spot.x - 5} ${spot.y} H ${spot.x + 5} M ${spot.x} ${spot.y - 5} V ${spot.y + 5}`} stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" />
              </motion.g>
            )}
            {/* Mist burst when you spray */}
            <AnimatePresence>
              {doodle.spraying && !reduce && Array.from({ length: 9 }, (_, i) => {
                const a = (i / 9) * Math.PI * 2;
                return <motion.circle key={i} cx={spot.x} cy={spot.y} r={3} fill={color.main}
                  initial={{ opacity: 0.8, cx: spot.x, cy: spot.y }} animate={{ opacity: 0, cx: spot.x + Math.cos(a) * 40, cy: spot.y + Math.sin(a) * 22, r: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} />;
              })}
            </AnimatePresence>
          </svg>
          {(drawing || mine) && <Pad mode={mode} strokes={drawing ? draft : mine!} brush={brush} live={drawing} onChange={setDraft} />}
          {doodle.loaded && !doodle.marked && !reduce && (
            <motion.span aria-hidden className="absolute flex" style={{ left: `${(spot.x / W) * 100 + 9}%`, top: `${(spot.y / H) * 100 - 30}%` }}
              animate={{ y: [0, -4, 0], rotate: [-8, 4, -8] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>
              <SprayBottle size={20} weight="fill" color="#FFFFFF" />
            </motion.span>
          )}
        </div>

        <AnimatePresence initial={false} mode="wait">
          {drawing ? (
            <motion.div key="tools" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
              <div className="px-3 pt-2 pb-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5" role="radiogroup" aria-label={tx(lang, '颜色', 'Colour')}>
                    {[color.main, ...SPRAY].map(c => (
                      <button key={c} role="radio" aria-checked={brush.c === c} aria-label={c} onClick={() => setBrush(b => ({ ...b, c }))}
                        className="w-7 h-7 rounded-full transition-transform" style={{ background: c, transform: brush.c === c ? 'scale(1.12)' : 'none', boxShadow: brush.c === c ? `0 0 0 2px ${C.surface2}, 0 0 0 4px #FFFFFF` : 'none' }} />
                    ))}
                  </div>
                  <button onClick={() => setDrawing(false)} className={`h-8 px-2 whitespace-nowrap ${TYPE.label}`} style={{ color: C.text2 }}>{tx(lang, '取消', 'Cancel')}</button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 h-9 px-1.5 rounded-full" style={{ background: C.surface3 }} role="radiogroup" aria-label={tx(lang, '粗细', 'Size')}>
                    {SIZES.map(w => (
                      <button key={w} role="radio" aria-checked={brush.w === w} aria-label={`${w}`} onClick={() => setBrush(b => ({ ...b, w }))} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: brush.w === w ? C.surface : 'transparent' }}>
                        <i className="rounded-full" style={{ width: 4 + w / 1.6, height: 4 + w / 1.6, background: brush.c }} />
                      </button>
                    ))}
                  </div>
                  <IconButton label={tx(lang, '撤销', 'Undo')} onClick={() => setDraft(d => d.slice(0, -1))} disabled={!draft.length}><ArrowCounterClockwise size={16} weight="bold" /></IconButton>
                  <IconButton label={tx(lang, '清空', 'Clear')} onClick={() => setDraft([])} disabled={!draft.length}><Trash size={16} weight="bold" /></IconButton>
                  <button onClick={save} disabled={saving} className={`ml-auto h-9 px-4 rounded-full whitespace-nowrap ${TYPE.label} font-semibold disabled:opacity-60`} style={FILLED()}>
                    {saving ? tx(lang, '上传中…', 'Uploading…') : tx(lang, '上传', 'Upload')}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 pb-3.5 -mt-1 flex flex-col items-center gap-2 text-center">
              {doodle.marked && !mine
                ? <p className={TYPE.label} style={{ color: C.text2 }}>
                    {tx(lang, '还有 ', 'Another ')}<strong style={{ color: C.text }}>{tx(lang, `${Math.max(doodle.count, 1)} 人`, `${Math.max(doodle.count, 1)}`)}</strong>
                    {tx(lang, ` 也被影响了，和你一起在${modeName(mode).replace('机场', '飞机')}上猛猛涂鸦`, ` people were affected by this ${modeName(mode, 'en').toLowerCase()} strike too`)}
                  </p>
                : caption && <p className={TYPE.label} style={{ color: C.text2 }}>{caption}</p>}
              {doodle.marked && (
                <button onClick={start} className={`h-9 px-3.5 rounded-full flex items-center gap-1.5 ${TYPE.label} font-semibold`} style={TONAL}>
                  <PencilSimple size={15} weight="bold" />{mine ? tx(lang, '重新画', 'Redraw') : tx(lang, '自己画一笔', 'Draw your own')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button aria-label={label} onClick={onClick} disabled={disabled} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-35" style={{ background: C.surface3, color: C.text }}>{children}</button>;
}

// ── Drawing pad ────────────────────────────────────────────────────────
// A canvas over the stage; strokes are clipped to the vehicle body and
// drawn as spray: a soft halo, a solid core, speckle and the odd drip.

function Pad({ mode, strokes, brush, live, onChange }: { mode: Mode; strokes: Stroke[]; brush: { c: string; w: number }; live: boolean; onChange: (s: Stroke[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);
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
  const total = strokes.reduce((n, s) => n + s.p.length / 2, 0);

  return (
    <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ touchAction: live ? 'none' : 'auto', cursor: live ? 'crosshair' : 'default', pointerEvents: live ? 'auto' : 'none' }}
      aria-label={live ? '涂鸦画布' : undefined}
      onPointerDown={e => {
        if (!live || strokes.length >= LIMITS.strokes) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        current.current = { c: brush.c, w: brush.w, p: point(e) };
        paint([...strokes, current.current]);
      }}
      onPointerMove={e => {
        const s = current.current;
        if (!s || total + s.p.length / 2 >= LIMITS.points) return;
        const [x, y] = point(e);
        const [lx, ly] = s.p.slice(-2);
        if (Math.hypot(x - lx, y - ly) < 1.5) return;
        s.p.push(x, y);
        paint([...strokes, s]);
      }}
      onPointerUp={() => {
        if (current.current) onChange([...strokes, current.current]);
        current.current = null;
      }}
      onPointerCancel={() => { current.current = null; paint(strokes); }}
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
  const rand = rng(`${index}|${s.p.length}|${s.p[0]}`);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
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
  // A drip where a heavy stroke ends
  if (s.w >= 8 && s.p.length >= 8) {
    const x = s.p[s.p.length - 2];
    const y = s.p[s.p.length - 1];
    const len = 6 + rand() * 12;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1.2, s.w * 0.3);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + len, ctx.lineWidth * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
