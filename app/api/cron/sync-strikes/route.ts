import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { fetchAndFilter, pruneExpiredPendingFromSupabase, pruneSupersededPendingFromSupabase, transformRows, upsertToSupabase } from '../../../../lib/strikeSync';

export { fetchAndFilter, pruneExpiredPendingFromSupabase, pruneSupersededPendingFromSupabase, transformRows, upsertToSupabase };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawRows = await fetchAndFilter();
    console.log(`[sync-strikes] Fetched ${rawRows.length} matching rows from MIT`);

    const records = rawRows.length > 0 ? await transformRows(rawRows) : [];
    console.log(`[sync-strikes] Transformed ${records.length} records`);

    const upserted = records.length > 0 ? await upsertToSupabase(records) : 0;
    console.log(`[sync-strikes] Upserted ${upserted} records`);

    const prunedSuperseded = records.length > 0 ? await pruneSupersededPendingFromSupabase(records) : 0;
    console.log(`[sync-strikes] Pruned ${prunedSuperseded} superseded pending records`);

    const pruned = await pruneExpiredPendingFromSupabase();
    console.log(`[sync-strikes] Pruned ${pruned} expired pending national train records`);

    revalidatePath('/');
    revalidatePath('/roma');
    revalidatePath('/torino');

    return NextResponse.json({
      success: true,
      fetched: rawRows.length,
      upserted,
      prunedSuperseded,
      pruned,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-strikes] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
