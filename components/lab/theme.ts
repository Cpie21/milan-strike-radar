import type { Mode } from '../../lib/lab/model';

// One visual system: solid dark surfaces, one radius family. Colour has two
// jobs only: hue says which transport (so "is my mode hit?" is a glance),
// and green says service still runs. Calm days carry no colour at all.

export const C = {
  bg: '#0A0B0D',
  surface: '#15171B',
  surface2: '#1E2025',
  surface3: '#272A30',
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.12)',
  text: '#F5F6F7',
  text2: 'rgba(245,246,247,0.66)',
  text3: 'rgba(245,246,247,0.42)',
  stop: '#FF5A4E',
  stopSoft: 'rgba(255,90,78,0.14)',
  ok: '#3DDC84',
  okSoft: 'rgba(61,220,132,0.13)',
  pend: '#F5B544',
  pendSoft: 'rgba(245,181,68,0.13)',
  cancel: 'rgba(245,246,247,0.32)',
  ink: '#0A0B0D', // text on white
};

// Mode hues, tuned for dark surfaces. Metro takes Milan's metro red; buses
// the orange of ATM trams and buses; trains a rail blue; flights violet.
export const MODE_COLOR: Record<Mode, { main: string; soft: string }> = {
  SUBWAY: { main: '#FF5A4E', soft: 'rgba(255,90,78,0.16)' },
  BUS: { main: '#FF9F2E', soft: 'rgba(255,159,46,0.16)' },
  TRAIN: { main: '#4C8DFF', soft: 'rgba(76,141,255,0.18)' },
  AIRPORT: { main: '#A97FFF', soft: 'rgba(169,127,255,0.18)' },
};

// Controls, one rule. Filled (white or a mode hue) always takes ink text —
// every hue above clears 6:1 against ink, while white on orange would not.
// Tonal (surface3) takes the normal text colour. Tinted (a hue's soft fill
// with its main colour) is for state, never for something you press.
export const FILLED = (bg = '#FFFFFF') => ({ background: bg, color: '#0A0B0D' });
export const TONAL = { background: '#272A30', color: '#F5F6F7' };

// Type: digits are what people read (times, dates), so they get a face of
// their own — Barlow Semi Condensed, drawn from highway signage: open
// counters, tabular, narrow enough to keep "21:00 → 21:00" on one centred
// line. Chinese falls through to PingFang. On a dark ground strokes read
// heavier, so weights stay a step lighter than on light themes: 600 for
// display and titles, 400 for reading, 500 only where text is small.
export const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans SC", "Helvetica Neue", sans-serif';
export const NUM = `var(--font-num), ${SANS}`;
export const TYPE = {
  display: 'text-[40px] leading-[1.05] font-semibold tracking-[-0.005em] tabular-nums', // with NUM
  page: 'text-[28px] leading-[1.15] font-semibold tracking-tight',
  title: 'text-[20px] leading-[1.25] font-semibold',
  body: 'text-[15px] leading-[1.45] font-normal',
  action: 'text-[15px] font-semibold',
  label: 'text-[13px] leading-[1.35] font-medium',
  caption: 'text-[11.5px] leading-[1.3] font-medium',
};

export const LINE_COLORS: Record<string, [string, string]> = {
  M1: ['#E30613', '#FFFFFF'], M2: ['#00A13A', '#FFFFFF'], M3: ['#F8C300', '#1A1A1A'], M4: ['#0072BC', '#FFFFFF'], M5: ['#9A5BA8', '#FFFFFF'],
};

export const R = { card: 24, inner: 16, control: 14, chip: 999 };

// Tool motion: quick and settled; a little spring only where something
// physically travels (selection, sheets).
export const EASE = [0.32, 0.72, 0, 1] as const;
export const SPRING = { type: 'spring' as const, stiffness: 520, damping: 40, mass: 0.8 };
export const SPRING_SOFT = { type: 'spring' as const, stiffness: 320, damping: 36 };
export const SPRING_SHEET = { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.9 };
