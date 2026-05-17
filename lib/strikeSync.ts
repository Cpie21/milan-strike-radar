import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeRegionValue,
  classifyRegionTag,
  inferRegionTagFromText,
  normalizeAirportAffectedLines,
  normalizeProviderList,
} from './strikeNormalization';
import { getGuaranteeWindows } from './guaranteeWindows';

export type StrikeStatus = 'CONFIRMED' | 'CANCELLED' | 'REQUIRES_DETAIL' | 'UNCERTAIN';

export interface StrikeWindow {
  start: string;
  end: string;
}

export interface StrikeRecord {
  date: string;
  category: 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
  provider: string;
  status: StrikeStatus;
  display_time: string;
  duration_hours: string;
  strike_windows: StrikeWindow[];
  guarantee_windows: StrikeWindow[];
  affected_lines: string[];
  region: string;
  data_source?: string;
}

export interface RawStrikeRow {
  date: string;
  endDate: string;
  provider: string;
  region: string;
  sector: string;
  province: string;
  modalita: string;
  note: string;
  rilevanza: string;
  proclamationDate: string;
}

const MIT_URL = 'http://scioperi.mit.gov.it/mit2/public/scioperi';
const NATIONAL_KEYWORDS = ['nazionale', 'plurisettoriale'];
const TRANSPORT_SECTORS = ['trasporto pubblico', 'ferroviario', 'aereo'];
const TRANSPORT_CONTEXT_KEYWORDS = [
  'settore ferroviario',
  'ferroviario:',
  'trasporto pubblico locale',
  'settore aereo',
  'trasporto aereo',
  'aeroport',
  'enav',
];
const TRANSPORT_EXCLUSION_KEYWORDS = [
  'esclusi settori trasporto aereo, ferroviario, trasporto pubblico locale',
  'esclusi settori trasporto aereo',
  'esclusi settori ferroviario',
  'escluso settore ferroviario',
  'escluso settore trasporto pubblico locale',
  'escluso settore trasporto aereo',
];
const PASSENGER_RAIL_IMPACT_KEYWORDS = [
  'trenord',
  'trenitalia',
  'italo',
  'ntv',
  'rfi',
  'rete ferroviaria italiana',
  'trasporto viaggiatori',
  'trasporto passeggeri',
  'servizio passeggeri',
  'gruppo ferrovie dello stato',
  'personale di macchina',
  'personale mobile',
  'personale di bordo',
  'equipaggi',
  'macchinisti',
  'capotreno',
  'alta velocita',
  'alta velocità',
];
const FREIGHT_ONLY_RAIL_KEYWORDS = [
  'mercitalia',
  'shunting',
  'terminal',
  'intermodal',
  'interporto',
  'logistica',
  'logistics',
  'cargo',
  'merci',
  'scalo merci',
  'smistamento',
  'raccordi ferroviari',
  'raccordo ferroviario',
  'manovra ferroviaria',
];
const PENDING_STATUSES: StrikeStatus[] = ['REQUIRES_DETAIL', 'UNCERTAIN'];
const CATEGORY_PROVIDER_FALLBACKS: Record<StrikeRecord['category'], string> = {
  TRAIN: '铁路相关人员',
  SUBWAY: '公共交通人员',
  BUS: '公共交通人员',
  AIRPORT: '机场相关人员',
};
const VERIFIED_SUPPLEMENTS: StrikeRecord[] = [
  {
    date: '2026-03-18',
    region: 'MILANO',
    category: 'AIRPORT',
    provider: '机场地勤人员 / 德纳达地服人员',
    status: 'CONFIRMED',
    display_time: '全天 24小时',
    duration_hours: '24小时',
    strike_windows: [{ start: '00:00', end: '24:00' }],
    guarantee_windows: [
      { start: '07:00', end: '10:00' },
      { start: '18:00', end: '21:00' },
    ],
    affected_lines: ['马尔彭萨机场', '利纳特机场'],
    data_source: 'SECONDARY_VERIFIED',
  },
];

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/\*/g, '').trim();
}

