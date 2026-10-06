import { scopeTitle, type FieldEvidence, type ScopeEvidence } from './strikeScope';
import type { LineScope } from './lineScope';
import { identifyOperatorIds, operatorAdapters } from './operatorAdapters';
import type { StrikeRecord } from './strikeSync';
import { scheduledEndpoint, type RouteDay } from './serviceSchedule';
import { freshMembership, routeDisplayName, type CatalogRoute } from './routeMembership';

export type DeclaredLineImpact = {
  version: 1;
  checkedAt: string|null;
  declaredScope: FieldEvidence<{
    kind: 'ALL_OPERATOR_LINES'|'SPECIFIC_LINES'|'ALL_EXCEPT'|'NAMED_NETWORKS'|'REGIONAL_SERVICE'|'NATIONAL_SERVICE'|'OPERATOR_STAFF'|'REGIONAL_STAFF'|'AVIATION'|'UNKNOWN';
    operatorIds: string[]; operatorNames: string[]; networkNames: string[];
    affectedLineNames: string[]; excludedLineNames: string[];
    affectedRouteIds: string[]; excludedRouteIds: string[]; gtfsFeedId?: string;
    officialRegion: string|null; officialProvince: string|null;
  }>;
  lineMembership?: FieldEvidence<{operator:string;date:string;category:string;routes:{id:string;name:string}[]}>;
  potentialLines: {displayName:string;routeLongNames?:string[];routeIds:string[];operatorId:string|null;mode:string;reason:'NAMED_IN_OFFICIAL_NOTICE'|'WITHIN_DECLARED_OPERATOR_SCOPE'|'WITHIN_DECLARED_NAMED_NETWORK';confidence:'HIGH';noticeSource:string|null;catalogSource:string|null;catalogCheckedAt:string|null;catalogFeedId:string|null;catalogHash:string|null;actualOperationConfirmed:false;scheduledReference?:{source:string;checkedAt:string;kind:'SCHEDULED_REFERENCE';firstDeparture:RouteDay['firstDeparture'];lastDeparture:RouteDay['lastDeparture'];lastArrival:RouteDay['lastArrival']}}[];
  potentialLinesStatus:'RESOLVED'|'PARTIAL'|'SCOPE_UNCONFIRMED'|'CATALOG_UNAVAILABLE'|'CATALOG_STALE'|'NOT_CONFIGURED'|'NOT_APPLICABLE';
  enumerationCoverage:'PUBLISHED_CATALOG_ONLY'|'NOTICE_NAMED_LINES'|'NONE';
  specificLinesStatus: 'KNOWN'|'NOT_APPLICABLE'|'SOURCE_UNAVAILABLE'|'SOURCE_PARTIAL'|'NO_MATCHED_NOTICE'|'NOT_STATED_IN_MATCHED_NOTICE'|'NOT_CHECKED'|'CONFLICT'|'NOT_ENUMERATED';
  passengerRelevance: 'PASSENGER_SERVICE'|'SUPPORT_SERVICE'|'CARGO'|'UNKNOWN';
  // Observations are fetched separately and never persisted as timeless facts.
  observedStatus: 'NOT_CHECKED';
  aviation?: {scopeType:string;airports:string[];operators:string[];protectedFlightExceptions:ScopeEvidence['protectedFlightExceptions']};
  presentation: { zh:string; en:string; showLineSection:boolean };
};
type ImpactInput = Pick<StrikeRecord,'provider'|'region'|'category'> & {date?:string} & {raw_payload?:StrikeRecord['raw_payload'];last_seen_at?:string;timing_evidence?:{fields?:ScopeEvidence}|null;official_record?:{workforce:string}|null};
const otherNames:Record<string,string>={TRENITALIA:'Trenitalia',TRENITALIA_REGIONALE:'Trenitalia Regionale',TRENORD:'Trenord',ATAF_FOGGIA:'ATAF Foggia',ARRIVA_UDINE:'Arriva Udine'};
export function buildLineImpact(record:ImpactInput,now=new Date()):DeclaredLineImpact {
  const f=record.timing_evidence?.fields, scope=f?.lineScope;
  const ids=[...new Set([...(scope?.value.operatorIds || []),...identifyOperatorIds({...record,provider:record.official_record?.workforce || record.provider})])];
  const names=ids.map(id=>operatorAdapters.find(a=>a.id===id)?.name || otherNames[id] || id);
  const conflict=scope?.confidence==='CONFLICT';
  const known=scope && scope.value.kind!=='UNKNOWN' && scope.confidence!=='UNKNOWN' && !conflict ? scope:undefined;
  const indirect=f?.passengerImpact?.value==='INDIRECT_OR_UNCONFIRMED';
  const aviation=record.category==='AIRPORT';
  const regional=/^regionale$/i.test(f?.officialGeography?.value.relevance || '');
  const national=/^nazionale$/i.test(f?.officialGeography?.value.relevance || '');
  const generalService=f?.scopeType?.value==='RAIL_GENERAL' || ['BUS','SUBWAY'].includes(record.category) && /sciopero generale|settori pubblici|categorie pubbliche|plurisettorial/i.test(record.raw_payload?.provider || record.official_record?.workforce || record.provider);
  const kind:DeclaredLineImpact['declaredScope']['value']['kind']=aviation?'AVIATION':known?(known.value.kind==='ALL_OPERATOR_LINES'&&known.value.networkNames.length?'NAMED_NETWORKS':known.value.kind):indirect?(regional?'REGIONAL_STAFF':ids.length?'OPERATOR_STAFF':'UNKNOWN'):generalService&&regional?'REGIONAL_SERVICE':generalService&&national?'NATIONAL_SERVICE':ids.length?'OPERATOR_STAFF':'UNKNOWN';
  const g=f?.officialGeography?.value;
  const value={kind,operatorIds:ids,operatorNames:names,networkNames:known?.value.networkNames || [],affectedLineNames:known?.value.affectedLineNames || [],excludedLineNames:known?.value.excludedLineNames || [],affectedRouteIds:known?.value.affectedRouteIds || [],excludedRouteIds:known?.value.excludedRouteIds || [],...(known?.value.gtfsFeedId?{gtfsFeedId:known.value.gtfsFeedId}:{}),officialRegion:g?.region || null,officialProvince:g?.province || null};
  const schedule=f?.serviceSchedule;
  const membership=ids.length===1?freshMembership(f?.routeMembership,record.date || '',record.category,record.region,ids[0],now):undefined;
  // Retain compatibility for old persisted rows until the next scheduled sync.
  const datedScheduleMembership=known && ['ALL_OPERATOR_LINES','ALL_EXCEPT'].includes(known.value.kind) && !known.value.networkNames.length && ids.length===1 && schedule?.confidence==='HIGH' && schedule.value.operator===ids[0] && scheduledEndpoint(schedule.value,record.date || '',record.category,'start',now) ? {operator:ids[0],date:record.date!,category:record.category,routes:schedule.value.routes.map(r=>({id:r.id,name:r.name}))}:undefined;
  const lineMembership=membership?{value:{operator:membership.operator,date:membership.date,category:membership.category,routes:membership.routes.map(r=>({id:r.id,name:routeDisplayName(r,membership.operator,record.category)}))},confidence:'HIGH' as const,source:'OPERATOR_OFFICIAL' as const,method:'CODE' as const,url:membership.source!,excerpt:'Fresh official published route membership; does not establish service-calendar validity or actual operation'}:datedScheduleMembership?{value:datedScheduleMembership,confidence:'HIGH' as const,source:'OPERATOR_OFFICIAL' as const,method:'CODE' as const,url:schedule!.value.source!,excerpt:'Dated official timetable route identity; does not confirm actual strike operation'}:undefined;
  const candidateRoutes:CatalogRoute[]=membership?.routes || (datedScheduleMembership?.routes.map(r=>({...r,type:record.category==='SUBWAY'?1:record.category==='TRAIN'?2:3,operator:ids[0]})) || []);
  const canonical=(v:string)=>v.trim().toUpperCase();
  const excluded=new Set(value.excludedLineNames.map(canonical));
  const groups=new Map<string,CatalogRoute[]>();
  for(const route of candidateRoutes){const name=routeDisplayName(route,ids[0],record.category);if(!name||excluded.has(canonical(name)))continue;groups.set(name,[...(groups.get(name)||[]),route]);}
  const potentialLines:DeclaredLineImpact['potentialLines']=[];
  if(!aviation&&!indirect&&!conflict&&known?.confidence==='HIGH') {
    const listed=kind==='SPECIFIC_LINES'?value.affectedLineNames:['ALL_OPERATOR_LINES','ALL_EXCEPT','NAMED_NETWORKS'].includes(kind)?[...groups.keys()]:[];
    for(const name of listed.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}))) {
      const routes=[...groups.entries()].find(([n])=>canonical(n)===canonical(name))?.[1] || [];
      const entry:DeclaredLineImpact['potentialLines'][number]={displayName:name,routeLongNames:[...new Set(routes.map(r=>r.longName).filter((n):n is string=>Boolean(n)))],routeIds:routes.map(r=>r.id),operatorId:ids.length===1?ids[0]:null,mode:record.category,reason:kind==='SPECIFIC_LINES'?'NAMED_IN_OFFICIAL_NOTICE':kind==='NAMED_NETWORKS'?'WITHIN_DECLARED_NAMED_NETWORK':'WITHIN_DECLARED_OPERATOR_SCOPE',confidence:'HIGH',noticeSource:known.url || null,catalogSource:membership?.source || lineMembership?.url || null,catalogCheckedAt:membership?.checkedAt || (datedScheduleMembership?schedule!.value.checkedAt:null),catalogFeedId:membership?.feedId || null,catalogHash:membership?.contentHash || (datedScheduleMembership?schedule!.value.contentHash:null),actualOperationConfirmed:false};
      // A network's latest arrival is never copied to each individual line.
      if(schedule && schedule.value.date===record.date&&schedule.value.category===record.category&&schedule.value.operator===entry.operatorId&&schedule.value.checkedAt&&schedule.value.source&&['COMPLETE','PARTIAL'].includes(schedule.value.status)) {
        const age=now.getTime()-Date.parse(schedule.value.checkedAt), matches=schedule.value.routes.filter(r=>entry.routeIds.includes(r.id));
        if(age>=-300000&&age<=48*3600000&&matches.length===1){const r=matches[0];entry.scheduledReference={source:schedule.value.source,checkedAt:schedule.value.checkedAt,kind:'SCHEDULED_REFERENCE',firstDeparture:r.firstDeparture,lastDeparture:r.lastDeparture,lastArrival:r.lastArrival};}
      }
      potentialLines.push(entry);
    }
  }
  const potentialLinesStatus:DeclaredLineImpact['potentialLinesStatus']=aviation||indirect?'NOT_APPLICABLE':!known||known.confidence!=='HIGH'||conflict?'SCOPE_UNCONFIRMED':potentialLines.length?(kind==='SPECIFIC_LINES'?'RESOLVED':'PARTIAL'):f?.routeMembership?.value.status==='STALE'?'CATALOG_STALE':f?.routeMembership?.value.status==='NOT_CONFIGURED'?'NOT_CONFIGURED':'CATALOG_UNAVAILABLE';
  const workforce=record.raw_payload?.provider || record.official_record?.workforce || record.provider;
  const evidence=known || (ids.length?{confidence:'HIGH' as const,source:'MIT' as const,url:f?.officialGeography?.url || f?.scopeType?.url || 'https://scioperi.mit.gov.it/mit2/public/scioperi',excerpt:workforce}:f?.officialGeography);
  const status=f?.noticeDiscovery?.status;
  const specificLinesStatus:DeclaredLineImpact['specificLinesStatus']=aviation||indirect?'NOT_APPLICABLE':conflict?'CONFLICT':known?(['SPECIFIC_LINES','ALL_EXCEPT'].includes(known.value.kind)?'KNOWN':'NOT_ENUMERATED'):status==='UNAVAILABLE'?'SOURCE_UNAVAILABLE':status==='PARTIAL'?'SOURCE_PARTIAL':status==='NO_MATCH'?'NO_MATCHED_NOTICE':status==='MATCHED'?'NOT_STATED_IN_MATCHED_NOTICE':'NOT_CHECKED';
  let zh='可能受影响的服务范围待确认',en='Potential service scope awaiting confirmation';
  const label=names.join(' / ');
  if(kind==='ALL_OPERATOR_LINES'){zh=`${label} 所属线路可能受影响`;en=`${label} services may be affected`;}
  if(kind==='NAMED_NETWORKS'){zh=`${value.networkNames.join(' / ')} 可能受影响`;en=`${value.networkNames.join(' / ')} services may be affected`;}
  if(kind==='SPECIFIC_LINES'){zh=`${value.affectedLineNames.join('、')} 可能受影响`;en=`${value.affectedLineNames.join(', ')} may be affected`;}
  if(kind==='ALL_OPERATOR_LINES'&&potentialLines.length&&potentialLines.length<=8){zh=`${potentialLines.map(l=>l.displayName).join('、')} 均可能受影响`;en=`${potentialLines.map(l=>l.displayName).join(', ')} may be affected`;}
  if(kind==='ALL_EXCEPT'){zh=`${label} 所属线路可能受影响，公告排除 ${value.excludedLineNames.join('、')}`;en=`${label} services may be affected; notice excludes ${value.excludedLineNames.join(', ')}`;}
  const serviceZh=record.category==='TRAIN'?'铁路服务':'地方公共交通',serviceEn=record.category==='TRAIN'?'rail services':'local public transport';
  if(kind==='REGIONAL_SERVICE'){zh=`${g?.region} ${serviceZh}可能受影响，具体运营商和线路尚未确认`;en=`${g?.region} ${serviceEn} may be affected; specific operators and lines unconfirmed`;}
  if(kind==='NATIONAL_SERVICE'){zh=`全国${serviceZh}可能受影响，具体运营商和线路尚未确认`;en=`National ${serviceEn} may be affected; specific operators and lines unconfirmed`;}
  if(kind==='OPERATOR_STAFF'){zh=`${label} 人员罢工，具体线路影响尚未确认`;en=`${label} staff strike; specific line impact unconfirmed`;}
  if(indirect){zh='相关人员罢工，对列车运行的具体影响尚未确认';en='Related staff strike; effects on train operation unconfirmed';}
  if(aviation){const prefix=(f?.affectedAirports?.value || []).join(' / ');zh=prefix?`${prefix} · ${scopeTitle(f?.scopeType?.value || 'UNKNOWN')}，服务可能受影响`:`${scopeTitle(f?.scopeType?.value || 'UNKNOWN')}，具体航班影响以官方通知为准`;en=prefix?`${prefix}: ${scopeTitle(f?.scopeType?.value || 'UNKNOWN','en')}; services may be affected`:`${scopeTitle(f?.scopeType?.value || 'UNKNOWN','en')}; flight impact requires official confirmation`;}
  if(conflict&&!aviation&&!indirect){zh='官方线路范围信息存在差异，具体影响待确认';en='Official line scope differs between notices; impact unconfirmed';}
  return {version:1,checkedAt:f?.noticeDiscovery?.checkedAt || record.last_seen_at || null,declaredScope:{value,confidence:conflict?'CONFLICT':kind==='UNKNOWN'?'UNKNOWN':known?.confidence || (ids.length?'HIGH':evidence?.confidence || 'UNKNOWN'),source:known?.source || (kind==='UNKNOWN'?'UNKNOWN':evidence?.source==='UNKNOWN'?'MIT':evidence?.source || 'MIT'),method:'CODE',...(evidence?.url?{url:evidence.url}:{}),...(evidence?.excerpt?{excerpt:evidence.excerpt}:{})},...(lineMembership?{lineMembership}:{}),potentialLines,potentialLinesStatus,enumerationCoverage:potentialLines.length?(kind==='SPECIFIC_LINES'?'NOTICE_NAMED_LINES':'PUBLISHED_CATALOG_ONLY'):'NONE',specificLinesStatus,passengerRelevance:f?.scopeType?.value==='CARGO'?'CARGO':indirect?'SUPPORT_SERVICE':known||f?.passengerImpact?.value==='DIRECT_SERVICE'?'PASSENGER_SERVICE':'UNKNOWN',observedStatus:'NOT_CHECKED',...(aviation?{aviation:{scopeType:f?.scopeType?.value || 'UNKNOWN',airports:f?.affectedAirports?.value || [],operators:f?.affectedOperators?.value || [],protectedFlightExceptions:f?.protectedFlightExceptions}}:{}),presentation:{zh,en,showLineSection:!aviation&&!indirect}};
}
export function attachLineImpacts(records:StrikeRecord[]) {
  return records.map(r=>r.timing_evidence?.fields?{...r,timing_evidence:{...r.timing_evidence,fields:{...r.timing_evidence.fields,lineImpact:buildLineImpact(r)}}}:r);
}
export function declaredLineMatch(impact:DeclaredLineImpact,line:string):'NAMED'|'POTENTIAL'|'EXCLUDED'|'UNCONFIRMED' {
  const scope=impact.declaredScope;
  if(scope.confidence==='CONFLICT'||scope.confidence==='UNKNOWN')return 'UNCONFIRMED';
  const canonical=(s:string)=>s.trim().toUpperCase();
  if(scope.value.excludedLineNames.some(s=>canonical(s)===canonical(line)))return 'EXCLUDED';
  if(scope.value.affectedLineNames.some(s=>canonical(s)===canonical(line)))return 'NAMED';
  if(impact.potentialLines?.some(r=>canonical(r.displayName)===canonical(line)))return scope.value.kind==='SPECIFIC_LINES'?'NAMED':'POTENTIAL';
  if(scope.confidence==='HIGH' && ['ALL_OPERATOR_LINES','ALL_EXCEPT'].includes(scope.value.kind) && impact.lineMembership?.confidence==='HIGH') {
    const membership=impact.lineMembership.value;
    const matches=membership.routes.filter(r=>canonical(r.name)===canonical(line) || membership.operator==='ATM_MILANO' && membership.category==='SUBWAY' && /^M[1-5]$/i.test(line) && r.id===canonical(line) && 'M'+r.name===canonical(line));
    if(matches.length===1)return 'POTENTIAL';
  }
  // An arbitrary line code is not proof it belongs to the declared operator.
  return 'UNCONFIRMED';
}
export function lineRouteCatalogFeed(scope:LineScope,feeds:Record<string,{operator:string}>) {
  const ids=Object.keys(feeds).filter(id=>scope.operatorIds.length===1&&feeds[id].operator===scope.operatorIds[0]);
  return ids.length===1?ids[0]:undefined;
}
