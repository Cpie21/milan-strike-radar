import { createClient } from '@supabase/supabase-js';
import { resolveCity } from './cities';
import { unstable_cache } from 'next/cache';
import { syncHealth } from './syncHealth';

export function serverDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing server Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function romeToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const cachedCityStrikes = unstable_cache(async (tag: string, startDate: string) => {
  const city = resolveCity(tag);
  if (!city) throw new Error('Unsupported city');
  const aliases = [...new Set([city.tag, city.slug, city.en, city.en.toLowerCase(), city.zh, 'NATIONAL', '国家的', 'nazionale'])];
  const db = serverDatabase();
  const records = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await db.from('strikes').select('id,date,category,provider,region,status,display_time,duration_hours,strike_windows,guarantee_windows,affected_lines,data_source,source_url,source_key,timing_evidence').gte('date', startDate).in('region', aliases).neq('status', 'STALE').order('date').order('id').range(offset, offset + 999);
    if (error) throw new Error(`Cannot read strikes: ${error.message}`);
    records.push(...(data || []));
    if (!data || data.length < 1000) return records;
  }
  throw new Error('Strike query exceeded pagination bound; refusing to return truncated data');
}, ['city-strikes-v3'], { revalidate: 600, tags: ['strikes'] });

// Validate freshness outside the cache: a failed background refresh must not
// allow stale cached data to masquerade as a healthy synchronization.
export async function readCityStrikes(tag: string, startDate: string) {
  const db = serverDatabase();
  const [latest, success] = await Promise.all([
    db.from('strike_sync_runs').select('status,started_at').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('strike_sync_runs').select('completed_at').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (latest.error || success.error || !syncHealth(latest.data, success.data?.completed_at).healthy) throw new Error('Strike synchronization is unavailable or outdated');
  return cachedCityStrikes(tag, startDate);
}
