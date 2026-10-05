import type { ReactNode } from 'react';
import { Barlow_Semi_Condensed } from 'next/font/google';

// Numerals face for the lab only; see components/lab/theme.ts (TYPE).
const num = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-num', display: 'swap' });

export default function LabLayout({ children }: { children: ReactNode }) {
  return <div className={num.variable}>{children}</div>;
}
