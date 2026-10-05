// One visual system: solid dark surfaces, one radius family, colour only
// for status. Decoration that competes with the strike facts is out.

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
