import type { decodeServiceAlerts } from './transitServiceAlerts';
import type { RouteCatalog } from './officialTransitData';

// Realtime cause, scoped entity, freshness and static identity all have to
// agree. A cancelled trip alone is never classified as strike-caused.
export function relevantLiveLineImpact(feed:ReturnType<typeof decodeServiceAlerts>,catalog:RouteCatalog|undefined,query:{date:string;today:string;category?:string;line?:string}) {
  const base={status:query.date===query.today?feed.status:'NOT_APPLICABLE',source:feed.source,sourceTimestamp:feed.feedTimestamp,checkedAt:feed.checkedAt,absenceMeansNormalService:false,alerts:[] as {id:string;header:string;description:string;effect:string;routeIds:string[];strikeCauseConfirmed:boolean}[]};
  if(query.date!==query.today||feed.status!=='FRESH'||!catalog||catalog.feedId!=='GTFS_ROMA'||!catalog.validFrom||!catalog.validTo||query.date<catalog.validFrom||query.date>catalog.validTo)return {...base,status:query.date!==query.today?'NOT_APPLICABLE':feed.status==='FRESH'?'UNVERIFIED_SCOPE':feed.status};
  const types=query.category==='SUBWAY'?[1]:query.category==='BUS'?[0,3,11]:query.category==='TRAIN'?[2]:[0,1,2,3,11];
  const routes=catalog.routes.filter(r=>types.includes(r.type)&&(!query.line||r.name.toUpperCase()===query.line));
  // Ambiguous names cannot identify one passenger line.
  if(query.line&&routes.length!==1)return {...base,status:'UNVERIFIED_SCOPE'};
  const ids=new Set(routes.map(r=>r.id));
  const alerts=feed.alerts.filter(a=>a.isActive).flatMap(a=>{
    const scoped=[...new Set(a.selectors.filter(s=>!s.stopId&&!s.tripId&&s.routeId&&ids.has(s.routeId)).map(s=>s.routeId!))];
    if(!scoped.length)return [];
    return [{id:a.id,header:a.header,description:a.description,effect:a.effect,routeIds:scoped,strikeCauseConfirmed:a.confirmedStrikeDisruption}];
  });
  return {...base,alerts};
}
