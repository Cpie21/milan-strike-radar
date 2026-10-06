import { redirect } from 'next/navigation';
import { cityPath, resolveCity } from '../../lib/cities';

// The lab became the site: its old links land on the city's own page.
export default async function LabPage({ searchParams }: { searchParams: Promise<{ city?: string; date?: string }> }) {
  const params = await searchParams;
  const path = cityPath(resolveCity(params.city || 'MILANO')?.tag || 'MILANO');
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  redirect(date ? `${path}?date=${date}` : path);
}
