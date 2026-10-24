import { canonicalLineAlias, type GestAliasVerification } from './canonicalLineAlias';
import type { LineScope } from './lineScope';
import type { FieldEvidence } from './strikeScope';

/** These are scheduled passenger times, never proof of actual strike operation. */
export type ServiceClock = { clock:string; dayOffset:number; seconds:number };
export type ServiceSchedule = {
  status:'COMPLETE'|'PARTIAL'|'UNKNOWN'|'OUT_OF_VALIDITY'|'NO_SCHEDULED_SERVICE'|'NOT_APPLICABLE'|'OVERLAPPING_SERVICE_DAYS';
  date:string; operator:string|null; category:string; source:string|null; checkedAt:string|null;
  contentHash:string|null; reason:string|null; routes:RouteDay[];
  firstDeparture:ServiceClock|null; lastDeparture:ServiceClock|null; lastArrival:ServiceClock|null;
  actualOperationConfirmed:false;
};
export type RouteDay={id:string;name:string;firstDeparture:ServiceClock;lastDeparture:ServiceClock;lastArrival:ServiceClock};
export type RouteService={routeId:string;serviceId:string;trips:number;complete:boolean;first:number;lastDeparture:number;lastArrival:number};
export type ScheduleIndex={aliasVerification?:GestAliasVerification;identityEndpoints?:string[];feedId?:string;operator:string;source:string;checkedAt:string;contentHash:string;validFrom:string|null;validTo:string|null;timezone:string;modeValidTo?:Record<string,string>;routes:{id:string;name:string;type:number;longName?:string}[];calendar:Record<string,string>[];exceptions:Record<string,string>[];services:RouteService[]};

export function serviceClock(seconds:number):ServiceClock {
  if(!Number.isSafeInteger(seconds)||seconds<0||seconds>=259200)throw new Error('Invalid service clock');
  return {clock:String(Math.floor(seconds/3600)%24).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0'),dayOffset:Math.floor(seconds/86400),seconds};
}
export function gtfsSeconds(value:string):number|null {
  const m=/^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(value);
  if(!m)return null;const n=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);return n<259200?n:null;
}
export function validServiceDate(date:string) {return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;}
export const unknownSchedule=(date:string,category:string,reason:string,status:ServiceSchedule['status']='UNKNOWN'):ServiceSchedule=>({status,date,category,reason,operator:null,source:null,checkedAt:null,contentHash:null,routes:[],firstDeparture:null,lastDeparture:null,lastArrival:null,actualOperationConfirmed:false});
const compact=(date:string)=>date.replaceAll('-','');
const modes=(category:string)=>category==='BUS'?[0,3,11]:category==='SUBWAY'?[1]:category==='TRAIN'?[2]:[];

