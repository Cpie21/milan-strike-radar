import type { Mode } from '../../lib/lab/model';

// One visual system: solid dark surfaces, one radius family. Colour has two
// jobs only: hue says which transport (so "is my mode hit?" is a glance),
// and mint says "fine". Guaranteed hours are drawn in timetable ivory: the
// service simply runs, so they look like the normal printed timetable,
// not like another colour competing with the mode. Calm days carry no colour.

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
  ok: '#4AD9A7',
  okSoft: 'rgba(74,217,167,0.13)',
  run: '#EDE6D3', // guaranteed hours: the service runs as timetabled
  pend: '#F5B544',
  pendSoft: 'rgba(245,181,68,0.13)',
  cancel: 'rgba(245,246,247,0.32)',
  ink: '#0A0B0D', // text on white
};

// Mode hues, from what these things look like in Italy, so people match
// the colour to what they ride:
//   metro   – rosso: the red "M" of Milan's and Rome's metro signs
//   bus     – arancio ministeriale: the orange Italian buses wore for decades
//   train   – blu FS: Italian station signs are white on blue, and so are the
//             Ferrovie dello Stato and Trenitalia marks
//   airport – viola: the sky's other colour, kept clear of the rail blue
// `main` marks things on dark (glyphs, bars, text); `deep` is the fill
// behind white text (all >= 4.5:1); `soft` tints a surface.
export const MODE_COLOR: Record<Mode, { main: string; deep: string; soft: string }> = {
  SUBWAY: { main: '#FF5147', deep: '#D52B20', soft: 'rgba(255,81,71,0.16)' },
  BUS: { main: '#FF8F1F', deep: '#BF5700', soft: 'rgba(255,143,31,0.16)' },
  TRAIN: { main: '#5B93FF', deep: '#2559C9', soft: 'rgba(91,147,255,0.17)' },
  AIRPORT: { main: '#B08CFF', deep: '#7650DB', soft: 'rgba(176,140,255,0.17)' },
};

// Controls, one rule: on this dark ground every button label is white.
// Primary = a mode's deep fill (contextual: the card's own colour).
// Secondary = tonal grey. Tinted (soft fill + main text) is state only,
// never something you press. White surfaces are reserved for selection
// (the chosen date), not for buttons.
export const FILLED = (deep: string) => ({ background: deep, color: '#FFFFFF' });
export const TONAL = { background: '#2C3036', color: '#F5F6F7' };

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
