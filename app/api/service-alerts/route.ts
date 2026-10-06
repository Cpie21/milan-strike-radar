import { NextResponse } from 'next/server';
import { readCurrentServiceAlerts } from '../../../lib/transitServiceAlertsCache';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const region=new URL(request.url).searchParams.get('region')?.toUpperCase();
  if(region!=='ROMA')return NextResponse.json({status:'UNSUPPORTED',error:'Official realtime feed is currently configured for ROMA only'},{status:400});
  try {
    const body=await readCurrentServiceAlerts();
    if(!body)throw new Error('Unavailable official feed');
    // Revalidate freshness at response time, including a cached response.

    const fresh=body.status==='FRESH';
    return NextResponse.json(body,{status:fresh?200:503,headers:{'Cache-Control':fresh?'public, max-age=0, s-maxage=30':'no-store'}});
  } catch {
    return NextResponse.json({status:'UNAVAILABLE',region:'ROMA',alerts:[],absenceMeansNormalService:false,error:'Official realtime advisories unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
