import type { Mode } from '../../lib/lab/model';

// Minimal line glyphs drawn on a 20px grid; stroke follows currentColor.
const common = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function ModeIcon({ mode, size = 20 }: { mode: Mode; size?: number }) {
  const props = { ...common, width: size, height: size, 'aria-hidden': true };
  switch (mode) {
    case 'SUBWAY':
      return <svg {...props}><circle cx="10" cy="10" r="7.2" /><path d="M6.6 13V7.2l3.4 4 3.4-4V13" /></svg>;
    case 'BUS':
      return <svg {...props}><rect x="4" y="3.2" width="12" height="11.6" rx="2.4" /><path d="M4 9.6h12M6.6 17v-2.2M13.4 17v-2.2" /><circle cx="7" cy="12.2" r=".5" /><circle cx="13" cy="12.2" r=".5" /></svg>;
    case 'TRAIN':
      return <svg {...props}><rect x="5" y="2.8" width="10" height="11.4" rx="3" /><path d="M5 9.4h10M7.4 17.2l1.2-3M12.6 17.2l-1.2-3" /><circle cx="8" cy="11.8" r=".5" /><circle cx="12" cy="11.8" r=".5" /></svg>;
    case 'AIRPORT':
      return <svg {...props}><path d="M10 2.8c.8 0 1.2.8 1.2 1.8v3.6l5.6 3.2v1.6l-5.6-1.6v3.4l1.8 1.4v1.2L10 16.6l-3 .8v-1.2l1.8-1.4v-3.4L3.2 13v-1.6l5.6-3.2V4.6c0-1 .4-1.8 1.2-1.8z" /></svg>;
  }
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
