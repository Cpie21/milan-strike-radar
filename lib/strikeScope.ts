import type { TimingEvidence, TimingSource } from './strikeEvidence';
import { CITIES, resolveCity } from './cities';
import { scopeTiming, timingSections } from './strikeTiming';
import { affectedScopeText, classifyRegionTags, normalizeAirportAffectedLines } from './strikeNormalization';
import { parseLineScope } from './lineScope';
import { intersectGuaranteeEvidence, identifyOperators } from './operatorGuaranteeProfiles';
import { eavDepartmentModes, EAV_DEPARTMENT_SOURCE } from './operatorDepartments';

export type ScopeType = 'AIRPORT' | 'AIRLINE' | 'AIRLINE_CREW' | 'GROUND_HANDLING' | 'CARGO' | 'NATIONAL_AVIATION' | 'MIXED_AIRPORT_SERVICES' | 'RAIL_GENERAL' | 'RAIL_OPERATOR' | 'RAIL_CREW' | 'RAIL_INFRASTRUCTURE' | 'RAIL_SECURITY' | 'RAIL_SUPPORT' | 'RAIL_CUSTOMER_SERVICE' | 'UNKNOWN';
export type GuaranteeSource = 'OFFICIAL_STRIKE_NOTICE' | 'STANDARD_RULE' | 'OPERATOR_RULE' | 'UNKNOWN';
export type FieldEvidence<T> = { value: T; confidence: 'HIGH' | 'MEDIUM' | 'UNKNOWN' | 'CONFLICT'; source: 'MIT' | 'OPERATOR_OFFICIAL' | 'STANDARD_RULE' | 'REPORTED' | 'UNKNOWN'; url?: string; excerpt?: string; method?: 'OFFICIAL' | 'CODE' | 'JEV' };
export type ScopeEvidence = {
  noticeDiscovery?: { checkedAt:string; status:'MATCHED'|'PARTIAL'|'UNAVAILABLE'|'NO_MATCH'|'NOT_CHECKED'; sources:{url:string;status:'FETCHED'|'FAILED'|'DEFERRED'}[] };
  lineImpact?: import('./lineImpact').DeclaredLineImpact;
  protectedFlightExceptions?: FieldEvidence<{airportName:string;direction:'TO_FROM';kind:'GUARANTEED_FLIGHTS'}[]>;
  location: FieldEvidence<string>;
  officialGeography?: FieldEvidence<{region:string;province:string;relevance:string}>;
  supportedCityProjection?: FieldEvidence<string[]>;
  locationStatus?: 'SUPPORTED_PROJECTION' | 'UNSUPPORTED_CITY' | 'UNSUPPORTED_REGION' | 'UNPROJECTED_GEOGRAPHY' | 'UNKNOWN_LOCATION';
  railSections?: FieldEvidence<{subject:'RAIL_SERVICE'|'RAIL_CONTRACTORS'|'RAIL_FREIGHT';text:string;representedByThisEvent:boolean}[]>;
  serviceSchedule?: FieldEvidence<import('./serviceSchedule').ServiceSchedule>;
  serviceClassification?: FieldEvidence<{operator:string;department:string;mode:string}>;
  passengerImpact?: FieldEvidence<'DIRECT_SERVICE' | 'INDIRECT_OR_UNCONFIRMED' | 'UNKNOWN'>;
  scopeType: FieldEvidence<ScopeType>;
  affectedLines: FieldEvidence<string[] | 'ALL_LINES' | 'UNKNOWN'>;
  lineScope?: FieldEvidence<import('./lineScope').LineScope>;
  routeCatalog?: FieldEvidence<Omit<import('./officialTransitData').RouteCatalog,'routes'>>;
  routeMembership?: FieldEvidence<import('./routeMembership').RouteMembership>;
  affectedAirports: FieldEvidence<string[]>;
  affectedOperators: FieldEvidence<string[]>;
  timing: FieldEvidence<unknown>;
  exclusions: FieldEvidence<string[]>;
  guaranteeSource: GuaranteeSource;
  guaranteeType: 'GUARANTEED_SERVICE' | 'PROTECTED_FLIGHTS';
  guaranteedServiceWindow: FieldEvidence<{start:string;end:string}[]>;
  guaranteeEvidenceWindows?: FieldEvidence<import('./strikeEvidence').EvidenceWindow[]>;
  guaranteeDuringStrike?: FieldEvidence<import('./strikeEvidence').EvidenceWindow[]>;
  guaranteePolicy?: import('./operatorGuaranteeProfiles').GuaranteePolicy;
  guaranteedTrains?: FieldEvidence<{trainNumber:string;departure:string;serviceDate:string}[]>;
};

