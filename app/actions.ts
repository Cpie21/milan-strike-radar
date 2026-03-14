'use server'

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
        auth: {
            persistSession: false
        },
        global: {
            headers: { 'Cache-Control': 'no-store' }
        }
    }
);

export async function submitDoodle(strikeId: string, clientUuid: string, date?: string, category?: string, displayTime?: string, region?: string) {
    return submitDoodleByGroup(strikeId, clientUuid, date, category, displayTime, region);
}

function buildDoodleGroupKey(date?: string, category?: string, displayTime?: string, region?: string) {
    if (!date || !category) return '';
    const normalizedRegion = region || 'MILANO';
    const normalizedDisplayTime = category === 'AIRPORT' ? (displayTime || '') : '';
    return `${date}|${normalizedRegion}|${category}|${normalizedDisplayTime}`;
}

async function resolveGroupStrikeIds(strikeId: string, date?: string, category?: string, displayTime?: string, region?: string) {
    if (!date || !category) return [strikeId];
    let query = supabase
        .from('strikes')
        .select('id')
        .eq('date', date)
        .eq('category', category);
    if (region) {
        query = query.in('region', [region, 'NATIONAL']);
    }
    if (category === 'AIRPORT' && displayTime) {
        query = query.eq('display_time', displayTime);
    }
    const { data, error } = await query;
    if (error || !data || data.length === 0) return [strikeId];
    return data.map((r: any) => r.id).filter(Boolean);
}

export async function submitDoodleByGroup(strikeId: string, clientUuid: string, date?: string, category?: string, displayTime?: string, region?: string) {
    try {
        const groupKey = buildDoodleGroupKey(date, category, displayTime, region);
        if (groupKey) {
            const { error } = await supabase
                .from('strike_doodles')
                .insert([{ strike_id: null, group_key: groupKey, client_uuid: clientUuid }]);

            if (!error) {
                return { success: true };
            }

            if (error.code === '23505') {
                return { success: false, error: 'Already doodled' };
            }

            const maybeSchemaGap = `${error.message} ${error.details || ''}`.toLowerCase();
            if (!maybeSchemaGap.includes('group_key') && !maybeSchemaGap.includes('null value in column "strike_id"')) {
                console.error('Doodle insert error', error);
                return { success: false, error: error.message };
            }
        }

        const ids = await resolveGroupStrikeIds(strikeId, date, category, displayTime, region);
        const canonicalStrikeId = ids.slice().sort()[0] || strikeId;
        const { error } = await supabase
            .from('strike_doodles')
            .insert([{ strike_id: canonicalStrikeId, client_uuid: clientUuid }]);

        if (error) {
            // Uniqueness violation is usually code '23505'
            if (error.code === '23505') {
                return { success: false, error: 'Already doodled' };
            }
            console.error('Doodle insert error', error);
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err: any) {
        console.error('Doodle submission failed entirely (table likely missing):', err);
        return { success: false, error: err.message };
    }
}

export async function getDoodleCount(strikeId: string, date?: string, category?: string, displayTime?: string, region?: string) {
    return getDoodleCountByGroup(strikeId, date, category, displayTime, region);
}

export async function getDoodleCountByGroup(strikeId: string, date?: string, category?: string, displayTime?: string, region?: string) {
    try {
        const groupKey = buildDoodleGroupKey(date, category, displayTime, region);
        if (groupKey) {
            const { count, error } = await supabase
                .from('strike_doodles')
                .select('*', { count: 'exact', head: true })
                .eq('group_key', groupKey);

            if (!error) {
                return count || 0;
            }
        }

        const ids = await resolveGroupStrikeIds(strikeId, date, category, displayTime, region);
        const { count, error } = await supabase
            .from('strike_doodles')
            .select('*', { count: 'exact', head: true })
            .in('strike_id', ids);

        if (error) {
            // Probably table doesn't exist yet before migration
            return 0;
        }
        return count || 0;
    } catch (err) {
        return 0;
    }
}

export async function submitFeedback(content: string, nickname?: string) {
    try {
        const { error } = await supabase
            .from('feedback')
            .insert([{ content, nickname }]);
        if (error) {
            console.error('Feedback submission error', error);
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err: any) {
        console.error('Feedback submission failed:', err);
        return { success: false, error: err.message };
    }
}
