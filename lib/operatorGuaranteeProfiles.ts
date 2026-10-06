import type { EvidenceWindow } from './strikeEvidence';
import type { StrikeRecord } from './strikeSync';
import { numericWindows } from './strikePresentation';

import { identifyOperatorIds, type OperatorId } from './operatorAdapters';
export type { OperatorId } from './operatorAdapters';
export type GuaranteePolicy = {
  operator: OperatorId;
  mode: StrikeRecord['category'];
  service: 'URBAN_SUBURBAN' | 'DAYTIME_TPL' | 'REGIONAL_RAIL' | 'BERGAMO_CONSORTIA' | 'CAMPANIA_BUS';
  source: string;
  validFrom: string;
  validTo: string;
  checkedAt: string;
  validityBasis: 'REVIEW_WINDOW';
  windows: EvidenceWindow[];
  qualification: string;
};
export type Profile = Omit<GuaranteePolicy, 'mode'|'windows'> & { modes: StrikeRecord['category'][]; weekday: EvidenceWindow[]; holiday?: EvidenceWindow[] };
const clock = (start:string,end:string):EvidenceWindow => ({start,end,end_kind:'clock'});
const startOfService = (end:string):EvidenceWindow => ({start:null,end,end_kind:'clock'});
const dates={validFrom:'2026-10-05',validTo:'2026-11-04',checkedAt:'2026-10-05',validityBasis:'REVIEW_WINDOW' as const};
// These dates bound our last verified applicability, not a fabricated legal
// effective date. Expired profiles stop supplying guarantees until refreshed.
export const operatorGuaranteeProfiles: Profile[] = [
  {...dates,operator:'ATM_MILANO',modes:['BUS','SUBWAY'],service:'URBAN_SUBURBAN',source:'https://www.atm.it/it/IlGruppo/ChiSiamo/Documents/Carta%20della%20Mobilit%C3%A0%20ATM%202025.pdf',weekday:[startOfService('08:45'),clock('15:00','18:00')],qualification:'Operator standard rule; a dated notice or Commission decision can change it. Service start varies by line.'},
  {...dates,operator:'ATAC_ROMA',modes:['BUS','SUBWAY'],service:'DAYTIME_TPL',source:'https://romamobilita.it/wp-content/uploads/2026/05/TM-1_28-maggio_merged_compressed.pdf',weekday:[startOfService('08:30'),clock('17:00','20:00')],qualification:'Daytime ATAC standard bands restated by Roma Mobilita in a prior notice; not confirmation of this strike. Night services and other Rome operators require their own notice.'},
  {...dates,operator:'GTT_TORINO',modes:['BUS','SUBWAY'],service:'URBAN_SUBURBAN',source:'https://www.gtt.to.it/cms/risorse/cdm.pdf',weekday:[clock('06:00','09:00'),clock('12:00','15:00')],qualification:'GTT urban/suburban surface and metro only; excludes interurban and night services.'},
  {...dates,operator:'TRENITALIA_REGIONALE',modes:['TRAIN'],service:'REGIONAL_RAIL',source:'https://www.trenitalia.com/it/regionale/viaggiare-con-il-regionale.html',weekday:[clock('06:00','09:00'),clock('18:00','21:00')],holiday:[clock('07:00','10:00'),clock('18:00','21:00')],qualification:'Minimum regional rail service framework; only listed guaranteed trains are assured, not every train within these bands. Long-distance services are excluded.'},
  {...dates,operator:'ARRIVA_BERGAMO',modes:['BUS'],service:'BERGAMO_CONSORTIA',source:'https://arriva.it/app/uploads/sites/7/2026/09/BERGAMO-Carta-della-mobilita-2026.pdf',weekday:[clock('06:00','08:30'),clock('12:30','16:00')],qualification:'Bergamo Trasporti Est/Ovest/Sud: guaranteed departures in these bands, based on the 2026 service charter. Excludes airport shuttles and Lecco services.'},
  {...dates,operator:'AIR_CAMPANIA',modes:['BUS'],service:'CAMPANIA_BUS',source:'https://aircampania.it/download/carta-della-mobilita-ed-1-rev-1-del-13-07-2023/?wpdmdl=10244',weekday:[clock('06:00','08:00'),clock('13:00','15:00'),clock('17:00','19:00')],qualification:'AIR Campania bus service charter, rev. 9 of 18 November 2025; dated notices take precedence. Protection is minimum service, not every departure. Excludes funicular and indirect support staff.'},
];

export function identifyOperators(record:Pick<StrikeRecord,'region'|'category'|'provider'|'raw_payload'>):OperatorId[] {
  return identifyOperatorIds(record);
}

