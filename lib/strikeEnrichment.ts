import { easyJetNoticeDocuments } from './easyJetNotices';
import { orderDiscoveryUrls, type DiscoveryAttempt } from './discoveryRotation';
import { SOURCE_USER_AGENT } from './sourceRequest';
import { fetchCgsse } from './cgsseTls';
import { fetchToscanaNotice } from './toscanaAirportNotices';
import { noticeRootsForRecord, officialOperatorIds, identifyOperatorIds } from './operatorAdapters';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { classifyRegionTags } from './strikeNormalization';
import { CITIES, resolveCity } from './cities';
import { parseStrikeTiming, scopeTiming, timingFromWindows } from './strikeTiming';
import { CITY_STRIKE_SOURCES, SUPPLEMENTAL_OPERATOR_SOURCES, AVIATION_STRIKE_SOURCES, NATIONAL_STRIKE_SOURCES, OFFICIAL_STRIKE_HOSTS, METRO_CITY_TAGS, sourceCities, sourceCategory, sourceOperatorNames, assertCitySourceCoverage } from './strikeSources';
import { mergeEvidenceWindows, numericWindows } from './strikePresentation';
import { extractLineScope, sourceFact, makeScopeEvidence } from './strikeScope';
import type { StrikeRecord } from './strikeSync';
import { officialLineScope, parseLineScope, lineTextForMode } from './lineScope';
import { eavDepartmentModes } from './operatorDepartments';
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
const OPERATORS = ['ataf', 'start romagna', 'atm', 'atac', 'gtt', 'trenord', 'trenitalia', 'italo', 'ntv', 'rfi', 'enav', 'easyjet', 'ryanair', 'wizz', 'gest', 'amtab', 'amt', 'anm', 'eav', 'tper', 'tmb', 'actv', 'avm', 'amts', 'amap', 'ratp', 'arriva', 'autolinee toscane', 'busitalia', 'asp', 'ctm', 'brec', 'brescia trasporti', 'triestetrasporti', 'tua', 'sasa', 'stp', 'atb', 'teb', 'amat', 'atv', 'fce', 'circumetnea', 'brescia mobilita', 'trieste trasporti', 'ita', 'alha', 'dnata', 'sea', 'techno sky', 'adr', 'airport handling'];
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const unionKey = (s: string) => normalize(s).replace(/\bal[\s-]*cobas\b/g, 'alcobas').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const matchingUnion = (raw: string, other: string) => {
  const canon=unionKey(raw).replace(/\builtransporti\b|\built\b/g,'uil').replace(/\busb lavoro privato\b/g,'usb').replace(/\bconfial trasporti\b/g,'confial').replace(/\bosr\s+/g,'');
  const text=` ${unionKey(other).replace(/\builtransporti\b|\built\b/g,'uil').replace(/\bconfial trasporti\b/g,'confial').replace(/\busb lavoro privato\b/g,'usb')} `;
  const names=canon.match(/\balcobas\b|\bcobas\b|\bconfial\b|\busb\b|\bcub\b|\bcgil\b|\bcisl\b|\buil\b|\bugl\b|\bfaisa\b|\bfast\b|\borsa\b|\bsul\b/g);
  return names?.length ? names.every(n=>text.includes(` ${n} `)) : Boolean(canon) && text.includes(` ${canon} `);
};
const sameUnionContext = (a:string,b:string) => a===b || matchingUnion(a,b) && matchingUnion(b,a);
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
  guarantee_evidence_windows?: EvidenceWindow[];
  cities?: string[];
  field_text?: string;
  guarantee_clauses?: string[];
  section_heading?: string;
}

export function allowedSourceUrl(input: string) {
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && HOSTS.has(u.hostname);
  } catch { return false; }
}

