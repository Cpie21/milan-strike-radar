import type { Metadata } from 'next';
import { CITIES, cityPath, resolveCity } from '../../lib/cities';
import { addDaysIso } from '../../lib/romeDate';
import { readCityStrikes, romeToday, serverDatabase } from '../../lib/strikeQuery';
import { windowsDisplay, type StrikeEvent } from '../../lib/strikePresentation';
import type { TimingEvidence } from '../../lib/strikeEvidence';
import { scopeOf, scopeTitle } from '../../lib/strikeScope';
import { aggregateStrikes, filterStrikesForRegion } from '../../components/utils';
import type { CardStatus, GuaranteeSource, Mode, ModeCard, Source } from '../../lib/lab/model';
import LabApp from '../../components/lab/LabApp';

// Redesign playground. Not linked from the product and not indexed.
export const metadata: Metadata = { title: 'Lab · 意大利罢工查询', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Aggregated = {
  id: string;
  date: string;
  category: Mode;
  status: CardStatus;
  provider?: string;
  region?: string;
  guarantee_windows?: { start: string; end: string }[];
  affected_lines?: string[];
  has_unknown_timing?: boolean;
  display_time?: string;
  guaranteeSource?: GuaranteeSource;
  timing_evidence?: TimingEvidence;
  strike_events?: StrikeEvent[];
};

const toSources = (event: StrikeEvent): Source[] => [
  ...(event.source_url ? [{ name: '意大利交通部 MIT', url: event.source_url, authority: 'official' }] : []),
  ...(event.timing_evidence?.sources || []).map(s => ({ name: s.name, url: s.url, authority: s.authority })),
];

// Rome clock at render time, so the first frame already shows the right sky.
function romeMinutesNow() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

const unique = (sources: Source[]) => sources.filter((s, i) => sources.findIndex(o => o.url === s.url) === i);

export default async function LabPage({ searchParams }: { searchParams: Promise<{ city?: string; date?: string }> }) {
  const params = await searchParams;
  const city = resolveCity(params.city || 'MILANO') || CITIES[0];
  const today = romeToday();
  const from = addDaysIso(today, -7);
  const raw = await readCityStrikes(city.tag, from);
  const scoped = filterStrikesForRegion(raw, city.tag);
  const nationalKeys = new Set((scoped as { region?: string; source_key?: string }[]).filter(r => r.region === 'NATIONAL').map(r => r.source_key));
  const days = aggregateStrikes(scoped, city.tag) as unknown as Aggregated[];

  const cards: ModeCard[] = days.map(day => {
    const events = day.strike_events || [];
    const scope = day.category === 'AIRPORT' ? scopeOf(day as Parameters<typeof scopeOf>[0]) : null;
    return {
      id: day.id,
      date: day.date,
      scope: scope && scope !== 'UNKNOWN' ? scopeTitle(scope) : '',
      category: day.category,
      status: day.status,
      provider: day.provider || '',
      national: events.some(e => nationalKeys.has(e.source_key)),
      windows: day.timing_evidence?.windows || [],
      // Guarantees without a known origin are not shown, as on the live page.
      guarantees: (day.guaranteeSource || 'UNKNOWN') === 'UNKNOWN' ? [] : day.guarantee_windows || [],
      guaranteeSource: day.guaranteeSource || 'UNKNOWN',
      guaranteeKind: day.timing_evidence?.fields?.guaranteeType || (day.category === 'AIRPORT' ? 'PROTECTED_FLIGHTS' : 'GUARANTEED_SERVICE'),
      displayTime: day.display_time || '',
      lines: day.affected_lines || [],
      unknownTiming: Boolean(day.has_unknown_timing),
      confidence: day.timing_evidence?.confidence || 'official',
      sources: unique(events.flatMap(toSources)),
      events: events.map(e => ({ provider: e.provider || '', status: e.status || '', display: e.windows.length ? windowsDisplay(e.windows) : '', sources: unique(toSources(e)) })),
    };
  });

  // One query for every city's headline, like Apple Weather's city list.
  const { data: upcoming } = await serverDatabase().from('strikes')
    .select('id,date,category,provider,region,status,display_time,duration_hours,strike_windows,guarantee_windows,affected_lines,data_source,source_url,source_key,timing_evidence')
    .gte('date', today).neq('status', 'STALE').order('date').limit(5000);
  const cityStatus: Record<string, { today: Mode[]; next: string | null; nextModes: Mode[] }> = {};
  for (const c of CITIES) {
    const rows = (filterStrikesForRegion(upcoming || [], c.tag) as { date: string; category: Mode; status: string }[]).filter(r => r.status !== 'CANCELLED');
    const next = rows.find(r => r.date > today)?.date ?? null;
    cityStatus[c.tag] = {
      today: [...new Set(rows.filter(r => r.date === today).map(r => r.category))],
      next,
      nextModes: [...new Set(rows.filter(r => r.date === next).map(r => r.category))],
    };
  }

  const { data: sync } = await serverDatabase().from('strike_sync_runs').select('completed_at').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle();
  const lastDate = cards.reduce((last, c) => (c.date > last ? c.date : last), addDaysIso(today, 14));
  const selected = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  return (
    <LabApp
      city={{ tag: city.tag, zh: city.zh, en: city.en, path: cityPath(city.tag) }}
      cities={CITIES.map(c => ({ tag: c.tag, zh: c.zh, en: c.en, path: cityPath(c.tag) }))}
      cards={cards}
      today={today}
      from={from}
      to={lastDate}
      initialDate={selected}
      lastSync={sync?.completed_at ?? null}
      initialMinutes={romeMinutesNow()}
      cityStatus={cityStatus}
    />
  );
}
