import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { readCityStrikes, romeToday } from '../../../lib/strikeQuery';
import { filterStrikesForRegion } from '../../../components/utils';
import { parseLineImpactQuery, travellerLineImpacts } from '../../../lib/travellerLineImpact';
import { readCurrentServiceAlerts } from '../../../lib/transitServiceAlertsCache';
import { loadRouteCatalog } from '../../../lib/officialTransitData';
import { relevantLiveLineImpact } from '../../../lib/liveLineImpact';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const readCatalog=unstable_cache(async()=>{try{return await loadRouteCatalog('GTFS_ROMA');}catch{return null;}},['line-impact-rome-catalog-result-v1'],{revalidate:300});
export async function GET(request:Request) {
  const today=romeToday();let query;
  try{query=parseLineImpactQuery(new URL(request.url).searchParams,today);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Invalid query'},{status:400});}
  try {
    const rows=await readCityStrikes(query.region,query.date);
    const declared=travellerLineImpacts(filterStrikesForRegion(rows,query.region) as Parameters<typeof travellerLineImpacts>[0],query);
    let observed:object={status:query.date===today?'NOT_CONFIGURED':'NOT_APPLICABLE',alerts:[],absenceMeansNormalService:false};
    if(query.region==='ROMA'&&query.date===today&&query.category!=='AIRPORT') {
      try {
        const [alerts,catalog]=await Promise.all([readCurrentServiceAlerts(),readCatalog()]);
        if(!alerts)throw new Error('Unavailable official feed');
        observed=relevantLiveLineImpact(alerts,catalog || undefined,{...query,today});
      }catch{observed={status:'UNAVAILABLE',alerts:[],absenceMeansNormalService:false};}
    }
    return NextResponse.json({query,declared,observed},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Strike data unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
