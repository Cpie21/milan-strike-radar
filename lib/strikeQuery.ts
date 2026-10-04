import { createClient } from '@supabase/supabase-js';
import { resolveCity } from './cities';

export function serverDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing server Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function romeToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function readCityStrikes(tag: string, startDate: string) {
  const city = resolveCity(tag);
  if (!city) throw new Error('Unsupported city');
  const aliases = [...new Set([city.tag, city.slug, city.en, city.en.toLowerCase(), city.zh, 'NATIONAL', '国家的', 'nazionale'])];
  const { data, error } = await serverDatabase().from('strikes').select('id,date,category,provider,region,status,display_time,duration_hours,strike_windows,guarantee_windows,affected_lines,data_source').gte('date', startDate).in('region', aliases).order('date');
  if (error) throw new Error(`Cannot read strikes: ${error.message}`);
  return data || [];
}
