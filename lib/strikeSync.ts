import { createHash } from 'node:crypto';
import { parseStrikeTiming, scopeTiming } from './strikeTiming';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeRegionValue,
  classifyRegionTags,
  normalizeAirportAffectedLines,
  normalizeProviderList,
} from './strikeNormalization';
import { getGuaranteeWindows } from './guaranteeWindows';
import type { TimingEvidence } from './strikeEvidence';

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
  source_key?: string;
  source_url?: string;
  raw_payload?: RawStrikeRow;
  last_seen_at?: string;
  timing_evidence?: TimingEvidence | null;
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
  unions?: string;
  sourceKey?: string;
  sourceUrl?: string;
  sourceStatus?: string;
  rawRegion?: string;
}

const MIT_URL = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const TRANSPORT_SECTORS = ['trasporto pubblico', 'ferroviario', 'aereo'];
const TRANSPORT_CONTEXT_KEYWORDS = [
  'ferroviario',
  'ferrovie',
  'settore ferroviario',
  'ferroviario:',
  'trasporto pubblico locale',
  'settore aereo',
  'trasporto aereo',
  'aeroport',
  'enav',
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
  return header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchOfficial(url: string, options: RequestInit = {}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`MIT returned HTTP ${response.status}`);
      return parseStrikeHtml(await response.text());
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function fetchAndFilter(): Promise<RawStrikeRow[]> {
  return fetchOfficial(MIT_URL);
}

// The upcoming list drops yesterday's records and withdrawn future events.
// Search all states so both late changes and upcoming cancellations are seen.
export async function fetchRecentRows(todayIso = getRomeTodayIso()): Promise<RawStrikeRow[]> {
  const { start, end } = syncDateWindow(todayIso);
  const italianDate = (iso: string) => iso.split('-').reverse().join('/');
  const body = new URLSearchParams({ dataInizio: italianDate(start), dataFine: italianDate(end), settore: '0', rilevanza: '0', stato: '0', categoria: '', sindacato: '', submit: 'Ricerca' });
  return fetchOfficial(`${MIT_URL}/ricerca`, { method: 'POST', body });
}

export function syncDateWindow(todayIso = getRomeTodayIso()) {
  const start = new Date(`${todayIso}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(`${todayIso}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 90);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function parseStrikeHtml(html: string): RawStrikeRow[] {
  const $ = cheerio.load(html);
  const rows: RawStrikeRow[] = [];
  let headerIndex: Record<string, number> = {};
  let foundStrikeTable = false;

  $('table tr').each((_, tr) => {
    const ths = $(tr).find('th');
    if (ths.length > 0) {
      const headers = ths.map((__, th) => normalizeHeader($(th).text())).get();
      headerIndex = {};
      headers.forEach((header, index) => {
        if (header) headerIndex[header] = index;
      });
      if (['inizio', 'fine', 'categoria', 'settore', 'modalita', 'regione', 'provincia'].every((key) => headerIndex[key] !== undefined)) {
        foundStrikeTable = true;
      }
      return;
    }

    const cells = $(tr).find('td');
    if (cells.length < 5) return;

    const texts = cells.map((__, td) => $(td).text().trim()).get();
    const dateCol = texts.findIndex((text) => /^\d{2}\/\d{2}\/\d{4}/.test(text));
    if (dateCol === -1) return;

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
      unions: getByHeader('sindacati', dateCol + 2).trim(),
      sourceStatus: getByHeader('stato').trim(),
      sourceUrl: MIT_URL,
      region: getByHeader('regione', dateCol + 9).trim(),
      rawRegion: getByHeader('regione', dateCol + 9).trim(),
      province: getByHeader('provincia', dateCol + 10).trim(),
    };

    if (!isTransportRelevantRow(raw)) return;
    const regionTags = classifyRegionTags({
      regionText: raw.region, provinceText: raw.province, sectorText: raw.sector,
      providerText: raw.provider, noteText: `${raw.note} ${raw.rilevanza}`,
    });
    // Identity intentionally excludes timing, so an official timing revision
    // replaces its previous version rather than creating a second full-day row.
    raw.sourceKey = createHash('sha256').update(JSON.stringify([
      raw.date, raw.provider, raw.unions, raw.proclamationDate, raw.region, raw.province,
    ])).digest('hex');
    regionTags.forEach(region => rows.push({ ...raw, region: canonicalizeRegionValue(region) }));
  });

  if (!foundStrikeTable) {
    throw new Error('MIT strike table missing or changed; refusing to treat this response as no strikes');
  }
  return rows;
}

function isTransportRelevantRow(row: RawStrikeRow) {
  const sectorLow = row.sector.toLowerCase();
  const combined = `${row.sector} ${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();


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

function parseItalianDateToDate(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split('/');
  if (!dd || !mm || !yyyy) return null;

  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) || date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd) ? null : date;
}

function getDateSpan(startDateStr: string, endDateStr?: string) {
  const start = parseItalianDateToDate(startDateStr);
  const end = parseItalianDateToDate(endDateStr || startDateStr);
  if (!start || !end || end < start) throw new Error(`Invalid official date span: ${startDateStr} - ${endDateStr}`);

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 32) {
    const yyyy = String(cursor.getFullYear());
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  if (cursor <= end) throw new Error('Official date span exceeds 32 days; refusing to publish a truncated span');

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
  baseTimeInfo: { hours: string; display: string; windows: StrikeWindow[]; dateSpecific?: boolean },
  dateSpan: string[],
  dateIndex: number
) {
  if (dateSpan.length <= 1 || baseTimeInfo.dateSpecific) {
    return {
      hours: baseTimeInfo.hours,
      display: baseTimeInfo.display,
      windows: baseTimeInfo.windows.map((window) => ({ ...window })),
    };
  }

  const isFullDay =
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

  const resolvedWindows = windows;
  return {
    hours: buildDurationFromWindows(resolvedWindows, baseTimeInfo.hours),
    display: resolvedWindows.length ? buildDisplayFromWindows(resolvedWindows) : '具体时段待公布',
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

function getCategoryModalitaText(modalita: string, category?: StrikeRecord['category']) {
  return scopeTiming(modalita, category);
}

function hasConcreteStrikeTiming(row: RawStrikeRow, category: StrikeRecord['category'], dateIso: string) {
  const modalita = getCategoryModalitaText(row.modalita, category).toLowerCase();
  const combined = `${modalita} ${row.note} ${row.rilevanza}`.toLowerCase();

  return (
    /\b\d+\s*ore\b/i.test(combined) ||
    /dalle\s+\d{1,2}[\.:]\d{2}/i.test(combined) ||
    /\d{1,2}[\.:]\d{2}\s*(?:del\s+\d{1,2}\/\d{1,2})?\s*[-–]\s*\d{1,2}[\.:]\d{2}/i.test(combined) ||
    combined.includes('24 ore') ||
    combined.includes('intero turno') ||
    parseTimeWindows(row.modalita, row.note, row.rilevanza, category, dateIso).dateSpecific === true
  );
}

function shouldTreatAsPending(row: RawStrikeRow, category: StrikeRecord['category'], dateIso: string) {
  if (category !== 'TRAIN') return false;
  if (row.region !== 'NATIONAL') return false;
  if (!row.proclamationDate) return false;

  const leadDays = getLeadDaysBeforeStrike(dateIso, row.proclamationDate);
  if (leadDays === null || leadDays < 14) return false;

  const combined = `${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
  const hasConcreteTime = hasConcreteStrikeTiming(row, category, dateIso);
  const hasPassengerImpactSignal = PASSENGER_RAIL_IMPACT_KEYWORDS.some((keyword) => combined.includes(keyword));
  const hasRailScopeSignal = hasPassengerImpactSignal || combined.includes('ferroviario') || combined.includes('ferrovie');

  // An explicit railway window in the official table is evidence even after
  // the date has passed; archive corrections must not become pending again.
  if (hasConcreteTime && hasRailScopeSignal) return false;

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

    const response = await fetch(url, { method: 'POST', body: params, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`DeepL translate failed: ${response.status}`);
    const json = await response.json();
    return json?.translations?.[0]?.text || text;
  } catch (error) {
    console.error('Translation failed for', text, error);
    return text;
  }
}

async function normalizeProvider(raw: string, translator = translateText) {
  let source = raw.toUpperCase();
  source = source.replace(/SOC\. /g, '');
  source = source.replace(/SOC\./g, '');
  source = source.replace(/S\.P\.A\./g, '');
  source = source.replace(/S\.R\.L\./g, '');
  source = source.replace(/S\.C\.A\.R\.L\./g, '');
  source = source.trim();

  const translated = await translator(source);
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

  if (!categories.size && sectorLow.includes('trasporto pubblico')) categories.add('BUS');
  if (/metropolitan|\bmetro\b/.test(providerLow)) categories.add('SUBWAY');
  // An excluded mode does not exclude the other transport modes of a general strike.
  const excluded = combinedLow.match(/esclus[oaie]\s+(?:il\s+)?settor[ei]\s+([^.;]+)/)?.[1] || '';
  if (/aereo/.test(excluded)) categories.delete('AIRPORT');
  if (/ferroviario/.test(excluded)) categories.delete('TRAIN');
  if (/trasporto pubblico|tpl/.test(excluded)) { categories.delete('BUS'); categories.delete('SUBWAY'); }
  return Array.from(categories);
}

function extractAffectedLines(note: string) {
  const keywords = ['Linate', 'Malpensa', 'Bergamo', 'M1', 'M2', 'M3', 'M4', 'M5', 'Trenord', 'Trenitalia'];
  const found = keywords.filter((keyword) => note.toLowerCase().includes(keyword.toLowerCase()));
  return found.length > 0 ? found : ['全部线路'];
}

export function parseTimeWindows(durationRaw: string, note: string, _relevance: string, category?: StrikeRecord['category'], dateIso?: string) {
  // Notes are not mixed into durations: they can contain exclusions, guaranteed
  // service windows and times belonging to a different mode of transport.
  return parseStrikeTiming(durationRaw, category, dateIso);
}

function getCategoryDateSpan(row: RawStrikeRow, category: StrikeRecord['category'], fallbackDateSpan: string[]) {
  const timing = parseStrikeTiming(row.modalita, category, fallbackDateSpan[0]);
  return timing.explicitDates.length ? timing.explicitDates : fallbackDateSpan;
}

export async function transformRows(rawRows: RawStrikeRow[]): Promise<StrikeRecord[]> {
  // The status-search snapshot follows the upcoming snapshot and is authoritative
  // for revisions. Deduplicate before translations and transformations.
  rawRows = [...new Map(rawRows.map(row => [`${row.sourceKey || JSON.stringify(row)}|${row.region}`, row])).values()];
  // Memoize translation work per run and bound concurrency as city coverage grows.
  const translations = new Map<string, Promise<string>>();
  const translate = (text: string) => {
    if (!translations.has(text)) translations.set(text, translateText(text));
    return translations.get(text)!;
  };
  const rawRecordGroups: StrikeRecord[][] = [];
  for (let offset = 0; offset < rawRows.length; offset += 6) {
  const batch = rawRows.slice(offset, offset + 6);
  rawRecordGroups.push(...await Promise.all(batch.map(async (row) => {
    const baseProviderNorm = await normalizeProvider(row.provider, translate);
    const categories = resolveCategories(row.provider, row.sector, `${row.modalita} ${row.note} ${row.rilevanza}`);
    const dateSpan = getDateSpan(row.date, row.endDate);

    let status: StrikeStatus = 'CONFIRMED';
    const combinedRaw = `${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
    if (`${combinedRaw} ${row.sourceStatus || ''}`.toLowerCase().match(/revocat|differit|sospes/)) {
      status = 'CANCELLED';
    } else if (combinedRaw.includes('da definire')) {
      status = 'REQUIRES_DETAIL';
    }

    const recordInputs = categories.flatMap((category) => {
      const categoryDateSpan = getCategoryDateSpan(row, category, dateSpan);
      return categoryDateSpan.map((dateIso, dateIndex) => ({ dateIso, dateIndex, category, dateSpan: categoryDateSpan }));
    });

    return Promise.all(recordInputs.map(async ({ dateIso, dateIndex, category, dateSpan }) => {
      const providerNorm = baseProviderNorm || getProviderFallback(category);
      let resolvedStatus: StrikeStatus = status;
      if (resolvedStatus === 'CONFIRMED' && shouldTreatAsPending(row, category, dateIso)) {
        resolvedStatus = 'REQUIRES_DETAIL';
      }
      const parsedTimeInfo = parseTimeWindows(row.modalita, row.note, row.rilevanza, category, dateIso);
      const timeInfo = splitTimeInfoForDate(parsedTimeInfo, dateSpan, dateIndex);
      const guaranteeWindows = timeInfo.windows.length ? getGuaranteeWindows({
        category,
        dateIso,
        region: row.region,
        isFullDay:
          timeInfo.hours === '24小时' ||
          (timeInfo.windows.length === 1 && timeInfo.windows[0].start === '00:00' && timeInfo.windows[0].end === '24:00'),
      }) : [];

      if (!timeInfo.windows.length && resolvedStatus === 'CONFIRMED') resolvedStatus = 'UNCERTAIN';

      let lines = category === 'AIRPORT'
        ? normalizeAirportAffectedLines([], { contextText: `${row.provider} ${row.note}`, regionTag: row.region })
        : extractAffectedLines(row.note);

      const excludeNotes = ['nazionale', 'provinciale', 'regionale', 'territoriale'];
      if (lines.length === 1 && lines[0] === '全部线路' && row.note.trim().length > 3 && !excludeNotes.includes(row.note.toLowerCase().trim())) {
        const translatedNote = await translate(row.note);
        if (translatedNote && translatedNote !== row.note) lines = [translatedNote];
      }

      if (category === 'AIRPORT') {
        lines = normalizeAirportAffectedLines(lines, {
          contextText: `${row.provider} ${row.note}`,
          regionTag: row.region,
        });
      }

      const dataSource = 'MIT_PRIMARY';
      if (resolvedStatus === 'REQUIRES_DETAIL') resolvedStatus = 'UNCERTAIN';

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
        ...(row.sourceKey ? { source_key: row.sourceKey, source_url: row.sourceUrl || MIT_URL, raw_payload: row, last_seen_at: new Date().toISOString() } : {}),
      } satisfies StrikeRecord;
    }));
  })));
  }
  const rawRecords = rawRecordGroups.flat();

  const recordsMap = new Map<string, StrikeRecord>();
  [...rawRecords, ...VERIFIED_SUPPLEMENTS.filter(record => record.date >= getRomeTodayIso())].forEach((record) => {
    const key = `${record.source_key || record.provider}|${record.date}|${record.region}|${record.category}`;
    const existing = recordsMap.get(key);
    if (record.source_key) { recordsMap.set(key, record); return; }
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
      status: existing.status === 'CANCELLED' || record.status === 'CANCELLED' ? 'CANCELLED' : record.status,
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
  return record.date < todayIso;
}

function isPendingStatus(status?: string | null) {
  return PENDING_STATUSES.includes((status || '') as StrikeStatus);
}

function isFullDayRecord(record: Pick<StrikeRecord, 'display_time' | 'duration_hours' | 'strike_windows'>) {
  return (
    record.display_time === '全天 24小时' ||
    record.duration_hours === '24小时' ||
    (record.strike_windows || []).some((window) => window.start === '00:00' && window.end === '24:00')
  );
}

function shouldReplaceSameStrikeVariant(
  existing: Pick<StrikeRecord, 'status' | 'display_time' | 'duration_hours' | 'strike_windows'>,
  nextRecord: StrikeRecord
) {
  if (isPendingStatus(existing.status) && !isPendingStatus(nextRecord.status)) return true;

  return (
    existing.status === 'CONFIRMED' &&
    nextRecord.status === 'CONFIRMED' &&
    isFullDayRecord(existing) &&
    !isFullDayRecord(nextRecord)
  );
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

function createDatabaseClient(url: string, key: string) {
  return createClient(url, key);
}

export async function upsertToSupabase(records: StrikeRecord[], database?: ReturnType<typeof createDatabaseClient>, warnings: string[] = []) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!database && (!supabaseUrl || !supabaseKey)) {
    throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = database || createDatabaseClient(supabaseUrl!, supabaseKey!);
  let affected = 0;
  const sourced = records.filter(record => record.source_key);
  const adoptedIds = new Set<string>();
  if (sourced.length) {
    const dates = [...new Set(sourced.map(record => record.date))];
    const { data: legacy, error } = await supabase.from('strikes').select('id,date,region,category,provider,source_key').in('date', dates).is('source_key', null);
    if (error) throw new Error(`Source schema unavailable: ${error.message}; apply the strike-source migration first`);
    const rows = [];
    for (const record of sourced) {
      const candidates = (legacy || []).filter(row => row.date === record.date && row.region === record.region && row.category === record.category && row.provider === record.provider && !adoptedIds.has(row.id));
      // A legacy ambiguity must not stop unrelated, authoritative announcements.
      // Do not guess an identity; write a new sourced row. The successful snapshot
      // soft-retires unmatched legacy rows and retains them for later review.
      if (candidates.length > 1) warnings.push(`Ambiguous legacy strike: ${record.date} ${record.region} ${record.category}; retained for review`);
      const existing = candidates.length === 1 ? candidates[0] : undefined;
      if (existing) {
        adoptedIds.add(existing.id);
        const { error: adoptError } = await supabase.from('strikes').update({ source_key: record.source_key }).eq('id', existing.id).is('source_key', null);
        if (adoptError) throw new Error(`Legacy adoption failed: ${adoptError.message}`);
      }
      rows.push({ ...record, updated_at: new Date().toISOString() });
    }
    // A stable source key means corrections to arbitrary times and cancelled
    // events overwrite the same row. Timing is deliberately not part of identity.
    const { error: upsertError } = await supabase.from('strikes').upsert(rows, { onConflict: 'source_key,date,region,category', defaultToNull: false });
    if (upsertError) throw new Error(`Source upsert failed: ${upsertError.message}`);
    affected += sourced.length;
  }
  for (const record of records.filter(record => !record.source_key)) {
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

    const { data: sameStrikeVariants, error: sameStrikeLookupError } = await supabase
      .from('strikes')
      .select('id, status, display_time, duration_hours, strike_windows')
      .eq('date', record.date)
      .eq('region', record.region)
      .eq('category', record.category)
      .eq('provider', record.provider);

    if (sameStrikeLookupError) throw new Error(`Supabase same-strike lookup error: ${sameStrikeLookupError.message}`);

    const replaceableVariant = (sameStrikeVariants || []).find((variant) => shouldReplaceSameStrikeVariant(variant, record));
    if (replaceableVariant?.id) {
      const { error: replaceError } = await supabase.from('strikes').update(record).eq('id', replaceableVariant.id);
      if (replaceError) throw new Error(`Supabase same-strike replace error: ${replaceError.message}`);
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
      throw new Error(`Supabase insert error: ${insertError.message}. Apply the strike-source migration; incompatible records must never be merged to bypass a constraint.`);
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
