import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return null;
    }
    return createClient(supabaseUrl, supabaseKey);
}

export async function GET() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            return NextResponse.json(
                { error: 'Supabase URL or Key is missing in environment variables.' },
                { status: 500 }
            );
        }
        // Query the strikes table, selecting all columns and ordering by date ascending
        const { data, error } = await supabase
            .from('strikes')
            .select('*')
            .order('date', { ascending: true });

        if (error) {
            console.error('Error fetching strikes from Supabase:', error);
            return NextResponse.json(
                { error: 'Failed to fetch strikes data' },
                { status: 500 }
            );
        }

        // Return the fetched data
        return NextResponse.json(data);
    } catch (err) {
        console.error('Unexpected error in GET /api/strikes:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
