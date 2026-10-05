import type { Metadata } from 'next';
import SolariGallery from './SolariGallery';

export const metadata: Metadata = { title: 'Lab · Solari', robots: { index: false, follow: false } };

export default function Page() {
  return <SolariGallery />;
}