export async function fetchAndFilter(): Promise<RawStrikeRow[]> {
  const html = await fetch(MIT_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MilanStrikeBot/1.0)' },
  }).then((response) => {
    if (!response.ok) throw new Error(`MIT fetch failed: ${response.status}`);
    return response.text();
  });

  const $ = cheerio.load(html);
  const rows: RawStrikeRow[] = [];
  let headerIndex: Record<string, number> = {};

  $('table tr').each((_, tr) => {
    const ths = $(tr).find('th');
    if (ths.length > 0) {
      const headers = ths.map((__, th) => normalizeHeader($(th).text())).get();
      headerIndex = {};
      headers.forEach((header, index) => {
        if (header) headerIndex[header] = index;
      });
      return;
    }

    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    const texts = cells.map((__, td) => $(td).text().trim()).get();
    const dateCol = texts.findIndex((text) => /^\d{2}\/\d{2}\/\d{4}/.test(text));
    if (dateCol === -1 && !headerIndex.inizio) return;

    const getByHeader = (key: string, fallbackIdx?: number) => {
      const index = headerIndex[key];
      if (index !== undefined && index !== null) return texts[index] ?? '';
      if (fallbackIdx !== undefined) return texts[fallbackIdx] ?? '';
      return '';
    };

    const raw: RawStrikeRow = {
      date: getByHeader('inizio', dateCol).trim(),
      endDate: getByHeader('fine', dateCol + 1).trim(),
      provider: getByHeader('categoria', dateCol + 4).trim(),
      sector: getByHeader('settore', dateCol + 3).trim(),
      modalita: getByHeader('modalita', dateCol + 5).trim(),
      rilevanza: getByHeader('rilevanza', dateCol + 6).trim(),
      note: getByHeader('note', dateCol + 7).trim(),
      proclamationDate: getByHeader('data proclamazione').trim(),
      region: getByHeader('regione', dateCol + 9).trim(),
      province: getByHeader('provincia', dateCol + 10).trim(),
    };

    const regionTag = classifyRegionTag({
      regionText: raw.region,
      provinceText: raw.province,
      sectorText: raw.sector,
      providerText: raw.provider,
      noteText: `${raw.note} ${raw.rilevanza}`,
    });

    let finalRegion = regionTag;
    if (!finalRegion && NATIONAL_KEYWORDS.some((keyword) => raw.rilevanza.toLowerCase().includes(keyword))) {
      const fallback = inferRegionTagFromText(`${raw.provider} ${raw.note}`);
      finalRegion = fallback && fallback !== 'OTHER' ? fallback : '';
    }

    if (!finalRegion || finalRegion === 'OTHER') return;

    if (!isTransportRelevantRow(raw)) return;

    rows.push({ ...raw, region: canonicalizeRegionValue(finalRegion) });
  });

  return rows;
}

