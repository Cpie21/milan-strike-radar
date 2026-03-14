import RegionPage from '../[region]/page';

export default function Page() {
  return RegionPage({ params: Promise.resolve({ region: 'roma' }) });
}
