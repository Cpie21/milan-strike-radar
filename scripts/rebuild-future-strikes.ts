import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeRegionValue,
  classifyRegionTag,
  inferRegionTagFromText,
  normalizeAirportAffectedLines,
  normalizeProviderList,
} from '../lib/strikeNormalization.ts';

const MIT_URL = 'http://scioperi.mit.gov.it/mit2/public/scioperi';
const NATIONAL_KEYWORDS = ['nazionale', 'plurisettoriale'];
const TRANSPORT_SECTORS = ['trasporto pubblico', 'ferroviario', 'aereo'];
const today = new Date().toISOString().slice(0, 10);
const VERIFIED_SUPPLEMENTS = [
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase env vars');
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/\*/g, '').trim();
}

function parseItalianDate(dateStr: string) {
  const [dd, mm, yyyy] = dateStr.split('/');
  if (!dd || !mm || !yyyy) return dateStr;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function resolveCategory(provider: string, sector: string) {
  const providerLow = provider.toLowerCase();
  const sectorLow = sector.toLowerCase();
  if (providerLow.includes('atm')) return 'SUBWAY';
  if (providerLow.includes('trenord') || providerLow.includes('trenitalia') || providerLow.includes('italo') || sectorLow.includes('ferrov')) return 'TRAIN';
  if (providerLow.includes('sea') || providerLow.includes('enav') || providerLow.includes('aeroport') || sectorLow.includes('aereo')) return 'AIRPORT';
  return 'BUS';
}

async function translateText(text: string) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!text.trim() || !apiKey) return text;
  const params = new URLSearchParams({ auth_key: apiKey, text, target_lang: 'ZH' });
  const response = await fetch(process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    body: params,
  });
  if (!response.ok) return text;
  const json = await response.json();
  return json?.translations?.[0]?.text || text;
}

async function normalizeProvider(raw: string) {
  let toTranslate = raw.toUpperCase();
  toTranslate = toTranslate.replace(/SOC\. /g, '');
  toTranslate = toTranslate.replace(/SOC\./g, '');
  toTranslate = toTranslate.replace(/S\.P\.A\./g, '');
  toTranslate = toTranslate.replace(/S\.R\.L\./g, '');
  toTranslate = toTranslate.replace(/S\.C\.A\.R\.L\./g, '');
  toTranslate = toTranslate.replace(/ PERSONALE /g, ' ');
  toTranslate = toTranslate.replace(/^PERSONALE /g, '');
  toTranslate = toTranslate.replace(/NAVIGANTE /g, '');
  toTranslate = toTranslate.replace(/ DI TERRA E DI VOLO /g, ' ');
  toTranslate = toTranslate.replace(/ DI VOLO /g, ' ');
  toTranslate = toTranslate.replace(/ DI TERRA /g, ' ');
  toTranslate = toTranslate.trim();
  const translated = await translateText(toTranslate);
  return normalizeProviderList(toTranslate, translated).join(' / ') || '相关人员';
}

function parseTimeWindows(modalita: string, note: string, rilevanza: string) {
  const combined = `${modalita} ${note} ${rilevanza}`.toUpperCase();
  let hours = '部分时段';
  const windows: Array<{ start: string; end: string }> = [];

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
  return {
    hours,
    windows,
    display: windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00'
      ? '全天 24小时'
      : windows.map((window) => `${window.start} - ${window.end}`).join(', '),
  };
}

function injectGuaranteeWindows(category: string, dateIso: string, timeInfo: { hours: string; windows: Array<{ start: string; end: string }> }) {
  const date = new Date(dateIso);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  if (category === 'AIRPORT') {
    const isFullDay = timeInfo.hours === '24小时' || timeInfo.windows.some((window) => window.start === '00:00' && window.end === '24:00');
    if (isFullDay) {
      return [
        { start: '07:00', end: '10:00' },
        { start: '18:00', end: '21:00' },
      ];
    }
  }

  if (category === 'TRAIN' && !isWeekend) {
    return [
      { start: '06:00', end: '09:00' },
      { start: '18:00', end: '21:00' },
    ];
  }

  if (category === 'SUBWAY' || category === 'BUS') {
    return [
      { start: '00:00', end: '08:45' },
      { start: '15:00', end: '18:00' },
    ];
  }

  return [];
}

