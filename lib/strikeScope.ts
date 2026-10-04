import type { TimingEvidence, TimingSource } from './strikeEvidence';
import { affectedScopeText, normalizeAirportAffectedLines } from './strikeNormalization';

export type ScopeType = 'AIRPORT' | 'AIRLINE' | 'AIRLINE_CREW' | 'GROUND_HANDLING' | 'CARGO' | 'NATIONAL_AVIATION' | 'UNKNOWN';
export type GuaranteeSource = 'OFFICIAL_STRIKE_NOTICE' | 'STANDARD_RULE' | 'OPERATOR_RULE' | 'UNKNOWN';
export type FieldEvidence<T> = { value: T; confidence: 'HIGH' | 'MEDIUM' | 'UNKNOWN' | 'CONFLICT'; source: 'MIT' | 'OPERATOR_OFFICIAL' | 'STANDARD_RULE' | 'REPORTED' | 'UNKNOWN'; url?: string; excerpt?: string };
export type ScopeEvidence = {
  location: FieldEvidence<string>;
  scopeType: FieldEvidence<ScopeType>;
  affectedLines: FieldEvidence<string[] | 'ALL_LINES' | 'UNKNOWN'>;
  affectedAirports: FieldEvidence<string[]>;
  affectedOperators: FieldEvidence<string[]>;
  timing: FieldEvidence<unknown>;
  exclusions: FieldEvidence<string[]>;
  guaranteeSource: GuaranteeSource;
  guaranteeType: 'GUARANTEED_SERVICE' | 'PROTECTED_FLIGHTS';
  guaranteedServiceWindow: FieldEvidence<{start:string;end:string}[]>;
};

export function aviationScope(text: string, region: string): ScopeType {
  if (/cargo|trasporto merci|航空货运/i.test(text)) return 'CARGO';
  if (/handling|地服|地勤|GH TOSCANA|dnata|swissport/i.test(text)) return 'GROUND_HANDLING';
  const airline=/easyjet|ryanair|wizz|ITA AIRWAYS|alitalia|airlines|compagnia aerea|航空/i.test(text);
  if(airline && /navigante|piloti|pilot|crew|assistenti di volo|机组|飞行员/i.test(text)) return 'AIRLINE_CREW';
  if(airline) return 'AIRLINE';
  if(region==='NATIONAL' && /\bENAV\b|sciopero generale|settore aereo|trasporto aereo/i.test(text)) return 'NATIONAL_AVIATION';
  if(/aeroport|airport|\bAPT\b|security|sicuritalia|\bENAV\b|\bSEA\b/i.test(text)) return 'AIRPORT';
  return 'UNKNOWN';
}

export function extractLineScope(text: string): string[] | 'ALL_LINES' | 'UNKNOWN' {
  if (/esclus|eccetto|except|non\s+(?:interess|coinvolt)/i.test(text)) return 'UNKNOWN';
  const affected=affectedScopeText(text);
  // Network scope is a statement about services, not about all the staff.
  if (/esclus|eccetto|except/i.test(text) && /tutt[eaio]\s+(?:le\s+)?linee|intera\s+rete|all (?:lines|services)/i.test(text)) return 'UNKNOWN';
  if (/tutt[eaio]\s+(?:le\s+)?linee|intera\s+rete|entire network|all (?:lines|services)|全部线路|全部车次/i.test(affected)) return 'ALL_LINES';
  const metro=[...affected.matchAll(/\bM[1-5]\b/gi)].map(m=>m[0].toUpperCase());
  const lines=[...affected.matchAll(/\bline[ae]\s+(\d{1,4}[A-Z]?)(?=\b)/gi)].map(m=>m[1].toUpperCase());
  const values=[...new Set([...metro,...lines])];
  return values.length ? values : 'UNKNOWN';
}

export function makeScopeEvidence(row: {provider:string; note:string; sector:string; modalita:string; sourceUrl?:string}, region: string, category: string, windows: {start:string;end:string}[], guarantees: {start:string;end:string}[] = []): ScopeEvidence {
  const url=row.sourceUrl || 'https://scioperi.mit.gov.it/mit2/public/scioperi';
  const fact=<T>(value:T, known=true, excerpt=row.provider):FieldEvidence<T>=>({value,confidence:known?'HIGH':'UNKNOWN',source:known?'MIT':'UNKNOWN',...(known?{url,excerpt}:{})});
  const scope=category==='AIRPORT'?aviationScope(row.provider,region):'UNKNOWN';
  const lines=extractLineScope(row.note);
  const airports=category==='AIRPORT' && !['AIRLINE','AIRLINE_CREW','CARGO'].includes(scope) ? normalizeAirportAffectedLines([],{contextText:affectedScopeText(row.provider)+' '+affectedScopeText(row.note)}) : [];
  return {
    location:fact(region,region!=='UNKNOWN',row.provider), exclusions:fact(/esclus|eccetto/i.test(row.note)?[row.note]:[],/esclus|eccetto/i.test(row.note),row.note), scopeType:fact(scope,scope!=='UNKNOWN'),
    affectedLines:fact(lines,lines!=='UNKNOWN',row.note), affectedAirports:fact(airports,!!airports.length),
    // Do not treat a list of all staff as a list of all operators.
    affectedOperators:fact(/sciopero generale|categorie pubbliche|settori pubblici|plurisettorial/i.test(row.provider)?[]:row.provider?[row.provider]:[],!!row.provider && !/sciopero generale|categorie pubbliche|settori pubblici|plurisettorial/i.test(row.provider)),
    timing:fact(windows,!!windows.length,row.modalita),
    guaranteeSource:guarantees.length?'STANDARD_RULE':'UNKNOWN', guaranteeType:category==='AIRPORT'?'PROTECTED_FLIGHTS':'GUARANTEED_SERVICE',
    guaranteedServiceWindow:guarantees.length?{value:guarantees,confidence:'MEDIUM',source:'STANDARD_RULE',url:'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/',excerpt:'Protected departure bands, not a guarantee for every flight'}:fact([],false),
  };
}

export function scopeOf(row: {timing_evidence?: TimingEvidence|null; provider?:string; region?:string; scopeType?:ScopeType}) {
  return row.scopeType || row.timing_evidence?.fields?.scopeType.value || aviationScope(row.provider || '',row.region || '');
}
export function sourceFact<T>(value:T, source:TimingSource):FieldEvidence<T> {
  return {value,confidence:source.authority==='official'?'HIGH':'MEDIUM',source:source.authority==='official'?'OPERATOR_OFFICIAL':'REPORTED',url:source.url,excerpt:source.excerpt};
}
export function scopeTitle(scope: ScopeType, language:'zh'|'en'='zh') {
  const titles:Record<ScopeType,[string,string]>={AIRPORT:['机场人员罢工','Airport staff strike'],AIRLINE:['航司罢工','Airline strike'],AIRLINE_CREW:['航司机组罢工','Airline crew strike'],GROUND_HANDLING:['地面服务人员罢工','Ground handling strike'],CARGO:['货运航空罢工','Cargo airline strike'],NATIONAL_AVIATION:['全国航空人员罢工','National aviation strike'],UNKNOWN:['航空相关罢工（范围待核实）','Aviation strike (scope unverified)']};
  return titles[scope][language==='zh'?0:1];
}
