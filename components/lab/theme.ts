import type { Sky } from '../../lib/lab/model';

// One visual system for the redesign, modelled on Apple Weather: a sky that
// carries the state, glass cards on top, white type throughout.

export const SKY: Record<Sky, { base: string; glow: string; card: string; tint: string }> = {
  // Clear: nothing announced for the selected day.
  'clear-day': {
    base: 'linear-gradient(180deg, #2C67AE 0%, #3F7DC4 38%, #6FA2D8 72%, #9CC2E8 100%)',
    glow: 'radial-gradient(120% 60% at 18% -8%, rgba(255,255,255,.38), rgba(255,255,255,0) 60%)',
    card: 'rgba(18, 52, 98, 0.24)',
    tint: '#2C67AE',
  },
  'clear-night': {
    base: 'linear-gradient(180deg, #070F24 0%, #0F1E40 45%, #1C3160 100%)',
    glow: 'radial-gradient(90% 50% at 80% -10%, rgba(140,170,255,.16), rgba(140,170,255,0) 60%)',
    card: 'rgba(255, 255, 255, 0.07)',
    tint: '#0F1E40',
  },
  // Overcast: at least one active strike on the selected day.
  'storm-day': {
    base: 'linear-gradient(180deg, #45505E 0%, #5B6675 40%, #7D8794 75%, #A0A8B2 100%)',
    glow: 'radial-gradient(110% 55% at 30% -10%, rgba(255,255,255,.22), rgba(255,255,255,0) 60%)',
    card: 'rgba(28, 34, 44, 0.26)',
    tint: '#45505E',
  },
  'storm-night': {
    base: 'linear-gradient(180deg, #0C0F15 0%, #161B24 45%, #252C38 100%)',
    glow: 'radial-gradient(90% 50% at 70% -10%, rgba(255,120,100,.10), rgba(255,120,100,0) 60%)',
    card: 'rgba(255, 255, 255, 0.07)',
    tint: '#161B24',
  },
};

// Status colours are tuned to read on every sky, never on white.
export const C = {
  text: '#FFFFFF',
  text2: 'rgba(255,255,255,0.72)',
  text3: 'rgba(255,255,255,0.5)',
  hair: 'rgba(255,255,255,0.16)',
  track: 'rgba(255,255,255,0.14)',
  stop: '#FF7A6B',
  stopSolid: '#F2564A',
  ok: '#7EE2A0',
  pend: '#FFCB6B',
  cancel: 'rgba(255,255,255,0.38)',
};

export const LINE_COLORS: Record<string, [string, string]> = {
  M1: ['#E30613', '#FFFFFF'], M2: ['#00A13A', '#FFFFFF'], M3: ['#F8C300', '#1A1A1A'], M4: ['#0072BC', '#FFFFFF'], M5: ['#9A5BA8', '#FFFFFF'],
};

export const glass = (card: string) => ({
  background: card,
  backdropFilter: 'blur(22px) saturate(150%)',
  WebkitBackdropFilter: 'blur(22px) saturate(150%)',
  boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.22), 0 0 0 0.5px rgba(255,255,255,0.08)',
});

// Apple-style ease and springs: settle quickly, a hint of overshoot only
// where something physically moves.
export const EASE = [0.32, 0.72, 0, 1] as const;
export const SPRING = { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.9 };
export const SPRING_SOFT = { type: 'spring' as const, stiffness: 300, damping: 34 };
export const SPRING_SHEET = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.95 };
