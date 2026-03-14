import { NextResponse } from 'next/server';
import { fetchAndFilter, transformRows, upsertToSupabase } from '../../../../lib/strikeSync';

export { fetchAndFilter, transformRows, upsertToSupabase };

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

    if (rawRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No matching strikes found',
        upserted: 0,
      });
    }

    const records = await transformRows(rawRows);
    console.log(`[sync-strikes] Transformed ${records.length} records`);

    const upserted = await upsertToSupabase(records);
    console.log(`[sync-strikes] Upserted ${upserted} records`);

    return NextResponse.json({
      success: true,
      fetched: rawRows.length,
      upserted,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sync-strikes] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
