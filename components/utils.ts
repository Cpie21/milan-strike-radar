import { eventWindows, mergeEvidenceWindows, numericWindows, intersectGuarantees, windowsDisplay, windowsDuration, type StrikeEvent } from '../lib/strikePresentation';
import type { TimingEvidence } from '../lib/strikeEvidence';
import { CITIES } from '../lib/cities';
import {
  canonicalizeRegionValue,
  inferRegionTagFromText,
  normalizeAirportAffectedLines,
  normalizeProviderList,
  sanitizeAffectedLines,
} from '../lib/strikeNormalization';

type StrikeWindow = {
  start: string;
  end: string;
};

type StrikeLike = {
  id?: number | string;
  category?: string;
  date?: string;
  data_source?: string;
  source_url?: string;
  source_key?: string;
  timing_evidence?: TimingEvidence | null;
  display_time?: string;
  duration_hours?: string;
  strike_windows?: StrikeWindow[];
  guarantee_windows?: StrikeWindow[];
  affected_lines?: string[];
  provider?: string;
  region?: string;
  note?: string;
  status?: string;
  strike_events?: StrikeEvent[];
  has_unknown_timing?: boolean;
};

const REGION_AIRPORT_KEYWORDS: Record<string, string[]> = Object.fromEntries(CITIES.map(city => [city.tag, [...city.airports, `${city.zh}相关机场`]]));
const REGION_DEFAULT_AIRPORT_LINES: Record<string, string[]> = Object.fromEntries(CITIES.map(city => [city.tag, city.airports.map(name => `${name}机场`)]));

export function parseDate(dateStr: string) {
  return new Date(dateStr);
}

// Maps backend strike categories to Chinese labels
export const categoryMap: Record<string, string> = {
  'FERROVIARIO': '火车',
  'TRASPORTO PUBBLICO LOCALE': '公交',
  'AEREO': '机场',
  'MARITTIMO': '轮船',
};

// Maps backend status to English status for frontend logic
export const statusMap: Record<string, 'active' | 'cancelled'> = {
  'CONFIRMED': 'active',
  'CANCELLED': 'cancelled',
  'REVOKED': 'cancelled',
  'SUSPENDED': 'cancelled',
  'REQUIRES_DETAIL': 'active',
  'UNCERTAIN': 'active',
};

export function normalizeDisplayLines(lines: string[], category?: string) {
  if (category !== 'AIRPORT') return sanitizeAffectedLines(lines || []);
  return normalizeAirportAffectedLines(lines || []);
}

function resolveStrikeRegion(strike: StrikeLike) {
  const explicit = canonicalizeRegionValue(strike?.region || '');
  const inferred = inferRegionTagFromText(
    `${strike?.provider || ''} ${strike?.affected_lines?.join(' ') || ''} ${strike?.note || ''}`
  );
  if (!explicit) return inferred;
  return explicit;
}

function filterAirportLinesForDisplay(lines: string[], currentRegion: string) {
  const keywords = REGION_AIRPORT_KEYWORDS[currentRegion] || [];
  const filtered = lines.filter((line) => keywords.some((keyword) => line.includes(keyword)));
  const hasConcreteAirport = filtered.some((line) => !line.includes('相关机场'));
  if (hasConcreteAirport) return filtered;
  if (filtered.length > 0) return REGION_DEFAULT_AIRPORT_LINES[currentRegion] || [];
  if (lines.some((line) => line.includes('全国相关机场'))) {
    return REGION_DEFAULT_AIRPORT_LINES[currentRegion] || [];
  }
  return [];
}

const NETWORK_WIDE_LINE_MARKERS = new Set(['全部线路', '全部车次']);

const CATEGORY_PROVIDER_FALLBACKS: Record<string, string> = {
  TRAIN: '铁路相关人员',
  SUBWAY: '公共交通人员',
  BUS: '公共交通人员',
  AIRPORT: '机场相关人员',
};
const VAGUE_PROVIDER_LABELS = new Set(['相关人员', '( )人员', '()人员']);

