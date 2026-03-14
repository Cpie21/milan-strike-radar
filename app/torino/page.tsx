import { createClient } from '@supabase/supabase-js';
import StrikeDashboard from '../../components/StrikeDashboard';

export const revalidate = 3600;

export default async function Page() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        return <StrikeDashboard strikesData={[]} regionTag="TORINO" />;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date();
    const lastYearSept1 = new Date(today.getFullYear() - 1, 8, 1);
    const startDateStr = new Date(lastYearSept1.getTime() - lastYearSept1.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const regionFilter = [
        'region.in.(TORINO,NATIONAL)',
        'region.ilike.%torino%',
        'region.ilike.%turin%',
        'region.eq.都灵',
        'region.eq.国家的',
        'region.ilike.%nazional%',
    ].join(',');

    const { data: strikes, error } = await supabase
        .from('strikes')
        .select('*')
        .gte('date', startDateStr)
        .or(regionFilter)
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching strikes:', error);
    }

    return <StrikeDashboard strikesData={strikes || []} regionTag="TORINO" />;
}
