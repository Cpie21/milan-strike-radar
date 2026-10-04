import { CITIES } from './cities';

// Sources are registered independently of particular dates or strikes. Shared
// operators list every served city, and homonymous ATM operators stay scoped.
export const CITY_STRIKE_SOURCES = [
  { cities:['MILANO'], name:'ATM Milano', aliases:['atm'], urls:['https://www.atm.it/it/AtmNews/AtmInforma/Pagine/default.aspx','https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/default2.aspx'] },
  { cities:['ROMA'], name:'ATAC', aliases:['atac','roma tpl'], urls:['https://www.atac.roma.it/tempo-reale'] },
  { cities:['TORINO'], name:'GTT', aliases:['gtt','arriva torino'], urls:['https://www.gtt.to.it/cms/avvisi-e-informazioni-di-servizio'] },
  { cities:['NAPOLI'], name:'ANM', aliases:['anm'], urls:['https://www.anm.it/'] },
  { cities:['FIRENZE','PISA'], name:'Autolinee Toscane', aliases:['autolinee toscane','ratp'], urls:['https://www.at-bus.it/it/viaggia/avvisi','https://www.at-bus.it/it/scopri/novita'] },
  { cities:['FIRENZE'], name:'GEST', aliases:['gest'], urls:['https://www.gestramvia.it/'] },
  { cities:['BOLOGNA'], name:'TPER', aliases:['tper'], urls:['https://www.tper.it/news'] },
  { cities:['VENEZIA'], name:'ACTV / AVM', aliases:['actv','avm'], urls:['https://actv.avmspa.it/it/news'] },
  { cities:['GENOVA'], name:'AMT Genova', aliases:['amt'], urls:['https://www.amt.genova.it/amt/area-stampa/comunicati-stampa/'] },
  { cities:['PALERMO'], name:'AMAT Palermo', aliases:['amat'], urls:['https://www.amat.pa.it/notizie/'] },
  { cities:['CATANIA'], name:'AMTS Catania', aliases:['amts'], urls:['https://www.amts.ct.it/avvisi-news'] },
  { cities:['CATANIA'], name:'Ferrovia Circumetnea', aliases:['fce','circumetnea'], urls:['https://www.circumetnea.it/'] },
  { cities:['BARI'], name:'AMTAB', aliases:['amtab'], urls:['https://www.amtab.it/it/'] },
  { cities:['VERONA'], name:'ATV Verona', aliases:['atv'], urls:['https://www.atv.verona.it/news-sul-servizio'] },
  { cities:['PADOVA'], name:'Busitalia Veneto', aliases:['busitalia'], urls:['https://www.fsbusitalia.it/it/veneto/news-veneto.html'] },
  { cities:['TRIESTE'], name:'Trieste Trasporti', aliases:['trieste trasporti','triestetrasporti'], urls:['https://www.triestetrasporti.it/it/avvisi-infomobilita'] },
  { cities:['CAGLIARI'], name:'CTM Cagliari', aliases:['ctm'], urls:['https://www.ctmcagliari.it/comunicati/'] },
  { cities:['BERGAMO'], name:'Arriva Bergamo', aliases:['arriva'], urls:['https://bergamo.arriva.it/notice-category/avvisi-di-servizio/'] },
  { cities:['BERGAMO'], name:'ATB / TEB', aliases:['atb','teb'], urls:['https://www.atb.bergamo.it/avvisi'] },
  { cities:['BRESCIA'], name:'Brescia Mobilità', aliases:['brescia mobilita','brescia trasporti','metro brescia'], urls:['https://www.bresciamobilita.it/'] },
  { cities:['MESSINA'], name:'ATM Messina', aliases:['atm'], urls:['https://www.atmmessinaspa.it/comunicati.php?pag=4'] },
  { cities:['PERUGIA'], name:'Busitalia Umbria', aliases:['busitalia'], urls:['https://www.fsbusitalia.it/it/umbria/news-umbria.html'] },
];
export const AVIATION_STRIKE_SOURCES = [
  { cities:['VENEZIA'], name:'Venice Marco Polo', aliases:['sicuritalia','marco polo'], urls:['https://www.veneziaairport.it/it_it/news.html'] },
  { cities:['MILANO'], name:'SEA Milan airports', aliases:['sea','malpensa','linate'], urls:['https://www.milanomalpensa-airport.com/it/assistenza/news'] },
  { cities:['BERGAMO'], name:'Milan Bergamo Airport', aliases:['orio','bgy'], urls:['https://www.milanbergamoairport.it/it/news/'] },
  { cities:['FIRENZE','PISA'], name:'Toscana Aeroporti', aliases:['toscana aeroporti','gh toscana','consulta'], urls:['https://www.toscana-aeroporti.com/it/news/'] },
  { cities:[], name:'easyJet', aliases:['easyjet'], urls:['https://www.easyjet.com/it/aiuto/prepararsi-a-volare/informazioni-di-viaggio'] },
];
export const NATIONAL_STRIKE_SOURCES = [
  { name:'Trenord', aliases:['trenord'], urls:['https://www.trenord.it/news/trenord-informa/avvisi/'] },
  { name:'Trenitalia', aliases:['trenitalia','rfi','ferrovie dello stato'], urls:['https://www.trenitalia.com/it/informazioni/treni-garantiti-incasodisciopero.html'] },
  { name:'Italo', aliases:['italo','ntv'], urls:['https://www.italotreno.com/it'] },
  { name:'ENAC', aliases:['enav','aereo','aeroport'], urls:['https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/voli-garantiti/'] },
];

