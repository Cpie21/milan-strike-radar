import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';

// Text not in the reader's language — Italian source wording, operator
// notices, and backend labels stored in Chinese — shown in theirs, with the
// original one tap away. One batched call per new set of texts, cached for
// a week; on any failure the original is shown.
// Lab-side for now — the sync pipeline should store these once (AI_HANDOFF).

export type Translation = { zh: string; en: string };

const MODEL = 'google/gemini-3.5-flash-lite';
const PROMPT = [
  'You translate public-transport strike notices for travellers.',
  'Each value is Italian or Chinese. Give it in Simplified Chinese (zh) and English (en); if a value is already in one of them, keep that one as is.',
  'Glossary: SOC./SOCC. = società (company); PERSONALE = staff; GRUPPO = group; MODALITA\' = arrangements; FINE/TERMINE DEL SERVIZIO = end of service;',
  'Provinciale = provincial; Regionale = regional; Nazionale = national; Lombardia = 伦巴第 / Lombardy.',
  'Keep company and union names as they are (ATM, Trenord, USB…). Write clock times as HH:MM digits (8:45 → 08:45, 15 → 15:00).',
  'Use sentence case in English, never all caps. Return only JSON: {"<id>": {"zh": "...", "en": "..."}}.',
].join(' ');

async function callModel(texts: string[]): Promise<Record<string, Translation>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('no key');
  const input = Object.fromEntries(texts.map((t, i) => [String(i), t]));
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: JSON.stringify(input) }] }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`translate HTTP ${response.status}`);
  const json = await response.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}') as Record<string, Translation>;
  const out: Record<string, Translation> = {};
  texts.forEach((t, i) => { const v = parsed[String(i)]; if (v?.zh && v?.en) out[t] = { zh: v.zh, en: v.en }; });
  if (!Object.keys(out).length) throw new Error('empty translation');
  return out;
}

export async function translateAll(texts: string[]): Promise<Record<string, Translation>> {
  const unique = [...new Set(texts.map(t => t.trim()).filter(t => t.length > 1))].sort();
  if (!unique.length) return {};
  const hash = createHash('sha256').update(unique.join('\u0000')).digest('hex').slice(0, 24);
  try {
    // Throwing inside keeps failures out of the cache.
    return await unstable_cache(() => callModel(unique), ['lab-translate', hash], { revalidate: 7 * 86400 })();
  } catch (error) {
    console.error('[lab translate]', error instanceof Error ? error.message : error);
    return {};
  }
}
