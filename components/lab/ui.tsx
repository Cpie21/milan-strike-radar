'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { AirplaneTilt, Bus, Subway, Train, X, type IconWeight } from '@phosphor-icons/react';
import type { Mode } from '../../lib/lab/model';
import { C, FILLED, LINE_COLORS, MODE_COLOR, SPRING_SHEET, TONAL } from './theme';

export function ModeGlyph({ mode, size = 20, weight = 'fill', color }: { mode: Mode; size?: number; weight?: IconWeight; color?: string }) {
  const props = { size, weight, color, 'aria-hidden': true } as const;
  if (mode === 'SUBWAY') return <Subway {...props} />;
  if (mode === 'BUS') return <Bus {...props} />;
  if (mode === 'TRAIN') return <Train {...props} />;
  return <AirplaneTilt {...props} />;
}

// Transit-signage badges: a filled square in the mode's colour with a white
// pictogram, the way stations mark them. Metro is the white "M" on red
// that every Italian metro uses; the others are front-on pictograms, which
// stay readable at 12px where side views blur.
export function ModeBadge({ mode, size = 16, ring }: { mode: Mode; size?: number; ring?: string }) {
  const glyph = Math.round(size * 0.68);
  return (
    <span aria-hidden className="inline-flex items-center justify-center shrink-0" style={{
      width: size, height: size, borderRadius: Math.round(size * 0.26), background: MODE_COLOR[mode].deep, color: '#FFFFFF',
      boxShadow: ring ? `0 0 0 ${Math.max(1.5, size / 10)}px ${ring}` : undefined,
    }}>
      {mode === 'SUBWAY'
        ? <span style={{ fontFamily: 'var(--font-num), sans-serif', fontWeight: 600, fontSize: Math.round(size * 0.78), lineHeight: 1, marginTop: size * 0.04 }}>M</span>
        : mode === 'BUS' ? <Bus size={glyph} weight="fill" />
          : mode === 'TRAIN' ? <Train size={glyph} weight="fill" />
            : <AirplaneTilt size={glyph} weight="fill" />}
    </span>
  );
}

export function LineBadge({ line }: { line: string }) {
  const [bg, fg] = LINE_COLORS[line.toUpperCase()] || [C.surface3, C.text];
  return <span className="inline-flex items-center h-[22px] px-[7px] rounded-[7px] text-[12.5px] font-semibold tabular-nums" style={{ background: bg, color: fg }}>{line}</span>;
}

// Sheets follow iOS: a grabber appears only when the sheet can actually
// change size. Short content opens at its own height with no grabber; long
// content opens at 60% and drags up to full height.
const MEDIUM = 0.6;
const LARGE = 0.92;

export function Sheet({ open, onClose, title, children, large = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; large?: boolean }) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [expanded, setExpanded] = useState(large);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      setViewport(window.innerHeight);
      if (bodyRef.current) setNatural(bodyRef.current.scrollHeight + 64);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (bodyRef.current?.firstElementChild) observer.observe(bodyRef.current.firstElementChild);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); setExpanded(large); };
  }, [open, large]);

  const resizable = natural > viewport * MEDIUM;
  const height = resizable ? viewport * (expanded ? LARGE : MEDIUM) : Math.min(natural, viewport * LARGE);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[90]" style={{ background: 'rgba(0,0,0,0.55)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="fixed z-[95] inset-x-0 bottom-0 mx-auto w-full max-w-[520px] flex flex-col overflow-hidden"
            style={{ background: C.surface, color: C.text, borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: `0 -0.5px 0 ${C.lineStrong}, 0 -20px 60px rgba(0,0,0,0.5)` }}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1, height } : { y: 0, height }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={SPRING_SHEET}
            drag={reduce ? false : 'y'} dragListener={false} dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: resizable && !expanded ? 0.25 : 0.04, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (resizable && !expanded && info.offset.y < -40) setExpanded(true);
              else if (info.offset.y > 90 || info.velocity.y > 700) { if (expanded) setExpanded(false); else onClose(); }
            }}
          >
            <div onPointerDown={e => controls.start(e)} className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing">
              {resizable
                ? <div className="pt-2 flex justify-center"><span className="w-9 h-[5px] rounded-full" style={{ background: C.lineStrong }} /></div>
                : <div className="h-2" />}
              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
                <button onClick={onClose} onPointerDown={e => e.stopPropagation()} aria-label="关闭" className="w-[30px] h-[30px] rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: C.surface3 }}>
                  <X size={14} weight="bold" color={C.text2} />
                </button>
              </div>
            </div>
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
              <div>{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Button({ children, onClick, href, tone = 'white', className = '' }: { children: ReactNode; onClick?: () => void; href?: string; tone?: 'white' | 'quiet' | 'stop'; className?: string }) {
  // Neutral primary is a lighter grey; every label stays white (theme.ts).
  const style = tone === 'white' ? { background: '#454A54', color: '#FFFFFF' } : tone === 'stop' ? FILLED('#D63B30') : TONAL;
  const cls = `h-12 rounded-[14px] flex items-center justify-center gap-2 text-[15.5px] font-semibold active:scale-[0.98] transition-transform ${className}`;
  if (href) return <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls} style={style}>{children}</a>;
  return <button onClick={onClick} className={cls} style={style}>{children}</button>;
}
