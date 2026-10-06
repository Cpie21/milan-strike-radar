import { canonicalRouteName, type AliasContext } from './canonicalLineAlias';
import type { RouteCatalog } from './officialTransitData';
import type { FieldEvidence } from './strikeScope';
import { validServiceDate } from './serviceSchedule';

export type CatalogRoute = {id:string;name:string;type:number;operator:string;longName?:string;networks?:string[];cities?:string[];source?:string};
export type NetworkCatalog = Omit<RouteCatalog,'feedId'|'routes'> & {feedId:string;operator:string;cities:string[];routes:CatalogRoute[]};
export type RouteMembership = {
  status:'CURRENT_CATALOG'|'STALE'|'UNAVAILABLE'|'NOT_CONFIGURED'|'MODE_NOT_COVERED'|'NETWORK_UNVERIFIED'|'NOT_APPLICABLE';
  operator:string;date:string;category:string;city:string;feedId:string|null;source:string|null;checkedAt:string|null;contentHash:string|null;
  routes:CatalogRoute[];
  // Publisher service dates constrain timetables, not operator ownership.
  publishedSchedule:{validFrom:string|null;validTo:string|null;modeValidTo?:Record<string,string>};
  coverage:'PUBLISHED_CATALOG_ONLY';actualOperationConfirmed:false;
};
export const routeTypesFor=(category:string)=>category==='BUS'?[0,3,11]:category==='SUBWAY'?[1]:category==='TRAIN'?[2]:[];
export function routeDisplayName(route:CatalogRoute,operator:string,category:string,context?:AliasContext) {
  const canonical=context?canonicalRouteName(route,context):route.name;
  if(canonical!==route.name)return canonical;
  return operator==='ATM_MILANO'&&category==='SUBWAY'&&/^M[1-5]$/.test(route.id)&&route.name===route.id.slice(1)?route.id:route.name || route.longName || route.id;
}
export function emptyMembership(operator:string,date:string,category:string,city:string,status:RouteMembership['status']):RouteMembership {
  return {status,operator,date,category,city,feedId:null,source:null,checkedAt:null,contentHash:null,routes:[],publishedSchedule:{validFrom:null,validTo:null},coverage:'PUBLISHED_CATALOG_ONLY',actualOperationConfirmed:false};
}
/** A freshly retrieved official directory verifies ownership, never planned/actual departures. */
export function projectRouteMembership(catalog:NetworkCatalog,date:string,category:string,city:string,operator:string,networks:string[]=[],now=new Date()):RouteMembership {
  const base={...emptyMembership(operator,date,category,city,'UNAVAILABLE'),feedId:catalog.feedId,source:catalog.source,checkedAt:catalog.checkedAt,contentHash:catalog.contentHash,publishedSchedule:{validFrom:catalog.validFrom,validTo:catalog.validTo,...(catalog.modeValidTo?{modeValidTo:catalog.modeValidTo}:{})}};
  if(!validServiceDate(date)||catalog.operator!==operator||!catalog.cities.includes(city))return base;
  const age=now.getTime()-Date.parse(catalog.checkedAt);
  // An archive re-fetched today can still contain obsolete service information.
  // Recent expiry is allowed for ownership only; months-old feeds are rejected.
  const expired=catalog.validTo?now.getTime()-Date.parse(catalog.validTo+'T23:59:59Z'):0;
  if(!Number.isFinite(age)||age< -300000||age>48*3600000||expired>30*86400000)return {...base,status:'STALE'};
  const candidates=catalog.routes.filter(r=>r.operator===operator&&routeTypesFor(category).includes(r.type)&&(!r.cities||r.cities.includes(city)));
  if(!candidates.length)return {...base,status:'MODE_NOT_COVERED'};
  if(networks.length && networks.some(n=>!candidates.some(r=>r.networks?.includes(n))))return {...base,status:'NETWORK_UNVERIFIED'};
  const routes=networks.length?candidates.filter(r=>r.networks?.some(n=>networks.includes(n))):candidates;
  return {...base,status:'CURRENT_CATALOG',routes};
}
export function membershipFact(value:RouteMembership):FieldEvidence<RouteMembership> {
  return {value,confidence:value.status==='CURRENT_CATALOG'?'HIGH':'UNKNOWN',source:value.source?'OPERATOR_OFFICIAL':'UNKNOWN',method:'CODE',...(value.source?{url:value.source}:{}),excerpt:'Current published operator route membership only; service calendar and actual operation require separate evidence.'};
}
export function freshMembership(fact:FieldEvidence<RouteMembership>|undefined,date:string,category:string,city:string,operator:string,now=new Date()) {
  const v=fact?.value;if(fact?.confidence!=='HIGH'||v?.status!=='CURRENT_CATALOG'||v.date!==date||v.category!==category||v.city!==city||v.operator!==operator||!v.source||!v.checkedAt)return;
  const age=now.getTime()-Date.parse(v.checkedAt),expired=v.publishedSchedule?.validTo?now.getTime()-Date.parse(v.publishedSchedule.validTo+'T23:59:59Z'):0;if(!Number.isFinite(age)||age< -300000||age>48*3600000||expired>30*86400000)return;
  return v;
}