async function fetchHtml(input: string, deadline: number): Promise<string> {
  if(new URL(input).hostname==='www.toscana-aeroporti.com' && /^\/it\/news\//.test(new URL(input).pathname))return fetchToscanaNotice(input,deadline);
  let url = input;
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!allowedSourceUrl(url)) throw new Error('Source URL is outside approved hosts');
    const remaining = deadline - Date.now();
    if (remaining < 100) throw new Error('External discovery budget exhausted');
    const signal=AbortSignal.timeout(Math.min(10_000,remaining));
    let response = ['cgsse.it','www.cgsse.it'].includes(new URL(url).hostname)?await fetchCgsse(url,signal):await fetch(url, { cache: 'no-store', redirect: 'manual', signal, headers: { 'User-Agent': SOURCE_USER_AGENT, 'Accept':'text/html,application/xhtml+xml,application/pdf' } });
    // A single compatibility check with the real Node runtime's default
    // identity; never impersonate a browser/crawler or follow a CAPTCHA host.
    if(response.status===403 && ['www.bresciamobilita.it','www.veneziaairport.it'].includes(new URL(url).hostname)) {
      await response.body?.cancel();
      response=await fetch(url,{cache:'no-store',redirect:'manual',signal,headers:{Accept:'text/html,application/xhtml+xml,application/pdf'}});
    }
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

const ENGLISH_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function visiblePublicationDate(text:string) {
  const months=MONTHS.map(m=>m.slice(0,3)).join('|');
  const value=normalize(text);
  const first=new RegExp(`\\b(${months})\\w*\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`).exec(value);
  const last=new RegExp(`\\b(\\d{1,2})\\s+(${months})\\w*,?\\s+(20\\d{2})\\b`).exec(value);
  if(!first&&!last)return undefined;
  const month=MONTHS.findIndex(m=>m.startsWith(first?first[1]:last![2]))+1;
  const day=Number(first?first[2]:last![1]),year=Number(first?first[3]:last![3]);
  const iso=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const parsed=new Date(iso+'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===iso?iso:undefined;
}
function exactDate(text: string, date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new RegExp(`\\b0?${day}\\s*[/.-]\\s*0?${month}\\s*[/.-]\\s*${year}\\b|\\b${day}\\s+(?:${MONTHS[month - 1]}|${ENGLISH_MONTHS[month - 1]})\\s+${year}\\b|\\b${ENGLISH_MONTHS[month - 1]}\\s+${day},?\\s+${year}\\b`, 'i').test(text);
}
function sourceFor(url: string, text: string, checkedAt: string): TimingSource {
  const host = new URL(url).hostname;
  return { url, name: host === 'sciopero.net' ? 'Sciopero.net' : host === 'www.virgilio.it' ? 'Virgilio' : host, authority: OFFICIAL_HOSTS.has(host) ? 'official' : 'reported', checked_at: checkedAt, excerpt: text.slice(0, 800), content_hash: digest(text) };
}

// Structured detail pages carry date, union, transport mode and territorial scope.
export function parseExternalNotices(html: string, url: string, dates: string[], checkedAt = new Date().toISOString(), fromCurrentOfficialIndex = false): ExternalNotice[] {
  const cards=easyJetNoticeDocuments(html,url);
  if(cards)return cards.flatMap(card=>parseExternalNotices(card,url,dates,checkedAt));
  const $ = cheerio.load(html);
  const published = $('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime') || html.match(/"datePublished"\s*:\s*"([^"]+)/)?.[1] || visiblePublicationDate($('.published').first().text());
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
  // Index pages contain several unrelated announcements. Follow their dated
  // links, never treat the entire list as one operator-wide strike notice.
  if (!output.length && [...CITY_STRIKE_SOURCES,...SUPPLEMENTAL_OPERATOR_SOURCES,...AVIATION_STRIKE_SOURCES,...NATIONAL_STRIKE_SOURCES].some(s=>s.urls.includes(url)) && !$('article[data-public-operator-card]').length) return [];
  // Article dates may be in the body, or omit the year in a title. A
  // publication date anchors yearless dates and rejects old recurring notices.
  const title = $('h1,h2').filter((_,el)=>/scioper|\bstrike\b|industrial action/i.test($(el).text())).first().text() || $('h1').first().text();
  const content=$('.entry-content,.et_pb_post_content').first();
  const body = $('article').first().length ? $('article').first() : content.length ? content : $('main').first().length ? $('main').first() : $('body');
  // HTML block boundaries often contain no literal whitespace. Preserve word
  // boundaries so "2030</h1><p>USB" does not become the unknown union "2030USB".
  body.find('h1,h2,h3,p,li,div,td,br').append(' ');
  const text = body.text().replace(/\s+/g, ' ').trim();
  const knownCities = sourceCities(url);
  const official = OFFICIAL_HOSTS.has(new URL(url).hostname);
  const operatorContext = official ? sourceOperatorNames(url) : '';
  const eventDates = dates.filter(d => {
    if (exactDate(title, d) || exactDate(text.slice(0,2500), d)) return true;
    if (!/scioper|\bstrike\b|industrial action/i.test(title)) return false;
    if (!published && fromCurrentOfficialIndex && official) {
      const event=Date.parse(d),stamp=Date.parse(checkedAt);
      const yearless=new RegExp(`\\b${Number(d.slice(8))}\\s+(?:${MONTHS[Number(d.slice(5,7))-1]}|${ENGLISH_MONTHS[Number(d.slice(5,7))-1]})(?!\\s+20\\d{2})`,'i').test(title);
      const weekdays=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
      const weekday=weekdays.findIndex(w=>normalize(title).includes(w));
      return yearless && event>=stamp-86400000 && event<=stamp+90*86400000 && weekday>=0 && new Date(d).getUTCDay()===weekday;
    }
    if(!published) return false;
    const [year,month,day]=d.split('-').map(Number);
    const stamp=Date.parse(published), event=Date.parse(d);
    return Number.isFinite(stamp) && event >= stamp-7*86400000 && event <= stamp+90*86400000 && new RegExp(`\\b${day}\\s+(?:${MONTHS[month-1]}|${ENGLISH_MONTHS[month-1]})(?!\\s+20\\d{2})`, 'i').test(title) && year >= new Date(stamp).getUTCFullYear();
  });
  if (!output.length && eventDates.length && /scioper|\bstrike\b|industrial action/i.test(title + ' ' + text.slice(0,1500)) && !/\brevocat|\bdifferit|\bsospes|annullat|(?:strike|industrial action)[^.]{0,60}\b(?:cancelled|postponed|withdrawn)\b/i.test(text)) {
    const names = /\b(?:alcobas|al[ -]cobas|confial|usb|cub|cobas|cgil|cisl|uiltransporti|uilt|uil|ugl|faisa|fast|orsa|sul)\b/i;
    const parts: {text:string;heading:string;unions:string;dates:string[]}[]=[];
    let heading=title, unionContext=names.test(title)?title:'', dateContext=eventDates;
    let sectionCities=knownCities;
    const cityByHeading=new Map<string,string[]>();

    body.find('h2,h3,p,li,pre').each((_,el)=>{
      if (/^h[23]$/.test(el.tagName)) {
        heading=$(el).text();
        if(/linee|funicolare|aeroport|rete|servizio.*(?:a|di|per) /i.test(heading)) sectionCities=classifyRegionTags({providerText:heading,sectorText:sourceCategory(url)});
        cityByHeading.set(heading,sectionCities);
        if(names.test(heading)) unionContext=heading;
        const scopedDates=dates.filter(d=>exactDate(heading,d));if(scopedDates.length)dateContext=scopedDates;
        if (/garant|fasce|guaranteed|protected/i.test(heading) && /\d{1,2}[.:]\d{2}/.test(heading)) parts.push({text:heading,heading,unions:unionContext,dates:dateContext});
        return;
      }
      const t=$(el).text().replace(/\s+/g,' ').trim();
      if(t) {
        if(names.test(t)) unionContext=t;
        const scopedDates=dates.filter(d=>exactDate(t,d));if(scopedDates.length)dateContext=scopedDates;
        parts.push({text:t,heading,unions:unionContext,dates:dateContext});
      }
    });
    if (!parts.length) parts.push({text,heading:title,unions:text,dates:eventDates});
    // Source union abbreviations are allowed for official operator notices;
    // date + operator-wide announcements without named unions cover that day.
    const namedUnion=names.test(text);
    const hasParts = /garant|fasce|guaranteed|protected/i.test(text);
    for (const date of eventDates) for (const part of parts) {
      if(!part.dates.includes(date)) continue;
      const candidate=part.text;
      if (!/\d{1,2}[.:]\d{2}|dalle?\s+\d|inizio\s+(?:del\s+)?servizio/i.test(candidate)) continue;
      const guarantee = /garant|fasce di garanzia|guaranteed|protected/i.test(part.heading + ' ' + candidate) && !/non\s+(?:(?:saranno|essere)\s+)?garant|not guaranteed/i.test(candidate);
      // A lone 24-hour duration without an actual interruption clause is not
      // operational timing, and generic guarantee pages cannot supply dates.
      if (guarantee || /ultimi scioperi|precedent[ei] scioperi/i.test(candidate)) continue;
      if (!official && !/scioper|interromp|stop|sospens|orari/i.test(part.heading+' '+candidate)) continue;
      const mentioned = (value:string) => {
        const specific=knownCities.filter(tag=>hasWord(value,resolveCity(tag)!.slug));
        return specific.length ? specific : knownCities.filter(tag=>hasWord(value,resolveCity(tag)!.region));
      };
      const cities = cityByHeading.has(part.heading) ? cityByHeading.get(part.heading)! : mentioned(part.heading+' '+candidate).length ? mentioned(part.heading+' '+candidate) : mentioned(title).length ? mentioned(title) : knownCities;
      const territory = [title,...cities.map(c=>resolveCity(c)?.slug || c)].join(' ');
      output.push({ date, provider: title+' '+operatorContext+' '+text.slice(0,1000), territory, cities, unions:part.unions || text, sector:sourceCategory(url) || title, field_text:parts.filter(p=>p.heading===part.heading && p.unions===part.unions && p.dates.includes(date)).map(p=>p.text).join(' '), section_heading:part.heading, timing:candidate, status:'', operator_day:official && !namedUnion, source:sourceFor(url,candidate,checkedAt) });
    }
    // Official scope-only clauses are useful even before operational hours
    // are published. Keep the same date/union/heading fences as timing facts.
    if(official) for(const part of parts) for(const date of part.dates) {
      if(!eventDates.includes(date) || /ultimi scioperi|precedent[ei] scioperi|motivazioni|motivi dello sciopero/i.test(part.heading+' '+part.text))continue;
      const fieldText=parts.filter(p=>p.heading===part.heading && sameUnionContext(p.unions,part.unions) && p.dates.includes(date)).map(p=>p.text).join(' ');
      if(!/\bline[ae]\b|intera\s+rete|servizi di linea/i.test(fieldText))continue;
      const cities=cityByHeading.get(part.heading) || knownCities;
      const operators=[...new Set(cities.flatMap(c=>officialOperatorIds(url,c)))];
      if(parseLineScope(fieldText,operators,true).kind==='UNKNOWN')continue;
      if(output.some(n=>n.date===date && n.section_heading===part.heading && sameUnionContext(n.unions,part.unions)))continue;
      output.push({date,provider:title+' '+operatorContext+' '+text.slice(0,1000),territory:[title,...cities.map(c=>resolveCity(c)?.slug)].join(' '),cities,unions:part.unions || text,sector:sourceCategory(url)||title,field_text:fieldText,section_heading:part.heading,timing:'',status:'',operator_day:!namedUnion,source:sourceFor(url,fieldText,checkedAt)});
    }
    // Guarantees belong to the same dated union/mode section, never the
    // whole page. A dated notice with only guarantees can still verify fields.
    if(hasParts) {
      const isGuarantee=(p:typeof parts[number])=>/garant|fasce di garanzia|guaranteed|protected/i.test(p.heading+' '+p.text) && !/non\s+(?:(?:saranno|essere)\s+)?garant|not guaranteed/i.test(p.text);
      if(official && !output.length) for(const part of parts.filter(isGuarantee)) for(const date of part.dates) {
        if(!parseStrikeTiming(part.text).windows.length) continue;
        output.push({date,provider:title+' '+operatorContext+' '+text.slice(0,1000),territory:[title,...knownCities.map(c=>resolveCity(c)?.slug)].join(' '),cities:knownCities,unions:part.unions || text,sector:sourceCategory(url)||title,field_text:parts.filter(p=>p.heading===part.heading && sameUnionContext(p.unions,part.unions) && p.dates.includes(date)).map(p=>p.text).join(' '),section_heading:part.heading,timing:'',status:'',operator_day:!namedUnion,source:sourceFor(url,part.text,checkedAt)});
      }
      for(const notice of output) {
        const clauses=parts.filter(p=>isGuarantee(p) && (p.heading===notice.section_heading || /garan|fasce/i.test(p.heading)) && p.dates.includes(notice.date) && (!namedUnion || sameUnionContext(p.unions,notice.unions)));
        if(clauses.length) {
          notice.guarantee_clauses=clauses.map(p=>p.heading+' '+p.text);
          notice.guarantee_windows=clauses.flatMap(p=>parseStrikeTiming(p.text).windows);
        }
      }
    }
  }

  return output;
}