function isTransportRelevantRow(row: RawStrikeRow) {
  const sectorLow = row.sector.toLowerCase();
  const combined = `${row.sector} ${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();

  if (TRANSPORT_EXCLUSION_KEYWORDS.some((keyword) => combined.includes(keyword))) return false;
  if (isCommuterIrrelevantFreightRailRow(row)) return false;
  if (TRANSPORT_SECTORS.some((sector) => sectorLow.includes(sector))) return true;

  return TRANSPORT_CONTEXT_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function isCommuterIrrelevantFreightRailRow(row: RawStrikeRow) {
  const combined = `${row.sector} ${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
  const railContext =
    row.sector.toLowerCase().includes('ferroviario') ||
    combined.includes('ferroviario') ||
    combined.includes('ferrov');

  if (!railContext) return false;

  const hasPassengerImpactSignal = PASSENGER_RAIL_IMPACT_KEYWORDS.some((keyword) => combined.includes(keyword));
  if (hasPassengerImpactSignal) return false;

  return FREIGHT_ONLY_RAIL_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function parseItalianDate(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split('/');
  if (!dd || !mm || !yyyy) return dateStr;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseItalianDateToDate(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split('/');
  if (!dd || !mm || !yyyy) return null;

  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateSpan(startDateStr: string, endDateStr?: string) {
  const start = parseItalianDateToDate(startDateStr);
  const end = parseItalianDateToDate(endDateStr || startDateStr) || start;
  if (!start || !end || end < start) return [parseItalianDate(startDateStr)];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 10) {
    const yyyy = String(cursor.getFullYear());
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === 24) return 24 * 60;
  return hours * 60 + minutes;
}

function buildDisplayFromWindows(windows: StrikeWindow[]) {
  return windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00'
    ? '全天 24小时'
    : windows.map((window) => `${window.start} - ${window.end}`).join(', ');
}

function buildDurationFromWindows(windows: StrikeWindow[], fallback: string) {
  if (windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00') return '24小时';

  const totalMinutes = windows.reduce((sum, window) => {
    const start = timeToMinutes(window.start);
    let end = timeToMinutes(window.end);
    if (end <= start) end += 24 * 60;
    return sum + Math.max(0, end - start);
  }, 0);

  if (!totalMinutes) return fallback;
  const hours = totalMinutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}小时`;
}

function splitTimeInfoForDate(
  baseTimeInfo: { hours: string; display: string; windows: StrikeWindow[] },
  dateSpan: string[],
  dateIndex: number
) {
  if (dateSpan.length <= 1) {
    return {
      hours: baseTimeInfo.hours,
      display: baseTimeInfo.display,
      windows: baseTimeInfo.windows.map((window) => ({ ...window })),
    };
  }

  const isFullDay =
    baseTimeInfo.hours === '24小时' ||
    baseTimeInfo.hours === '48小时' ||
    baseTimeInfo.windows.some((window) => window.start === '00:00' && window.end === '24:00');

  if (isFullDay) {
    const windows = [{ start: '00:00', end: '24:00' }];
    return {
      hours: '24小时',
      display: '全天 24小时',
      windows,
    };
  }

  const windows = baseTimeInfo.windows.flatMap((window) => {
    const start = timeToMinutes(window.start);
    const end = timeToMinutes(window.end);
    const isOvernight = end <= start;

    if (!isOvernight) {
      return dateIndex === 0 ? [{ ...window }] : [];
    }

    if (dateIndex === 0) return [{ start: window.start, end: '24:00' }];
    if (dateIndex === 1) return [{ start: '00:00', end: window.end }];
    return [];
  });

  const resolvedWindows = windows.length > 0 ? windows : [{ start: '00:00', end: '24:00' }];
  return {
    hours: buildDurationFromWindows(resolvedWindows, baseTimeInfo.hours),
    display: buildDisplayFromWindows(resolvedWindows),
    windows: resolvedWindows,
  };
}

function getLeadDaysBeforeStrike(dateIso: string, proclamationDate: string) {
  const [yyyy, mm, dd] = dateIso.split('-');
  if (!yyyy || !mm || !dd) return null;

  const strikeDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const proclaimedAt = parseItalianDateToDate(proclamationDate);
  if (Number.isNaN(strikeDate.getTime()) || !proclaimedAt) return null;

  const diffMs = strikeDate.getTime() - proclaimedAt.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function shouldTreatAsPending(row: RawStrikeRow, category: StrikeRecord['category'], dateIso: string) {
  if (category !== 'TRAIN') return false;
  if (row.region !== 'NATIONAL') return false;
  if (!row.proclamationDate) return false;

  const leadDays = getLeadDaysBeforeStrike(dateIso, row.proclamationDate);
  if (leadDays === null || leadDays < 14) return false;

  const combined = `${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
  const hasConcreteTime =
    /\b\d+\s*ore\b/i.test(combined) ||
    /dalle\s+\d{1,2}[\.:]\d{2}/i.test(combined) ||
    combined.includes('24 ore') ||
    combined.includes('intero turno');
  const hasPassengerImpactSignal = PASSENGER_RAIL_IMPACT_KEYWORDS.some((keyword) => combined.includes(keyword));

  return !hasConcreteTime || !hasPassengerImpactSignal;
}

async function translateText(text: string): Promise<string> {
  if (!text.trim()) return text;
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) return text;

  try {
    const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
    const params = new URLSearchParams();
    params.append('auth_key', apiKey);
    params.append('text', text);
    params.append('target_lang', 'ZH');

    const response = await fetch(url, { method: 'POST', body: params });
    if (!response.ok) throw new Error(`DeepL translate failed: ${response.status}`);
    const json = await response.json();
    return json?.translations?.[0]?.text || text;
  } catch (error) {
    console.error('Translation failed for', text, error);
    return text;
  }
}

async function normalizeProvider(raw: string) {
  let source = raw.toUpperCase();
  source = source.replace(/SOC\. /g, '');
  source = source.replace(/SOC\./g, '');
  source = source.replace(/S\.P\.A\./g, '');
  source = source.replace(/S\.R\.L\./g, '');
  source = source.replace(/S\.C\.A\.R\.L\./g, '');
  source = source.trim();

  const translated = await translateText(source);
  return normalizeProviderList(source, translated).join(' / ');
}

function getProviderFallback(category: StrikeRecord['category']) {
  return CATEGORY_PROVIDER_FALLBACKS[category];
}

function resolveCategories(provider: string, sector: string, context = ''): StrikeRecord['category'][] {
  const providerLow = provider.toLowerCase();
  const sectorLow = sector.toLowerCase();
  const combinedLow = `${provider} ${sector} ${context}`.toLowerCase();
  const isMilanAtm = /\batm\b/.test(providerLow) && providerLow.includes('milano');

  // ATM in Milan is the local transit operator, so broad TPL strikes affect both metro and bus.
  if (isMilanAtm && sectorLow.includes('trasporto pubblico')) return ['SUBWAY', 'BUS'];
  if (/\batm\b/.test(providerLow)) return ['SUBWAY'];

  const categories = new Set<StrikeRecord['category']>();
  if (
    providerLow.includes('trenord') ||
    providerLow.includes('trenitalia') ||
    providerLow.includes('italo') ||
    providerLow.includes('rfi') ||
    combinedLow.includes('ferrov')
  ) {
    categories.add('TRAIN');
  }
  if (
    providerLow.includes('sea') ||
    providerLow.includes('enav') ||
    combinedLow.includes('aereo') ||
    combinedLow.includes('aeroport') ||
    combinedLow.includes('easyjet') ||
    combinedLow.includes('adr security')
  ) {
    categories.add('AIRPORT');
  }
  if (combinedLow.includes('trasporto pubblico locale') || combinedLow.includes('autoferro')) {
    categories.add('BUS');
  }

  if (categories.size > 0) return Array.from(categories);
  return ['BUS'];
}

function extractAffectedLines(note: string) {
  const keywords = ['Linate', 'Malpensa', 'Bergamo', 'M1', 'M2', 'M3', 'M4', 'M5', 'Trenord', 'Trenitalia'];
  const found = keywords.filter((keyword) => note.toLowerCase().includes(keyword.toLowerCase()));
  return found.length > 0 ? found : ['全部线路'];
}

function parseTimeWindows(durationRaw: string, modalita: string, note: string) {
  const combined = `${durationRaw} ${modalita} ${note}`.toUpperCase();
  let hours = '部分时段';
  const windows: StrikeWindow[] = [];

  if (combined.includes('24 ORE') || combined.includes('INTERO TURNO')) {
    hours = '24小时';
    windows.push({ start: '00:00', end: '24:00' });
  } else {
    const hourMatch = combined.match(/(\d+)\s*ORE/);
    if (hourMatch) hours = `${hourMatch[1]}小时`;

    const optionalDate = String.raw`(?:\s+DEL\s+\d{1,2}\/\d{1,2})?`;
    const timeRegex = new RegExp(String.raw`DALLE\s+(\d{1,2})[\.:](\d{2})${optionalDate}\s+ALLE\s+(\d{1,2})[\.:](\d{2})`, 'g');
    const endOfServiceRegex = new RegExp(String.raw`DALLE\s+(\d{1,2})[\.:](\d{2})${optionalDate}\s+A\s+FINE\s+SERVIZIO`, 'g');
    let match: RegExpExecArray | null;
    while ((match = timeRegex.exec(combined)) !== null) {
      windows.push({
        start: `${match[1].padStart(2, '0')}:${match[2]}`,
        end: `${match[3].padStart(2, '0')}:${match[4]}`,
      });
    }
    while ((match = endOfServiceRegex.exec(combined)) !== null) {
      windows.push({
        start: `${match[1].padStart(2, '0')}:${match[2]}`,
        end: '24:00',
      });
    }
  }

  if (windows.length === 0) windows.push({ start: '00:00', end: '24:00' });
  windows.sort((a, b) => a.start.localeCompare(b.start));

  return {
    hours,
    windows,
    display:
      windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00'
        ? '全天 24小时'
        : windows.map((window) => `${window.start} - ${window.end}`).join(', '),
  };
}

async function fetchSecondarySource(category: string, provider: string): Promise<{ windows?: StrikeWindow[]; lines?: string[] } | null> {
  try {
    if ((category === 'SUBWAY' || category === 'BUS') && provider.toUpperCase().includes('ATM')) {
      return null;
    }
    if (category === 'AIRPORT') {
      return null;
    }
    return null;
  } catch (error) {
    console.error('Secondary fetch failed:', error);
    return null;
  }
}

export async function transformRows(rawRows: RawStrikeRow[]): Promise<StrikeRecord[]> {
  const rawRecordGroups = await Promise.all(rawRows.map(async (row) => {
    const baseProviderNorm = await normalizeProvider(row.provider);
    const categories = resolveCategories(row.provider, row.sector, `${row.modalita} ${row.note} ${row.rilevanza}`);
    const dateSpan = getDateSpan(row.date, row.endDate);

    let status: StrikeStatus = 'CONFIRMED';
    const combinedRaw = `${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
    if (combinedRaw.includes('revocat') || combinedRaw.includes('differit')) {
      status = 'CANCELLED';
    } else if (combinedRaw.includes('da definire')) {
      status = 'REQUIRES_DETAIL';
    }

    const baseTimeInfo = parseTimeWindows(row.modalita, row.note, row.rilevanza);
    const recordInputs = dateSpan.flatMap((dateIso, dateIndex) => (
      categories.map((category) => ({ dateIso, dateIndex, category }))
    ));

    return Promise.all(recordInputs.map(async ({ dateIso, dateIndex, category }) => {
      const providerNorm = baseProviderNorm || getProviderFallback(category);
      let resolvedStatus: StrikeStatus = status;
      if (resolvedStatus === 'CONFIRMED' && shouldTreatAsPending(row, category, dateIso)) {
        resolvedStatus = 'REQUIRES_DETAIL';
      }
      const timeInfo = splitTimeInfoForDate(baseTimeInfo, dateSpan, dateIndex);
      const guaranteeWindows = getGuaranteeWindows({
        category,
        dateIso,
        region: row.region,
        isFullDay:
          timeInfo.hours === '24小时' ||
          (timeInfo.windows.length === 1 && timeInfo.windows[0].start === '00:00' && timeInfo.windows[0].end === '24:00'),
      });

      let lines = category === 'AIRPORT'
        ? normalizeAirportAffectedLines([], { contextText: `${row.provider} ${row.note}`, regionTag: row.region })
        : extractAffectedLines(row.note);

      const excludeNotes = ['nazionale', 'provinciale', 'regionale', 'territoriale'];
      if (lines.length === 1 && lines[0] === '全部线路' && row.note.trim().length > 3 && !excludeNotes.includes(row.note.toLowerCase().trim())) {
        const translatedNote = await translateText(row.note);
        if (translatedNote && translatedNote !== row.note) lines = [translatedNote];
      }

      if (category === 'AIRPORT') {
        lines = normalizeAirportAffectedLines(lines, {
          contextText: `${row.provider} ${row.note}`,
          regionTag: row.region,
        });
      }

      let dataSource = 'MIT_PRIMARY';
      if (resolvedStatus === 'REQUIRES_DETAIL' || (lines.length === 1 && lines[0] === '全部线路')) {
        const secondaryResult = await fetchSecondarySource(category, providerNorm);
        if (secondaryResult) {
          if (secondaryResult.windows?.length) {
            timeInfo.windows = secondaryResult.windows;
            timeInfo.display = secondaryResult.windows.map((window) => `${window.start} - ${window.end}`).join(', ');
            timeInfo.hours = '精确时段';
          }
          if (secondaryResult.lines?.length) {
            lines = category === 'AIRPORT'
              ? normalizeAirportAffectedLines(secondaryResult.lines, {
                  contextText: `${row.provider} ${row.note}`,
                  regionTag: row.region,
                })
              : secondaryResult.lines;
          }
          resolvedStatus = 'CONFIRMED';
          dataSource = 'SECONDARY_LIVE';
        } else if (resolvedStatus === 'REQUIRES_DETAIL') {
          resolvedStatus = 'UNCERTAIN';
        }
      }

      return {
        date: dateIso,
        category,
        provider: providerNorm,
        region: row.region,
        status: resolvedStatus,
        display_time: timeInfo.display,
        duration_hours: timeInfo.hours,
        strike_windows: timeInfo.windows,
        guarantee_windows: guaranteeWindows,
        affected_lines: lines,
        data_source: dataSource,
      } satisfies StrikeRecord;
    }));
  }));
  const rawRecords = rawRecordGroups.flat();

  const recordsMap = new Map<string, StrikeRecord>();
  [...rawRecords, ...VERIFIED_SUPPLEMENTS].forEach((record) => {
    const key = `${record.date}|${record.region}|${record.category}|${record.provider}|${record.display_time}`;
    const existing = recordsMap.get(key);
    if (!existing) {
      recordsMap.set(key, record);
      return;
    }

    const mergedStrikeWindows = mergeWindows([...(existing.strike_windows || []), ...(record.strike_windows || [])]);
    const mergedGuarantees = mergeWindows([...(existing.guarantee_windows || []), ...(record.guarantee_windows || [])]);
    const mergedAffectedLines = record.category === 'AIRPORT'
      ? normalizeAirportAffectedLines([...(existing.affected_lines || []), ...(record.affected_lines || [])], {
          contextText: `${existing.provider} ${record.provider} ${[...(existing.affected_lines || []), ...(record.affected_lines || [])].join(' ')}`,
          regionTag: existing.region || record.region,
        })
      : Array.from(new Set([...(existing.affected_lines || []), ...(record.affected_lines || [])]));

    const isFullDay =
      existing.duration_hours === '24小时' ||
      record.duration_hours === '24小时' ||
      mergedStrikeWindows.some((window) => window.start === '00:00' && window.end === '24:00');

    recordsMap.set(key, {
      ...existing,
      status: existing.status === 'CONFIRMED' || record.status === 'CONFIRMED' ? 'CONFIRMED' : record.status,
      duration_hours: isFullDay ? '24小时' : existing.duration_hours || record.duration_hours,
      display_time: isFullDay
        ? '全天 24小时'
        : mergedStrikeWindows.map((window) => `${window.start} - ${window.end}`).join(', '),
      strike_windows: isFullDay ? [{ start: '00:00', end: '24:00' }] : mergedStrikeWindows,
      guarantee_windows: mergedGuarantees,
      affected_lines: mergedAffectedLines,
      data_source: existing.data_source === 'SECONDARY_VERIFIED' || record.data_source === 'SECONDARY_VERIFIED'
        ? 'SECONDARY_VERIFIED'
        : existing.data_source || record.data_source,
    });
  });

  return Array.from(recordsMap.values());
}

function mergeWindows(windows: StrikeWindow[]) {
  if (windows.length <= 1) return windows;
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  const merged = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = current.end > last.end ? current.end : last.end;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function getRomeTodayIso() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function requiresRegionalTrainImpactVerification(record: Pick<StrikeRecord, 'category' | 'region' | 'status' | 'data_source'>) {
  if (record.category !== 'TRAIN') return false;
  if (record.region !== 'NATIONAL') return false;
  if (record.status !== 'REQUIRES_DETAIL' && record.status !== 'UNCERTAIN') return false;
  if ((record.data_source || 'MIT_PRIMARY') !== 'MIT_PRIMARY') return false;
  return true;
}

function shouldPruneExpiredPendingRecord(record: Pick<StrikeRecord, 'date' | 'category' | 'region' | 'status' | 'data_source'>, todayIso = getRomeTodayIso()) {
  if (!requiresRegionalTrainImpactVerification(record)) return false;
  return record.date <= todayIso;
}

function isPendingStatus(status?: string | null) {
  return PENDING_STATUSES.includes((status || '') as StrikeStatus);
}

function isVagueProvider(provider?: string | null) {
  const value = (provider || '').trim();
  if (!value) return true;
  return value === '相关人员' || value === '铁路相关人员' || value === '公共交通人员' || value === '机场相关人员';
}

function providerCanSupersedePending(pendingProvider: string | null | undefined, nextProvider: string) {
  if (isVagueProvider(pendingProvider) || isVagueProvider(nextProvider)) return true;

  const pending = normalizeProviderList(pendingProvider || '').join(' / ').toLowerCase();
  const next = normalizeProviderList(nextProvider || '').join(' / ').toLowerCase();
  if (!pending || !next) return true;
  if (pending === next || pending.includes(next) || next.includes(pending)) return true;

  const pendingParts = pending.split(/\s*\/\s*/).filter(Boolean);
  const nextParts = next.split(/\s*\/\s*/).filter(Boolean);
  return pendingParts.some((part) => nextParts.some((nextPart) => part === nextPart || part.includes(nextPart) || nextPart.includes(part)));
}

function regionsOverlap(candidateRegion: string | null | undefined, nextRegion: string) {
  const candidate = canonicalizeRegionValue(candidateRegion || '');
  const next = canonicalizeRegionValue(nextRegion || '');
  return candidate === next || candidate === 'NATIONAL' || next === 'NATIONAL';
}

function canSupersedePendingRecord(
  candidate: Pick<StrikeRecord, 'date' | 'category' | 'region' | 'provider' | 'status'>,
  nextRecord: StrikeRecord
) {
  if (!isPendingStatus(candidate.status)) return false;
  if (nextRecord.status === 'REQUIRES_DETAIL' || nextRecord.status === 'UNCERTAIN') return false;
  if (candidate.date !== nextRecord.date) return false;
  if (candidate.category !== nextRecord.category) return false;
  if (!regionsOverlap(candidate.region, nextRecord.region)) return false;
  return providerCanSupersedePending(candidate.provider, nextRecord.provider);
}

export async function upsertToSupabase(records: StrikeRecord[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let affected = 0;

  for (const record of records) {
    const { data: existing, error: lookupError } = await supabase
      .from('strikes')
      .select('id')
      .eq('date', record.date)
      .eq('region', record.region)
      .eq('category', record.category)
      .eq('provider', record.provider)
      .eq('display_time', record.display_time)
      .maybeSingle();

    if (lookupError) throw new Error(`Supabase lookup error: ${lookupError.message}`);

    if (existing?.id) {
      const { error: updateError } = await supabase.from('strikes').update(record).eq('id', existing.id);
      if (updateError) throw new Error(`Supabase update error: ${updateError.message}`);
      affected += 1;
      continue;
    }

    if (!isPendingStatus(record.status)) {
      const { data: pendingCandidates, error: pendingLookupError } = await supabase
        .from('strikes')
        .select('id, date, category, region, provider, status')
        .eq('date', record.date)
        .eq('category', record.category)
        .in('status', PENDING_STATUSES);

      if (pendingLookupError) throw new Error(`Supabase pending lookup error: ${pendingLookupError.message}`);

      const supersededPending = (pendingCandidates || []).find((candidate) => canSupersedePendingRecord(candidate, record));
      if (supersededPending?.id) {
        const { error: updatePendingError } = await supabase.from('strikes').update(record).eq('id', supersededPending.id);
        if (updatePendingError) throw new Error(`Supabase pending update error: ${updatePendingError.message}`);
        affected += 1;
        continue;
      }
    }

    const { error: insertError } = await supabase.from('strikes').insert(record);
    if (insertError) {
      const isLegacyConstraint = insertError.message.includes('strikes_date_provider_key');
      if (!isLegacyConstraint) {
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }

      const { data: legacyExisting, error: legacyLookupError } = await supabase
        .from('strikes')
        .select('id, region, category, provider, status, display_time, duration_hours, strike_windows, guarantee_windows, affected_lines')
        .eq('date', record.date)
        .eq('provider', record.provider)
        .maybeSingle();

      if (legacyLookupError || !legacyExisting?.id) {
        throw new Error(`Supabase legacy lookup error: ${legacyLookupError?.message || insertError.message}`);
      }

      const mergedStrikeWindows = mergeWindows([...(legacyExisting.strike_windows || []), ...record.strike_windows]);
      const mergedGuarantees = mergeWindows([...(legacyExisting.guarantee_windows || []), ...record.guarantee_windows]);
      const mergedAffectedLines = Array.from(new Set([...(legacyExisting.affected_lines || []), ...record.affected_lines]));
      const isFullDay =
        legacyExisting.duration_hours === '24小时' ||
        record.duration_hours === '24小时' ||
        mergedStrikeWindows.some((window) => window.start === '00:00' && window.end === '24:00');

      const mergedRecord = {
        ...record,
        region: legacyExisting.region || record.region,
        category: legacyExisting.category || record.category,
        status: legacyExisting.status === 'CONFIRMED' || record.status === 'CONFIRMED' ? 'CONFIRMED' : record.status,
        strike_windows: isFullDay ? [{ start: '00:00', end: '24:00' }] : mergedStrikeWindows,
        guarantee_windows: mergedGuarantees,
        affected_lines: mergedAffectedLines,
        duration_hours: isFullDay ? '24小时' : record.duration_hours,
        display_time: isFullDay
          ? '全天 24小时'
          : mergedStrikeWindows.map((window) => `${window.start} - ${window.end}`).join(', '),
      } satisfies StrikeRecord;

      const { error: legacyUpdateError } = await supabase
        .from('strikes')
        .update(mergedRecord)
        .eq('id', legacyExisting.id);

      if (legacyUpdateError) {
        throw new Error(`Supabase legacy update error: ${legacyUpdateError.message}`);
      }
    }
    affected += 1;
  }

  return affected;
}

export async function pruneSupersededPendingFromSupabase(records: StrikeRecord[]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const confirmedOrCancelledRecords = records.filter((record) => !isPendingStatus(record.status));
  if (confirmedOrCancelledRecords.length === 0) return 0;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const dates = Array.from(new Set(confirmedOrCancelledRecords.map((record) => record.date)));

  const { data: candidates, error: lookupError } = await supabase
    .from('strikes')
    .select('id, date, category, region, provider, status')
    .in('date', dates)
    .in('status', PENDING_STATUSES);

  if (lookupError) {
    throw new Error(`Supabase superseded pending lookup error: ${lookupError.message}`);
  }

  const staleIds = (candidates || [])
    .filter((candidate) => confirmedOrCancelledRecords.some((record) => canSupersedePendingRecord(candidate, record)))
    .map((candidate) => candidate.id);

  if (staleIds.length === 0) return 0;

  const { error: deleteError } = await supabase
    .from('strikes')
    .delete()
    .in('id', staleIds);

  if (deleteError) {
    throw new Error(`Supabase superseded pending delete error: ${deleteError.message}`);
  }

  return staleIds.length;
}

export async function pruneExpiredPendingFromSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const todayIso = getRomeTodayIso();

  const { data: candidates, error: lookupError } = await supabase
    .from('strikes')
    .select('id, date, category, region, status, data_source')
    .lte('date', todayIso)
    .eq('category', 'TRAIN')
    .eq('region', 'NATIONAL')
    .in('status', ['REQUIRES_DETAIL', 'UNCERTAIN']);

  if (lookupError) {
    throw new Error(`Supabase prune lookup error: ${lookupError.message}`);
  }

  const staleIds = (candidates || [])
    .filter((record) => shouldPruneExpiredPendingRecord(record, todayIso))
    .map((record) => record.id);

  if (staleIds.length === 0) return 0;

  const { error: deleteError } = await supabase
    .from('strikes')
    .delete()
    .in('id', staleIds);

  if (deleteError) {
    throw new Error(`Supabase prune delete error: ${deleteError.message}`);
  }

  return staleIds.length;
}
