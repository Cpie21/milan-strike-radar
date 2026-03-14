require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('strikes').select('*').order('date', { ascending: false }).limit(5);
  if (error) console.error(error);
  console.log("Found", data?.length, "records. Latest are:");
  console.dir(data, { depth: null });
}
check();
