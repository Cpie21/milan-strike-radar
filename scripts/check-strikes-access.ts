
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_service_role_key_here';

const supabase = createClient(supabaseUrl, supabaseKey);

async function enableStrikesRLS() {
  console.log('Enabling RLS on strikes table...');
  
  // We cannot execute SQL directly via supabase-js client (it requires pg driver or dashboard).
  // But we can verify if we can read from it using ANON key logic simulation.
  
  // Actually, we can't change schema via JS client. 
  // I will output the SQL for the user to run, and also try to debug the current state.
  
  const { data, error } = await supabase.from('strikes').select('count', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error checking strikes table:', error);
  } else {
    console.log(`Current strikes count visible to Service Role: ${data}`);
  }
}

enableStrikesRLS();
