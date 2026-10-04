import type { Metadata } from 'next';
import { CITIES, resolveCity } from '../../lib/cities';
import { addDaysIso } from '../../lib/romeDate';
import { readCityStrikes, romeToday, serverDatabase } from '../../lib/strikeQuery';
import { windowsDisplay, type StrikeEvent } from '../../lib/strikePresentation';
import type { TimingEvidence } from '../../lib/strikeEvidence';
import { scopeOf, scopeTitle } from '../../lib/strikeScope';
import { aggregateStrikes, filterStrikesForRegion } from '../../components/utils';
import type { CardStatus, Mode, ModeCard, Source } from '../../lib/lab/model';
import LabHome from '../../components/lab/LabHome';

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
  timing_evidence?: TimingEvidence;
  strike_events?: StrikeEvent[];
};

const toSources = (event: StrikeEvent): Source[] => [
  ...(event.source_url ? [{ name: '意大利交通部 MIT', url: event.source_url, authority: 'official' }] : []),
  ...(event.timing_evidence?.sources || []).map(s => ({ name: s.name, url: s.url, authority: s.authority })),
];

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
      guarantees: day.guarantee_windows || [],
      lines: day.affected_lines || [],
      unknownTiming: Boolean(day.has_unknown_timing),
      confidence: day.timing_evidence?.confidence || 'official',
      sources: unique(events.flatMap(toSources)),
      events: events.map(e => ({ provider: e.provider || '', status: e.status || '', display: e.windows.length ? windowsDisplay(e.windows) : '', sources: unique(toSources(e)) })),
    };
  });

  const { data: sync } = await serverDatabase().from('strike_sync_runs').select('completed_at').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle();
  const lastDate = cards.reduce((last, c) => (c.date > last ? c.date : last), addDaysIso(today, 14));
  const selected = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  return (
    <LabHome
      city={{ tag: city.tag, zh: city.zh }}
      cities={CITIES.map(c => ({ tag: c.tag, zh: c.zh, en: c.en }))}
      cards={cards}
      today={today}
      from={from}
      to={lastDate}
      initialDate={selected}
      lastSync={sync?.completed_at ?? null}
    />
  );
}
