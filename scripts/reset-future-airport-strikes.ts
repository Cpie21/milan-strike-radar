import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const today = new Date().toISOString().slice(0, 10);

async function run() {
  const { error, count } = await supabase
    .from('strikes')
    .delete({ count: 'exact' })
    .gte('date', today);

  if (error) {
    throw error;
  }

  console.log(`Deleted ${count ?? 0} future strike rows from ${today} onward.`);
}

run().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
