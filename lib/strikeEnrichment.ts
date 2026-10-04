import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { CITIES, resolveCity } from './cities';
import { parseStrikeTiming, scopeTiming, timingFromWindows } from './strikeTiming';
import { CITY_STRIKE_SOURCES, NATIONAL_STRIKE_SOURCES, OFFICIAL_STRIKE_HOSTS, METRO_CITY_TAGS, sourceCities, sourceOperatorNames, assertCitySourceCoverage } from './strikeSources';
import { mergeEvidenceWindows, numericWindows } from './strikePresentation';
import type { StrikeRecord } from './strikeSync';
import { evidenceTimeLabel, type EvidenceWindow, type TimingEvidence, type TimingSource } from './strikeEvidence';

// Discovery follows current indexes, never a hard-coded event/article URL.
const MEDIA_INDEXES = [
  'https://www.virgilio.it/notizie/economia/scioperi/',
  'https://moveo.telepass.com/tag/scioperi/',
  'https://www.sicurauto.it/news/traffico-e-viabilita/',
];
const OFFICIAL_HOSTS = OFFICIAL_STRIKE_HOSTS;
const HOSTS = new Set([...OFFICIAL_HOSTS, 'sciopero.net', 'www.virgilio.it', 'moveo.telepass.com', 'www.sicurauto.it']);
const SECTORS = { TRAIN: 'trasporto-ferroviario', SUBWAY: 'trasporto-pubblico-locale', BUS: 'trasporto-pubblico-locale', AIRPORT: 'trasporto-aereo' };
const OPERATORS = ['atm', 'atac', 'gtt', 'trenord', 'trenitalia', 'italo', 'ntv', 'rfi', 'enav', 'easyjet', 'ryanair', 'wizz', 'gest', 'amtab', 'amt', 'anm', 'eav', 'tper', 'tmb', 'actv', 'avm', 'amts', 'amap', 'ratp', 'arriva', 'autolinee toscane', 'busitalia', 'asp', 'ctm', 'brec', 'brescia trasporti', 'triestetrasporti', 'tua', 'sasa', 'stp', 'atb', 'teb', 'amat', 'atv', 'fce', 'circumetnea', 'brescia mobilita', 'trieste trasporti', 'ita', 'alha', 'dnata', 'sea', 'techno sky', 'adr', 'airport handling'];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const unionKey = (s: string) => normalize(s).replace(/\bal[\s-]*cobas\b/g, 'alcobas').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const matchingUnion = (raw: string, other: string) => {
  const canon=unionKey(raw).replace(/\busb lavoro privato\b/g,'usb').replace(/\bconfial trasporti\b/g,'confial').replace(/\bosr\s+/g,'');
  const text=` ${unionKey(other).replace(/\bconfial trasporti\b/g,'confial').replace(/\busb lavoro privato\b/g,'usb')} `;
  const names=canon.match(/\balcobas\b|\bcobas\b|\bconfial\b|\busb\b|\bcub\b|\bcgil\b|\bcisl\b|\buil\b|\bugl\b|\bfaisa\b|\bfast\b|\borsa\b|\bsul\b/g);
  return names?.length ? names.every(n=>text.includes(` ${n} `)) : Boolean(canon) && text.includes(` ${canon} `);
};
const hasWord = (s: string, word: string) => new RegExp(`(?:^|[^a-z0-9])${word}(?:$|[^a-z0-9])`, 'i').test(normalize(s));
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const linkUrl = (href: string, base: string) => { try { const value = new URL(href, base).href; return allowedSourceUrl(value) ? value : null; } catch { return null; } };
const timeKey = (windows: EvidenceWindow[]) => JSON.stringify(windows);

export interface ExternalNotice {
  date: string;
  provider: string;
  territory: string;
  unions: string;
  sector: string;
  timing: string;
  status: string;
  source: TimingSource;
  official_url?: string;
  operator_day?: boolean;
  guarantee_windows?: { start: string; end: string }[];
  cities?: string[];
}

export function allowedSourceUrl(input: string) {
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && HOSTS.has(u.hostname);
  } catch { return false; }
}

