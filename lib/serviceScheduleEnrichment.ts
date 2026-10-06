import { GTFS_FEEDS, type FeedId } from './officialTransitData';
import { loadScheduleIndex } from './gtfsSchedule';
import { scheduleForScope, unknownSchedule, type ScheduleIndex, type ServiceSchedule } from './serviceSchedule';
import { indirectRail, type FieldEvidence } from './strikeScope';
import type { StrikeRecord } from './strikeSync';
import { CITIES } from './cities';

export const FEED_CITIES:Record<FeedId,string[]>={GTFS_MILANO:['MILANO'],GTFS_ROMA:['ROMA'],GTFS_GEST:['FIRENZE'],GTFS_BARI:['BARI'],GTFS_GENOVA:['GENOVA'],GTFS_CAGLIARI:['CAGLIARI'],GTFS_CATANIA:['CATANIA'],GTFS_TORINO:['TORINO'],GTFS_EAV:['NAPOLI'],GTFS_ACTV:['VENEZIA'],GTFS_TPER:['BOLOGNA']};
export const FEED_MODES:Record<FeedId,string[]>={GTFS_MILANO:['BUS','SUBWAY'],GTFS_ROMA:['BUS','SUBWAY'],GTFS_GEST:['BUS'],GTFS_BARI:['BUS'],GTFS_GENOVA:['BUS','SUBWAY'],GTFS_CAGLIARI:['BUS'],GTFS_CATANIA:['BUS'],GTFS_TORINO:['BUS','SUBWAY'],GTFS_EAV:['BUS','SUBWAY','TRAIN'],GTFS_ACTV:['BUS'],GTFS_TPER:['BUS']};
export function serviceScheduleCoverage() {
  return CITIES.map(city=>({city:city.tag,modes:Object.fromEntries(['BUS','SUBWAY','TRAIN','AIRPORT'].map(mode=>[mode,{status:mode==='AIRPORT'?'NOT_APPLICABLE':Object.entries(FEED_CITIES).some(([id,cities])=>cities.includes(city.tag)&&FEED_MODES[id as FeedId].includes(mode))?'SOURCE_CONFIGURED':'NO_VERIFIED_FEED',feeds:Object.entries(FEED_CITIES).filter(([id,cities])=>cities.includes(city.tag)&&FEED_MODES[id as FeedId].includes(mode)).map(([id])=>({id,source:GTFS_FEEDS[id as FeedId].url})),note:'Source configuration is not proof of dated/mode/line coverage; each event must pass validation.'}]))}));
}
export function scheduleFeedFor(record:StrikeRecord):FeedId|undefined {
  const f=record.timing_evidence?.fields,scope=f?.lineScope;
  if(record.status==='CANCELLED'||record.region==='NATIONAL'||record.category==='AIRPORT'||f?.passengerImpact?.value==='INDIRECT_OR_UNCONFIRMED'||f&&indirectRail(f.scopeType.value)||/amministrativ|uffici|manutenzione|security|appalt/i.test(record.raw_payload?.provider||record.provider))return;
  if(!scope||scope.confidence!=='HIGH'||scope.value.kind==='UNKNOWN'||scope.value.operatorIds.length!==1||scope.value.networkNames.length)return;
  // EAV is regional. A Napoli ownership projection is partial and cannot
  // donate the latest arrival of all regional services to a local event.
  if(scope.value.operatorIds[0]==='EAV_NAPOLI'&&scope.value.kind!=='SPECIFIC_LINES')return;
  return (Object.keys(GTFS_FEEDS) as FeedId[]).find(id=>FEED_CITIES[id].includes(record.region)&&GTFS_FEEDS[id].operator===scope.value.operatorIds[0]);
}
const asFact=(value:ServiceSchedule):FieldEvidence<ServiceSchedule>=>({value,confidence:value.status==='COMPLETE'?'HIGH':'UNKNOWN',source:value.source?'OPERATOR_OFFICIAL':'UNKNOWN',method:'CODE',...(value.source?{url:value.source}:{}),excerpt:'Scheduled passenger service only. Does not confirm actual operation, strike cessation or service resumption.'});
/** Optional enrichment cannot stop MIT ingestion or manufacture an endpoint on failure. */
export async function enrichServiceSchedules(records:StrikeRecord[],warnings:string[],read:(id:FeedId)=>Promise<ScheduleIndex>=loadScheduleIndex,now=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const wanted=records.filter(r=>r.date>=today&&r.status!=='CANCELLED'&&(r.timing_evidence?.windows.some(w=>w.start===null||w.end_kind==='end_of_service')));
  // Sequential bounded downloads: avoid several giant stop_times inflations at once.
  const deadline=Date.now()+60000;
  const indexes=new Map<FeedId,ScheduleIndex>();const failed=new Set<FeedId>();
  for(const r of wanted) {
    const id=scheduleFeedFor(r);if(!id||indexes.has(id)||failed.has(id))continue;
    if(Date.now()>deadline){failed.add(id);warnings.push('Scheduled service fetch deferred by sync budget: '+id);continue;}
    try {indexes.set(id,await read(id));}catch{failed.add(id);warnings.push('Scheduled service times unavailable: '+id);}
  }
  let complete=0;
  for(const r of wanted) {
    const f=r.timing_evidence?.fields;if(!f)continue;
    const id=scheduleFeedFor(r),index=id?indexes.get(id):undefined;
    const value=index?scheduleForScope(index,r.date,r.category,f.lineScope!.value):unknownSchedule(r.date,r.category,r.category==='AIRPORT'||indirectRail(f.scopeType.value)?'PASSENGER_TIMETABLE_NOT_APPLICABLE':id?'SOURCE_UNAVAILABLE':'NO_VERIFIED_OPERATOR_AND_LINE_SCOPE',r.category==='AIRPORT'||indirectRail(f.scopeType.value)?'NOT_APPLICABLE':'UNKNOWN');
    // Drop stale previously persisted evidence on every refresh, including failure.
    f.serviceSchedule=asFact(value);if(value.status==='COMPLETE')complete++;
    if(value.status==='PARTIAL'||value.status==='OUT_OF_VALIDITY')warnings.push('Scheduled service times '+value.status+': '+r.region+'/'+r.category+'/'+r.date);
  }
  return {records,complete,feeds:indexes.size};
}
