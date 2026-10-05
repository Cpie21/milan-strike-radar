'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import { AirplaneTilt, Bus, Subway, Train, X, type IconWeight } from '@phosphor-icons/react';
import type { Mode } from '../../lib/lab/model';
import { C, FILLED, LINE_COLORS, MODE_COLOR, TONAL } from './theme';

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

// Sheets, after iOS. Tall sheets open at a medium detent with the rest of
// the content running off the bottom edge, so it is visible that there is
// more. At that detent a drag anywhere moves the whole sheet; fully up, the
// content scrolls, and only when it is scrolled to the top does a downward
// drag move the sheet again. `dismissFromTop` closes straight from full
// height (used for answers: pulling down means "done with this").
// Short sheets open at their own height, with no grabber.
const MEDIUM = 0.62;

export function Sheet({ open, onClose, title, children, tall = false, large = false, dismissFromTop = false, header }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; tall?: boolean; large?: boolean; dismissFromTop?: boolean; header?: ReactNode;
}) {
  const detents = tall || large ? [MEDIUM, 1] : undefined;
  const [snap, setSnap] = useState<number | string | null>(large ? 1 : MEDIUM);
  useEffect(() => { if (open) { const t = setTimeout(() => setSnap(large ? 1 : MEDIUM), 0); return () => clearTimeout(t); } }, [open, large]);
  const full = !detents || snap === 1;
  const body = (
      <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-[90]" style={{ background: 'rgba(0,0,0,0.55)' }} />
      <Drawer.Content aria-describedby={undefined} className="fixed z-[95] inset-x-0 bottom-0 mx-auto w-full max-w-[520px] flex flex-col outline-none"
        style={{ background: C.surface, color: C.text, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: detents ? '94dvh' : undefined, maxHeight: '94dvh', boxShadow: `0 -0.5px 0 ${C.lineStrong}, 0 -20px 60px rgba(0,0,0,0.5)` }}>
        {detents ? <div className="pt-2 flex justify-center"><span className="w-9 h-[5px] rounded-full" style={{ background: C.lineStrong }} /></div> : <div className="h-2" />}
        <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-3 select-none">
          {header ?? <Drawer.Title className="text-[18px] font-semibold tracking-tight">{title}</Drawer.Title>}
          {header && <Drawer.Title className="sr-only">{title}</Drawer.Title>}
          <button onClick={onClose} aria-label="关闭" className="w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: C.surface3 }}>
            <X size={14} weight="bold" color={C.text2} />
          </button>
        </div>
        <div className="flex-1 min-h-0 px-5 overscroll-contain" style={{ overflowY: full ? 'auto' : 'hidden', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  );
  const change = (o: boolean) => { if (!o) onClose(); };
  if (!detents) return <Drawer.Root open={open} onOpenChange={change}>{body}</Drawer.Root>;
  return (
    <Drawer.Root open={open} onOpenChange={change} snapPoints={detents} activeSnapPoint={snap} fadeFromIndex={0}
      setActiveSnapPoint={next => { if (dismissFromTop && snap === 1 && next === MEDIUM) { onClose(); return; } setSnap(next); }}>
      {body}
    </Drawer.Root>
  );
}

export function Button({ children, onClick, href, tone = 'white', className = '' }: { children: ReactNode; onClick?: () => void; href?: string; tone?: 'white' | 'quiet' | 'stop'; className?: string }) {
  // Neutral primary is a lighter grey; every label stays white (theme.ts).
  const style = tone === 'white' ? { background: '#454A54', color: '#FFFFFF' } : tone === 'stop' ? FILLED('#D63B30') : TONAL;
  const cls = `h-12 rounded-[14px] flex items-center justify-center gap-2 text-[15.5px] font-semibold active:scale-[0.98] transition-transform ${className}`;
  if (href) return <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls} style={style}>{children}</a>;
  return <button onClick={onClick} className={cls} style={style}>{children}</button>;
}
