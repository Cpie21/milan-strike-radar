import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchServiceAlerts, currentServiceAlerts } from '../../../lib/transitServiceAlerts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const read=unstable_cache(fetchServiceAlerts,['rome-official-service-alerts-v1'],{revalidate:60});
export async function GET(request:Request) {
  const region=new URL(request.url).searchParams.get('region')?.toUpperCase();
  if(region!=='ROMA')return NextResponse.json({status:'UNSUPPORTED',error:'Official realtime feed is currently configured for ROMA only'},{status:400});
  try {
    const result=await read();
    // Revalidate freshness at response time, including a cached response.
    const body=currentServiceAlerts(result);
    const fresh=body.status==='FRESH';
    return NextResponse.json(body,{status:fresh?200:503,headers:{'Cache-Control':fresh?'public, max-age=0, s-maxage=30':'no-store'}});
  } catch {
    return NextResponse.json({status:'UNAVAILABLE',region:'ROMA',alerts:[],absenceMeansNormalService:false,error:'Official realtime advisories unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
