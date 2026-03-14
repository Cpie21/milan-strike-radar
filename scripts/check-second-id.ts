
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_service_role_key_here';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSecondId() {
  const id = '08e44b33-9b26-4707-88ec-95cbea405a2f';
  console.log(`Checking strike ID: ${id}`);
  
  const { data: strike, error } = await supabase
    .from('strikes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Strike details:', JSON.stringify(strike, null, 2));
  }
}

checkSecondId();