// Metro services exist only in these supported cities. Tram-only networks stay
// in BUS, matching the product's surface-transport category.
export const METRO_CITY_TAGS = new Set(['MILANO','ROMA','TORINO','NAPOLI','GENOVA','CATANIA','BRESCIA']);

export const OFFICIAL_STRIKE_HOSTS = new Set([
  'cgsse.it','www.cgsse.it','scioperi.mit.gov.it',
  ...[...CITY_STRIKE_SOURCES,...AVIATION_STRIKE_SOURCES,...NATIONAL_STRIKE_SOURCES].flatMap(s=>s.urls.map(url=>new URL(url).hostname)),
]);

export function sourceCities(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return []; }
  const matches = [...CITY_STRIKE_SOURCES,...AVIATION_STRIKE_SOURCES].filter(s=>s.urls.some(root=>{
    const base=new URL(root);
    if (base.hostname !== parsed.hostname) return false;
    // Busitalia has distinct regional branches under one hostname.
    if (base.hostname === 'www.fsbusitalia.it') return parsed.pathname.includes(base.pathname.split('/')[2]);
    return true;
  }));
  return [...new Set(matches.flatMap(s=>s.cities))];
}
export function sourceCategory(url: string) {
  const host=new URL(url).hostname;
  return AVIATION_STRIKE_SOURCES.some(s=>s.urls.some(u=>new URL(u).hostname===host)) ? 'Trasporto aereo' : CITY_STRIKE_SOURCES.some(s=>s.urls.some(u=>new URL(u).hostname===host)) ? 'Trasporto pubblico locale' : '';
}
export function sourceOperatorNames(url: string) {
  const host=new URL(url).hostname;
  return [...CITY_STRIKE_SOURCES,...AVIATION_STRIKE_SOURCES,...NATIONAL_STRIKE_SOURCES].filter(s=>s.urls.some(root=>new URL(root).hostname===host)).flatMap(s=>[s.name,...s.aliases]).join(' ');
}

export function assertCitySourceCoverage() {
  const missing=CITIES.filter(city=>!CITY_STRIKE_SOURCES.some(s=>s.cities.includes(city.tag)));
  if (missing.length) throw new Error(`Missing strike discovery sources: ${missing.map(c=>c.tag).join(', ')}`);
}
