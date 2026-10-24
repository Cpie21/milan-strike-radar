import { buildLineImpact, type DeclaredLineImpact } from '../lib/lineImpact';
import { eventWindows, mergeEvidenceWindows, numericWindows, intersectGuarantees, windowsDisplay, windowsDuration, aggregateTimingConfidence, type StrikeEvent } from '../lib/strikePresentation';
import { mergeServiceSchedules, type ServiceSchedule } from '../lib/serviceSchedule';
import type { OfficialStrikeRecord } from '../lib/officialStrikeRecord';
import type { TimingEvidence, EvidenceWindow } from '../lib/strikeEvidence';
import { scopeOf, type ScopeType, type GuaranteeSource } from '../lib/strikeScope';
import { CITIES } from '../lib/cities';
import { mergeLineScopes, unknownLineScope, type LineScope, type LineScopeKind } from '../lib/lineScope';
import { intersectGuaranteeEvidence, type GuaranteePolicy } from '../lib/operatorGuaranteeProfiles';
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
  last_seen_at?: string;
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
  has_unknown_lines?: boolean;
  scopeType?: ScopeType;
  guaranteeSource?: GuaranteeSource;
  lineScope?: LineScopeKind;
  lineScopeEvidence?: LineScope;
  lineImpacts?: {source_key?:string;impact:DeclaredLineImpact}[];
  guaranteeEvidenceWindows?: EvidenceWindow[];
  guaranteePolicies?: GuaranteePolicy[];
  serviceSchedule?: ServiceSchedule;
  official_record?: OfficialStrikeRecord | null;
};

const REGION_AIRPORT_KEYWORDS: Record<string, string[]> = Object.fromEntries(CITIES.map(city => [city.tag, [...city.airports, `${city.zh}相关机场`]]));

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
  return lines.filter(line=>!line.includes('相关机场') && keywords.some(keyword=>line.includes(keyword)));
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
      if (!normalizedRegion || normalizedRegion === 'UNKNOWN' || scopeOf(strike)==='CARGO' && strike.category==='AIRPORT') return null;
      if (normalizedRegion && normalizedRegion !== currentRegion && normalizedRegion !== 'NATIONAL') {
        return null;
      }
      if (strike.category !== 'AIRPORT') {
        return {
          ...strike,
          region: normalizedRegion,
          provider: normalizeProviderForDisplay(strike.provider, strike.category),
        };
      }

      return {
        ...strike,
        region: normalizedRegion,
        provider: normalizeProviderForDisplay(strike.provider, strike.category),
        affected_lines: filterAirportLinesForDisplay(normalizeAirportAffectedLines(strike.affected_lines || [], {
          contextText: (strike.affected_lines || []).join(' '),
          regionTag: normalizedRegion || currentRegion,
        }), currentRegion),
      };
    });

  return normalizedStrikes
    .filter((strike) => {
      if (!strike) return false;
      if (strike.category !== 'AIRPORT') return true;
      // Empty airport detail is unknown, not proof of no aviation impact.
      return true;
    })
    .filter((strike): strike is StrikeLike => Boolean(strike));
}

/** A single journey overview per city, date and transport type. Official
 * notices keep their own identities, status and timings inside strike_events. */