function recordOperators(record: StrikeRecord) {
  return OPERATORS.filter(op => hasWord(record.raw_payload?.provider || record.provider, op));
}
export function matchesNotice(notice: ExternalNotice, record: StrikeRecord) {
  if (notice.date !== record.date || record.status === 'CANCELLED' || /revocat|differit|sospes/i.test(notice.status)) return false;
  if(new URL(notice.source.url).hostname==='romamobilita.it' && !/\batac\b/i.test(notice.field_text || notice.provider))return false;
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
  if (!city && record.region !== 'NATIONAL') {
    // Unsupported is not unknown: require an exact registered operator and its
    // own publisher. Generic UNKNOWN rows can never borrow another city notice.
    const ids=identifyOperatorIds(record);
    if(record.timing_evidence?.fields?.locationStatus!=='UNSUPPORTED_CITY' || !ids.length || !officialOperatorIds(notice.source.url,'UNKNOWN').some(id=>ids.includes(id)))return false;
    const geography=[record.raw_payload?.province || '',...(ids.includes('START_ROMAGNA')?['forli','cesena','ravenna','rimini'].filter(place=>hasWord(record.raw_payload?.provider || '',place)):[])].join(' ');
    const places=normalize(geography).split(/[^a-z]+/).filter(p=>p.length>3&&!['tutte','provincia'].includes(p));
    if(!places.length || !places.every(place=>hasWord(territory,place)) && !/nazionale|national|intera rete|tutte le linee/.test(territory))return false;
  }
  if (record.region === 'NATIONAL' && !/nazionale|nazional[ei]|national|italy|italia/.test(territory)) return false;
  const operators = recordOperators(record);
  const generic = /sciopero generale|settori pubblici|categorie pubbliche|tutte.*aziend|plurisettorial/i.test(record.raw_payload?.provider || '');
  const officialCity = notice.source.authority === 'official' && sourceCities(notice.source.url).includes(record.region);
  const ignored = new Set(['personale','soc','socc','societa','gruppo','trasporto','trasporti','pubblico','locale','settore','del','della','delle','degli','dello','dei','per','con','tutti','tutte','italia','spa','srl','aeroporto','aeroporti','azienda','aziende','esercizio','viaggiante', ...CITIES.flatMap(c=>[c.slug,c.region])]);
  const identifiers = normalize(record.raw_payload?.provider || '').split(/[^a-z0-9]+/).filter(t=>t.length>2&&!ignored.has(t));
  const companyMatch = operators.length ? operators.some(op=>hasWord(notice.provider+' '+notice.timing,op)) : identifiers.length && identifiers.every(t=>hasWord(notice.provider,t));
  if (!companyMatch && !(generic && officialCity && ['BUS','SUBWAY'].includes(record.category))) return false;
  const sector = normalize(notice.sector);
  if (record.category === 'TRAIN' && !/ferroviar|tren|rfi|italo/.test(sector + ' ' + notice.provider.toLowerCase()) && !(recordOperators(record).includes('eav') && eavDepartmentModes(notice.provider+' '+(notice.field_text||'')).includes('TRAIN'))) return false;
  if (record.category === 'AIRPORT' && !/aereo|aeroport|enav|air|ryanair|easyjet|wizz/.test(sector + ' ' + notice.provider.toLowerCase())) return false;
  if (['BUS', 'SUBWAY'].includes(record.category) && /trasporto (?:aereo|ferroviario)/.test(sector)) return false;
  return true;
}

