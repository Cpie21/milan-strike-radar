import CityPage from '../../components/CityPage';

export const revalidate = 3600;

export default function Page() {
  return <CityPage tag="TORINO" />;
}
