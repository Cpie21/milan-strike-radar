import type { ReactNode } from 'react';
import { Barlow_Semi_Condensed, Permanent_Marker } from 'next/font/google';

// Lab-only faces; see components/lab/theme.ts (TYPE).
const num = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-num', display: 'swap' });
// Marker lettering for the graffiti tags only.
const tag = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-tag', display: 'swap' });

export default function LabLayout({ children }: { children: ReactNode }) {
  return <div className={`${num.variable} ${tag.variable}`}>{children}</div>;
}
