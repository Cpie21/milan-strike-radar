import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { Barlow_Semi_Condensed } from 'next/font/google';

// Lab-only faces; see components/lab/theme.ts (TYPE).
const num = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-num', display: 'swap' });

// Safari tints its status bar and toolbars from theme-color and the page
// background: both are the lab's own near-black, so the page runs edge to
// edge with no seam. LabApp retints theme-color on strike days to match the
// glow at the top of the page.
export const viewport: Viewport = {
  themeColor: '#0A0B0D',
  colorScheme: 'dark',
  viewportFit: 'cover',
};

export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <div className={num.variable}>
      <style>{'html,body{background:#0A0B0D;color-scheme:dark;overscroll-behavior-y:none}'}</style>
      {children}
    </div>
  );
}