function normalizeProviderForDisplay(provider: string | undefined, category: string | undefined) {
  const normalized = normalizeProviderList(provider || '').filter((label) => !VAGUE_PROVIDER_LABELS.has(label));
  return normalized.join(' / ') || CATEGORY_PROVIDER_FALLBACKS[category || ''] || '相关人员';
}

function shouldDeriveBusVariantForMilanAtm(strike: StrikeLike) {
  if (!strike || strike.category !== 'SUBWAY') return false;

  const normalizedProvider = normalizeProviderForDisplay(strike.provider, strike.category);
  const normalizedRegion = resolveStrikeRegion(strike);
  const sanitizedLines = sanitizeAffectedLines(strike.affected_lines || []);

  if (normalizedRegion !== 'MILANO') return false;
  if (!normalizedProvider.includes('米兰交通局')) return false;

  return sanitizedLines.length === 0 || sanitizedLines.every((line) => NETWORK_WIDE_LINE_MARKERS.has(line));
}

function expandDerivedStrikeVariants(rawStrikes: Array<StrikeLike | null | undefined>) {
  return rawStrikes.flatMap((strike) => {
    if (!strike) return [];
    if (!shouldDeriveBusVariantForMilanAtm(strike)) return [strike];

    return [
      strike,
      {
        ...strike,
        category: 'BUS',
      },
    ];
  });
}

export function filterStrikesForRegion(rawStrikes: Array<StrikeLike | null | undefined>, regionTag: string) {
  if (!Array.isArray(rawStrikes)) return [];
  const allowedCategories = new Set(['TRAIN', 'SUBWAY', 'BUS', 'AIRPORT']);
  const currentRegion = canonicalizeRegionValue(regionTag) || 'MILANO';
  const localKeys = new Set(rawStrikes.filter(s=>s && s.source_key && resolveStrikeRegion(s) === currentRegion && s.status !== 'STALE' && eventWindows(s).length).map(s=>`${s!.source_key}|${s!.date}|${s!.category}`));

  const normalizedStrikes: Array<StrikeLike | null> = rawStrikes
    .map((strike) => {
      if (!strike) return null;
      if (strike.status === 'STALE') return null;
      if (strike.region === 'NATIONAL' && strike.source_key && localKeys.has(`${strike.source_key}|${strike.date}|${strike.category}`)) return null;
      // Only hide expired unverifiable legacy placeholders. Distinct official
      // announcements must not supersede each other just because providers match.
      if (!strike.source_key && !strike.strike_events?.length && strike.region === 'NATIONAL' && strike.category === 'TRAIN' &&
          ['UNCERTAIN', 'REQUIRES_DETAIL'].includes(strike.status || '') && strike.date &&
          strike.date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) return null;
      if (!strike.category || !allowedCategories.has(strike.category)) return null;

      const normalizedRegion = resolveStrikeRegion(strike);
      if (normalizedRegion && normalizedRegion !== currentRegion && normalizedRegion !== 'NATIONAL') {
        return null;
      }
      if (strike.category !== 'AIRPORT') {
        return {
          ...strike,
          region: normalizedRegion || currentRegion,
          provider: normalizeProviderForDisplay(strike.provider, strike.category),
        };
      }

      return {
        ...strike,
        region: normalizedRegion || currentRegion,
        provider: normalizeProviderForDisplay(strike.provider, strike.category),
        affected_lines: filterAirportLinesForDisplay(normalizeAirportAffectedLines(strike.affected_lines || [], {
          contextText: `${strike.provider || ''} ${(strike.affected_lines || []).join(' ')} ${strike.display_time || ''}`,
          regionTag: normalizedRegion || currentRegion,
        }), currentRegion),
      };
    });

  return normalizedStrikes
    .filter((strike) => {
      if (!strike) return false;
      if (strike.category !== 'AIRPORT') return true;
      return Array.isArray(strike.affected_lines) && strike.affected_lines.length > 0;
    })
    .filter((strike): strike is StrikeLike => Boolean(strike));
}

