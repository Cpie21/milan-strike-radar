'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
// more; swiping up opens them fully. Pulling down always means "done":
// from either height it closes, it never parks back at the medium detent
// (the sheet is a transient view, so one gesture should end it, as Apple's
// HIG and Material's modal bottom sheets both treat a downward swipe).
// Short sheets open at their own height.
//
// Gestures are split so they never fight: the grabber and header drag the
// sheet (the drawer's own drag); the content area belongs to the content.
// There, at the medium detent a swipe up expands and a swipe down closes;
// fully up the content scrolls natively, and only a pull that starts with
// the content already at the top moves the sheet, following the finger,
// then closes past a threshold. Sideways
// swipes (rails, carousels, the wall) are left alone.
const MEDIUM = 0.62;

function useContentGestures(node: HTMLDivElement | null, on: boolean, full: boolean, { expand, collapse }: { expand: () => void; collapse: () => void }) {
  const live = useRef({ full, expand, collapse });
  useEffect(() => { live.current = { full, expand, collapse }; });
  useEffect(() => {
    if (!node || !on) return;
    let x0 = 0, y0 = 0, axis: 'x' | 'y' | null = null, fromTop = false, offset = 0, tracking = false, base: number | null = null;
    // The drawer positions itself with a transform; follow the finger on
    // top of it, then hand back.
    const drawer = node.closest('[data-vaul-drawer]') as HTMLElement | null;
    const place = (y: number, animate: boolean) => {
      if (!drawer || base === null) return;
      drawer.style.transition = animate ? 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
      drawer.style.transform = `translate3d(0, ${base + y}px, 0)`;
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = null; offset = 0; tracking = true; base = null;
      fromTop = node.scrollTop <= 0;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? 'y' : 'x';
      if (axis !== 'y') return;
      if (!live.current.full) offset = dy > 0 ? dy * 0.7 : Math.max(-24, dy * 0.2);
      else if (fromTop && dy > 0 && node.scrollTop <= 0) offset = dy * 0.55;
      else { offset = 0; return; }
      if (e.cancelable) e.preventDefault();
      if (base === null && drawer) base = new DOMMatrix(getComputedStyle(drawer).transform).m42;
      place(offset, false);
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
      const moved = base !== null;
      if (axis === 'y' && !live.current.full && dy < -36) { if (moved) place(0, true); live.current.expand(); }
      else if (axis === 'y' && offset > 70) live.current.collapse();
      else if (moved) place(0, true);
      offset = 0;
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    };
  }, [node, on]);
}

export function Sheet({ open, onClose, title, children, tall = false, large = false, header, expand = false, fit = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; tall?: boolean; large?: boolean; header?: ReactNode;
  expand?: boolean; // content that needs room asks for full height itself
  // The first detent is the content's own height, down to the element marked
  // data-sheet-fit (or all of it), so the sheet shows exactly what matters.
  fit?: boolean;
}) {
  // A callback ref: the drawer mounts its content after this renders.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [fitPx, setFitPx] = useState<number | null>(null);
  useEffect(() => {
    if (!fit || !open || !scroller) return;
    const measure = () => {
      const drawer = scroller.closest('[data-vaul-drawer]') as HTMLElement | null;
      const content = scroller.firstElementChild as HTMLElement | null;
      if (!drawer || !content) return;
      // the marked end, else the page in view (a carousel of pages), else all of it
      const end = (scroller.querySelector('[data-sheet-fit]') ?? scroller.querySelector('[data-sheet-page]') ?? content) as HTMLElement;
      const h = Math.max(240, end.getBoundingClientRect().bottom - drawer.getBoundingClientRect().top + scroller.scrollTop + 36);
      // vaul offsets a px detent from the window's height, not the drawer's
      setFitPx(Math.round(Math.min(window.innerHeight, h + window.innerHeight - drawer.offsetHeight)));
    };
    // Content animates in (heights, offsets): measure once it has settled.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => { clearTimeout(timer); timer = setTimeout(measure, 140); };
    measure();
    const mo = new MutationObserver(later);
    mo.observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'data-sheet-fit', 'data-sheet-page'] });
    window.addEventListener('resize', later);
    return () => { clearTimeout(timer); mo.disconnect(); window.removeEventListener('resize', later); };
  }, [fit, open, scroller]);
  const low: number | string = fit && fitPx ? `${fitPx}px` : MEDIUM;
  const detents = tall || large ? [low, 1] : undefined;
  const [snap, setSnap] = useState<number | string | null>(large ? 1 : MEDIUM);
  useEffect(() => { if (open) { const t = setTimeout(() => setSnap(large ? 1 : low), 0); return () => clearTimeout(t); } }, [open, large]); // eslint-disable-line react-hooks/exhaustive-deps
  // the fitted height follows the content, unless the sheet is fully up
  useEffect(() => { if (open && fit) { const t = setTimeout(() => setSnap(s => (s === 1 ? 1 : low)), 0); return () => clearTimeout(t); } }, [low]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && expand && detents) { const t = setTimeout(() => setSnap(1), 0); return () => clearTimeout(t); } }, [open, expand]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = !detents || snap === 1;
  useContentGestures(scroller, !!detents && open, full, {
    expand: () => setSnap(1),
    collapse: onClose,
  });
  const body = (
      <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-[90]" style={{ background: 'rgba(0,0,0,0.55)' }} />
      <Drawer.Content aria-describedby={undefined} className="fixed z-[95] inset-x-0 bottom-0 mx-auto w-full max-w-[520px] flex flex-col outline-none"
        style={{ background: C.surface, color: C.text, borderTopLeftRadius: 28, borderTopRightRadius: 28, height: detents ? '94dvh' : undefined, maxHeight: '94dvh', boxShadow: `0 -0.5px 0 ${C.lineStrong}, 0 -20px 60px rgba(0,0,0,0.5)`}}>
        {/* the grabber on every sheet: any of them can be pulled down */}
        <div className="pt-2 pb-1.5 flex justify-center"><span className="w-9 h-[5px] rounded-full" style={{ background: C.lineStrong }} /></div>
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 select-none">
          {header ?? <Drawer.Title className="text-[18px] font-semibold tracking-tight">{title}</Drawer.Title>}
          {header && <Drawer.Title className="sr-only">{title}</Drawer.Title>}
          <button onClick={onClose} aria-label="关闭 / Close" className="w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ background: C.surface3 }}>
            <X size={14} weight="bold" color={C.text2} />
          </button>
        </div>
        <div ref={setScroller} data-vaul-no-drag={detents ? '' : undefined} className="flex-1 min-h-0 px-5 overscroll-contain" style={{ overflowY: full ? 'auto' : 'hidden', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  );
  const change = (o: boolean) => { if (!o) onClose(); };
  if (!detents) return <Drawer.Root open={open} onOpenChange={change}>{body}</Drawer.Root>;
  return (
    <Drawer.Root open={open} onOpenChange={change} snapPoints={detents} activeSnapPoint={snap} fadeFromIndex={0}
      setActiveSnapPoint={next => { if (snap === 1 && next === low) { onClose(); return; } setSnap(next); }}>
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
