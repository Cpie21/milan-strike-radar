import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { reserveAiBudget, settleAiBudget } from '../aiBudget';

// Text not in the reader's language — Italian source wording, operator
// notices, and backend labels stored in Chinese — shown in theirs, with the
// original one tap away.
//
// Each text is cached on its own (hash of text + model + prompt version), so
// a new strike only sends the new texts. Misses within a page render are
// batched into one call, reserved against the shared AI budget first. A
// translation that loses or changes a clock time or a line code is rejected
// and the original is shown: translation must never change a fact.

export type Translation = { zh: string; en: string };

const MODEL = 'google/gemini-3.5-flash-lite';
const VERSION = 'v2';
const PROMPT = [
  'You translate public-transport strike notices for travellers.',
  'Each value is Italian or Chinese. Give it in Simplified Chinese (zh) and English (en); if a value is already in one of them, keep that one as is.',
  'Glossary: SOC./SOCC. = società (company); PERSONALE = staff; GRUPPO = group; MODALITA\' = arrangements; FINE/TERMINE DEL SERVIZIO = end of service;',
  'Provinciale = provincial; Regionale = regional; Nazionale = national; Lombardia = 伦巴第 / Lombardy.',
  'Keep company and union names as they are (ATM, Trenord, USB…). Write clock times as HH:MM digits (8:45 → 08:45, 15 → 15:00). Keep line codes (M1, S9, R28) and dates exactly.',
  'Use sentence case in English, never all caps. Return only JSON: {"<id>": {"zh": "...", "en": "..."}}.',
].join(' ');

// Facts that must survive: clock times (normalised) and line codes.
const clocks = (t: string) => [...t.matchAll(/(\d{1,2})[:.](\d{2})/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
const lineCodes = (t: string) => [...t.toUpperCase().matchAll(/\b(M[1-5]|S\d{1,2}|RE?\d{1,2})\b/g)].map(m => m[1]);
export function keepsFacts(source: string, out: string) {
  const oc = clocks(out), ol = lineCodes(out);
  return clocks(source).every(c => oc.includes(c)) && lineCodes(source).every(l => ol.includes(l));
}

async function callModel(texts: string[]): Promise<Record<string, Translation>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('no key');
  const budget = await reserveAiBudget('translate', `tr:${Date.now()}:${texts.length}`, 400 + texts.join('').length * 3);
  if (!budget.ok) throw new Error('budget');
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
  await settleAiBudget(budget, typeof json.usage?.cost === 'number' ? json.usage.cost : null);
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}') as Record<string, Translation>;
  const out: Record<string, Translation> = {};
  texts.forEach((t, i) => {
    const v = parsed[String(i)];
    if (v?.zh && v?.en && keepsFacts(t, v.zh) && keepsFacts(t, v.en)) out[t] = { zh: v.zh, en: v.en };
  });
  return out;
}

// Batch every cache miss of one render into a single call.
let pending: { text: string; resolve: (t: Translation | null) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
function queue(text: string) {
  return new Promise<Translation | null>(resolve => {
    pending.push({ text, resolve });
    if (!timer) timer = setTimeout(async () => {
      const batch = pending; pending = []; timer = null;
      try {
        const result = await callModel(batch.map(b => b.text));
        batch.forEach(b => b.resolve(result[b.text] ?? null));
      } catch (error) {
        console.error('[lab translate]', error instanceof Error ? error.message : error);
        batch.forEach(b => b.resolve(null));
      }
    }, 0);
  });
}

async function translateOne(text: string): Promise<Translation | null> {
  const hash = createHash('sha256').update(`${MODEL}|${VERSION}|${text}`).digest('hex').slice(0, 32);
  try {
    // Throwing keeps a failure out of the cache, so it is retried next time.
    return await unstable_cache(async () => { const t = await queue(text); if (!t) throw new Error('miss'); return t; }, ['lab-tr', hash], { revalidate: 30 * 86400 })();
  } catch { return null; }
}

export async function translateAll(texts: string[]): Promise<Record<string, Translation>> {
  const unique = [...new Set(texts.map(t => t?.trim()).filter((t): t is string => !!t && t.length > 1))];
  const done = await Promise.all(unique.map(async t => [t, await translateOne(t)] as const));
  return Object.fromEntries(done.filter(([, v]) => v).map(([k, v]) => [k, v!]));
}
