import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { CITIES, resolveCity } from './cities';
import { scopeTiming, timingFromWindows } from './strikeTiming';
import type { StrikeRecord } from './strikeSync';
import { evidenceTimeLabel, type EvidenceWindow, type TimingEvidence, type TimingSource } from './strikeEvidence';

// Discovery follows current indexes, never a hard-coded event/article URL.
const MEDIA_INDEXES = [
  'https://www.virgilio.it/notizie/economia/scioperi/',
  'https://moveo.telepass.com/tag/scioperi/',
  'https://www.sicurauto.it/news/traffico-e-viabilita/',
];
const OPERATOR_INDEXES = [
  { operator: 'atm', urls: ['https://www.atm.it/it/AtmNews/AtmInforma/Pagine/default.aspx', 'https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/default2.aspx'] },
  { operator: 'atac', urls: ['https://www.atac.roma.it/tempo-reale'] },
  { operator: 'gtt', urls: ['https://www.gtt.to.it/cms/avvisi-e-informazioni-di-servizio'] },
  { operator: 'trenord', urls: ['https://www.trenord.it/news/trenord-informa/avvisi/'] },
  { operator: 'trenitalia', urls: ['https://www.trenitalia.com/it/informazioni/treni-garantiti-incasodisciopero.html'] },
];
const OFFICIAL_HOSTS = new Set(['cgsse.it', 'www.cgsse.it', 'www.atm.it', 'www.atac.roma.it', 'www.gtt.to.it', 'www.trenord.it', 'www.trenitalia.com', 'scioperi.mit.gov.it']);
const HOSTS = new Set([...OFFICIAL_HOSTS, 'sciopero.net', 'www.virgilio.it', 'moveo.telepass.com', 'www.sicurauto.it']);
const SECTORS = { TRAIN: 'trasporto-ferroviario', SUBWAY: 'trasporto-pubblico-locale', BUS: 'trasporto-pubblico-locale', AIRPORT: 'trasporto-aereo' };
const OPERATORS = ['atm', 'atac', 'gtt', 'trenord', 'trenitalia', 'italo', 'ntv', 'rfi', 'enav', 'easyjet', 'ryanair', 'wizz', 'gest', 'amtab', 'amt', 'anm', 'eav', 'tper', 'tmb', 'actv', 'avm', 'amts', 'amap', 'ratp', 'arriva', 'autolinee toscane', 'busitalia', 'asp', 'ctm', 'brec', 'brescia trasporti', 'triestetrasporti', 'tua', 'sasa', 'stp'];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const unionKey = (s: string) => normalize(s).replace(/\bal[\s-]*cobas\b/g, 'alcobas').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
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
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new Error('Unsupported source content type'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty source body');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 2_000_000) throw new Error('Source body exceeds size limit');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel(); throw error; }
    return Buffer.concat(chunks).toString('utf8');
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
  // Single-event operator/media articles: require date AND union to match later.
  // Only paragraphs explicitly describing an interruption are time candidates.
  const title = $('h1').first().text();
  const body = $('article').first().length ? $('article').first() : $('main').first();
  const text = body.text().replace(/\s+/g, ' ');
  const date = dates.find(d => exactDate(title, d));
  if (date && !output.length && !/\brevocat|\bdifferit|\bsospes/i.test(text)) {
    body.find('p,li').each((_, el) => {
      const timing = $(el).text().replace(/\s+/g, ' ').trim();
      if (/scioper|interromp|stop|sospens/i.test(timing) && !/garanti|fasce di garanzia|ultimi scioperi/i.test(timing)) {
        output.push({ date, provider: title + ' ' + text.slice(0, 1200), territory: title, unions: text.slice(0, 6000), sector: title, timing, status: '', source: sourceFor(url, timing, checkedAt) });
      }
    });
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
  if (!union || !(` ${unionKey(notice.unions)} `).includes(` ${union} `)) return false;
  const city = resolveCity(record.region);
  const territory = normalize(notice.territory + ' ' + notice.provider);
  if (city && !hasWord(territory, city.slug) && !hasWord(territory, city.region) && !/nazionale/.test(territory)) return false;
  if (!city && record.region !== 'NATIONAL') return false;
  const operators = recordOperators(record);
  if (notice.source.url === record.source_url && notice.source.authority === 'official' && notice.provider === record.raw_payload?.provider) return true;
  if (!operators.length || !operators.some(op => hasWord(notice.provider + ' ' + notice.timing, op))) return false;
  const sector = normalize(notice.sector);
  if (record.category === 'TRAIN' && !/ferroviar|tren|rfi|italo/.test(sector + ' ' + notice.provider.toLowerCase())) return false;
  if (record.category === 'AIRPORT' && !/aereo|aeroport|enav|air|ryanair|easyjet|wizz/.test(sector + ' ' + notice.provider.toLowerCase())) return false;
  if (['BUS', 'SUBWAY'].includes(record.category) && /trasporto (?:aereo|ferroviario)/.test(sector)) return false;
  return true;
}

export function parseExternalWindows(text: string, record: StrikeRecord): EvidenceWindow[] {
  let scoped = scopeTiming(normalize(text).replace(/[–—]/g, '-'), record.category);
  if (/garanti|fasce di garanzia|ultimi scioperi|ipotizz|presum/i.test(scoped)) return [];
  const modeLabels = [...scoped.matchAll(/\b(metropolitan[ae]|superficie|autobus|bus|tram)\s*:/g)];
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
  // Require clock minutes so dates, article numbers and durations are not times.
  const ranges = /(?:dalle?\s+(?:ore\s+)?)?\b(\d{1,2})[.:](\d{2})\s*(?:alle?\s+(?:ore\s+)?|a\s+|-\s*)(?:(\d{1,2})(?:[.:](\d{2}))?|(fine\s+servizio|termine\s+(?:del\s+)?servizio))\b/gi;
  for (const m of scoped.matchAll(ranges)) {
    const start = `${m[1].padStart(2, '0')}:${m[2]}`;
    const end = m[3] ? `${m[3].padStart(2, '0')}:${m[4] || '00'}` : null;
    if (Number(m[1]) > 23 || Number(m[2]) > 59 || end && (Number(m[3]) > 24 || Number(m[4] || 0) > 59 || Number(m[3]) === 24 && Number(m[4] || 0) !== 0)) return [];
    // Date-bearing/overnight windows need primary parser day splitting.
    if (end && end <= start || /\bdel\s+\d|giorno\s+successivo/.test(scoped)) return [];
    windows.push({ start, end, end_kind: end ? 'clock' : 'end_of_service' });
  }
  return [...new Map(windows.map(w => [JSON.stringify(w), w])).values()].sort((a,b) => a.start.localeCompare(b.start));
}

export function applyTimingEvidence(record: StrikeRecord, notices: ExternalNotice[]) {
  const result: StrikeRecord = { ...record, timing_evidence: null };
  if (record.status === 'CANCELLED') return result;
  if (record.raw_payload && /fine\s+servizio/i.test(record.raw_payload.modalita)) {
    notices = [...notices, { date: record.date, provider: record.raw_payload.provider, territory: record.region, unions: record.raw_payload.unions || '', sector: record.raw_payload.sector, timing: record.raw_payload.modalita, status: record.raw_payload.sourceStatus || '', source: sourceFor(record.source_url || 'https://scioperi.mit.gov.it/mit2/public/scioperi', record.raw_payload.modalita, new Date().toISOString()) }];
  }
  const candidates = notices.filter(n => matchesNotice(n, record)).map(notice => ({ notice, windows: parseExternalWindows(notice.timing, record) })).filter(c => c.windows.length);
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
  result.strike_windows = selected.windows.filter((w): w is EvidenceWindow & { end: string } => w.end_kind === 'clock' && w.end !== null).map(w => ({ start: w.start, end: w.end }));
  result.display_time = selected.windows.map(w => evidenceTimeLabel(w)).join(', ');
  result.duration_hours = selected.windows.some(w => w.end_kind === 'end_of_service') ? '分时段（至运营结束）' : timingFromWindows(result.strike_windows).hours;
  result.guarantee_windows = []; // Never manufacture guarantees from the complement.
  // 'Uncertain' timing is separate from MIT's confirmation that a strike exists.
  result.status = record.raw_payload?.sourceStatus && /revocat|differit|sospes/i.test(record.raw_payload.sourceStatus) ? 'CANCELLED' : 'CONFIRMED';
  return result;
}

export async function enrichStrikeTiming(records: StrikeRecord[], warnings: string[], now = new Date()) {
  const deadline = Date.now() + 100_000;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  const horizon = new Date(now.getTime() + 31 * 86400000).toISOString().slice(0, 10);
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
      if (Date.now() >= deadline || sourcesChecked >= 100) { warnings.push('External discovery budget reached; some sources deferred'); break; }
      await Promise.all(unique.slice(offset, offset + Math.min(6, 100 - sourcesChecked)).map(async url => {
        sourcesChecked++;
        try { documents.set(url, await fetchHtml(url, deadline)); }
        catch (error) { failed.add(url); warnings.push(`Supplement unavailable: ${new URL(url).hostname}${new URL(url).pathname}: ${error instanceof Error ? error.message + ('cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? ` (${error.cause.code})` : '') : 'fetch failed'}`); }
      }));
    }
  }
  const sectors = [...new Set(targets.map(r => SECTORS[r.category]))];
  const search = sectors.flatMap(sector => dates.map(date => `https://sciopero.net/settore/${sector}/?data=${date}`));
  const operatorIndexes = OPERATOR_INDEXES.filter(o => targets.some(r => recordOperators(r).includes(o.operator))).flatMap(o => o.urls);
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
        if (candidate && /scioper/i.test($(a).text() + ' ' + href) && (dates.some(d => exactDate($(a).text(), d) || exactDate(href.replace(/-/g, ' '), d)) || /scioperi-settimana|scioperi-.*calendario/.test(candidate)) && candidate !== url && !/garantiti-incasodisciopero|in-caso-di-sciopero|tag\/|economia\/scioperi/.test(candidate)) articles.push(candidate);
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
  let notices = [...documents].flatMap(([url, html]) => parseExternalNotices(html, url, dates, now.toISOString()));
  // Prefer the primary regulator details whenever reachable; do not bypass TLS.
  await collect(notices.filter(n => targets.some(r => matchesNotice(n, r))).map(n => n.official_url).filter((u): u is string => Boolean(u)));
  notices = [...documents].flatMap(([url, html]) => parseExternalNotices(html, url, dates, now.toISOString()));
  const enrichedRecords = output.map(r => targets.some(t => t.source_key === r.source_key && t.date === r.date && t.category === r.category && t.region === r.region) ? applyTimingEvidence(r, notices) : r);
  let enriched = 0, conflicts = 0;
  enrichedRecords.forEach((r, i) => {
    if (r.timing_evidence?.confidence === 'conflict') { conflicts++; warnings.push(`Timing conflict requires review: ${r.date} ${r.region} ${r.category} ${r.raw_payload?.unions}`); }
    if (!records[i].strike_windows.length && r.timing_evidence?.windows.length) enriched++;
  });
  return { records: enrichedRecords, enriched, sourcesChecked, conflicts };
}