export function aggregateStrikes(rawStrikes: Array<StrikeLike | null | undefined>, regionTag?: string) {
  const map = new Map<string, StrikeLike[]>();
  const input = rawStrikes.filter((s): s is StrikeLike => Boolean(s));
  const expanded = input;
  for (const strike of expanded) {
    const region = regionTag || strike.region;
    const scope=['AIRPORT','TRAIN'].includes(strike.category || '')?scopeOf(strike):'';
    const airline=['AIRLINE','AIRLINE_CREW'].includes(scope)?strike.provider || 'unknown':'';
    const key = `${strike.date}|${region}|${strike.category}${scope?`|${scope}|${airline}`:''}`;
    map.set(key, [...(map.get(key) || []), strike]);
  }
  return [...map].map(([key, rows]) => {
    const eventMap = new Map<string, StrikeEvent>();
    for (const row of rows) {
      const events = row.strike_events || [{ id: row.id, source_key:row.source_key, source_url:row.source_url, provider: row.provider, status:row.status, unions:row.timing_evidence?.unions, windows:eventWindows(row), guarantee_windows:row.guarantee_windows || [], timing_evidence: row.timing_evidence, affected_lines:row.affected_lines, region:row.region,official_record:row.official_record }];
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
    const confidence = aggregateTimingConfidence(relevant);
    const first = rows[0];
    const allLines = relevant.flatMap(e=>e.affected_lines || []);
    const fields=relevant.length===1?relevant[0].timing_evidence?.fields:undefined;
    const guaranteeSources=relevant.map(e=>e.timing_evidence?.fields?.guaranteeSource || 'UNKNOWN');
    const guaranteeSource:GuaranteeSource=guaranteeSources.includes('UNKNOWN')?'UNKNOWN':guaranteeSources.every(s=>s==='OFFICIAL_STRIKE_NOTICE')?'OFFICIAL_STRIKE_NOTICE':guaranteeSources.includes('OPERATOR_RULE')?'OPERATOR_RULE':'STANDARD_RULE';
    const lineFacts=relevant.map(e=>e.timing_evidence?.fields?.lineScope || {value:unknownLineScope(),confidence:'UNKNOWN' as const,source:'UNKNOWN' as const});
    const lineScopeEvidence=mergeLineScopes(lineFacts);
    const guaranteeEvidenceWindows=intersectGuaranteeEvidence(active.map(e=>e.timing_evidence?.fields?.guaranteeEvidenceWindows?.value || e.guarantee_windows.map(w=>({...w,end_kind:'clock' as const}))));
    const broad = allLines.some(line => NETWORK_WIDE_LINE_MARKERS.has(line));
    return {
      ...first,
      id: `day-${key.replaceAll('|','-')}`,
      region: regionTag || first.region,
      source_key: undefined,
      official_record: undefined,
      scopeType:['AIRPORT','TRAIN'].includes(first.category || '')?scopeOf(first):undefined,
      officialGeography:relevant.map(e=>e.timing_evidence?.fields?.officialGeography).filter(Boolean),
      supportedCityProjection:[...new Set(relevant.flatMap(e=>e.timing_evidence?.fields?.supportedCityProjection?.value || []))],
      guaranteeSource,
      guaranteedServiceWindow:intersectGuarantees(active),
      serviceSchedule:mergeServiceSchedules(active.map(e=>e.timing_evidence?.fields?.serviceSchedule),rows[0].date || '',rows[0].category || ''),
      guaranteeEvidenceWindows,
      guaranteePolicies:relevant.map(e=>e.timing_evidence?.fields?.guaranteePolicy).filter((p):p is GuaranteePolicy=>Boolean(p)),
      provider: normalizeProviderForDisplay(relevant.map(e=>e.provider).join(' / '),first.category),
      status: !active.length ? 'CANCELLED' : active.some(e=>e.windows.length) ? 'CONFIRMED' : 'UNCERTAIN',
      display_time: windowsDisplay(windows),
      duration_hours: windowsDuration(windows),
      strike_windows: numericWindows(windows),
      guarantee_windows: intersectGuarantees(active),
      timing_evidence: { fields, windows, confidence, sources, unions:[...new Set(relevant.map(e=>e.unions).filter(Boolean))].join(' / '), conflicts:relevant.flatMap(e=>e.timing_evidence?.conflicts || []) } as TimingEvidence,
      strike_events: events,
      has_unknown_lines:lineScopeEvidence.kind==='UNKNOWN',
      has_unknown_timing: active.some(e=>!e.windows.length),
      legacyLineScope: broad?'ALL_LINES':allLines.length?'SPECIFIC_LINES':'UNKNOWN',
      lineScope: lineScopeEvidence.kind,
      lineScopeEvidence,
      lineImpacts:relevant.map(e=>({source_key:e.source_key,impact:buildLineImpact({date:first.date,last_seen_at:rows.find(row=>e.source_key ? row.source_key===e.source_key : e.id!==undefined && row.id===e.id)?.last_seen_at,provider:e.provider || '',region:e.region || first.region || '',category:first.category as 'TRAIN'|'BUS'|'SUBWAY'|'AIRPORT',timing_evidence:e.timing_evidence,official_record:e.official_record})})),
      field_evidence:relevant.map(e=>({source_key:e.source_key,...e.timing_evidence?.fields})),
      affected_lines: first.category === 'AIRPORT' ? [...new Set(allLines)] : broad ? ['全部线路'] : sanitizeAffectedLines([...new Set(allLines)]),
    };
  });
}
