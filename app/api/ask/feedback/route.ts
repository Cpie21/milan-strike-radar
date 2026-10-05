import { NextRequest, NextResponse } from 'next/server';
import { serverDatabase } from '../../../../lib/strikeQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Good/bad ratings on Ask answers, kept as an evaluation set: the question,
// how it was read and what was shown, so a bad case can be replayed.
// Stored as structured JSON in `ask_feedback` (migration
// 20261006090000_ask_feedback.sql). A failed write is reported as a failure
// so the client can let the user retry; nothing is claimed as saved.

const MAX_BYTES = 32_000;
const REASONS = new Set(['misread', 'wrong', 'missing', 'irrelevant', 'other']);
const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 20;
};

// Keep only what a replay needs, and only in known shapes.
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const pick = (value: unknown, keys: string[]): Record<string, Json> =>
  value && typeof value === 'object' ? Object.fromEntries(keys.filter(k => k in value).map(k => [k, (value as Record<string, Json>)[k]])) : {};
function summariseAnswer(answer: unknown) {
  const a = pick(answer, ['kind', 'view', 'level', 'unchecked', 'range', 'place']);
  const raw = answer as { matches?: unknown[]; understanding?: unknown } | null;
  return {
    ...a,
    understanding: pick(raw?.understanding, ['intent', 'scope', 'time', 'city', 'modes', 'lines']),
    matches: (Array.isArray(raw?.matches) ? raw!.matches : []).slice(0, 12).map(m => pick(m, ['key', 'date', 'category', 'provider', 'status', 'display', 'relevance', 'reason', 'impact', 'overlap'])),
  };
}
function summariseTrace(trace: unknown) {
  return (Array.isArray(trace) ? trace : []).slice(0, 6).map(t => ({
    ...pick(t, ['id', 'ms']),
    facts: (Array.isArray((t as { facts?: unknown[] })?.facts) ? (t as { facts: unknown[] }).facts : []).slice(0, 20).map(f => pick(f, ['label', 'value', 'by', 'p'])),
  }));
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limited(ip)) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }
  const rating = body.rating === 'good' || body.rating === 'bad' ? body.rating : null;
  const query = typeof body.query === 'string' ? body.query.slice(0, 200) : '';
  if (!rating || !query) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  const row = {
    rating,
    reason: typeof body.reason === 'string' && REASONS.has(body.reason) ? body.reason : null,
    query,
    city: typeof body.city === 'string' ? body.city.slice(0, 20) : null,
    answer: summariseAnswer(body.answer),
    trace: summariseTrace(body.trace),
    client: 'lab',
  };
  const { error } = await serverDatabase().from('ask_feedback').insert([row]);
  if (error) {
    console.error('[ask-feedback] not stored:', error.code || error.message);
    return NextResponse.json({ ok: false, error: 'not_stored' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