export function aviationScope(text: string, region: string): ScopeType {
  if (/toscana aeroporti/i.test(text) && /gh toscana|consulta|handling/i.test(text)) return 'MIXED_AIRPORT_SERVICES';
  if (/cargo|trasporto merci|航空货运/i.test(text)) return 'CARGO';
  if (/handling|地服|地勤|GH TOSCANA|dnata|swissport/i.test(text)) return 'GROUND_HANDLING';
  const airline=/easyjet|ryanair|wizz|ITA AIRWAYS|alitalia|airlines|compagnia aerea|航空/i.test(text);
  if(airline && /navigante|piloti|pilot|crew|assistenti di volo|机组|飞行员/i.test(text)) return 'AIRLINE_CREW';
  if(airline) return 'AIRLINE';
  if(region==='NATIONAL' && /\bENAV\b|sciopero generale|settore aereo|trasporto aereo/i.test(text)) return 'NATIONAL_AVIATION';
  if(/aeroport|airport|\bAPT\b|security|sicuritalia|\bENAV\b|\bSEA\b/i.test(text)) return 'AIRPORT';
  return 'UNKNOWN';
}

export function railScope(text: string, context: {modalita?:string;note?:string} = {}): ScopeType {
  // A general strike has separately scoped rail and contractor clauses. Classify
  // the same FERROVIARIO section used by the clock parser, not its broad title.
  if (/sciopero generale|plurisettorial/i.test(text)) {
    const railSection=scopeTiming(context.modalita || '', 'TRAIN');
    return timingSections(context.modalita || '').some(s=>/^(?:SETTORE\s+)?FERROVIARIO$/.test(s.label)) && railSection.trim() ? 'RAIL_GENERAL' : 'UNKNOWN';
  }
  if (/\bTrenitalia\b/i.test(text) && /\bCUSTOMER OPERATIONS\b|customer service|vendita e assistenza/i.test(text)) return 'RAIL_CUSTOMER_SERVICE';
  if (/\bFS SECURITY\b|rail.*security|铁路安保/i.test(text)) return 'RAIL_SECURITY';
  if (/\bRFI\b|\bDOIT\b|infrastruttur|infrastructure|基础设施/i.test(text)) return 'RAIL_INFRASTRUCTURE';
  if (eavDepartmentModes(text).includes('TRAIN')) {
    if (/manutenzione|appalt|support/i.test(text)) return 'RAIL_SUPPORT';
    return /viaggiante|macchinist|bordo/i.test(text) ? 'RAIL_CREW' : 'RAIL_OPERATOR';
  }
  if (/personale.*(?:macchina|bordo)|macchinist|capotren|train crew|司乘/i.test(text)) return 'RAIL_CREW';
  if (/\bTRENITALIA\b|\bTRENORD\b|\bITALO\b|ferrovie dello stato|国家铁路|高铁/i.test(text)) return 'RAIL_OPERATOR';
  if (/pulizi|manutenzione|appalt[oi]|appaltatric|support|清洁|维护/i.test(text)) return 'RAIL_SUPPORT';
  return 'UNKNOWN';
}
export function railTitle(scope: ScopeType, language: 'zh' | 'en' = 'zh') {
  const titles: Partial<Record<ScopeType,[string,string]>> = {
    RAIL_GENERAL:['铁路罢工（总罢工铁路部分）','Rail service strike (general strike)'],
    RAIL_SECURITY:['铁路安保人员罢工','Railway security staff strike'],
    RAIL_INFRASTRUCTURE:['铁路基础设施人员罢工','Rail infrastructure staff strike'],
    RAIL_CUSTOMER_SERVICE:['铁路客服与车站服务人员罢工','Rail customer and station service staff strike'],
    RAIL_SUPPORT:['铁路配套服务人员罢工','Rail support staff strike'],
    RAIL_CREW:['铁路司乘人员罢工','Train crew strike'],
    RAIL_OPERATOR:['铁路运营人员罢工','Rail operator strike'],
    UNKNOWN:['铁路相关罢工（范围待核实）','Rail strike (scope unverified)'],
  };
  return (titles[scope] || titles.UNKNOWN!)[language==='zh'?0:1];
}
export function indirectRail(scope: ScopeType) {
  return ['RAIL_SECURITY','RAIL_INFRASTRUCTURE','RAIL_SUPPORT','RAIL_CUSTOMER_SERVICE'].includes(scope);
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

export function makeScopeEvidence(row: {provider:string; note:string; sector:string; modalita:string; sourceUrl?:string; rawRegion?:string; province?:string; rilevanza?:string}, region: string, category: string, windows: {start:string;end:string}[], guarantees: {start:string;end:string}[] = []): ScopeEvidence {
  const url=row.sourceUrl || 'https://scioperi.mit.gov.it/mit2/public/scioperi';
  const fact=<T>(value:T, known=true, excerpt=row.provider):FieldEvidence<T>=>({value,confidence:known?'HIGH':'UNKNOWN',source:known?'MIT':'UNKNOWN',method:'CODE',...(known?{url,excerpt}:{})});
  const scope=category==='AIRPORT'?aviationScope(row.provider,region):category==='TRAIN'?railScope(row.provider,row):'UNKNOWN';
  const projected=classifyRegionTags({regionText:row.rawRegion,provinceText:row.province,providerText:row.provider,sectorText:row.sector,noteText:row.note,relevanceText:row.rilevanza});
  const projection=projected.includes('NATIONAL') ? CITIES.map(c=>c.tag) : projected.filter(tag=>Boolean(resolveCity(tag)));
  const declared={region:row.rawRegion || '',province:row.province || '',relevance:row.rilevanza || ''};
  const hasProvince=Boolean(declared.province) && !/^(tutte|italia|nazionale|n\/?d|unknown)$/i.test(declared.province);
  const geographyKnown=Boolean(declared.region && !/^(unknown|n\/?d)$/i.test(declared.region) || hasProvince);
  const locationStatus:ScopeEvidence['locationStatus']=region!=='UNKNOWN' ? 'SUPPORTED_PROJECTION' : hasProvince&&!resolveCity(declared.province)?'UNSUPPORTED_CITY':geographyKnown?(CITIES.some(c=>c.region===declared.region.toLowerCase()) || /^italia$/i.test(declared.region)?'UNPROJECTED_GEOGRAPHY':'UNSUPPORTED_REGION'):'UNKNOWN_LOCATION';
  const lines=extractLineScope(row.note);
  const lineScope=parseLineScope(row.note,identifyOperators({provider:row.provider,region,category:category as import('./strikeSync').StrikeRecord['category']}));
  const airports=category==='AIRPORT' && !['AIRLINE','AIRLINE_CREW','CARGO'].includes(scope) ? normalizeAirportAffectedLines([],{contextText:affectedScopeText(row.provider)+' '+affectedScopeText(row.note)}) : [];
  return {
    ...(eavDepartmentModes(row.provider).includes(category as 'TRAIN'|'BUS')?{serviceClassification:{value:{operator:'EAV',department:category==='TRAIN'?'DTF':'DTA',mode:category},confidence:'HIGH' as const,source:'OPERATOR_OFFICIAL' as const,method:'CODE' as const,url:EAV_DEPARTMENT_SOURCE,excerpt:'Verified department meaning; does not establish this event’s exact lines or guaranteed services.'}}:{}),
    officialGeography:{...fact(declared,geographyKnown,[declared.region,declared.province,declared.relevance].join(' | ')),method:'OFFICIAL'}, supportedCityProjection:fact(projection,geographyKnown), locationStatus,
    ...(category==='TRAIN'?{railSections:fact(timingSections(row.modalita).filter(s=>/FERROVIAR|MERCI.*ROTAIA/.test(s.label)).map(s=>({subject:/APPALTI/.test(s.label)?'RAIL_CONTRACTORS' as const:/MERCI/.test(s.label)?'RAIL_FREIGHT' as const:'RAIL_SERVICE' as const,text:s.body.trim().replace(/\s*\/\s*$/,''),representedByThisEvent:/^(?:SETTORE\s+)?FERROVIARIO$/.test(s.label)})),timingSections(row.modalita).length>0,row.modalita)}:{}),
    location:fact(region,region!=='UNKNOWN',[row.rawRegion,row.province,row.rilevanza,row.provider].filter(Boolean).join(' | ')), passengerImpact:fact(indirectRail(scope)?'INDIRECT_OR_UNCONFIRMED':scope==='RAIL_GENERAL'||scope==='RAIL_OPERATOR'||scope==='RAIL_CREW'?'DIRECT_SERVICE':'UNKNOWN',scope.startsWith('RAIL_')), exclusions:fact(/esclus|eccetto/i.test(row.note)?[row.note]:[],/esclus|eccetto/i.test(row.note),row.note), scopeType:fact(scope,scope!=='UNKNOWN',scope==='RAIL_GENERAL'?scopeTiming(row.modalita,'TRAIN'):row.provider),
    affectedLines:fact(lines,lines!=='UNKNOWN',row.note), lineScope:fact(lineScope,lineScope.kind!=='UNKNOWN',row.note),affectedAirports:fact(airports,!!airports.length),
    // Do not treat a list of all staff as a list of all operators.
    affectedOperators:fact(/sciopero generale|categorie pubbliche|settori pubblici|plurisettorial/i.test(row.provider)?[]:row.provider?[row.provider]:[],!!row.provider && !/sciopero generale|categorie pubbliche|settori pubblici|plurisettorial/i.test(row.provider)),
    timing:fact(windows,!!windows.length,row.modalita),
    guaranteeSource:category==='AIRPORT' && /\bENAV\b/i.test(row.provider)?'STANDARD_RULE':guarantees.length?'STANDARD_RULE':'UNKNOWN', guaranteeType:category==='AIRPORT'?'PROTECTED_FLIGHTS':'GUARANTEED_SERVICE',
    ...(category==='AIRPORT' && /\bENAV\b/i.test(row.provider)?{guaranteeEvidenceWindows:{value:[{start:'07:00',end:'10:00',end_kind:'clock' as const},{start:'18:00',end:'21:00',end_kind:'clock' as const}],confidence:'MEDIUM' as const,source:'STANDARD_RULE' as const,method:'CODE' as const,url:'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/voli-garantiti',excerpt:'General protected departure bands; not event-specific flight confirmation.'},guaranteeDuringStrike:{value:intersectGuaranteeEvidence([[{start:'07:00',end:'10:00',end_kind:'clock'},{start:'18:00',end:'21:00',end_kind:'clock'}],windows.map(w=>({...w,end_kind:'clock' as const}))]),confidence:windows.length?'HIGH' as const:'UNKNOWN' as const,source:'STANDARD_RULE' as const,method:'CODE' as const}}:{}),
    ...(category==='AIRPORT' && /garantiti\s+i\s+voli\s+da\s+e\s+per\s+l.aeroporto\s+di\s+([^.;\n]+)/i.test(row.note)?{protectedFlightExceptions:fact([{airportName:row.note.match(/garantiti\s+i\s+voli\s+da\s+e\s+per\s+l.aeroporto\s+di\s+([^.;\n]+)/i)![1].trim().slice(0,160),direction:'TO_FROM' as const,kind:'GUARANTEED_FLIGHTS' as const}],true,row.note)}:{}),
    guaranteedServiceWindow:guarantees.length?{value:guarantees,confidence:'MEDIUM',source:'STANDARD_RULE',url:'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/',excerpt:'Protected departure bands, not a guarantee for every flight'}:fact([],false),
  };
}

export function scopeOf(row: {timing_evidence?: TimingEvidence|null; provider?:string; region?:string; scopeType?:ScopeType; category?:string}) {
  return row.scopeType || row.timing_evidence?.fields?.scopeType.value || (row.category==='TRAIN'?railScope(row.provider || ''):aviationScope(row.provider || '',row.region || ''));
}
export function sourceFact<T>(value:T, source:TimingSource):FieldEvidence<T> {
  return {value,confidence:source.authority==='official'?'HIGH':'MEDIUM',source:source.authority==='official'?'OPERATOR_OFFICIAL':'REPORTED',method:source.authority==='official'?'OFFICIAL':'CODE',url:source.url,excerpt:source.excerpt};
}
export function scopeTitle(scope: ScopeType, language:'zh'|'en'='zh') {
  const titles:Partial<Record<ScopeType,[string,string]>>={AIRPORT:['机场人员罢工','Airport staff strike'],AIRLINE:['航司罢工','Airline strike'],AIRLINE_CREW:['航司机组罢工','Airline crew strike'],MIXED_AIRPORT_SERVICES:['机场综合服务人员罢工','Mixed airport services strike'],GROUND_HANDLING:['地面服务人员罢工','Ground handling strike'],CARGO:['货运航空罢工','Cargo airline strike'],NATIONAL_AVIATION:['全国航空人员罢工','National aviation strike'],UNKNOWN:['航空相关罢工（范围待核实）','Aviation strike (scope unverified)']};
  return (titles[scope] || titles.UNKNOWN!)[language==='zh'?0:1];
}

// Preserve declared administrative scope; a supported-city card is only a
// projection, never proof that this city is the entire official impact area.
export function geographyContext(f: ScopeEvidence | undefined, language:'zh'|'en'='zh') {
  const g=f?.officialGeography?.value;
  if(!g || !/^regionale$/i.test(g.relevance) || !g.region) return '';
  return language==='zh'
    ? `官方登记范围：${g.region}（区域级，省份：${/^tutte$/i.test(g.province)?'全部':g.province || '未注明'}）。本站按支持城市展示，不代表仅影响本城市。`
    : `Official administrative scope: ${g.region} (regional; provinces: ${g.province || 'unspecified'}). This card projects the supported city; it is not the entire affected geography.`;
}
