import type { Metadata } from 'next';
import { CITIES, cityPath, resolveCity } from '../../lib/cities';
import { addDaysIso } from '../../lib/romeDate';
import { readCityStrikes, romeToday, serverDatabase } from '../../lib/strikeQuery';
import { windowsDisplay, type StrikeEvent } from '../../lib/strikePresentation';
import type { TimingEvidence } from '../../lib/strikeEvidence';
import { geographyContext, indirectRail, railTitle, scopeOf, scopeTitle } from '../../lib/strikeScope';
import { aggregateStrikes, filterStrikesForRegion } from '../../components/utils';
import type { CardStatus, GuaranteeSource, Mode, ModeCard, OfficialRecord, Quote, Source } from '../../lib/lab/model';
import { AVIATION_STRIKE_SOURCES, CITY_STRIKE_SOURCES, NATIONAL_STRIKE_SOURCES } from '../../lib/strikeSources';
import LabApp from '../../components/lab/LabApp';
import { translateAll } from '../../lib/lab/translate';

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
  lineScope?: 'ALL_LINES' | 'SPECIFIC_LINES' | 'UNKNOWN';
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

type RawPayload = { unions?: string; provider?: string; sector?: string; rilevanza?: string; rawRegion?: string; province?: string; modalita?: string; proclamationDate?: string; sourceUrl?: string };
const KNOWN_SOURCES = [...CITY_STRIKE_SOURCES, ...AVIATION_STRIKE_SOURCES, ...NATIONAL_STRIKE_SOURCES];
function sourceName(url: string) {
  try {
    const host = new URL(url).hostname;
    return KNOWN_SOURCES.find(s => s.urls.some(u => new URL(u).hostname === host))?.name ?? host.replace(/^www\./, '');
  } catch { return url; }
}
const isoFromItalian = (value?: string) => {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

function recordsFor(events: StrikeEvent[], raw: Map<string, RawPayload>): OfficialRecord[] {
  const seen = new Set<string>();
  return events.flatMap(e => {
    const p = raw.get(String(e.id));
    const key = e.source_key || String(e.id);
    if (!p || seen.has(key)) return [];
    seen.add(key);
    return [{
      unions: p.unions || e.unions || '',
      workforce: p.provider || '',
      sector: p.sector || '',
      relevance: p.rilevanza || '',
      area: [p.rawRegion, p.province && p.province !== 'Tutte' ? p.province : ''].filter(Boolean).join(' · '),
      mode: p.modalita || '',
      proclaimed: isoFromItalian(p.proclamationDate),
      windows: e.windows || [],
      url: p.sourceUrl || e.source_url || 'https://scioperi.mit.gov.it/mit2/public/scioperi',
    }];
  });
}

function quotesFor(events: StrikeEvent[]): Quote[] {
  const quotes: Quote[] = [];
  for (const e of events) {
    const timing = e.timing_evidence?.fields?.timing;
    if (timing?.url && timing.excerpt) quotes.push({ name: sourceName(timing.url), url: timing.url, excerpt: timing.excerpt, checkedAt: null, official: timing.source === 'OPERATOR_OFFICIAL' || timing.source === 'MIT' });
    for (const s of e.timing_evidence?.sources || []) {
      if (s.excerpt) quotes.push({ name: s.name || sourceName(s.url), url: s.url, excerpt: s.excerpt, checkedAt: s.checked_at?.slice(0, 10) || null, official: s.authority === 'official' });
    }
  }
  // One quote per page; keep the dated copy when both exist. MIT's own
  // wording is already in the register entry.
  return quotes.filter((q, i) => !q.url.includes('scioperi.mit.gov.it') && quotes.findIndex(o => o.url === q.url) === i)
    .map(q => ({ ...q, checkedAt: q.checkedAt ?? quotes.find(o => o.url === q.url && o.checkedAt)?.checkedAt ?? null }))
    .sort((a, b) => Number(b.official) - Number(a.official));
}

export default async function LabPage({ searchParams }: { searchParams: Promise<{ city?: string; date?: string }> }) {
  const params = await searchParams;
  const city = resolveCity(params.city || 'MILANO') || CITIES[0];
  const today = romeToday();
  const from = addDaysIso(today, -7);
  const raw = await readCityStrikes(city.tag, from);
  const scoped = filterStrikesForRegion(raw, city.tag);
  const nationalKeys = new Set((scoped as { region?: string; source_key?: string }[]).filter(r => r.region === 'NATIONAL').map(r => r.source_key));
  const days = aggregateStrikes(scoped, city.tag) as unknown as Aggregated[];
  // The MIT register row behind each event, for card-specific sourcing.
  const ids = [...new Set(days.flatMap(d => (d.strike_events || []).map(e => e.id)).filter(Boolean).map(String))];
  const registry = new Map<string, RawPayload>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await serverDatabase().from('strikes').select('id,raw_payload').in('id', ids.slice(i, i + 200));
    (data || []).forEach((r: { id: string; raw_payload: RawPayload | null }) => r.raw_payload && registry.set(String(r.id), r.raw_payload));
  }

  const cards: ModeCard[] = days.map(day => {
    const events = day.strike_events || [];
    const scope = day.category === 'AIRPORT' || day.category === 'TRAIN' ? scopeOf(day as Parameters<typeof scopeOf>[0]) : null;
    const scopeLabel = !scope ? '' : day.category === 'TRAIN' ? railTitle(scope) : scope !== 'UNKNOWN' ? scopeTitle(scope) : '';
    const geography = [...new Set(events.map(e => geographyContext(e.timing_evidence?.fields)).filter(Boolean))]
      .map(zh => ({ zh, en: geographyContext(events.find(e => geographyContext(e.timing_evidence?.fields) === zh)?.timing_evidence?.fields, 'en') }));
    return {
      id: day.id,
      date: day.date,
      scope: scopeLabel,
      scopeType: scope || '',
      indirect: day.category === 'TRAIN' && !!scope && indirectRail(scope),
      lineScope: day.lineScope || 'UNKNOWN',
      geography,
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
      records: recordsFor(events.filter(e => e.status !== 'CANCELLED'), registry),
      quotes: quotesFor(events.filter(e => e.status !== 'CANCELLED')),
    };
  });

  // Italian originals the reader may not read: MIT wording and official notices.
  const translations = await translateAll(cards.flatMap(c => [
    c.provider, c.scope,
    ...c.records.flatMap(r => [r.workforce, r.mode, r.area]),
    ...c.quotes.filter(q => q.official).map(q => q.excerpt),
  ]));

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
      translations={translations}
    />
  );
}
