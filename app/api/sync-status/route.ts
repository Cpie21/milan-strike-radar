import { NextResponse } from 'next/server';
import { serverDatabase } from '../../../lib/strikeQuery';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = serverDatabase();
    const fields = 'started_at,completed_at,status,fetched,upserted,unknown_timing';
    const [latest, success] = await Promise.all([
      db.from('strike_sync_runs').select(fields).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('strike_sync_runs').select(fields).eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (latest.error || success.error) throw new Error('Sync status unavailable');
    const lastSuccess = success.data?.completed_at;
    const stale = !lastSuccess || Date.now() - Date.parse(lastSuccess) > 26 * 3600_000;
    const healthy = !stale && latest.data?.status !== 'failed';
    return NextResponse.json({ healthy, stale, latest: latest.data, last_success: success.data }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ healthy: false, error: 'Synchronization status unavailable' }, { status: 503 });
  }
}
