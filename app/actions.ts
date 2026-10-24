'use server'

import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';
import { serverDatabase } from '../lib/strikeQuery';
import { validateFeedback } from '../lib/feedback';

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
    const input = validateFeedback(content, nickname);
    if (!input) return { success: false, error: '请输入 1–1000 字的反馈，昵称最多 60 字。' };
    try {
        const db = serverDatabase();
        const requestHeaders = await headers();
        // Vercel overwrites this header at its trusted ingress; do not trust
        // client-supplied x-forwarded-for values or device IDs for feedback.
        const ip = requestHeaders.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const identity = createHmac('sha256', process.env.FEEDBACK_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex');
        const { data: allowed, error: limitError } = await db.rpc('consume_feedback_limit', { identity_key: identity });
        if (limitError || !allowed) return { success: false, error: '提交过于频繁或服务暂时不可用，请稍后重试。' };
        const { error } = await db
            .from('feedback')
            .insert([input]);
        if (error) {
            console.error('Feedback submission error', error);
            return { success: false, error: '反馈提交失败，请稍后重试。' };
        }
        return { success: true };
    } catch (err: unknown) {
        console.error('Feedback submission failed:', err);
        return { success: false, error: '反馈提交失败，请稍后重试。' };
    }
}
