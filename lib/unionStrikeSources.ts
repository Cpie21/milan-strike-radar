import { CITIES } from './cities';

// Publisher affiliation is discovery context, never proof of participation,
// geography or service hours. Only explicit dated transport clauses may match.
export const UNION_STRIKE_SOURCES = [
  { unions:['CGIL'], urls:['https://www.cgil.it/strumenti/scioperi-e-vertenze','https://www.filtcgil.it/'] },
  { unions:['SGB'], urls:['https://www.sindacatosgb.it/'] },
];
export function isUnionSource(url:string) {
  try {
    const host=new URL(url).hostname;
    return UNION_STRIKE_SOURCES.some(s=>s.urls.some(root=>new URL(root).hostname===host));
  } catch { return false; }
}
export function unionRootsForRecord(record:{raw_payload?:{unions?:string}}) {
  const text=record.raw_payload?.unions || '';
  return UNION_STRIKE_SOURCES.filter(s=>s.unions.some(name=>new RegExp(`\\b${name}\\b`,'i').test(text))).flatMap(s=>s.urls);
}
export function unionClauseScope(heading:string,timing:string,context:string) {
  const text=(heading+' '+timing).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const categories:string[]=[];
  // A contractor/ancillary section is not the passenger railway section.
  if(!/appalti|pulizi|security|sicurezza|infrastruttur|merci|cargo/.test(heading.toLowerCase()) && /ferroviar|\btreni\b/.test(text))categories.push('TRAIN');
  if(/trasporto aereo|settore aereo|aeroport|aviazione|\bvoli\b/.test(text))categories.push('AIRPORT');
  if(/trasporto pubblico locale|\btpl\b/.test(text))categories.push('BUS','SUBWAY');
  if(/\bautobus\b|\bbus\b|\btram\b|superficie/.test(text))categories.push('BUS');
  if(/metropolitan|\bmetro\b/.test(text))categories.push('SUBWAY');
  const word=(s:string,w:string)=>new RegExp('(?:^|[^a-z])'+w+'(?:$|[^a-z])').test(s);
  const cities=CITIES.filter(c=>word(text,c.slug) || word(text,c.region)).map(c=>c.tag);
  // Regions outside the UI registry must also fence national expansion.
  const local=/\b(?:locale|regionale|provinciale|territoriale|abruzzo|basilicata|calabria|molise|marche|trentino|valle d.aosta)\b/.test(text) || cities.length>0;
  const broadSection=/^(?:(?:il|settore|trasporto)\s+)*(?:ferroviario|aereo|pubblico locale|tpl|treni)\s*[:;,.-]/i.test(heading.trim()) || /^(?:(?:il|settore|trasporto)\s+)*(?:ferroviario|aereo|pubblico locale|tpl|treni)\s*[:;,.-]/i.test(timing.trim());
  const national=!local && broadSection && !/\b(?:societa|azienda|presso|aeroporto)\b|\bsoc\./i.test(text) && /sciopero (?:generale )?nazionale|tutto il territorio nazionale|ambito nazionale/i.test(context);
  const excluded=/esclus|non (?:ader|interess|coinvol)|revocat|differit|sospes/i.test(text);
  return {categories:excluded?[]:[...new Set(categories)],cities,national};
}
