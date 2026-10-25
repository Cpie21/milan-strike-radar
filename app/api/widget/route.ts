import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../lib/cities';
import { addDaysIso } from '../../../lib/romeDate';
import { readSavedCityStrikeSnapshot, romeToday } from '../../../lib/strikeQuery';
import { aggregateStrikes, filterStrikesForRegion } from '../../../components/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  const city = resolveCity(new URL(request.url).searchParams.get('region') || 'MILANO');
  if (!city) return NextResponse.json({ error: 'Unsupported city' }, { status: 400, headers });
  try {
    const snapshot = await readSavedCityStrikeSnapshot(city.tag, addDaysIso(romeToday(), -1));
    const scoped = filterStrikesForRegion(snapshot.records, city.tag);
    const records = filterStrikesForRegion(aggregateStrikes(scoped, city.tag), city.tag);
    // Keep the widget small; full source payloads and route catalogs can be
    // hundreds of KB and are already available on the linked city page.
    const data = records.map(record => ({
      date: record.date, category: record.category, status: record.status,
      provider: record.provider, strike_windows: record.strike_windows || [],
      guarantee_windows: record.guarantee_windows || [], has_unknown_timing: record.has_unknown_timing,
      timing_evidence: { windows: record.timing_evidence?.windows || [] },
    }));
    return NextResponse.json({ version: 1, region: city.tag, fresh: snapshot.healthy, lastSuccessfulSync: snapshot.lastSuccessfulSync, data }, { headers });
  } catch {
    return NextResponse.json({ error: 'Saved strike data unavailable' }, { status: 503, headers });
  }
}