async function run() {
  const html = await fetch(MIT_URL).then((response) => response.text());
  const $ = cheerio.load(html);
  let headerIndex: Record<string, number> = {};
  const rows: Array<{ date: string; provider: string; sector: string; region: string; province: string; modalita: string; note: string; rilevanza: string }> = [];

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
    if (dateCol === -1 && headerIndex.inizio === undefined) return;

    const getByHeader = (key: string, fallbackIdx?: number) => {
      const index = headerIndex[key];
      if (index !== undefined && index !== null) return texts[index] ?? '';
      if (fallbackIdx !== undefined) return texts[fallbackIdx] ?? '';
      return '';
    };

    const row = {
      date: getByHeader('inizio', dateCol).trim(),
      provider: getByHeader('categoria', dateCol + 4).trim(),
      sector: getByHeader('settore', dateCol + 3).trim(),
      modalita: getByHeader('modalita', dateCol + 5).trim(),
      rilevanza: getByHeader('rilevanza', dateCol + 6).trim(),
      note: getByHeader('note', dateCol + 7).trim(),
      region: getByHeader('regione', dateCol + 9).trim(),
      province: getByHeader('provincia', dateCol + 10).trim(),
    };

    const isoDate = parseItalianDate(row.date);
    if (isoDate < today) return;
    if (!TRANSPORT_SECTORS.some((sector) => row.sector.toLowerCase().includes(sector))) return;

    const classified = classifyRegionTag({
      regionText: row.region,
      provinceText: row.province,
      sectorText: row.sector,
      providerText: row.provider,
      noteText: `${row.note} ${row.rilevanza}`,
    });

    let regionTag = classified;
    if (!regionTag && NATIONAL_KEYWORDS.some((keyword) => row.rilevanza.toLowerCase().includes(keyword))) {
      const fallback = inferRegionTagFromText(`${row.provider} ${row.note}`);
      regionTag = fallback && fallback !== 'OTHER' ? fallback : '';
    }

    if (!regionTag || regionTag === 'OTHER') return;
    rows.push({ ...row, region: canonicalizeRegionValue(regionTag) });
  });

  const records = [];
  for (const row of rows) {
    const category = resolveCategory(row.provider, row.sector);
    const provider = await normalizeProvider(row.provider);
    const timeInfo = parseTimeWindows(row.modalita, row.note, row.rilevanza);
    const affectedLines = category === 'AIRPORT'
      ? normalizeAirportAffectedLines([], { contextText: `${row.provider} ${row.note}`, regionTag: row.region })
      : ['全部线路'];

    records.push({
      date: parseItalianDate(row.date),
      region: row.region,
      category,
      provider,
      status: 'CONFIRMED',
      display_time: timeInfo.display,
      duration_hours: timeInfo.hours,
      strike_windows: timeInfo.windows,
      guarantee_windows: injectGuaranteeWindows(category, parseItalianDate(row.date), timeInfo),
      affected_lines: affectedLines,
      data_source: 'MIT_PRIMARY',
    });
  }

  for (const record of VERIFIED_SUPPLEMENTS) {
    if (record.date >= today) {
      records.push(record);
    }
  }

  const mergedRecords = new Map<string, any>();
  for (const record of records) {
    const legacyKey = `${record.date}|${record.provider}`;
    if (!mergedRecords.has(legacyKey)) {
      mergedRecords.set(legacyKey, record);
      continue;
    }

    const existing = mergedRecords.get(legacyKey);
    existing.strike_windows = Array.from(
      new Map(
        [...(existing.strike_windows || []), ...(record.strike_windows || [])].map((window: { start: string; end: string }) => [`${window.start}-${window.end}`, window])
      ).values()
    ).sort((a: { start: string }, b: { start: string }) => a.start.localeCompare(b.start));
    existing.display_time = existing.strike_windows.map((window: { start: string; end: string }) => `${window.start} - ${window.end}`).join(', ');
    existing.affected_lines = Array.from(new Set([...(existing.affected_lines || []), ...(record.affected_lines || [])]));
    existing.guarantee_windows = Array.from(
      new Map(
        [...(existing.guarantee_windows || []), ...(record.guarantee_windows || [])].map((window: { start: string; end: string }) => [`${window.start}-${window.end}`, window])
      ).values()
    );
    existing.status = existing.status === 'CONFIRMED' || record.status === 'CONFIRMED' ? 'CONFIRMED' : existing.status;
  }

  let upserted = 0;
  for (const record of mergedRecords.values()) {
    const { data: existing } = await supabase
      .from('strikes')
      .select('id')
      .eq('date', record.date)
      .eq('region', record.region)
      .eq('category', record.category)
      .eq('provider', record.provider)
      .eq('display_time', record.display_time)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from('strikes').update(record).eq('id', existing.id);
    } else {
      const { error } = await supabase.from('strikes').insert(record);
      if (error) throw error;
    }
    upserted += 1;
  }

  console.log(`Rebuilt ${upserted} future strike rows.`);
}

run().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
