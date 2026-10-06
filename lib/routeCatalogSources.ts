import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { GTFS_FEEDS, loadRouteCatalog, transitBytes, type FeedId } from './officialTransitData';
import { FEED_CITIES, FEED_MODES } from './serviceScheduleEnrichment';
import { CITIES } from './cities';
import { operatorAdapters } from './operatorAdapters';
import type { NetworkCatalog, CatalogRoute } from './routeMembership';

const DIRECTORIES:{id:string;operator:string;cities:string[];modes:string[];url:string;parser:string;extraUrls?:string[]}[]=[
  {id:'DIRECTORY_ATB',operator:'ATB_TEB_BERGAMO',cities:['BERGAMO'],modes:['BUS'],url:'https://www.atb.bergamo.it/trasporti-pubblici/linee',parser:'ATB'},
  {id:'DIRECTORY_AIR_CAMPANIA',operator:'AIR_CAMPANIA',cities:['NAPOLI','ROMA'],modes:['BUS'],url:'https://aircampania.it/linee-e-orari/',parser:'AIR'},
  {id:'DIRECTORY_TRENORD',operator:'TRENORD',cities:['MILANO','BERGAMO','BRESCIA','VERONA'],modes:['TRAIN'],url:'https://www.dati.lombardia.it/resource/yqye-t4rp.json?$limit=1000',parser:'TRENORD'},
  {id:'DIRECTORY_TRIESTE',operator:'TRIESTE_TRASPORTI',cities:['TRIESTE'],modes:['BUS'],url:'https://www.triestetrasporti.it/it/trasporto-pubblico/linee-percorsi-orari',parser:'TRIESTE'},
  {id:'DIRECTORY_BRESCIA',operator:'BRESCIA_MOBILITA',cities:['BRESCIA'],modes:['BUS'],url:'https://www.bresciamobilita.it/mappe',parser:'BRESCIA'},
  {id:'DIRECTORY_PALERMO',operator:'AMAT_PALERMO',cities:['PALERMO'],modes:['BUS'],url:'https://www.amat.pa.it/linee_perc_orari/itinerari_orari.php',parser:'PALERMO'},
  {id:'DIRECTORY_VERONA',operator:'ATV_VERONA',cities:['VERONA'],modes:['BUS'],url:'https://www.atv.verona.it/orari-urbani/dettaglio-percorsi-orari-pdf',extraUrls:['https://www.atv.verona.it/urbano-verona-serale','https://www.atv.verona.it/urbano-verona-festivo'],parser:'VERONA'},
];
export const routeCatalogSources=[
  ...Object.entries(GTFS_FEEDS).map(([id,f])=>({id,operator:f.operator,cities:FEED_CITIES[id as FeedId],modes:FEED_MODES[id as FeedId],url:f.url,parser:'GTFS'})),
  ...DIRECTORIES,
];
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
function explicitlyNamedCities(text:string) {
  return CITIES.filter(c=>new RegExp('(?:^|[^a-z])'+c.tag+'(?:$|[^a-z])','i').test(text)).map(c=>c.tag);
}
export function directoryCatalog(id:string,text:string,checkedAt=new Date().toISOString()):NetworkCatalog {
  const source=DIRECTORIES.find(s=>s.id===id);if(!source)throw new Error('Unregistered official route directory');
  const routes:CatalogRoute[]=[];
  if(source.parser==='TRENORD') {
    const rows:Record<string,string>[]=JSON.parse(text);
    if(!Array.isArray(rows)||rows.length>=1000)throw new Error('Incomplete official railway catalogue');
    for(const r of rows) {
      // Dataset is the official Trenord/Malpensa Express publication. Refuse
      // other agencies, unnamed special services and replacement buses.
      if(r.agency_id!=='1'||Number(r.route_type)!==2||!/^S\d+$|^R\d+$|^RE\s?\d+$|^MXP[12]$/i.test(r.route_short_name||''))continue;
      const cities=explicitlyNamedCities(r.route_long_name || '');
      routes.push({id:r.route_id,name:r.route_short_name.replace(/^RE\s+(\d+)$/,'RE$1'),longName:r.route_long_name,type:2,operator:source.operator,cities,source:source.url});
    }
  } else {
    const $=cheerio.load(text);$('nav,header,footer,script,style,aside').remove();
    if(source.parser==='BRESCIA'){
      const sections=$('h4').filter((_,e)=>clean($(e).text())==='Brescia');if(sections.length!==1)throw new Error('Brescia city section not verified');
      sections.nextUntil('h4').find('.bm-route-square').each((_,el)=>{const card=$(el),name=clean(card.find('.line-number').text()),longName=clean(card.find('.bm-title .title').text()),href=card.find('.pdf-container a[href]').attr('href');if(!/^\d+$/.test(name)||!href)return;const url=new URL(href,source.url);if(url.hostname!=='www.bresciamobilita.it'||!url.pathname.endsWith('.pdf'))return;routes.push({id:name,name,longName,type:3,operator:source.operator,cities:['BRESCIA'],source:url.href});});
    }else if(source.parser==='TRIESTE'){
      $('a[href][aria-label]').each((_,el)=>{const url=new URL($(el).attr('href')!,source.url),m=/^\/it\/trasporto-pubblico\/linee-orari\/linea-([0-9a-z]+)(-tram)?$/i.exec(url.pathname);if(url.hostname!=='www.triestetrasporti.it'||!m)return;const name=m[1].toUpperCase();routes.push({id:name,name,longName:clean($(el).parent().find('.name').text()),type:m[2]?0:3,operator:source.operator,cities:['TRIESTE'],source:url.href});});
    }else if(source.parser==='PALERMO'){
      $('select option[value]').each((_,el)=>{const name=clean($(el).attr('value')||'');if(!name||clean($(el).text())!=='Linea '+name)return;routes.push({id:name,name,type:/^TRAM\d+$/.test(name)?0:3,operator:source.operator,cities:['PALERMO'],source:source.url});});
    }else if(source.parser==='VERONA'){
      $('a[href]').each((_,el)=>{const m=/^orari(?:o)? linea ([A-Z0-9]+)(?:\s|$)/i.exec(clean($(el).text()));if(!m)return;const url=new URL($(el).attr('href')!,source.url);if(url.hostname!=='www.atv.verona.it'||!url.pathname.includes('/ServeAttachment.php/'))return;routes.push({id:m[1],name:m[1],type:3,operator:source.operator,cities:['VERONA'],source:url.href});});
    }else if(source.parser==='ATB') {
      $('h3.card-title a[href]').each((_,el)=>{
        const title=clean($(el).text()),url=new URL($(el).attr('href')!,source.url);
        if(url.hostname!=='www.atb.bergamo.it'||url.pathname!=='/trasporti-pubblici/linee/prossime-corse')return;
        const routeId=url.searchParams.get('idroute');if(!routeId)return;
        const match=/^Linea\s+([A-Z0-9]+)(?:\s|$)/i.exec(title),funicular=/^Funicolare /i.test(title);
        if(!match&&!funicular)return;
        routes.push({id:routeId,name:match?match[1]:title,type:funicular?7:match![1]==='T1'?0:3,operator:source.operator,cities:[...source.cities],source:url.href});
      });
    } else {
      // The AIR directory labels each timetable with a line code and itinerary.
      // Preserve endpoint city restrictions; do not assign every Campania line
      // to Napoli just because the employer is mentioned by a Napoli strike.
      $('a[href]').each((_,el)=>{
        const title=clean($(el).text()),m=/^([A-Z0-9]+(?:-[A-Z0-9]+)?)\s*\|\s*(.+)$/i.exec(title);
        if(!m)return;const url=new URL($(el).attr('href')!,source.url);
        if(url.hostname!=='aircampania.it')return;
        routes.push({id:m[1],name:m[1],longName:m[2],type:3,operator:source.operator,cities:explicitlyNamedCities(m[2]),source:url.href});
      });
    }
  }
  const grouped=new Map<string,CatalogRoute>();
  for(const r of routes){const prior=grouped.get(r.id);if(prior){if(prior.type!==r.type||prior.operator!==r.operator||prior.name!==r.name)throw new Error('Conflicting official route identity');prior.cities=[...new Set([...(prior.cities||[]),...(r.cities||[])])];if(r.longName&&prior.longName!==r.longName)prior.longName=[...new Set([prior.longName,r.longName].filter(Boolean))].join(' / ');prior.source=source.url;}else grouped.set(r.id,{...r});}
  const unique=[...grouped.values()];
  if(!unique.length||unique.some(r=>!r.id||!r.name))throw new Error('No verified official routes in directory');
  return {feedId:id,source:source.url,operator:source.operator,cities:[...source.cities],checkedAt,contentHash:createHash('sha256').update(text).digest('hex'),validFrom:null,validTo:null,routes:unique};
}
export async function loadNetworkCatalog(id:string):Promise<NetworkCatalog> {
  const source=routeCatalogSources.find(s=>s.id===id);if(!source)throw new Error('Unregistered route source');
  if(source.parser==='GTFS'){const catalog=await loadRouteCatalog(id as FeedId);return {...catalog,operator:source.operator,cities:source.cities};}
  const deadline=Date.now()+12000;const pages=await Promise.all([source.url,...('extraUrls' in source?source.extraUrls || []:[])].map(async url=>(await transitBytes(url,3_000_000,deadline)).bytes.toString('utf8')));
  return directoryCatalog(id,pages.join('\n'));
}
export function catalogSourceFor(operator:string,city:string) {
  const sources=routeCatalogSources.filter(s=>s.operator===operator&&s.cities.includes(city));
  return sources.length===1?sources[0]:undefined;
}
export function routeCatalogCoverage() {
  return CITIES.map(city=>({city:city.tag,modes:Object.fromEntries(['BUS','SUBWAY','TRAIN','AIRPORT'].map(mode=>[mode,{
    status:mode==='AIRPORT'?'FLIGHT_EVIDENCE_REQUIRED':routeCatalogSources.some(s=>s.cities.includes(city.tag)&&s.modes.includes(mode))?'REGISTERED_SOURCE_REQUIRES_EVENT_VALIDATION':'NO_VERIFIED_CATALOG',
    operators:operatorAdapters.filter(a=>a.cities.includes(city.tag)).map(a=>({operator:a.id,sources:routeCatalogSources.filter(s=>s.operator===a.id&&s.cities.includes(city.tag)&&s.modes.includes(mode)).map(s=>({id:s.id,url:s.url})),noticeSources:a.urls})),
    railSources:mode==='TRAIN'?routeCatalogSources.filter(s=>s.operator==='TRENORD'&&s.cities.includes(city.tag)).map(s=>({id:s.id,url:s.url})):[],
    actualOperationConfirmed:false,
  }]))}));
}