export function parseExternalWindows(text: string, record: StrikeRecord): EvidenceWindow[] {
  let scoped = scopeTiming(normalize(text).replace(/\bfrom\s+/g,'dalle ').replace(/\bto\s+(?=\d{1,2}[.:]\d{2})/g,'alle ').replace(/not guaranteed/g,'disruptions').replace(/[–—]/g, '-').replace(/\b(\d{1,2}),(\d{2})\b/g,'$1:$2'), record.category);
  scoped=scoped.replace(/non\s+(?:(?:saranno|essere)\s+)?garantit[ioea]/g,'disruptions').replace(/sino\s+a|fino\s+a/g,'a');
  scoped=scoped.replace(/dopo\s+le\s+(\d{1,2})(?:[.:](\d{2}))?\s*,?\s*(?:a|al|alle?|fino al)\s+termine\s+(?:del\s+)?servizio/g,(_,h,m)=>`dalle ${h}:${m || '00'} a termine servizio`);
  if (/garanti|fasce di garanzia|guaranteed|protected|ultimi scioperi|ipotizz|presum/i.test(scoped)) return [];
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
  const fields=record.timing_evidence?.fields || (record.raw_payload ? makeScopeEvidence({...record.raw_payload,note:record.raw_payload.note || ''},record.region,record.category,record.strike_windows,record.guarantee_windows) : undefined);
  const result: StrikeRecord = { ...record, timing_evidence:{windows:record.strike_windows.map(w=>({...w,end_kind:'clock' as const})),confidence:'official',sources:[],unions:record.raw_payload?.unions || '',conflicts:[],fields} };
  const matched=notices.filter(n=>matchesNotice(n,record));
  // Event-specific guarantees and lines must be considered even when MIT's
  // exact clock range is already known. Retain all field sources for tracing.
  const official=matched.filter(n=>n.source.authority==='official').map(n=>{
    if(!n.guarantee_clauses) return n;
    const city=resolveCity(record.region);
    const clauses=n.guarantee_clauses.filter(text=>!city || !CITIES.some(c=>c.tag!==city.tag && hasWord(text,c.slug)) || hasWord(text,city.slug));
    const symbolic=mergeEvidenceWindows(clauses.flatMap(text=>parseExternalWindows(text.replace(/garant\w*|fasce di garanzia/gi,'service').replace(/(\d{1,2}[.:]\d{2})\s*\/\s*(\d{1,2}[.:]\d{2})/g,'$1-$2'),record)));
    return {...n,guarantee_windows:numericWindows(symbolic),guarantee_evidence_windows:symbolic};
  });
  if(fields && official.length) {
    const locationNotice=official.find(n=>n.cities?.includes(record.region) || sourceCities(n.source.url).includes(record.region));
    if(locationNotice) result.timing_evidence!.fields={...fields,location:sourceFact(record.region,{...locationNotice.source,excerpt:locationNotice.territory+' '+(locationNotice.field_text || locationNotice.provider).slice(0,500)})};
    const baseFields=result.timing_evidence!.fields!;
    const guarantees=official.filter(n=>n.guarantee_windows?.length || n.guarantee_evidence_windows?.length);
    const guaranteeKeys=new Set(guarantees.map(n=>JSON.stringify(n.guarantee_evidence_windows || n.guarantee_windows?.map(w=>({...w,end_kind:'clock'})))));
    if(guaranteeKeys.size===1) {
      result.guarantee_windows=guarantees[0].guarantee_windows || [];
      const guaranteeSource={...guarantees[0].source,excerpt:guarantees[0].guarantee_clauses?.join(' ').slice(0,800) || JSON.stringify(result.guarantee_windows)};
      result.timing_evidence!.fields={...baseFields,guaranteeSource:'OFFICIAL_STRIKE_NOTICE',guaranteedServiceWindow:sourceFact(result.guarantee_windows,guaranteeSource),guaranteeEvidenceWindows:sourceFact(guarantees[0].guarantee_evidence_windows || result.guarantee_windows.map(w=>({...w,end_kind:'clock' as const})),guaranteeSource)};
    } else if(guaranteeKeys.size>1) {
      result.guarantee_windows=[];
      result.timing_evidence!.fields={...baseFields,guaranteeSource:'UNKNOWN',guaranteedServiceWindow:{value:[],confidence:'CONFLICT',source:'UNKNOWN'}};
    }
    const lineFacts=official.map(n=>officialLineScope(record,n.field_text || n.timing,n.source)).filter(f=>f.value.kind!=='UNKNOWN');
    if(record.category!=='AIRPORT' && lineFacts.length) {
      const keys=new Set(lineFacts.map(f=>JSON.stringify([f.value.kind,f.value.operatorIds,f.value.networkNames,f.value.affectedLineNames,f.value.excludedLineNames])));
      const chosen=lineFacts[0];
      result.timing_evidence!.fields={...result.timing_evidence!.fields!,lineScope:keys.size===1?chosen:{...chosen,confidence:'CONFLICT'}};
      if(keys.size===1 && chosen.value.kind==='SPECIFIC_LINES') {
        result.affected_lines=chosen.value.affectedLineNames;
        result.timing_evidence!.fields!.affectedLines={...chosen,value:chosen.value.affectedLineNames};
      }
    }
    const named=official.map(n=>({notice:n,lines:extractLineScope(lineTextForMode(n.field_text || n.timing,record.category))})).filter(n=>n.lines!=='UNKNOWN');
    if(!lineFacts.length && named.length && new Set(named.map(n=>JSON.stringify(n.lines))).size===1 && record.category!=='AIRPORT') {
      result.affected_lines=named[0].lines==='ALL_LINES'?['全部线路']:named[0].lines as string[];
      result.timing_evidence!.fields={...result.timing_evidence!.fields!,affectedLines:sourceFact(named[0].lines,{...named[0].notice.source,excerpt:(named[0].notice.field_text || named[0].notice.timing).slice(0,800)})};
    }
  }
  const updatedFields=result.timing_evidence!.fields;
  const verificationSources=[...new Map(matched.map(n=>[n.source.url,n.source])).values()];
  result.timing_evidence!.sources=verificationSources;
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
  // A dated operator notice describes actual service availability; regulator
  // entries describe the proclaimed action. Preserve that distinction when a
  // regulator lists one union's shorter window within a combined operator day.
  // Matching date/operator/geography checks already ran above. Do not vote
  // away disagreements between two operator documents of equal authority.
  const operators = officials.filter(c => Boolean(sourceOperatorNames(c.notice.source.url)));
  const pool = operators.length ? operators : officials.length ? officials : candidates;
  const groups = new Map<string, typeof candidates>();
  pool.forEach(c => { const key = timeKey(c.windows); groups.set(key, [...(groups.get(key) || []), c]); });
  // A conflict at the same authority cannot be resolved by vote or article order.
  const selected = groups.size === 1 ? pool[0] : null;
  const genericFullDay = record.strike_windows.length === 1 && record.strike_windows[0].start === '00:00' && record.strike_windows[0].end === '24:00' && !/\d{1,2}[.:]\d{2}/.test(record.raw_payload?.modalita || '');
  const mitKnown = record.strike_windows.length > 0 && !genericFullDay;
  const primaryWindows: EvidenceWindow[] = record.strike_windows.map(w => ({ ...w, end_kind: 'clock' }));
  if (!selected || !officials.length && mitKnown && timeKey(selected.windows) !== timeKey(primaryWindows)) {
    result.timing_evidence = { fields:updatedFields?{...updatedFields,timing:{...updatedFields.timing,value:primaryWindows,confidence:'CONFLICT'}}:undefined, windows: primaryWindows, confidence: 'conflict', sources: candidates.map(c => c.notice.source), unions: record.raw_payload?.unions || '', conflicts: candidates.map(c => ({ url: c.notice.source.url, windows: c.windows })) };
    return result;
  }
  const aligned = candidates.filter(c => timeKey(c.windows) === timeKey(selected.windows));
  const sources = [...new Map(aligned.map(c => [c.notice.source.url, c.notice.source])).values()];
  // Matching hosts corroborate the transcription; they may share an upstream source.
  const evidence: TimingEvidence = { fields:updatedFields, windows: selected.windows, confidence: officials.length || mitKnown ? 'official' : new Set(sources.map(s => new URL(s.url).hostname)).size > 1 ? 'corroborated' : 'reported', sources:[...new Map([...verificationSources,...sources].map(s=>[s.url,s])).values()], unions: record.raw_payload?.unions || '', conflicts: [...candidates.filter(c => timeKey(c.windows) !== timeKey(selected.windows)).map(c => ({ url: c.notice.source.url, windows: c.windows })), ...(mitKnown && timeKey(primaryWindows)!==timeKey(selected.windows) ? [{url:record.source_url || 'https://scioperi.mit.gov.it/mit2/public/scioperi',windows:primaryWindows}] : [])] };
  result.timing_evidence = evidence;
  if(evidence.fields && (officials.length || !mitKnown)) evidence.fields={...evidence.fields,timing:sourceFact(selected.windows,selected.notice.source)};
  if (mitKnown && !officials.length) return result;
  result.strike_windows = numericWindows(selected.windows);
  result.display_time = selected.windows.map(w => evidenceTimeLabel(w)).join(', ');
  result.duration_hours = selected.windows.some(w => w.start === null || w.end_kind === 'end_of_service') ? '分时段（按运营时间）' : timingFromWindows(result.strike_windows).hours;
  // Keep provenance from the independent guarantee extraction above.
  // 'Uncertain' timing is separate from MIT's confirmation that a strike exists.
  result.status = record.raw_payload?.sourceStatus && /revocat|differit|sospes/i.test(record.raw_payload.sourceStatus) ? 'CANCELLED' : 'CONFIRMED';
  return result;
}