/** A single journey overview per city, date and transport type. Official
 * notices keep their own identities, status and timings inside strike_events. */
export function aggregateStrikes(rawStrikes: Array<StrikeLike | null | undefined>, regionTag?: string) {
  const map = new Map<string, StrikeLike[]>();
  const input = rawStrikes.filter((s): s is StrikeLike => Boolean(s));
  // Legacy metro-only rows may derive a bus card, but never overwrite an
  // explicitly scoped bus announcement with metro timing.
  const expanded = expandDerivedStrikeVariants(input).filter(s => input.includes(s) || !input.some(b => b.category === 'BUS' && b.date === s.date && b.region === s.region && b.source_key === s.source_key && (s.source_key || b.provider === s.provider)));
  for (const strike of expanded) {
    const region = regionTag || strike.region;
    const key = `${strike.date}|${region}|${strike.category}`;
    map.set(key, [...(map.get(key) || []), strike]);
  }
  return [...map].map(([key, rows]) => {
    const eventMap = new Map<string, StrikeEvent>();
    for (const row of rows) {
      const events = row.strike_events || [{ id: row.id, source_key:row.source_key, source_url:row.source_url, provider: row.provider, status:row.status, unions:row.timing_evidence?.unions, windows:eventWindows(row), guarantee_windows:row.guarantee_windows || [], timing_evidence: row.timing_evidence }];
      for (const event of events) {
        const identity = event.source_key || String(event.id || JSON.stringify([event.provider,event.status,event.windows]));
        eventMap.set(identity, event);
      }
    }
    const events = [...eventMap.values()].sort((a,b)=>String(a.source_key || a.id || a.provider).localeCompare(String(b.source_key || b.id || b.provider)));
    const active = events.filter(e => e.status !== 'CANCELLED');
    const relevant = active.length ? active : events;
    const windows = mergeEvidenceWindows(relevant.flatMap(e => e.windows));
    const sources = [...new Map(relevant.flatMap(e => e.timing_evidence?.sources || []).map(source => [source.url, source])).values()];
    const confidence = relevant.some(e=>e.timing_evidence?.confidence === 'conflict') ? 'conflict' : sources.some(s=>s.authority === 'reported') ? 'reported' : 'official';
    const first = rows[0];
    const allLines = rows.flatMap(r=>r.affected_lines || []);
    const broad = allLines.some(line => NETWORK_WIDE_LINE_MARKERS.has(line));
    return {
      ...first,
      id: `day-${key.replaceAll('|','-')}`,
      region: regionTag || first.region,
      source_key: undefined,
      provider: normalizeProviderForDisplay(relevant.map(e=>e.provider).join(' / '),first.category),
      status: !active.length ? 'CANCELLED' : active.some(e=>e.windows.length) ? 'CONFIRMED' : 'UNCERTAIN',
      display_time: windowsDisplay(windows),
      duration_hours: windowsDuration(windows),
      strike_windows: numericWindows(windows),
      guarantee_windows: active.some(e=>!e.windows.length) ? [] : intersectGuarantees(active),
      timing_evidence: { windows, confidence, sources, unions:[...new Set(relevant.map(e=>e.unions).filter(Boolean))].join(' / '), conflicts:relevant.flatMap(e=>e.timing_evidence?.conflicts || []) } as TimingEvidence,
      strike_events: events,
      has_unknown_timing: active.some(e=>!e.windows.length),
      affected_lines: first.category === 'AIRPORT' ? normalizeAirportAffectedLines(allLines, {contextText: rows.map(r=>r.provider).join(' '),regionTag:regionTag || first.region}) : broad ? ['全部线路'] : sanitizeAffectedLines([...new Set(allLines)]),
    };
  });
}
