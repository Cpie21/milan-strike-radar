import { notFound } from 'next/navigation';
import CityPage from '../../components/CityPage';
import { resolveCity } from '../../lib/cities';

export const revalidate = 3600;

export default async function Page({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  const city = resolveCity(region);
  if (!city) notFound();
  return <CityPage tag={city.tag} />;
}
