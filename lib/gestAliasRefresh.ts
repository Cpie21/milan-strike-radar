import type { RouteCatalog } from './officialTransitData';
import { GEST_ALIAS_SOURCE, GEST_FEED_SOURCE, type GestAliasVerification } from './canonicalLineAlias';

type Row=Record<string,string>;
const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** Same-archive trip endpoints plus the official public route description. */
export function gestEndpointPairs(routeId:string,trips:Row[],stops:Row[],times:Row[]) {
  const tripIds=new Set(trips.filter(t=>t.route_id===routeId).map(t=>t.trip_id));
  const names=new Map(stops.map(s=>[s.stop_id,clean(s.stop_name)]));
  const edges=new Map<string,{first:number;last:number;a:string;b:string}>();
  for(const t of times)if(tripIds.has(t.trip_id)) {
    const n=Number(t.stop_sequence),name=names.get(t.stop_id);
    if(!Number.isSafeInteger(n)||n<0||!name)throw new Error('Unverified GEST stop identity');
    const e=edges.get(t.trip_id)||{first:n,last:n,a:name,b:name};
    if(n<e.first){e.first=n;e.a=name;}if(n>e.last){e.last=n;e.b=name;}edges.set(t.trip_id,e);
  }
  if(edges.size!==tripIds.size||!edges.size)throw new Error('Incomplete GEST trip endpoints');
  return [...new Set([...edges.values()].map(e=>e.a+'|'+e.b))].sort();
}
export function verifyGestAlias(catalog:RouteCatalog,officialText:string,pairs:string[]):GestAliasVerification {
  const base={status:'UNVERIFIED' as const,source:GEST_ALIAS_SOURCE,catalogSource:catalog.source,checkedAt:catalog.checkedAt,validFrom:catalog.validFrom,validTo:catalog.validTo,endpoints:pairs};
  const text=clean(officialText),allowed=new Set(['villa costanza','careggi ospedale','unita','de andre']);
  if(catalog.feedId!=='GTFS_GEST'||catalog.source!==GEST_FEED_SOURCE||!text.includes('linea t1 leonardo')||!text.includes('villa costanza')||!text.includes('careggi')||!text.includes('senza interruzioni di linea')||!pairs.includes('villa costanza|careggi ospedale')||!pairs.includes('careggi ospedale|villa costanza')||pairs.some(p=>p.split('|').some(s=>!allowed.has(s))))return base;
  return {...base,status:'VERIFIED'};
}