async function fetchHtml(input: string, deadline: number): Promise<string> {
  let url = input;
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!allowedSourceUrl(url)) throw new Error('Source URL is outside approved hosts');
    const remaining = deadline - Date.now();
    if (remaining < 100) throw new Error('External discovery budget exhausted');
    const response = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(Math.min(10_000, remaining)), headers: { 'User-Agent': 'ItalyStrike/1.0 (+https://www.theitalystrike.com)' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Missing source redirect location');
      await response.body?.cancel();
      const next = new URL(location, url);
      if (next.hostname.replace(/^www\./, '') !== new URL(url).hostname.replace(/^www\./, '')) throw new Error('Cross-publisher redirect rejected');
      url = next.href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (!/text\/html|application\/xhtml|application\/pdf/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new Error('Unsupported source content type'); }
    const pdfContent = /application\/pdf/i.test(response.headers.get('content-type') || '');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty source body');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > (pdfContent ? 6_000_000 : 2_000_000)) throw new Error('Source body exceeds size limit');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel(); throw error; }
    const buffer = Buffer.concat(chunks);
    if (pdfContent) {
      const { getDocumentProxy, extractText } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      try {
        if (pdf.numPages > 20) throw new Error('PDF page bound exceeded');
        const { text } = await extractText(pdf, { mergePages: true });
        if (!text.trim()) throw new Error('PDF has no extractable text; another source is needed');
        const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<main><article><h1>${escape(text.slice(0,300))}</h1><p>${escape(text)}</p></article></main>`;
      } finally { await pdf.loadingTask.destroy(); }
    }
    const html = buffer.toString('utf8');
    if (/radware captcha|we apologize for the inconvenience|verify you are human|access denied/i.test(html.slice(0,30000))) throw new Error('Source blocked automated access');
    return html;
  }
  throw new Error('Source redirect limit exceeded');
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function exactDate(text: string, date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new RegExp(`\\b0?${day}\\s*[/.-]\\s*0?${month}\\s*[/.-]\\s*${year}\\b|\\b${day}\\s+${MONTHS[month - 1]}\\s+${year}\\b`, 'i').test(text);
}
function sourceFor(url: string, text: string, checkedAt: string): TimingSource {
  const host = new URL(url).hostname;
  return { url, name: host === 'sciopero.net' ? 'Sciopero.net' : host === 'www.virgilio.it' ? 'Virgilio' : host, authority: OFFICIAL_HOSTS.has(host) ? 'official' : 'reported', checked_at: checkedAt, excerpt: text.slice(0, 800), content_hash: digest(text) };
}

// Structured detail pages carry date, union, transport mode and territorial scope.
export function parseExternalNotices(html: string, url: string, dates: string[], checkedAt = new Date().toISOString()): ExternalNotice[] {
  const $ = cheerio.load(html);
  const published = $('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime') || html.match(/"datePublished"\s*:\s*"([^"]+)/)?.[1];
  $('script,style,nav,footer,header,aside').remove();
  const output: ExternalNotice[] = [];
  const detail = $('.detail-container').first();
  if (detail.length) {
    const fields: Record<string, string> = {};
    detail.find('.detail-row').each((_, el) => { fields[normalize($(el).find('.detail-label').text())] = $(el).find('.detail-value').text().replace(/\s+/g, ' ').trim(); });
    const date = dates.find(d => exactDate(fields["data dell'evento"] || '', d));
    if (date) {
      const timing = fields['orari e fasce'] || '';
      const official = detail.find('a[href*="cgsse.it/"]').attr('href');
      output.push({ date, provider: detail.find('h1').text(), territory: fields['ambito territoriale'] || '', unions: fields['sigle sindacali'] || '', sector: fields['settore coinvolto'] || '', timing, status: fields['stato attuale'] || '', source: sourceFor(url, timing, checkedAt), ...(official && allowedSourceUrl(official) ? { official_url: official } : {}) });
    }
    return output;
  }
  // A calendar table row is its own event; dates/times from adjacent rows are never mixed.
  $('article tr,main tr').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
    if (cells.length < 3) return;
    const date = dates.find(d => exactDate(cells[0], d));
    if (date) output.push({ date, provider: cells[0], territory: cells[0], unions: cells[1], sector: cells[0], timing: cells.slice(2).join(' '), status: '', source: sourceFor(url, cells.join(' | '), checkedAt) });
  });
  // Article dates may be in the body, or omit the year in a title. A
  // publication date anchors yearless dates and rejects old recurring notices.
  const title = $('h1,h2').filter((_,el)=>/scioper/i.test($(el).text())).first().text() || $('h1').first().text();
  const body = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  // HTML block boundaries often contain no literal whitespace. Preserve word
  // boundaries so "2030</h1><p>USB" does not become the unknown union "2030USB".
  body.find('h1,h2,h3,p,li,div,td,br').append(' ');
  const text = body.text().replace(/\s+/g, ' ').trim();
  const knownCities = sourceCities(url);
  const official = OFFICIAL_HOSTS.has(new URL(url).hostname);
  const operatorContext = official ? sourceOperatorNames(url) : '';
  const eventDates = dates.filter(d => {
    if (exactDate(title, d) || exactDate(text.slice(0,2500), d)) return true;
    if (!published || !/scioper/i.test(title)) return false;
    const [year,month,day]=d.split('-').map(Number);
    const stamp=Date.parse(published), event=Date.parse(d);
    return Number.isFinite(stamp) && event >= stamp-7*86400000 && event <= stamp+90*86400000 && new RegExp(`\\b${day}\\s+${MONTHS[month-1]}(?!\\s+20\\d{2})`, 'i').test(title) && year >= new Date(stamp).getUTCFullYear();
  });
  if (!output.length && eventDates.length && /scioper/i.test(title + ' ' + text.slice(0,1500)) && !/\brevocat|\bdifferit|\bsospes|annullat/i.test(text)) {
    const parts: { text:string; heading:string }[]=[];
    let heading=title;
    body.find('h2,h3,p,li,pre').each((_,el)=>{
      if (/^h[23]$/.test(el.tagName)) { heading=$(el).text(); return; }
      const t=$(el).text().replace(/\s+/g,' ').trim();
      if (t) parts.push({text:t,heading});
    });
    if (!parts.length) parts.push({text,heading:title});
    // Source union abbreviations are allowed for official operator notices;
    // date + operator-wide announcements without named unions cover that day.
    const names = /alcobas|al[ -]cobas|confial|usb|cub|cobas|cgil|cisl|uil|ugl|faisa|fast|orsa|sul/i;
    const namedUnion=names.test(text);
    const hasParts = /garant|fasce/i.test(text);
    for (const date of eventDates) for (const part of parts) {
      const candidate=part.text;
      if (!/\d{1,2}[.:]\d{2}|dalle?\s+\d|inizio\s+(?:del\s+)?servizio/i.test(candidate)) continue;
      const guarantee = /garant|fasce di garanzia/i.test(part.heading + ' ' + candidate);
      // A lone 24-hour duration without an actual interruption clause is not
      // operational timing, and generic guarantee pages cannot supply dates.
      if (guarantee || /ultimi scioperi|precedent[ei] scioperi/i.test(candidate)) continue;
      if (!official && !/scioper|interromp|stop|sospens|orari/i.test(part.heading+' '+candidate)) continue;
      const mentioned = (value:string) => {
        const specific=knownCities.filter(tag=>hasWord(value,resolveCity(tag)!.slug));
        return specific.length ? specific : knownCities.filter(tag=>hasWord(value,resolveCity(tag)!.region));
      };
      const cities = mentioned(part.heading+' '+candidate).length ? mentioned(part.heading+' '+candidate) : mentioned(title).length ? mentioned(title) : knownCities;
      const territory = [title,...cities.map(c=>resolveCity(c)?.slug || c)].join(' ');
      output.push({ date, provider: title+' '+operatorContext+' '+text.slice(0,1000), territory, cities, unions:text, sector:knownCities.length ? 'Trasporto pubblico locale' : title, timing:candidate, status:'', operator_day:official && !namedUnion, source:sourceFor(url,candidate,checkedAt) });
    }
    // Keep guarantees only when stated for this event in a separate clause.
    if (hasParts) {
      const guarantees = parts.filter(p=>/garant|fasce di garanzia/i.test(p.heading+' '+p.text)).flatMap(p=>parseStrikeTiming(p.text).windows);
      if (guarantees.length) output.forEach(n=>{ if(n.source.url===url) n.guarantee_windows=guarantees; });
    }
  }

  return output;
}

function recordOperators(record: StrikeRecord) {
  return OPERATORS.filter(op => hasWord(record.raw_payload?.provider || record.provider, op));
}
export function matchesNotice(notice: ExternalNotice, record: StrikeRecord) {
  if (notice.date !== record.date || record.status === 'CANCELLED' || /revocat|differit|sospes/i.test(notice.status)) return false;
  const union = unionKey(record.raw_payload?.unions || '');
  // Without a matching union, two strikes at one operator on the same date collide.
  if (!union || !matchingUnion(record.raw_payload?.unions || '', notice.unions) && !(notice.operator_day && notice.source.authority === 'official')) return false;
  const city = resolveCity(record.region);
  const territory = normalize(notice.territory + ' ' + notice.provider);
  const publisherCities = sourceCities(notice.source.url);
  if (city && publisherCities.length && !publisherCities.includes(city.tag)) return false;
  if (city && notice.cities?.length && !notice.cities.includes(city.tag)) return false;
  if (notice.source.url === record.source_url && notice.source.authority === 'official' && notice.provider === record.raw_payload?.provider) return true;
  if (city && !hasWord(territory, city.slug) && !hasWord(territory, city.region) && !/nazionale/.test(territory)) return false;
  if (!city && record.region !== 'NATIONAL') return false;
  if (record.region === 'NATIONAL' && !/nazionale|nazional[ei]/.test(territory)) return false;
  const operators = recordOperators(record);
  const generic = /sciopero generale|settori pubblici|categorie pubbliche|tutte.*aziend|plurisettorial/i.test(record.raw_payload?.provider || '');
  const officialCity = notice.source.authority === 'official' && sourceCities(notice.source.url).includes(record.region);
  const ignored = new Set(['personale','soc','socc','societa','gruppo','trasporto','trasporti','pubblico','locale','settore','del','della','delle','degli','dello','dei','per','con','tutti','tutte','italia','spa','srl','aeroporto','aeroporti','azienda','aziende','esercizio','viaggiante', ...CITIES.flatMap(c=>[c.slug,c.region])]);
  const identifiers = normalize(record.raw_payload?.provider || '').split(/[^a-z0-9]+/).filter(t=>t.length>2&&!ignored.has(t));
  const companyMatch = operators.length ? operators.some(op=>hasWord(notice.provider+' '+notice.timing,op)) : identifiers.length && identifiers.every(t=>hasWord(notice.provider,t));
  if (!companyMatch && !(generic && officialCity && ['BUS','SUBWAY'].includes(record.category))) return false;
  const sector = normalize(notice.sector);
  if (record.category === 'TRAIN' && !/ferroviar|tren|rfi|italo/.test(sector + ' ' + notice.provider.toLowerCase())) return false;
  if (record.category === 'AIRPORT' && !/aereo|aeroport|enav|air|ryanair|easyjet|wizz/.test(sector + ' ' + notice.provider.toLowerCase())) return false;
  if (['BUS', 'SUBWAY'].includes(record.category) && /trasporto (?:aereo|ferroviario)/.test(sector)) return false;
  return true;
}

export function parseExternalWindows(text: string, record: StrikeRecord): EvidenceWindow[] {
  let scoped = scopeTiming(normalize(text).replace(/[–—]/g, '-').replace(/\b(\d{1,2}),(\d{2})\b/g,'$1:$2'), record.category);
  if (/garanti|fasce di garanzia|ultimi scioperi|ipotizz|presum/i.test(scoped)) return [];
  const metroOnly = /metropolitan|\bmetro\b/.test(scoped) && !/superficie|autobus|\bbus\b|\btram\b/.test(scoped);
  const surfaceOnly = /superficie|autobus|\bbus\b|\btram\b/.test(scoped) && !/metropolitan|\bmetro\b/.test(scoped);
  if (record.category === 'BUS' && metroOnly || record.category === 'SUBWAY' && surfaceOnly) return [];
  const modeLabels = [...scoped.matchAll(/\b(metropolitan[ae]|superficie|autobus|bus|tram)(?:\s*:|\s+(?=dalle?\s+(?:ore\s+)?\d))/g)];
  if (modeLabels.length && ['SUBWAY', 'BUS'].includes(record.category)) {
    scoped = modeLabels.filter(m => record.category === 'SUBWAY' ? /metropolitan/.test(m[1]) : !/metropolitan/.test(m[1])).map(m => { const index = modeLabels.indexOf(m); return scoped.slice(m.index! + m[0].length, modeLabels[index + 1]?.index ?? scoped.length); }).join(' / ');
  }
  // Operator clauses may contain a whole-hour endpoint, e.g. dalle 8:45 alle 15.
  scoped = scoped.replace(/\bdalle?\s+(?:ore\s+)?(\d{1,2})(?![\d.:])\s+alle?\s+(?:ore\s+)?(\d{1,2})(?![\d.:])/g, 'dalle $1:00 alle $2:00');
  scoped = scoped.replace(/\bdalle?\s+(?:ore\s+)?(\d{1,2})(?![\d.:])\s+a\s+(fine\s+servizio)/g, 'dalle $1:00 a $2');
  const ops = recordOperators(record);
  // ATM/NET calendars contain Monza, Trezzo and Como with different hours.
  // Keep the ATM clause; the first comma/semicolon is not a boundary because
  // it can separate staff categories rather than operators.
  if (record.region === 'MILANO' && ops.includes('atm')) {
    const atm = scoped.search(/\b(?:gruppo\s+)?atm\b/);
    scoped = (atm >= 0 ? scoped.slice(atm) : scoped).split(/(?:[,;]\s*|\s+e\s+)?(?:net\s*-?\s*urbano\s+monza|net\s+monza|funicolare|extraurbano\s+trezzo|net\s*-\s*urbano)/i)[0];
  }
  // Different cities/airports/operators later in a clause cannot donate their times.
  const city = resolveCity(record.region);
  if (city) {
    const others = CITIES.filter(c => c.tag !== city.tag && !ops.includes(c.slug)).map(c => c.slug);
    const boundary = scoped.search(new RegExp(`(?:[,;]\\s*|\\s+e\\s+)(?:${others.join('|')})\\b`, 'i'));
    if (boundary >= 0) scoped = scoped.slice(0, boundary);
  }
  const windows: EvidenceWindow[] = [];
  // Explicit multi-day dates are split by the primary parser for this day.
  // A bare overnight pair has no reliable second date and remains unresolved.
  if (/\bdel\s+\d{1,2}\/\d{1,2}/i.test(scoped)) {
    const dated = parseStrikeTiming(scoped, undefined, record.date);
    return dated.dateSpecific ? dated.windows.map(w=>({...w,end_kind:'clock' as const})) : [];
  }
  const starts = /(?:dall['’]?|da)\s*inizio\s+(?:del\s+)?servizio\s*(?:alle?\s+(?:ore\s+)?|fino\s+alle?\s+)(\d{1,2})(?:[.:](\d{2}))?\b/gi;
  for (const m of scoped.matchAll(starts)) {
    if (Number(m[1]) > 24 || Number(m[2] || 0) > 59 || Number(m[1]) === 24 && Number(m[2] || 0)) return [];
    windows.push({start:null,end:`${m[1].padStart(2,'0')}:${m[2] || '00'}`,end_kind:'clock'});
  }
  // Require clock minutes so dates, article numbers and durations are not times.
  const ranges = /(?:dalle?\s+(?:ore\s+)?)?\b(\d{1,2})[.:](\d{2})\s*(?:alle?\s+(?:ore\s+)?|a\s+|-\s*)(?:(\d{1,2})(?:[.:](\d{2}))?|(fine\s+servizio|termine\s+(?:del\s+)?servizio))\b/gi;
  for (const m of scoped.matchAll(ranges)) {
    const start = `${m[1].padStart(2, '0')}:${m[2]}`;
    const end = m[3] ? `${m[3].padStart(2, '0')}:${m[4] || '00'}` : null;
    if (Number(m[1]) > 23 || Number(m[2]) > 59 || end && (Number(m[3]) > 24 || Number(m[4] || 0) > 59 || Number(m[3]) === 24 && Number(m[4] || 0) !== 0)) return [];
    // Date-bearing/overnight windows need primary parser day splitting.
    if (end && end <= start || /giorno\s+successivo/.test(scoped)) return [];
    windows.push({ start, end, end_kind: end ? 'clock' : 'end_of_service' });
  }
  return mergeEvidenceWindows(windows);
}

export function applyTimingEvidence(record: StrikeRecord, notices: ExternalNotice[]) {
  const result: StrikeRecord = { ...record, timing_evidence: null };
  if (record.status === 'CANCELLED') return result;
  if (record.raw_payload && /(?:fine|termine|inizio)\s+(?:del\s+)?servizio/i.test(record.raw_payload.modalita)) {
    notices = [...notices, { date: record.date, provider: record.raw_payload.provider, territory: record.region, unions: record.raw_payload.unions || '', sector: record.raw_payload.sector, timing: record.raw_payload.modalita, status: record.raw_payload.sourceStatus || '', source: sourceFor(record.source_url || 'https://scioperi.mit.gov.it/mit2/public/scioperi', record.raw_payload.modalita, new Date().toISOString()) }];
  }
  // Several paragraphs of one operator announcement form one set of windows.
  // Compare entire announcements, rather than treating their paragraphs as
  // disagreeing sources. The URL identifies the publisher document.
  const perDocument = new Map<string, {notice: ExternalNotice; windows: EvidenceWindow[]}>();
  for (const notice of notices.filter(n=>matchesNotice(n,record))) {
    const windows=parseExternalWindows(notice.timing,record);
    if (!windows.length) continue;
    const prior=perDocument.get(notice.source.url);
    perDocument.set(notice.source.url, prior ? {notice:{...notice,source:sourceFor(notice.source.url,prior.notice.source.excerpt+' '+notice.source.excerpt,notice.source.checked_at), guarantee_windows:[...(prior.notice.guarantee_windows || []),...(notice.guarantee_windows || [])]},windows:mergeEvidenceWindows([...prior.windows,...windows])} : {notice,windows});
  }
  const candidates=[...perDocument.values()];
  if (!candidates.length) return result;
  const officials = candidates.filter(c => c.notice.source.authority === 'official');
  const pool = officials.length ? officials : candidates;
  const groups = new Map<string, typeof candidates>();
  pool.forEach(c => { const key = timeKey(c.windows); groups.set(key, [...(groups.get(key) || []), c]); });
  // A conflict at the same authority cannot be resolved by vote or article order.
  const selected = groups.size === 1 ? pool[0] : null;
  const genericFullDay = record.strike_windows.length === 1 && record.strike_windows[0].start === '00:00' && record.strike_windows[0].end === '24:00' && !/\d{1,2}[.:]\d{2}/.test(record.raw_payload?.modalita || '');
  const mitKnown = record.strike_windows.length > 0 && !genericFullDay;
  const primaryWindows: EvidenceWindow[] = record.strike_windows.map(w => ({ ...w, end_kind: 'clock' }));
  if (!selected || mitKnown && timeKey(selected.windows) !== timeKey(primaryWindows)) {
    result.timing_evidence = { windows: primaryWindows, confidence: 'conflict', sources: candidates.map(c => c.notice.source), unions: record.raw_payload?.unions || '', conflicts: candidates.map(c => ({ url: c.notice.source.url, windows: c.windows })) };
    return result;
  }
  const aligned = candidates.filter(c => timeKey(c.windows) === timeKey(selected.windows));
  const sources = [...new Map(aligned.map(c => [c.notice.source.url, c.notice.source])).values()];
  // Matching hosts corroborate the transcription; they may share an upstream source.
  const evidence: TimingEvidence = { windows: selected.windows, confidence: officials.length || mitKnown ? 'official' : new Set(sources.map(s => new URL(s.url).hostname)).size > 1 ? 'corroborated' : 'reported', sources, unions: record.raw_payload?.unions || '', conflicts: candidates.filter(c => timeKey(c.windows) !== timeKey(selected.windows)).map(c => ({ url: c.notice.source.url, windows: c.windows })) };
  result.timing_evidence = evidence;
  if (mitKnown) return result;
  result.strike_windows = numericWindows(selected.windows);
  result.display_time = selected.windows.map(w => evidenceTimeLabel(w)).join(', ');
  result.duration_hours = selected.windows.some(w => w.start === null || w.end_kind === 'end_of_service') ? '分时段（按运营时间）' : timingFromWindows(result.strike_windows).hours;
  result.guarantee_windows = aligned.filter(c=>c.notice.source.authority === selected.notice.source.authority).flatMap(c=>c.notice.guarantee_windows || []); // Explicit event-specific statements only.
  // 'Uncertain' timing is separate from MIT's confirmation that a strike exists.
  result.status = record.raw_payload?.sourceStatus && /revocat|differit|sospes/i.test(record.raw_payload.sourceStatus) ? 'CANCELLED' : 'CONFIRMED';
  return result;
}

export async function enrichStrikeTiming(records: StrikeRecord[], warnings: string[], now = new Date()) {
  const deadline = Date.now() + 160_000;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  const horizon = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const targets = records.filter(r => r.status !== 'CANCELLED' && r.date >= today && r.date <= horizon && r.raw_payload);
  const output = records.map(r => ({ ...r, timing_evidence: null } as StrikeRecord));
  if (!targets.length) return { records: output, enriched: 0, sourcesChecked: 0, conflicts: 0 };
  const dates = [...new Set(targets.map(r => r.date))].sort();
  const documents = new Map<string, string>();
  const failed = new Set<string>();
  let sourcesChecked = 0;
  // Bound parallelism, redirects, bytes, time and total documents in the function.
  async function collect(urls: string[]) {
    const unique = [...new Set(urls)].filter(u => !documents.has(u) && !failed.has(u));
    for (let offset = 0; offset < unique.length; offset += 6) {
      if (Date.now() >= deadline || sourcesChecked >= 180) { warnings.push('External discovery budget reached; some sources deferred'); break; }
      await Promise.all(unique.slice(offset, offset + Math.min(6, 180 - sourcesChecked)).map(async url => {
        sourcesChecked++;
        try { documents.set(url, await fetchHtml(url, deadline)); }
        catch (error) { failed.add(url); warnings.push(`Supplement unavailable: ${new URL(url).hostname}${new URL(url).pathname}: ${error instanceof Error ? error.message + ('cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? ` (${error.cause.code})` : '') : 'fetch failed'}`); }
      }));
    }
  }
  const search = [...new Set([...targets].sort((a,b)=>Number(Boolean(a.strike_windows.length))-Number(Boolean(b.strike_windows.length)) || a.date.localeCompare(b.date)).map(r=>`https://sciopero.net/settore/${SECTORS[r.category]}/?data=${r.date}`))];
  assertCitySourceCoverage();
  const operatorIndexes = [
    ...CITY_STRIKE_SOURCES.filter(o=>targets.some(r=>(r.region === 'NATIONAL' || o.cities.includes(r.region)) && ['BUS','SUBWAY'].includes(r.category))).flatMap(o=>o.urls),
    ...NATIONAL_STRIKE_SOURCES.filter(o=>targets.some(r=>recordOperators(r).some(op=>o.aliases.includes(op)) || r.region === 'NATIONAL' && (r.category === 'TRAIN' || r.category === 'AIRPORT'))).flatMap(o=>o.urls),
  ];
  await collect([...operatorIndexes, ...MEDIA_INDEXES, ...search]);
  const articles: string[] = [];
  for (const [url, html] of documents) {
    const $ = cheerio.load(html);
    if (new URL(url).hostname === 'sciopero.net') {
      $('.strike-item').each((_, item) => {
        const text = $(item).text();
        if (!dates.some(d => exactDate(text, d))) return;
        const href = $(item).find('a[href]').attr('href');
        if (href) { const detail = new URL(href, url).href; if (allowedSourceUrl(detail)) articles.push(detail); }
      });
      const lastPage = $('.scioperi-pagination a').map((_, a) => Number(new URL($(a).attr('href') || url, url).searchParams.get('page') || 1)).get();
      // With a specific date, extra pages are few; never silently truncate.
      for (let page = 2; page <= Math.min(Math.max(1, ...lastPage), 4); page++) { const u = new URL(url); u.searchParams.set('page', String(page)); articles.push(u.href); }
      if (Math.max(1, ...lastPage) > 4) warnings.push(`Supplement date index exceeds page bound: ${url}`);
    } else {
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const candidate = linkUrl(href, url);
        if (candidate && /scioper/i.test($(a).text() + ' ' + href) && (OFFICIAL_HOSTS.has(new URL(url).hostname) || dates.some(d => exactDate($(a).text(), d) || exactDate(href.replace(/-/g, ' '), d)) || /scioperi-settimana|scioperi-.*calendario/.test(candidate)) && candidate !== url && !/garantiti-incasodisciopero|in-caso-di-sciopero|tag\/|economia\/scioperi/.test(candidate)) articles.push(candidate);
      });
    }
  }
  await collect(articles);
  // Extract links from discovered date-index pagination too.
  const pageDetails: string[] = [];
  for (const [url, html] of documents) {
    if (!new URL(url).searchParams.has('page')) continue;
    const $ = cheerio.load(html);
    $('.strike-item').each((_, item) => { const href = $(item).find('a[href]').attr('href'); if (href && dates.some(d => exactDate($(item).text(), d))) { const u = new URL(href, url).href; if (allowedSourceUrl(u)) pageDetails.push(u); } });
  }
  await collect(pageDetails);
  const attachments: string[]=[];
  for (const [url,html] of documents) {
    if (!OFFICIAL_HOSTS.has(new URL(url).hostname) || !/scioper/i.test(cheerio.load(html)('h1').first().text())) continue;
    const $=cheerio.load(html);
    $('a[href]').each((_,a)=>{const u=linkUrl($(a).attr('href') || '',url);if(u && /\.pdf(?:$|\?)/i.test(u)) attachments.push(u);});
  }
  await collect(attachments);
  let notices = [...documents].flatMap(([url, html]) => parseExternalNotices(html, url, dates, now.toISOString()));
  // Prefer the primary regulator details whenever reachable; do not bypass TLS.
  await collect(notices.filter(n => targets.some(r => matchesNotice(n, r))).map(n => n.official_url).filter((u): u is string => Boolean(u)));
  notices = [...documents].flatMap(([url, html]) => parseExternalNotices(html, url, dates, now.toISOString()));
  const cityVariants: StrikeRecord[]=[];
  for (const record of targets.filter(r=>r.region==='NATIONAL' && ['BUS','SUBWAY'].includes(r.category))) {
    for (const city of CITIES) {
      const scoped=notices.filter(n=>n.source.authority==='official' && sourceCities(n.source.url).includes(city.tag));
      const general=/sciopero generale|categorie pubbliche|plurisettorial/i.test(record.raw_payload?.provider || '');
      const categories = record.category === 'BUS' && general && METRO_CITY_TAGS.has(city.tag) ? ['BUS','SUBWAY'] as const : [record.category];
      for (const category of categories) {
        const variant={...record,region:city.tag,category};
        const enriched=applyTimingEvidence(variant,scoped);
        if (enriched.timing_evidence?.windows.length && enriched.timing_evidence.confidence !== 'conflict') {
          enriched.provider=[...new Set(CITY_STRIKE_SOURCES.filter(s=>s.cities.includes(city.tag) && enriched.timing_evidence!.sources.some(e=>s.urls.some(root=>new URL(root).hostname===new URL(e.url).hostname))).map(s=>s.name))].join(' / ') || enriched.provider;
          cityVariants.push(enriched);
        }
      }
    }
  }
  const enrichedRecords = output.map(r => targets.some(t => t.source_key === r.source_key && t.date === r.date && t.category === r.category && t.region === r.region) ? applyTimingEvidence(r, notices) : r);
  let enriched = 0, conflicts = 0;
  enrichedRecords.forEach((r, i) => {
    if (r.timing_evidence?.confidence === 'conflict') { conflicts++; warnings.push(`Timing conflict requires review: ${r.date} ${r.region} ${r.category} ${r.raw_payload?.unions}`); }
    if (!records[i].strike_windows.length && r.timing_evidence?.windows.length) enriched++;
    if (r.status !== 'CANCELLED' && !r.strike_windows.length && !r.timing_evidence?.windows.length) warnings.push(`Operational timing unresolved: ${r.date} ${r.region} ${r.category} ${r.raw_payload?.provider || r.provider}`);
  });
  return { records: [...enrichedRecords,...cityVariants], enriched:enriched+cityVariants.length, sourcesChecked, conflicts };
}