export function scheduleForScope(index:ScheduleIndex,date:string,category:string,scope:LineScope):ServiceSchedule {
  const empty={...unknownSchedule(date,category,'SCOPE_UNVERIFIED'),operator:index.operator,source:index.source,checkedAt:index.checkedAt,contentHash:index.contentHash};
  if(!validServiceDate(date)||index.timezone!=='Europe/Rome')return {...empty,reason:'INVALID_DATE_OR_TIMEZONE'};
  if(!index.validFrom||!index.validTo||date<index.validFrom||date>index.validTo||index.modeValidTo?.[category]&&date>index.modeValidTo[category])return {...empty,status:'OUT_OF_VALIDITY',reason:'DATE_OUTSIDE_PUBLISHED_TIMETABLE'};
  if(scope.kind==='UNKNOWN'||scope.operatorIds.length!==1||scope.operatorIds[0]!==index.operator||scope.networkNames.length)return empty;
  if(scope.kind!=='SPECIFIC_LINES'&&index.routes.some(r=>![0,1,2,3,4,5,6,7,11,12].includes(r.type)))return {...empty,reason:'UNSUPPORTED_GTFS_ROUTE_TYPE'};
  const candidates=index.routes.filter(r=>modes(category).includes(r.type));
  if(!candidates.length)return {...empty,reason:'MODE_NOT_IN_FEED'};
  const named=(names:string[])=>names.map(name=>candidates.filter(r=>r.name.toUpperCase()===name.toUpperCase() || canonicalLineAlias(r,{...index,date,category})?.officialName===name.toUpperCase() || index.operator==='ATM_MILANO'&&category==='SUBWAY'&&/^M[1-5]$/i.test(name)&&r.id===name.toUpperCase()&&'M'+r.name===name.toUpperCase()));
  const names=scope.kind==='SPECIFIC_LINES'?scope.affectedLineNames:scope.kind==='ALL_EXCEPT'?scope.excludedLineNames:[];
  const matches=named(names);
  if(matches.some(m=>m.length!==1)||scope.kind==='SPECIFIC_LINES'&&!names.length||scope.kind==='ALL_EXCEPT'&&!names.length)return {...empty,status:'PARTIAL',reason:'LINE_IDENTITY_INCOMPLETE'};
  const ids=new Set(matches.flat().map(r=>r.id));
  const routes=scope.kind==='SPECIFIC_LINES'?candidates.filter(r=>ids.has(r.id)):scope.kind==='ALL_EXCEPT'?candidates.filter(r=>!ids.has(r.id)):candidates;
  const day=compact(date),weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00Z').getUTCDay()];
  const active=new Set(index.calendar.filter(c=>c.start_date<=day&&c.end_date>=day&&c[weekday]==='1').map(c=>c.service_id));
  for(const c of index.exceptions.filter(c=>c.date===day)){if(c.exception_type==='1')active.add(c.service_id);else if(c.exception_type==='2')active.delete(c.service_id);}
  const resolved:RouteDay[]=[];let incomplete=false;
  for(const route of routes) {
    const all=index.services.filter(s=>s.routeId===route.id);
    if(!all.length){incomplete=true;continue;}
    const services=all.filter(s=>active.has(s.serviceId));
    if(!services.length)continue; // Explicit calendar inactivity is not an unknown route.
    if(services.some(s=>!s.complete)){incomplete=true;continue;}
    resolved.push({id:route.id,name:route.name,firstDeparture:serviceClock(Math.min(...services.map(s=>s.first))),lastDeparture:serviceClock(Math.max(...services.map(s=>s.lastDeparture))),lastArrival:serviceClock(Math.max(...services.map(s=>s.lastArrival)))});
  }
  if(incomplete)return {...empty,status:'PARTIAL',reason:'MISSING_OR_FREQUENCY_BASED_TRIP_TIMES',routes:resolved};
  if(!resolved.length)return {...empty,status:'NO_SCHEDULED_SERVICE',reason:'NO_ACTIVE_PASSENGER_TRIPS'};
  if(scope.kind!=='SPECIFIC_LINES') {
    const nextDate=new Date(date+'T12:00:00Z');nextDate.setUTCDate(nextDate.getUTCDate()+1);
    const next=nextDate.toISOString().slice(0,10),nextDay=compact(next),key=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][nextDate.getUTCDay()];
    const nextActive=new Set(index.calendar.filter(c=>c.start_date<=nextDay&&c.end_date>=nextDay&&c[key]==='1').map(c=>c.service_id));
    for(const c of index.exceptions.filter(c=>c.date===nextDay)){if(c.exception_type==='1')nextActive.add(c.service_id);else nextActive.delete(c.service_id);}
    const nextFirst=index.services.filter(s=>routes.some(r=>r.id===s.routeId)&&nextActive.has(s.serviceId)&&s.complete).map(s=>s.first);
    const end=Math.max(...resolved.map(r=>r.lastArrival.seconds));
    if(next<=index.validTo&&nextFirst.length&&end>=86400+Math.min(...nextFirst))return {...empty,status:'OVERLAPPING_SERVICE_DAYS',reason:'NO_SINGLE_NETWORK_END_ACROSS_SERVICE_DAYS',routes:resolved};
  }
  return {...empty,status:'COMPLETE',reason:null,routes:resolved,firstDeparture:serviceClock(Math.min(...resolved.map(r=>r.firstDeparture.seconds))),lastDeparture:serviceClock(Math.max(...resolved.map(r=>r.lastDeparture.seconds))),lastArrival:serviceClock(Math.max(...resolved.map(r=>r.lastArrival.seconds)))};
}

export function scheduleClockLabel(clock:ServiceClock,language:'zh'|'en'='zh') {
  const offset=clock.dayOffset===0?'':clock.dayOffset===1?(language==='zh'?'次日 ':'next day '):(language==='zh'?`${clock.dayOffset}天后 `:`+${clock.dayOffset} days `);
  return offset+clock.clock;
}
/** Aggregation requires evidence for every active event; partial coverage cannot supply a card-wide end. */
export function mergeServiceSchedules(facts:(FieldEvidence<ServiceSchedule>|undefined)[],date:string,category:string):ServiceSchedule {
  if(!facts.length||facts.some(f=>!f||f.confidence!=='HIGH'||f.value.status!=='COMPLETE'||f.value.date!==date||f.value.category!==category||!f.value.lastArrival))return unknownSchedule(date,category,'AGGREGATE_COVERAGE_INCOMPLETE');
  const values=facts.map(f=>f!.value),routes=values.flatMap(v=>v.routes);
  if(new Set(values.map(v=>v.operator)).size!==1||new Set(values.map(v=>v.contentHash)).size!==1)return unknownSchedule(date,category,'AGGREGATE_SOURCES_DIFFER');
  return {...values[0],routes:[...new Map(routes.map(r=>[r.id,r])).values()],firstDeparture:serviceClock(Math.min(...values.map(v=>v.firstDeparture!.seconds))),lastDeparture:serviceClock(Math.max(...values.map(v=>v.lastDeparture!.seconds))),lastArrival:serviceClock(Math.max(...values.map(v=>v.lastArrival!.seconds)))};
}

export function scheduledEndpoint(schedule:ServiceSchedule|undefined,date:string,category:string,edge:'start'|'end',now=new Date()):{label:string;clock:ServiceClock;source:string;kind:'SCHEDULED_REFERENCE'}|null {
  if(!schedule||schedule.status!=='COMPLETE'||schedule.date!==date||schedule.category!==category||!schedule.source||!schedule.checkedAt)return null;
  const checked=Date.parse(schedule.checkedAt),age=now.getTime()-checked;
  if(!Number.isFinite(checked)||age< -300000||age>48*3600000)return null;
  const clock=edge==='start'?schedule.firstDeparture:schedule.lastArrival;
  return clock?{label:scheduleClockLabel(clock),clock,source:schedule.source,kind:'SCHEDULED_REFERENCE'}:null;
}
