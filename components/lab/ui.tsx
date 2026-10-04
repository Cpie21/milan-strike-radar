'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Airplane, Bus, Subway, TrainRegional, X, type IconWeight } from '@phosphor-icons/react';
import type { Mode } from '../../lib/lab/model';
import { C, LINE_COLORS, SPRING_SHEET, glass } from './theme';

export function ModeGlyph({ mode, size = 20, weight = 'fill', color }: { mode: Mode; size?: number; weight?: IconWeight; color?: string }) {
  const props = { size, weight, color, 'aria-hidden': true } as const;
  if (mode === 'SUBWAY') return <Subway {...props} />;
  if (mode === 'BUS') return <Bus {...props} />;
  if (mode === 'TRAIN') return <TrainRegional {...props} />;
  return <Airplane {...props} />;
}

// Glass module in the Apple Weather idiom: small icon + label header, a
// hairline, then content.
export function Card({ tint, children, className = '' }: { tint: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[22px] ${className}`} style={glass(tint)}>
      {children}
    </section>
  );
}

export function CardHeader({ icon, label, trailing }: { icon: ReactNode; label: string; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 text-[13px] font-medium" style={{ color: C.text3 }}>
      <span className="flex">{icon}</span>
      <span className="tracking-[0.01em]">{label}</span>
      {trailing && <span className="ml-auto flex items-center">{trailing}</span>}
    </div>
  );
}

export function Hairline({ inset = 16 }: { inset?: number }) {
  return <div style={{ height: 0.5, background: C.hair, marginLeft: inset, marginRight: inset }} />;
}

export function LineBadge({ line }: { line: string }) {
  const [bg, fg] = LINE_COLORS[line.toUpperCase()] || ['rgba(255,255,255,0.16)', C.text];
  return <span className="inline-flex items-center h-[20px] px-1.5 rounded-[6px] text-[12px] font-semibold tabular-nums" style={{ background: bg, color: fg }}>{line}</span>;
}

// One sheet for every secondary page: grabber, title, round close button.
export function Sheet({ open, onClose, title, tint, children }: { open: boolean; onClose: () => void; title: string; tint: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[90]"
            style={{ background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="fixed z-[95] inset-x-0 bottom-0 mx-auto w-full max-w-[520px] max-h-[88dvh] flex flex-col rounded-t-[30px] overflow-hidden"
            style={{ ...glass(tint), background: `color-mix(in srgb, ${tint} 78%, rgba(10,14,22,0.9))`, color: C.text }}
            initial={reduce ? { opacity: 0 } : { y: '100%' }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={SPRING_SHEET}
            drag={reduce ? false : 'y'} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
          >
            <div className="pt-2 pb-1 flex justify-center"><span className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }} /></div>
            <div className="flex items-center justify-between px-5 pt-1 pb-3">
              <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
              <button onClick={onClose} aria-label="关闭" className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: 'rgba(255,255,255,0.16)' }}>
                <X size={15} weight="bold" />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function PrimaryButton({ children, onClick, href, tone = 'light' }: { children: ReactNode; onClick?: () => void; href?: string; tone?: 'light' | 'glass' | 'stop' }) {
  const style = tone === 'light'
    ? { background: '#FFFFFF', color: '#0E1A2E' }
    : tone === 'stop' ? { background: C.stopSolid, color: '#FFFFFF' } : { background: 'rgba(255,255,255,0.16)', color: C.text };
  const cls = 'h-12 w-full rounded-[14px] flex items-center justify-center gap-2 text-[16px] font-semibold active:scale-[0.98] transition-transform';
  if (href) return <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls} style={style}>{children}</a>;
  return <button onClick={onClick} className={cls} style={style}>{children}</button>;
}
