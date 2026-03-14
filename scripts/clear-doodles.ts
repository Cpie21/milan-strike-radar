
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_service_role_key_here';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndClear() {
  console.log('Checking connection...');
  
  // Check strikes table
  const { data: strikes, error: strikeError } = await supabase.from('strikes').select('id').limit(1);
  if (strikeError) {
    console.error('Error querying strikes table:', strikeError);
  } else {
    console.log('Strikes table access OK. Found rows:', strikes?.length);
  }

  // Try to clear doodles
  console.log('Clearing strike_doodles...');
  const { error, count } = await supabase
    .from('strike_doodles')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error clearing doodles:', error);
    if (error.code === 'PGRST205') {
        console.log('Hint: The table might exist but is not in the schema cache. You may need to reload the schema cache in Supabase Dashboard -> API Settings.');
    }
  } else {
    console.log(`Successfully deleted ${count} doodle records.`);
  }
}

checkAndClear();
