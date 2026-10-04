import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchAndFilter, fetchRecentRows, syncDateWindow, transformRows, upsertToSupabase, type StrikeRecord } from '../../../../lib/strikeSync';
import { serverDatabase } from '../../../../lib/strikeQuery';
import { enrichStrikeTiming } from '../../../../lib/strikeEnrichment';
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
    const { data: runs, error: startError } = await db.rpc('begin_strike_sync');
    if (startError) throw new Error(`Cannot record sync run: ${startError.message}; apply migration first`);
    const run = runs?.[0];
    if (!run) return NextResponse.json({ success: false, error: 'A synchronization is already running' }, { status: 409 });
    runId = run.id;
    const window = syncDateWindow(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(run.started_at)));
    const [upcoming, recent] = await Promise.all([fetchAndFilter(), fetchRecentRows()]);
    const rawRows = [...upcoming, ...recent];
    // Processing an empty valid table is successful, unlike a missing/error table.
    let records: StrikeRecord[] = rawRows.length ? (await transformRows(rawRows)).map(record => ({ ...record, last_seen_at: run.started_at })) : [];
    const warnings: string[] = [];
    const enrichment = await enrichStrikeTiming(records, warnings).catch(error => {
      warnings.push(`External timing discovery failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { records: records.map(record => ({ ...record, timing_evidence: null })), enriched: 0, sourcesChecked: 0, conflicts: 0 };
    });
    records = enrichment.records;
    const upserted = records.length ? await upsertToSupabase(records, db, warnings) : 0;
    const unknownTiming = records.filter(record => !record.strike_windows.length && !record.timing_evidence?.windows.length).length;
    const { data: retired, error: finishError } = await db.rpc('finish_strike_sync', {
      run_id: runId, window_start: window.start, window_end: window.end,
      fetched_count: rawRows.length, upserted_count: upserted, unknown_count: unknownTiming,
      run_warnings: warnings,
    });
    if (finishError) throw new Error(`Cannot finish sync log: ${finishError.message}`);
    CITIES.forEach(city => revalidatePath(cityPath(city.tag)));
    revalidatePath('/[region]', 'page');
    revalidatePath('/api/strikes');
    revalidatePath('/api/calendar');
    revalidateTag('strikes', { expire: 0 });
    console.log('[sync-strikes]', JSON.stringify({ runId, fetched: rawRows.length, upserted, unknownTiming, retired, enriched: enrichment.enriched, sourcesChecked: enrichment.sourcesChecked, conflicts: enrichment.conflicts, warnings }));
    return NextResponse.json({ success: true, runId, fetched: rawRows.length, upserted, unknownTiming, retired, enriched: enrichment.enriched, sourcesChecked: enrichment.sourcesChecked, conflicts: enrichment.conflicts, warningCount: warnings.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-strikes] Error:', message);
    if (runId) {
      await serverDatabase().from('strike_sync_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', runId).eq('status', 'running');
    }
    return NextResponse.json({ success: false, error: 'Strike synchronization failed; check the sync run log' }, { status: 500 });
  }
}