function easter(year:number) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  return new Date(Date.UTC(year,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1));
}
export function italianHoliday(date:string) {
  const day=new Date(date+'T12:00:00Z'),year=day.getUTCFullYear();
  const monday=new Date(easter(year).getTime()+86400000).toISOString().slice(0,10);
  // Local patronal holidays need explicit notice, not a city projection.
  return day.getUTCDay()===0 || ['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(date.slice(5)) || date===monday;
}

export function selectGuaranteePolicy(record:StrikeRecord,profiles:Profile[]=operatorGuaranteeProfiles):GuaranteePolicy|undefined {
  const f=record.timing_evidence?.fields;
  if(record.status==='CANCELLED' || !f || f.guaranteeSource==='OFFICIAL_STRIKE_NOTICE' || f.guaranteedServiceWindow.confidence==='CONFLICT') return;
  let ids=identifyOperators(record);
  if(!ids.length && f.lineScope?.source==='OPERATOR_OFFICIAL' && f.lineScope.confidence==='HIGH')ids=f.lineScope.value.operatorIds;
  if(ids.length!==1) return;
  const p=profiles.find(p=>p.operator===ids[0] && p.modes.includes(record.category) && record.date>=p.validFrom && record.date<=p.validTo);
  if(!p) return;
  const text=[record.raw_payload?.provider,record.raw_payload?.note,record.raw_payload?.modalita].join(' ');
  if(/notturn|night|funicolar|\bNET\b|Roma TPL|Troiani|\bSAP\b/i.test(text)) return;
  if(!['ARRIVA_BERGAMO','AIR_CAMPANIA'].includes(p.operator) && /extraurban|interurban/i.test(text))return;
  if(p.operator==='AIR_CAMPANIA' && /manutenzione|amministrativ|appalt|pulizi|support|non direttamente connesso/i.test(text))return;
  if(p.operator==='ARRIVA_BERGAMO' && (/aeroport|airport|Lecco|funivi/i.test(text) || !f.lineScope?.value.networkNames.length && !/Bergamo Trasporti/i.test(text)))return;
  if(p.operator==='GTT_TORINO' && record.category==='BUS' && !/urban|suburban/i.test(text)) return;
  if(record.category==='TRAIN' && (f.passengerImpact?.value!=='DIRECT_SERVICE' || !['RAIL_OPERATOR','RAIL_CREW'].includes(f.scopeType.value) || /\bRFI\b|\bDOIT\b|FS SECURITY|Trenord|Italo|appalt|pulizi|infrastruttur/i.test(text))) return;
  const {weekday,holiday,...policy}=p;
  const windows=holiday&&italianHoliday(record.date)?holiday:weekday;
  // An explicit dated operator notice can override a usual rule. Never label
  // its stated disruption as protected merely because a profile overlaps it.
  if(f.timing.source==='OPERATOR_OFFICIAL' && intersectGuaranteeEvidence([windows,record.timing_evidence?.windows||[]]).length)return;
  return {...policy,mode:record.category,windows};
}

export function applyGuaranteeProfile(record:StrikeRecord,profiles:Profile[]=operatorGuaranteeProfiles):StrikeRecord {
  const policy=selectGuaranteePolicy(record,profiles);
  if(!policy) return record;
  const numeric=numericWindows(policy.windows);
  return {...record,guarantee_windows:numeric,timing_evidence:{...record.timing_evidence!,fields:{...record.timing_evidence!.fields!,guaranteeSource:'OPERATOR_RULE',guaranteePolicy:policy,guaranteeDuringStrike:{value:intersectGuaranteeEvidence([policy.windows,record.timing_evidence?.windows||[]]),confidence:record.timing_evidence?.windows.length?'MEDIUM':'UNKNOWN',source:'OPERATOR_OFFICIAL',method:'CODE',url:policy.source,excerpt:'Intersection of sourced protection rules with the known strike window; not all departures are guaranteed.'},guaranteeEvidenceWindows:{value:policy.windows,confidence:'MEDIUM',source:'OPERATOR_OFFICIAL',method:'CODE',url:policy.source,excerpt:policy.qualification},guaranteedServiceWindow:{value:numeric,confidence:'MEDIUM',source:'OPERATOR_OFFICIAL',method:'CODE',url:policy.source,excerpt:policy.qualification},...(record.category==='TRAIN'?{guaranteedTrains:{value:[],confidence:'UNKNOWN' as const,source:'UNKNOWN' as const,url:'https://www.trenitalia.com/it/informazioni/treni-garantiti-incasodisciopero.html',excerpt:'No dated train-number list verified for this event'}}:{})}}};
}

export function intersectGuaranteeEvidence(sets:EvidenceWindow[][]):EvidenceWindow[] {
  if(!sets.length||sets.some(s=>!s.length))return [];
  const minutes=(s:string|null,upper=false)=>s===null?(upper?Infinity:-Infinity):Number(s.slice(0,2))*60+Number(s.slice(3));
  let result=sets[0];
  for(const set of sets.slice(1))result=result.flatMap(a=>set.flatMap(b=>{
    const start=minutes(a.start)>minutes(b.start)?a.start:b.start;
    const end=minutes(a.end,true)<minutes(b.end,true)?a.end:b.end;
    return minutes(start)<minutes(end,true)?[{start,end,end_kind:end===null?'end_of_service' as const:'clock' as const}]:[];
  }));
  return result;
}
