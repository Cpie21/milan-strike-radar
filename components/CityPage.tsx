import StrikeDashboard from './StrikeDashboard';
import { readCityStrikes, romeToday } from '../lib/strikeQuery';

export default async function CityPage({ tag }: { tag: string }) {
  const since = `${Number(romeToday().slice(0, 4)) - 1}-09-01`;
  // A read failure is an error, never evidence of "no strikes".
  const strikes = await readCityStrikes(tag, since);
  return <StrikeDashboard strikesData={strikes} regionTag={tag} />;
}
