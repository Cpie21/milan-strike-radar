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

  const normalizedStrikes: Array<StrikeLike | null> = rawStrikes
    .map((strike) => {
      if (!strike) return null;
      if (strike.status === 'STALE') return null;
      // Only hide expired unverifiable legacy placeholders. Distinct official
      // announcements must not supersede each other just because providers match.
      if (!strike.source_key && strike.region === 'NATIONAL' && strike.category === 'TRAIN' &&
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

/**
 * Union overlaps helper
 */
function mergeTimeWindows(windows: StrikeWindow[]) {
  if (windows.length <= 1) return windows;
  windows.sort((a, b) => a.start.localeCompare(b.start));
  const merged = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    const current = windows[i];
    if (current.start <= last.end) {
      last.end = current.end > last.end ? current.end : last.end;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/**
 * Data Aggregation (Phase) per user PRD
 * Groups identically dated strikes inside the same category
 */
export function aggregateStrikes(rawStrikes: Array<StrikeLike | null | undefined>) {
  const map = new Map<string, StrikeLike>();

  expandDerivedStrikeVariants(rawStrikes).forEach(strike => {
    const normalizedProvider = normalizeProviderForDisplay(strike.provider, strike.category);
    const normalizedLines = strike.category === 'AIRPORT'
      ? normalizeAirportAffectedLines(strike.affected_lines || [], {
          contextText: `${strike.provider || ''} ${(strike.affected_lines || []).join(' ')}`,
          regionTag: canonicalizeRegionValue(strike.region || ''),
        })
      : sanitizeAffectedLines(strike.affected_lines || []);

    // Different rail operators can strike at different times on the same day.
    // Keep them distinct, including cancellations and unknown timings.
    const key = `${strike.date}|${strike.region}|${strike.category}|${strike.status}|${strike.display_time}|${JSON.stringify(strike.strike_windows || [])}|${JSON.stringify(strike.timing_evidence?.windows || [])}|${strike.timing_evidence?.confidence || ""}`;

    if (!map.has(key)) {
      map.set(key, {
        ...JSON.parse(JSON.stringify(strike)),
        provider: normalizedProvider,
        affected_lines: normalizedLines,
      });
    } else {
      const existing = map.get(key);
      if (!existing) return;

      existing.provider = normalizeProviderForDisplay(`${existing.provider || ''} / ${normalizedProvider}`, existing.category);

      // Merge Strike Windows
      const allWindows = [...(existing.strike_windows || []), ...(strike.strike_windows || [])];
      const allGuaranteeWindows = [...(existing.guarantee_windows || []), ...(strike.guarantee_windows || [])];
      if (existing.timing_evidence?.windows.length) {
        const evidence = existing.timing_evidence;
        evidence.sources = [...new Map([...evidence.sources, ...(strike.timing_evidence?.sources || [])].map(s => [s.url, s])).values()];
        evidence.unions = [...new Set([evidence.unions, strike.timing_evidence?.unions].filter(Boolean))].join(' / ');
        // Keep semantic endpoints and their display text intact.
      } else if (strike.duration_hours === '24小时' || existing.duration_hours === '24小时') {
        existing.duration_hours = '24小时';
        existing.display_time = '全天 24小时';
        existing.strike_windows = [{ start: '00:00', end: '24:00' }];
      } else {
        existing.strike_windows = mergeTimeWindows(allWindows);
        existing.display_time = existing.strike_windows.length ? existing.strike_windows.map((w) => `${w.start} - ${w.end}`).join(', ') : '具体时段待公布';
      }
      existing.guarantee_windows = mergeTimeWindows(allGuaranteeWindows);

      // Merge Status
      if (strike.status === 'CONFIRMED') existing.status = 'CONFIRMED';

      // Merge Affected Lines
      const mergedLines = [...(existing.affected_lines || []), ...normalizedLines];
      existing.affected_lines = existing.category === 'AIRPORT'
        ? normalizeAirportAffectedLines(mergedLines, {
            contextText: `${existing.provider || ''} ${(mergedLines || []).join(' ')}`,
            regionTag: canonicalizeRegionValue(existing.region || ''),
          })
        : sanitizeAffectedLines(mergedLines).filter(l => l !== '全部线路' && l !== '全部车次');
      if (existing.affected_lines.length === 0) {
        existing.affected_lines = existing.category === 'AIRPORT' ? ['全部机场'] : ['全部线路'];
      }
    }
  });

  return Array.from(map.values()).map(existing => ({
    ...existing,
    provider: normalizeProviderForDisplay(existing.provider, existing.category),
    affected_lines: existing.category === 'AIRPORT'
      ? normalizeAirportAffectedLines(existing.affected_lines || [], {
          contextText: `${existing.provider || ''} ${(existing.affected_lines || []).join(' ')}`,
          regionTag: canonicalizeRegionValue(existing.region || ''),
        })
      : sanitizeAffectedLines(existing.affected_lines || []),
  }));
}
