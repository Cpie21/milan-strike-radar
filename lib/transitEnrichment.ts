import { lineRouteCatalogFeed } from './lineImpact';
import { unstable_cache } from 'next/cache';
import { refreshGuaranteeProfiles, fetchProfileDocument } from './guaranteeProfileRefresh';
import { applyGuaranteeProfile } from './operatorGuaranteeProfiles';
import { GTFS_FEEDS, loadRouteCatalog, validateLineRoutes, type FeedId } from './officialTransitData';
import { enrichServiceSchedules } from './serviceScheduleEnrichment';
import { loadScheduleIndex } from './gtfsSchedule';
import { enrichRouteMembership } from './routeMembershipEnrichment';
import { loadNetworkCatalog } from './routeCatalogSources';
import { FEED_CITIES } from './serviceScheduleEnrichment';
import type { StrikeRecord } from './strikeSync';

// Cache the small parsed result, not multi-megabyte PDFs/ZIPs. Cache failures
// never become fabricated successful verification.
const cachedProfile=unstable_cache(async(url:string)=>({text:await fetchProfileDocument(url),fetchedAt:new Date().toISOString()}),['operator-guarantee-doc-v1'],{revalidate:604800});
const cachedCatalog=unstable_cache((id:FeedId)=>loadRouteCatalog(id),['gtfs-route-catalog-v2'],{revalidate:86400});
const cachedSchedule=unstable_cache((id:FeedId)=>loadScheduleIndex(id),['gtfs-service-schedule-v2'],{revalidate:86400});
export async function enrichTransitScope(records:StrikeRecord[],warnings:string[],now=new Date()) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const profiles=await refreshGuaranteeProfiles(now,warnings,cachedProfile);
  const output=records.map(r=>r.date>=today?applyGuaranteeProfile(r,profiles):r);
  const needed=new Set<FeedId>();
  for(const r of output) {
    const scope=r.timing_evidence?.fields?.lineScope?.value;
    if(!scope || !['SPECIFIC_LINES','ALL_EXCEPT'].includes(scope.kind) || r.status==='CANCELLED' || r.date<today)continue;
    const id=lineRouteCatalogFeed(scope,GTFS_FEEDS) as FeedId|undefined;
    if(id)needed.add(id);
  }
  const catalogs=new Map<FeedId,Awaited<ReturnType<typeof loadRouteCatalog>>>();
  await Promise.all([...needed].map(async id=>{try{catalogs.set(id,await cachedCatalog(id));}catch{warnings.push('GTFS route validation unavailable: '+id);}}));
  for(const r of output) {
    const fact=r.timing_evidence?.fields?.lineScope;
    if(!fact || !['SPECIFIC_LINES','ALL_EXCEPT'].includes(fact.value.kind) || r.status==='CANCELLED' || r.date<today)continue;
    const id=lineRouteCatalogFeed(fact.value,GTFS_FEEDS) as FeedId|undefined;
    const catalog=id?catalogs.get(id):undefined;
    fact.value=catalog?validateLineRoutes(fact.value,catalog,r.date,r.category):{...fact.value,routeValidation:'UNAVAILABLE'};
    if(catalog) r.timing_evidence!.fields!.routeCatalog={value:{feedId:catalog.feedId,source:catalog.source,contentHash:catalog.contentHash,checkedAt:catalog.checkedAt,validFrom:catalog.validFrom,validTo:catalog.validTo},confidence:fact.value.routeValidation==='VERIFIED'?'HIGH':'UNKNOWN',source:'OPERATOR_OFFICIAL',method:'CODE',url:catalog.source};
  }
  return {records:output,profilesApplied:output.filter(r=>r.timing_evidence?.fields?.guaranteePolicy).length,routeCatalogs:catalogs.size};
}

export async function enrichScheduledServiceTimes(records:StrikeRecord[],warnings:string[],now=new Date()) {
  return enrichServiceSchedules(records,warnings,cachedSchedule,now);
}

const cachedNetwork=unstable_cache(async(id:string)=>{
  if(id in GTFS_FEEDS){const feedId=id as FeedId,catalog=await cachedCatalog(feedId);return {...catalog,operator:GTFS_FEEDS[feedId].operator,cities:FEED_CITIES[feedId]};}
  return loadNetworkCatalog(id);
},['official-network-membership-v1'],{revalidate:86400});
export async function enrichPotentialRouteCatalogs(records:StrikeRecord[],warnings:string[],now=new Date()) {
  return enrichRouteMembership(records,warnings,cachedNetwork,now);
}
