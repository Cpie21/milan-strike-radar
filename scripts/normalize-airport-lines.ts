import { createClient } from '@supabase/supabase-js';
import {
  canonicalizeRegionValue,
  inferRegionTagFromText,
  normalizeAirportAffectedLines,
  normalizeProviderList,
  sanitizeAffectedLines,
} from '../lib/strikeNormalization';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const deeplKey = process.env.DEEPL_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase env vars');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const TRANSPORT_CATEGORIES = new Set(['TRAIN', 'SUBWAY', 'BUS', 'AIRPORT']);

async function translateText(text: string): Promise<string> {
  if (!text || !text.trim() || !deeplKey) return text;

  const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
  const params = new URLSearchParams();
  params.append('auth_key', deeplKey);
  params.append('text', text);
  params.append('target_lang', 'ZH');

  const res = await fetch(url, { method: 'POST', body: params });
  if (!res.ok) return text;

  const json = await res.json();
  return json?.translations?.[0]?.text || text;
}

function normalizeRegion(region: string, provider: string, affectedLines: string[]) {
  const explicit = canonicalizeRegionValue(region || '');
  const inferred = inferRegionTagFromText(`${provider || ''} ${(affectedLines || []).join(' ')}`);

  if (!explicit) return inferred || 'OTHER';
  if (inferred && inferred !== explicit && inferred !== 'NATIONAL') return inferred;
  return explicit;
}

async function normalizeProvider(provider: string) {
  const translated = await translateText(provider || '');
  return normalizeProviderList(provider || '', translated).join(' / ') || '相关人员';
}

function normalizeLines(category: string | null, provider: string, region: string, lines: string[]) {
  if (category === 'AIRPORT') {
    const normalized = normalizeAirportAffectedLines(lines || [], {
      contextText: `${provider || ''} ${(lines || []).join(' ')}`,
      regionTag: region,
    });
    return normalized.length > 0 ? normalized : ['全国相关机场'];
  }

  const normalized = sanitizeAffectedLines(lines || []).filter((line) => !line.includes('语言环境'));
  return normalized.length > 0 ? normalized : ['全部线路'];
}

async function run() {
  console.log('Fetching transport strikes...');
  const { data: strikes, error } = await supabase
    .from('strikes')
    .select('id, date, provider, affected_lines, category, region, display_time')
    .order('date', { ascending: true });

  if (error || !strikes) {
    console.error('Error fetching strikes:', error);
    return;
  }

  let updated = 0;
  for (const strike of strikes) {
    if (strike.category && !TRANSPORT_CATEGORIES.has(strike.category)) continue;

    const normalizedProvider = await normalizeProvider(strike.provider || '');
    const normalizedRegion = normalizeRegion(strike.region || '', strike.provider || '', strike.affected_lines || []);
    const normalizedLines = normalizeLines(strike.category, strike.provider || '', normalizedRegion, strike.affected_lines || []);

    const needsUpdate =
      normalizedProvider !== (strike.provider || '') ||
      normalizedRegion !== (strike.region || '') ||
      JSON.stringify(normalizedLines) !== JSON.stringify(strike.affected_lines || []);

    if (!needsUpdate) continue;

    const { error: updateError } = await supabase
      .from('strikes')
      .update({
        provider: normalizedProvider,
        region: normalizedRegion,
        affected_lines: normalizedLines,
      })
      .eq('id', strike.id);

    if (updateError) {
      console.error('Update failed:', strike.id, updateError.message);
      continue;
    }

    updated += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`Done. Updated ${updated} rows.`);
}

run().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
