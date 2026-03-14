
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('Checking database for strikes...');
    const { data, error } = await supabase
        .from('strikes')
        .select('*') // Select all columns to see what's available
        .order('date', { ascending: true });

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found ' + data.length + ' strikes:');
        data.forEach(s => console.log(`${s.date}: ${s.category} - ${s.provider}`));
    }
}

checkData();
