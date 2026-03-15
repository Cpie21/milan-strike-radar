import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aggregateStrikes, filterStrikesForRegion } from '../../../components/utils';
import { canonicalizeRegionValue } from '../../../lib/strikeNormalization';

function resolveRegionTag(input: string | null) {
    const raw = (input || '').trim();
    if (!raw) return 'MILANO';

    const canonical = canonicalizeRegionValue(raw.toUpperCase());
    if (canonical === 'MILANO' || canonical === 'ROMA' || canonical === 'TORINO') {
        return canonical;
    }

    const lower = raw.toLowerCase();
    if (lower === 'milan' || lower === 'milano') return 'MILANO';
    if (lower === 'rome' || lower === 'roma') return 'ROMA';
    if (lower === 'turin' || lower === 'torino') return 'TORINO';
    return 'MILANO';
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const regionTag = resolveRegionTag(searchParams.get('region'));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return new NextResponse(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strikes from 1 month ago onwards
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(today.getMonth() - 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data: strikes, error } = await supabase
        .from('strikes')
        .select('*')
        .gte('date', startDateStr)
        .order('date', { ascending: true });

    if (error) {
        return new NextResponse(JSON.stringify({ error: 'Error fetching strikes' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const rawStrikes = strikes || [];
    const regionScoped = filterStrikesForRegion(rawStrikes, regionTag);
    const aggregated = filterStrikesForRegion(aggregateStrikes(regionScoped), regionTag);

    return new NextResponse(JSON.stringify(aggregated), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 's-maxage=3600, stale-while-revalidate'
        },
    });
}
