import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchAndFilter, fetchRecentRows, transformRows, upsertToSupabase } from '../../../../lib/strikeSync';
import { serverDatabase } from '../../../../lib/strikeQuery';
import { CITIES, cityPath } from '../../../../lib/cities';

export { fetchAndFilter, fetchRecentRows, transformRows, upsertToSupabase };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Sync authorization is not configured' }, { status: 503 });
  }
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let runId: string | undefined;
  try {
    const db = serverDatabase();
    const { data: run, error: startError } = await db.from('strike_sync_runs').insert({ status: 'running' }).select('id').single();
    if (startError) throw new Error(`Cannot record sync run: ${startError.message}; apply migration first`);
    runId = run.id;
    const [upcoming, recent] = await Promise.all([fetchAndFilter(), fetchRecentRows()]);
    const rawRows = [...upcoming, ...recent];
    // Processing an empty valid table is successful, unlike a missing/error table.
    const records = rawRows.length ? await transformRows(rawRows) : [];
    const upserted = records.length ? await upsertToSupabase(records) : 0;
    const unknownTiming = records.filter(record => !record.strike_windows.length).length;
    const { error: finishError } = await db.from('strike_sync_runs').update({ status: 'success', completed_at: new Date().toISOString(), fetched: rawRows.length, upserted, unknown_timing: unknownTiming }).eq('id', runId);
    if (finishError) throw new Error(`Cannot finish sync log: ${finishError.message}`);
    CITIES.forEach(city => revalidatePath(cityPath(city.tag)));
    revalidatePath('/[region]', 'page');
    revalidatePath('/api/strikes');
    revalidatePath('/api/calendar');
    console.log('[sync-strikes]', JSON.stringify({ runId, fetched: rawRows.length, upserted, unknownTiming }));
    return NextResponse.json({ success: true, runId, fetched: rawRows.length, upserted, unknownTiming });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-strikes] Error:', message);
    if (runId) {
      await serverDatabase().from('strike_sync_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', runId);
    }
    return NextResponse.json({ success: false, error: 'Strike synchronization failed; check the sync run log' }, { status: 500 });
  }
}
