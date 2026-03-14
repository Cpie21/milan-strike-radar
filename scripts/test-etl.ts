import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_service_role_key_here';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing in environment variables.');
}

// Initialize Supabase client with the Service Role Key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseKey);

// Phase 1: Mock Data Source
const mockData = [
    { date: '2026-02-28', provider: 'ATM', duration: '24 ore' },
    { date: '2026-03-01', provider: 'Trenord', duration: '24 ore' },
    { date: '2026-03-05', provider: 'ATM', duration: '4 ore' },
];

async function main() {
    console.log('Starting ETL Pipeline Test (Phases 1 & 2)...\n');

    // Phase 2: Rule Matcher Logic
    const processedData = mockData.map((item) => {
        let status = '';
        let data_source = '';
        let guarantee_windows: Array<{ start: string; end: string; type: string }> | null = null;

        if (item.provider === 'ATM' && item.duration === '24 ore') {
            status = 'CONFIRMED';
            data_source = 'STATIC_RULE';
            guarantee_windows = [
                { start: '08:45', end: '15:00', type: 'STRIKE' },
                { start: '18:00', end: '23:59', type: 'STRIKE' },
            ];
        } else if (item.provider === 'Trenord' && item.duration === '24 ore') {
            status = 'CONFIRMED';
            data_source = 'STATIC_RULE';
            guarantee_windows = [
                { start: '00:00', end: '06:00', type: 'STRIKE' },
                { start: '09:00', end: '18:00', type: 'STRIKE' },
                { start: '21:00', end: '23:59', type: 'STRIKE' },
            ];
        } else if (item.duration === '4 ore') {
            status = 'REQUIRES_DETAIL';
            data_source = 'MIT_AUTO';
            guarantee_windows = null;
        }

        return {
            date: item.date,
            provider: item.provider,
            status,
            data_source,
            guarantee_windows,
        };
    });

    console.log('Processed Data (Phase 2):');
    console.dir(processedData, { depth: null });

    console.log('\nInserting processed data into "strikes" table...');

    // Phase 4 (per prompt): Database Insert
    const { data, error } = await supabase
        .from('strikes')
        .insert(processedData)
        .select();

    if (error) {
        console.error('Error inserting data into Supabase:', error);
    } else {
        console.log('Successfully inserted data:');
        console.dir(data, { depth: null });
    }
}

main().catch(console.error);
