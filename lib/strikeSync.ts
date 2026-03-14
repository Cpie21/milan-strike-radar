import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeRegionValue,
  classifyRegionTag,
  inferRegionTagFromText,
  normalizeAirportAffectedLines,
  normalizeProviderList,
} from './strikeNormalization.ts';
import { getGuaranteeWindows } from './guaranteeWindows.ts';

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
  provider: string;
  region: string;
  sector: string;
  province: string;
  modalita: string;
  note: string;
  rilevanza: string;
}

const MIT_URL = 'http://scioperi.mit.gov.it/mit2/public/scioperi';
const NATIONAL_KEYWORDS = ['nazionale', 'plurisettoriale'];
const TRANSPORT_SECTORS = ['trasporto pubblico', 'ferroviario', 'aereo'];
const VERIFIED_SUPPLEMENTS: StrikeRecord[] = [
  {
    date: '2026-03-18',
    region: 'MILANO',
    category: 'AIRPORT',
    provider: 'Airport Handling 地勤人员 / 德纳达地服人员',
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
      provider: getByHeader('categoria', dateCol + 4).trim(),
      sector: getByHeader('settore', dateCol + 3).trim(),
      modalita: getByHeader('modalita', dateCol + 5).trim(),
      rilevanza: getByHeader('rilevanza', dateCol + 6).trim(),
      note: getByHeader('note', dateCol + 7).trim(),
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

    const sectorLow = raw.sector.toLowerCase();
    if (!TRANSPORT_SECTORS.some((sector) => sectorLow.includes(sector))) return;

    rows.push({ ...raw, region: canonicalizeRegionValue(finalRegion) });
  });

  return rows;
}

function parseItalianDate(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split('/');
  if (!dd || !mm || !yyyy) return dateStr;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
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
  return normalizeProviderList(source, translated).join(' / ') || '相关人员';
}

function resolveCategory(provider: string, sector: string): StrikeRecord['category'] {
  const providerLow = provider.toLowerCase();
  const sectorLow = sector.toLowerCase();
  if (providerLow.includes('atm')) return 'SUBWAY';
  if (providerLow.includes('trenord') || providerLow.includes('trenitalia') || providerLow.includes('italo') || sectorLow.includes('ferrov')) return 'TRAIN';
  if (providerLow.includes('sea') || providerLow.includes('enav') || providerLow.includes('aeroport') || sectorLow.includes('aereo')) return 'AIRPORT';
  return 'BUS';
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

    const timeRegex = /DALLE\s+(\d{1,2})[\.:](\d{2})\s+ALLE\s+(\d{1,2})[\.:](\d{2})/g;
    const endOfServiceRegex = /DALLE\s+(\d{1,2})[\.:](\d{2})\s+A\s+FINE\s+SERVIZIO/g;
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

async function fetchSecondarySource(category: string, provider: string, dateIso: string): Promise<{ windows?: StrikeWindow[]; lines?: string[] } | null> {
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
  const rawRecords = await Promise.all(rawRows.map(async (row) => {
    const dateIso = parseItalianDate(row.date);
    const providerNorm = await normalizeProvider(row.provider);
    const category = resolveCategory(row.provider, row.sector);

    let status: StrikeStatus = 'CONFIRMED';
    const combinedRaw = `${row.provider} ${row.modalita} ${row.note} ${row.rilevanza}`.toLowerCase();
    if (combinedRaw.includes('revocat') || combinedRaw.includes('differit')) {
      status = 'CANCELLED';
    } else if (combinedRaw.includes('da definire')) {
      status = 'REQUIRES_DETAIL';
    }

    const timeInfo = parseTimeWindows(row.modalita, row.note, row.rilevanza);
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
    if (status === 'REQUIRES_DETAIL' || (lines.length === 1 && lines[0] === '全部线路')) {
      const secondaryResult = await fetchSecondarySource(category, providerNorm, dateIso);
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
        status = 'CONFIRMED';
        dataSource = 'SECONDARY_LIVE';
      } else if (status === 'REQUIRES_DETAIL') {
        status = 'UNCERTAIN';
      }
    }

    return {
      date: dateIso,
      category,
      provider: providerNorm,
      region: row.region,
      status,
      display_time: timeInfo.display,
      duration_hours: timeInfo.hours,
      strike_windows: timeInfo.windows,
      guarantee_windows: guaranteeWindows,
      affected_lines: lines,
      data_source: dataSource,
    } satisfies StrikeRecord;
  }));

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
