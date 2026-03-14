
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url_here';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_service_role_key_here';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDoodleData() {
  console.log('Fetching strike_doodles...');
  const { data: doodles, error: doodleError } = await supabase
    .from('strike_doodles')
    .select('*')
    .limit(20);

  if (doodleError) {
    console.error('Error fetching doodles:', doodleError);
  } else {
    console.log(`Found ${doodles?.length || 0} doodles.`);
    console.log(JSON.stringify(doodles, null, 2));
    
    if (doodles && doodles.length > 0) {
      // Pick one strike_id and fetch its strike details
      const strikeId = doodles[0].strike_id;
      console.log(`Fetching strike details for strike_id: ${strikeId}`);
      
      const { data: strike, error: strikeError } = await supabase
        .from('strikes')
        .select('*')
        .eq('id', strikeId)
        .single();
        
      if (strikeError) {
        console.error('Error fetching strike:', strikeError);
      } else {
        console.log('Strike details:', JSON.stringify(strike, null, 2));
        
        // Check how many strikes match this date + category
        console.log(`Checking for group strikes with date: ${strike.date}, category: ${strike.category}`);
        const { data: groupStrikes, error: groupError } = await supabase
            .from('strikes')
            .select('id, date, category, display_time, provider')
            .eq('date', strike.date)
            .eq('category', strike.category);
            
        if (groupError) {
             console.error('Error checking group:', groupError);
        } else {
             console.log(`Found ${groupStrikes?.length} strikes in this group:`);
             console.log(JSON.stringify(groupStrikes, null, 2));
        }
      }
    }
  }
}

checkDoodleData();
