import { CITY_STRIKE_SOURCES, SUPPLEMENTAL_OPERATOR_SOURCES, NATIONAL_STRIKE_SOURCES, AVIATION_STRIKE_SOURCES } from './strikeSources';
import type { StrikeRecord } from './strikeSync';

// Source capabilities are independent: an official notice does not imply a
// timetable or a live feed exists. City membership is never operator evidence.
const adapterIds = {
  'ATAF Foggia':'ATAF_FOGGIA',
  'Arriva Udine':'ARRIVA_UDINE',
  'Start Romagna':'START_ROMAGNA',
  'ATM Milano':'ATM_MILANO',
  'ATAC':'ATAC_ROMA',
  'GTT':'GTT_TORINO',
  'ANM':'ANM_NAPOLI',
  'EAV':'EAV_NAPOLI',
  'AIR Campania':'AIR_CAMPANIA',
  'Autolinee Toscane':'AUTOLINEE_TOSCANE',
  'GEST':'GEST_FIRENZE',
  'TPER':'TPER_BOLOGNA',
  'ACTV / AVM':'ACTV_VENEZIA',
  'AMT Genova':'AMT_GENOVA',
  'AMAT Palermo':'AMAT_PALERMO',
  'AMTS Catania':'AMTS_CATANIA',
  'Ferrovia Circumetnea':'FCE_CATANIA',
  'AMTAB':'AMTAB_BARI',
  'ATV Verona':'ATV_VERONA',
  'Busitalia Veneto':'BUSITALIA_VENETO',
  'Trieste Trasporti':'TRIESTE_TRASPORTI',
  'CTM Cagliari':'CTM_CAGLIARI',
  'Arriva Bergamo':'ARRIVA_BERGAMO',
  'ATB / TEB':'ATB_TEB_BERGAMO',
  'Brescia Mobilità':'BRESCIA_MOBILITA',
  'ATM Messina':'ATM_MESSINA',
  'Busitalia Umbria':'BUSITALIA_UMBRIA',
} as const;
export type OperatorId = typeof adapterIds[keyof typeof adapterIds] | 'TRENITALIA_REGIONALE' | 'TRENITALIA' | 'TRENORD' | 'ATAF_FOGGIA' | 'ARRIVA_UDINE';
export const operatorAdapters = [...CITY_STRIKE_SOURCES,...SUPPLEMENTAL_OPERATOR_SOURCES].map(source=>{
  const id=adapterIds[source.name as keyof typeof adapterIds];
  if(!id)throw new Error('Official operator source lacks an identity: '+source.name);
  return {...source,id};
});
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const mentions=(text:string,alias:string)=>new RegExp('(?:^|[^a-z0-9])'+normalize(alias).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(normalize(text));
export function identifyOperatorIds(record:Pick<StrikeRecord,'region'|'category'|'provider'|'raw_payload'>):OperatorId[] {
  const text=record.raw_payload?.provider || record.provider;
  const found:OperatorId[]=operatorAdapters.filter(a=>a.cities.includes(record.region) && a.aliases.some(alias=>alias!=='ratp'&&mentions(text,alias)) && !(a.id==='GTT_TORINO'&&/arriva/i.test(text)&&!mentions(text,'gtt')) && !(a.id==='ATAC_ROMA'&&/roma tpl/i.test(text)&&!mentions(text,'atac'))).map(a=>a.id);
  if(record.category==='TRAIN') {
    if(/\bTrenitalia\b/i.test(text)) found.push(/regional[ei]/i.test([text,record.raw_payload?.note,record.raw_payload?.modalita].join(' ')) && !/customer operations/i.test(text)?'TRENITALIA_REGIONALE':'TRENITALIA');
    if(/\bTrenord\b/i.test(text))found.push('TRENORD');
  }
  if(/\bATAF\b/i.test(text)&&/foggia/i.test([text,record.raw_payload?.province].join(' ')))found.push('ATAF_FOGGIA');
  if(/\bArriva\b/i.test(text)&&/udine/i.test([text,record.raw_payload?.province].join(' ')))found.push('ARRIVA_UDINE');
  if(/\bstart\s+romagna\b/i.test(text))found.push('START_ROMAGNA');
  return [...new Set(found)];
}
export function officialOperatorIds(url:string,region:string):OperatorId[] {
  let host:string;try{host=new URL(url).hostname;}catch{return [];}
  return operatorAdapters.filter(a=>(a.cities.includes(region)||region==='UNKNOWN'&&!a.cities.length)&&a.urls.some(root=>new URL(root).hostname===host)).map(a=>a.id);
}
export function noticeRootsForRecord(record:Pick<StrikeRecord,'region'|'category'|'provider'|'raw_payload'>) {
  const operatorIds=identifyOperatorIds(record);
  const general=/sciopero generale|settori pubblici|categorie pubbliche|plurisettorial/i.test(record.raw_payload?.provider || record.provider);
  const otherRoots=[...NATIONAL_STRIKE_SOURCES,...(record.category==='AIRPORT'?AVIATION_STRIKE_SOURCES:[])].filter(s=>s.aliases.some(a=>mentions(record.raw_payload?.provider || record.provider,a))).flatMap(s=>s.urls);
  return [...new Set([...otherRoots,...operatorAdapters.filter(a=>operatorIds.includes(a.id) || general&&['BUS','SUBWAY'].includes(record.category)&&(record.region==='NATIONAL'||a.cities.includes(record.region))).flatMap(a=>a.urls)])];
}
