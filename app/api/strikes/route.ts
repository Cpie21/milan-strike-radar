import { resolveCity } from '../../../lib/cities';
import { readCityStrikes, romeToday } from '../../../lib/strikeQuery';
import { NextRequest, NextResponse } from 'next/server';
import { aggregateStrikes, filterStrikesForRegion } from '../../../components/utils';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const city = resolveCity(searchParams.get('region') || 'MILANO');
    if (!city) return NextResponse.json({ error: 'Unsupported city' }, { status: 400 });
    const regionTag = city.tag;
    const date = new Date(`${romeToday()}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    let strikes;
    try {
      strikes = await readCityStrikes(regionTag, date.toISOString().slice(0, 10));
    } catch {
      return NextResponse.json({ error: 'Strike data unavailable' }, { status: 503 });
    }

    const rawStrikes = strikes || [];
    const regionScoped = filterStrikesForRegion(rawStrikes, regionTag);
    const aggregated = filterStrikesForRegion(aggregateStrikes(regionScoped, regionTag), regionTag);

    return new NextResponse(JSON.stringify(aggregated), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
    });
}
