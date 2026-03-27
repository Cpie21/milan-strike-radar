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

const REGION_AIRPORT_KEYWORDS: Record<string, string[]> = {
  MILANO: ['马尔彭萨', '利纳特', '贝加莫', '米兰相关机场'],
  ROMA: ['菲乌米奇诺', '钱皮诺', '罗马相关机场'],
  TORINO: ['卡塞莱', '都灵相关机场'],
};

const REGION_DEFAULT_AIRPORT_LINES: Record<string, string[]> = {
  MILANO: ['马尔彭萨机场', '利纳特机场', '贝加莫机场'],
  ROMA: ['菲乌米奇诺机场', '钱皮诺机场'],
  TORINO: ['卡塞莱机场'],
};

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
  if (inferred && inferred !== explicit && inferred !== 'NATIONAL') return inferred;
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

function shouldDeriveBusVariantForMilanAtm(strike: StrikeLike) {
  if (!strike || strike.category !== 'SUBWAY') return false;

  const normalizedProvider = normalizeProviderList(strike.provider || '').join(' / ') || '相关人员';
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
      if (!strike.category || !allowedCategories.has(strike.category)) return null;
      const normalizedRegion = resolveStrikeRegion(strike);
      if (normalizedRegion && normalizedRegion !== currentRegion && normalizedRegion !== 'NATIONAL') {
        return null;
      }
      if (strike.category !== 'AIRPORT') {
        return {
          ...strike,
          region: normalizedRegion || currentRegion,
          provider: normalizeProviderList(strike.provider || '').join(' / ') || '相关人员',
        };
      }

      return {
        ...strike,
        region: normalizedRegion || currentRegion,
        provider: normalizeProviderList(strike.provider || '').join(' / ') || '相关人员',
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
    const normalizedProvider = normalizeProviderList(strike.provider || '').join(' / ') || '相关人员';
    const normalizedLines = strike.category === 'AIRPORT'
      ? normalizeAirportAffectedLines(strike.affected_lines || [], {
          contextText: `${strike.provider || ''} ${(strike.affected_lines || []).join(' ')}`,
          regionTag: canonicalizeRegionValue(strike.region || ''),
        })
      : sanitizeAffectedLines(strike.affected_lines || []);

    // Group by Date + Category + Time (for Airport)
    let key = `${strike.date}|${strike.category}`;
    if (strike.category === 'AIRPORT') {
      key += `|${strike.display_time}`;
    }

    if (!map.has(key)) {
      map.set(key, {
        ...JSON.parse(JSON.stringify(strike)),
        provider: normalizedProvider,
        affected_lines: normalizedLines,
      });
    } else {
      const existing = map.get(key);
      if (!existing) return;

      existing.provider = normalizeProviderList(`${existing.provider || ''} / ${normalizedProvider}`).join(' / ') || '相关人员';

      // Merge Strike Windows
      const allWindows = [...(existing.strike_windows || []), ...(strike.strike_windows || [])];
      const allGuaranteeWindows = [...(existing.guarantee_windows || []), ...(strike.guarantee_windows || [])];
      if (strike.duration_hours === '24小时' || existing.duration_hours === '24小时') {
        existing.duration_hours = '24小时';
        existing.display_time = '全天 24小时';
        existing.strike_windows = [{ start: '00:00', end: '24:00' }];
      } else {
        existing.strike_windows = mergeTimeWindows(allWindows);
        existing.display_time = existing.strike_windows.map((w) => `${w.start} - ${w.end}`).join(', ');
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
    provider: normalizeProviderList(existing.provider || '').join(' / ') || '相关人员',
    affected_lines: existing.category === 'AIRPORT'
      ? normalizeAirportAffectedLines(existing.affected_lines || [], {
          contextText: `${existing.provider || ''} ${(existing.affected_lines || []).join(' ')}`,
          regionTag: canonicalizeRegionValue(existing.region || ''),
        })
      : sanitizeAffectedLines(existing.affected_lines || []),
  }));
}
