import { NextResponse } from 'next/server';
import { serverDatabase } from '../../../lib/strikeQuery';
import { syncHealth, syncDataQuality } from '../../../lib/syncHealth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = serverDatabase();
    const fields = 'started_at,completed_at,status,fetched,upserted,unknown_timing,warnings';
    const [latest, success] = await Promise.all([
      db.from('strike_sync_runs').select(fields).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('strike_sync_runs').select(fields).eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latest.error || success.error) throw new Error('Sync status unavailable');
    const lastSuccess = success.data?.completed_at;
    const health = syncHealth(latest.data, lastSuccess);
    const compact=(run: typeof latest.data)=>{if(!run)return null;const {warnings,...rest}=run;return {...rest,warning_count:Array.isArray(warnings)?warnings.length:0};};
    const last=compact(latest.data),lastCompleted=compact(success.data);
    return NextResponse.json({ ...health, data_quality:syncDataQuality(health.healthy,last,lastCompleted), latest: last, last_success: lastCompleted }, { status: health.healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ healthy: false, error: 'Synchronization status unavailable' }, { status: 503 });
  }
}