export async function enrichStrikeTiming(records: StrikeRecord[], warnings: string[], now = new Date(),deadline = Date.now() + 160_000, priorRecords:Pick<StrikeRecord,'source_key'|'date'|'region'|'category'|'timing_evidence'>[] = []) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
  const horizon = new Date(now.getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const targets = records.filter(r => r.status !== 'CANCELLED' && r.date >= today && r.date <= horizon && r.raw_payload);
  const output = records.map(r => ({...r,timing_evidence:r.timing_evidence?{...r.timing_evidence,fields:r.timing_evidence.fields?{...r.timing_evidence.fields}:undefined}:undefined} as StrikeRecord));
  if (!targets.length) return { records: output, enriched: 0, sourcesChecked: 0, conflicts: 0 };
  const dates = [...new Set(targets.map(r => r.date))].sort();
  const documents = new Map<string, string>();
  const failed = new Set<string>();
  let sourcesChecked = 0;
  const attemptHistory=new Map<string,DiscoveryAttempt>();
  for(const old of priorRecords) {
    const discovery=old.timing_evidence?.fields?.noticeDiscovery;
    for(const source of discovery?.sources || []) {
      const attempt={firstDiscoveredAt:source.firstDiscoveredAt || discovery!.checkedAt,lastAttemptedAt:source.lastAttemptedAt || (source.status==='DEFERRED'?undefined:discovery!.checkedAt)};
      const previous=attemptHistory.get(source.url);
      if(!previous || (attempt.lastAttemptedAt || '')>(previous.lastAttemptedAt || ''))attemptHistory.set(source.url,attempt);
    }
  }
  // Bound parallelism, redirects, bytes, time and total documents in the function.
  const discoveryStart=Date.now(),discoveryBudget=Math.max(0,deadline-discoveryStart);
  const phaseDeadline=(fraction:number)=>discoveryStart+Math.floor(discoveryBudget*fraction);
  async function collect(urls: string[],attemptLimit=180,until=deadline) {
    const attemptEnd=Math.min(180,sourcesChecked+attemptLimit);
    const unique = orderDiscoveryUrls(urls,now,attemptHistory).filter(u => !documents.has(u) && !failed.has(u));
    for (let offset = 0; offset < unique.length; offset += 6) {
      if (Date.now() >= until || sourcesChecked >= attemptEnd) { warnings.push('External discovery budget reached; some sources deferred'); break; }
      await Promise.all(unique.slice(offset, offset + Math.min(6, attemptEnd - sourcesChecked)).map(async url => {
        sourcesChecked++;
        try { documents.set(url, await fetchHtml(url, until)); }
        catch (error) { failed.add(url); warnings.push(`Supplement unavailable: ${new URL(url).hostname}${new URL(url).pathname}: ${error instanceof Error ? error.message + ('cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? ` (${error.cause.code})` : '') : 'fetch failed'}`); }
      }));
    }
  }
  const search = [...new Set([...targets].sort((a,b)=>Number(Boolean(a.strike_windows.length))-Number(Boolean(b.strike_windows.length)) || a.date.localeCompare(b.date)).map(r=>`https://sciopero.net/settore/${SECTORS[r.category]}/?data=${r.date}`))];
  assertCitySourceCoverage();
  const operatorIndexes = [
    ...targets.flatMap(noticeRootsForRecord),
    ...CITY_STRIKE_SOURCES.filter(o=>targets.some(r=>(r.region === 'NATIONAL' || o.cities.includes(r.region)) && (['BUS','SUBWAY'].includes(r.category) || r.category==='TRAIN' && recordOperators(r).some(op=>o.aliases.includes(op))))).flatMap(o=>o.urls),
    ...AVIATION_STRIKE_SOURCES.filter(o=>targets.some(r=>r.category==='AIRPORT' && (o.cities.includes(r.region) || recordOperators(r).some(op=>o.aliases.includes(op))))).flatMap(o=>o.urls),
    ...NATIONAL_STRIKE_SOURCES.filter(o=>targets.some(r=>recordOperators(r).some(op=>o.aliases.includes(op)) || r.region === 'NATIONAL' && (r.category === 'TRAIN' || r.category === 'AIRPORT'))).flatMap(o=>o.urls),
  ];
  // Once an article is known, keep rereading it after it leaves the news index.
  // Only URLs are reused: facts must be extracted again and pass current matching.
  const knownNotices=priorRecords.filter(old=>targets.some(r=>r.source_key===old.source_key&&r.date===old.date&&r.category===old.category)).flatMap(old=>old.timing_evidence?.sources.filter(source=>source.authority==='official'&&source.url!== 'https://scioperi.mit.gov.it/mit2/public/scioperi'&&allowedSourceUrl(source.url)).map(source=>source.url)||[]);
  await collect(knownNotices,25,phaseDeadline(0.20));
  await collect(operatorIndexes,45,phaseDeadline(0.45));
  await collect([...MEDIA_INDEXES, ...search],25,phaseDeadline(0.60));
  const articles: string[] = [];
  const linkedByOfficialIndex=new Set<string>();
  const discoveryLinks:{root:string;url:string;dates:string[]}[]=[];
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
        if (candidate && /scioper|\bstrike\b|industrial action/i.test($(a).text() + ' ' + href) && (OFFICIAL_HOSTS.has(new URL(url).hostname) || dates.some(d => exactDate($(a).text(), d) || exactDate(href.replace(/-/g, ' '), d)) || /scioperi-settimana|scioperi-.*calendario/.test(candidate)) && candidate !== url && !/garantiti-incasodisciopero|in-caso-di-sciopero|tag\/|economia\/scioperi/.test(candidate)) { articles.push(candidate); if(operatorIndexes.includes(url) && OFFICIAL_HOSTS.has(new URL(url).hostname)) {linkedByOfficialIndex.add(candidate);discoveryLinks.push({root:url,url:candidate,dates:dates.filter(d=>exactDate($(a).text(),d)||exactDate(href.replace(/-/g,' '),d))});} }
      });
    }
  }
  const datedArticles=articles.filter(url=>discoveryLinks.some(link=>link.url===url&&link.dates.length) || new URL(url).hostname==='sciopero.net');
  await collect(datedArticles,35,phaseDeadline(0.80));
  await collect(articles.filter(url=>!datedArticles.includes(url)),10,phaseDeadline(0.85));
  // Extract links from discovered date-index pagination too.
  const pageDetails: string[] = [];
  for (const [url, html] of documents) {
    if (!new URL(url).searchParams.has('page')) continue;
    const $ = cheerio.load(html);
    $('.strike-item').each((_, item) => { const href = $(item).find('a[href]').attr('href'); if (href && dates.some(d => exactDate($(item).text(), d))) { const u = new URL(href, url).href; if (allowedSourceUrl(u)) pageDetails.push(u); } });
  }
  await collect(pageDetails,10,phaseDeadline(0.90));
  const attachments: string[]=[];
  for (const [url,html] of documents) {
    if (!OFFICIAL_HOSTS.has(new URL(url).hostname) || !/scioper|\bstrike\b|industrial action/i.test(cheerio.load(html)('h1,h2').text())) continue;
    const $=cheerio.load(html);
    const eventPage=dates.some(d=>exactDate($('h1,h2').text()+' '+$('article,main').first().text().slice(0,2000),d));
    $('a[href]').each((_,a)=>{
      const href=$(a).attr('href') || '',u=linkUrl(href,url);
      const datedLink=dates.some(d=>exactDate(($(a).text()+' '+href).replace(/-/g,' '),d));
      if(u && /\.pdf(?:$|\?)/i.test(u) && (eventPage || datedLink)) attachments.push(u);
    });
  }
  await collect(attachments,10,phaseDeadline(0.95));
  function parsedDocuments() {
    const parsed:ExternalNotice[]=[];
    for(const [url,html] of documents) {
      try { parsed.push(...parseExternalNotices(html,url,dates,now.toISOString(),linkedByOfficialIndex.has(url))); }
      catch { failed.add(url);documents.delete(url);warnings.push('Supplement content could not be verified: '+new URL(url).hostname+new URL(url).pathname); }
    }
    return parsed;
  }
  let notices = parsedDocuments();
  // Prefer the primary regulator details whenever reachable; do not bypass TLS.
  await collect(notices.filter(n => targets.some(r => matchesNotice(n, r))).map(n => n.official_url).filter((u): u is string => Boolean(u)),20);
  notices = parsedDocuments();
  const cityVariants: StrikeRecord[]=[];
  for (const record of targets.filter(r=>r.region==='NATIONAL' && ['BUS','SUBWAY'].includes(r.category))) {
    for (const city of CITIES) {
      const scoped=notices.filter(n=>n.source.authority==='official' && sourceCities(n.source.url).includes(city.tag));
      const general=/sciopero generale|categorie pubbliche|plurisettorial/i.test(record.raw_payload?.provider || '');
      const categories = record.category === 'BUS' && general && METRO_CITY_TAGS.has(city.tag) ? ['BUS','SUBWAY'] as const : [record.category];
      for (const category of categories) {
        const variant={...record,region:city.tag,category};
        const enriched=applyTimingEvidence(variant,scoped);
        if ((enriched.timing_evidence?.windows.length && enriched.timing_evidence.confidence !== 'conflict') || enriched.timing_evidence?.fields?.lineScope?.confidence==='HIGH' && enriched.timing_evidence.fields.lineScope.value.kind!=='UNKNOWN') {
          enriched.provider=[...new Set(CITY_STRIKE_SOURCES.filter(s=>s.cities.includes(city.tag) && enriched.timing_evidence!.sources.some(e=>s.urls.some(root=>new URL(root).hostname===new URL(e.url).hostname))).map(s=>s.name))].join(' / ') || enriched.provider;
          cityVariants.push(enriched);
        }
      }
    }
  }
  const enrichedRecords = output.map(r => targets.some(t => t.source_key === r.source_key && t.date === r.date && t.category === r.category && t.region === r.region) ? applyTimingEvidence(r, notices) : r);
  for (const r of [...enrichedRecords,...cityVariants]) {
    if(!targets.some(t=>t.source_key===r.source_key&&t.date===r.date) || !r.timing_evidence?.fields)continue;
    const roots=noticeRootsForRecord(r);
    const discoveryUrls=[...new Set([...roots,...priorRecords.filter(old=>old.source_key===r.source_key&&old.date===r.date&&old.category===r.category).flatMap(old=>old.timing_evidence?.sources.filter(s=>s.authority==='official'&&s.url!==r.source_url&&allowedSourceUrl(s.url)).map(s=>s.url)||[]),...discoveryLinks.filter(link=>roots.includes(link.root) && (!link.dates.length || link.dates.includes(r.date))).map(link=>link.url)])];
    const sources=discoveryUrls.map(url=>({url,status:documents.has(url)?'FETCHED' as const:failed.has(url)?'FAILED' as const:'DEFERRED' as const,firstDiscoveredAt:attemptHistory.get(url)?.firstDiscoveredAt || now.toISOString(),...((documents.has(url)||failed.has(url))?{lastAttemptedAt:now.toISOString()}:attemptHistory.get(url)?.lastAttemptedAt?{lastAttemptedAt:attemptHistory.get(url)!.lastAttemptedAt}:{})}));
    const matched=r.timing_evidence.sources.some(source=>source.authority==='official'&&roots.some(root=>new URL(root).hostname===new URL(source.url).hostname));
    const status=matched?'MATCHED':!sources.length?'NOT_CHECKED':sources.every(s=>s.status==='FAILED')?'UNAVAILABLE':sources.some(s=>s.status!=='FETCHED')?'PARTIAL':'NO_MATCH';
    r.timing_evidence.fields.noticeDiscovery={checkedAt:now.toISOString(),status,sources};
  }
  let enriched = 0, conflicts = 0;
  const verification={operatorOfficial:0,reported:0,mitOnly:0,acquisition:{cgsseDocuments:[...documents.keys()].filter(u=>['cgsse.it','www.cgsse.it'].includes(new URL(u).hostname)).length,toscanaApiDocuments:[...documents.keys()].filter(u=>new URL(u).hostname==='www.toscana-aeroporti.com'&&new URL(u).pathname.startsWith('/it/news/')).length}};
  enrichedRecords.forEach((r, i) => {
    if(r.status!=='CANCELLED' && r.date>=today && r.region!=='UNKNOWN') {
      if(r.timing_evidence?.sources.some(s=>s.authority==='official')) verification.operatorOfficial++;
      else if(r.timing_evidence?.sources.length) verification.reported++;
      else verification.mitOnly++;
    }
    if (r.timing_evidence?.conflicts.length) { conflicts++; warnings.push(`Timing conflict requires review: ${r.date} ${r.region} ${r.category} ${r.raw_payload?.unions}`); }
    if (!records[i].strike_windows.length && r.timing_evidence?.windows.length) enriched++;
    if (r.status !== 'CANCELLED' && !r.strike_windows.length && !r.timing_evidence?.windows.length) warnings.push(`Operational timing unresolved: ${r.date} ${r.region} ${r.category} ${r.raw_payload?.provider || r.provider}`);
  });
  return { records: [...enrichedRecords,...cityVariants], enriched:enriched+cityVariants.length, sourcesChecked, conflicts, verification };
}
