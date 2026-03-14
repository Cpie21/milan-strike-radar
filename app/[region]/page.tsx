import { createClient } from '@supabase/supabase-js';
import StrikeDashboard from '../../components/StrikeDashboard';

export const revalidate = 3600; // Cache for 1 hour, or revalidate on demand

const REGION_SLUG_MAP: Record<string, string> = {
    milano: 'MILANO',
    milan: 'MILANO',
    roma: 'ROMA',
    rome: 'ROMA',
    torino: 'TORINO',
    turin: 'TORINO',
};

const REGION_FILTER_MAP: Record<string, string> = {
    MILANO: [
        'region.in.(MILANO,NATIONAL)',
        'region.ilike.%milan%',
        'region.eq.米兰',
    ].join(','),
    ROMA: [
        'region.in.(ROMA,NATIONAL)',
        'region.ilike.%roma%',
        'region.ilike.%rome%',
        'region.eq.罗马',
    ].join(','),
    TORINO: [
        'region.in.(TORINO,NATIONAL)',
        'region.ilike.%torino%',
        'region.ilike.%turin%',
        'region.eq.都灵',
    ].join(','),
};

export default async function Page({ params }: { params: { region: string } }) {
    // Use service role key server-side (safe — this is a Server Component)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        return <StrikeDashboard strikesData={[]} />;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch strikes starting from Sept 1st of last year
    const today = new Date();
    const lastYearSept1 = new Date(today.getFullYear() - 1, 8, 1);
    const startDateStr = new Date(lastYearSept1.getTime() - lastYearSept1.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const regionTag = REGION_SLUG_MAP[(params?.region || '').toLowerCase()] || 'MILANO';
    const regionFilter = REGION_FILTER_MAP[regionTag] || REGION_FILTER_MAP.MILANO;

    const { data: strikes, error } = await supabase
        .from('strikes')
        .select('*')
        .gte('date', startDateStr)
        .or(regionFilter)
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching strikes:', error);
    }

    const rawStrikes = strikes || [];

    return <StrikeDashboard strikesData={rawStrikes} regionTag={regionTag} />;
}
