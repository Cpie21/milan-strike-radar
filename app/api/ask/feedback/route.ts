import { NextRequest, NextResponse } from 'next/server';
import { serverDatabase } from '../../../../lib/strikeQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Good/bad ratings on Ask answers, kept as an evaluation set. Each row
// carries the question, how it was understood and what was shown, so a bad
// case can be replayed. Writes to `ask_feedback` (schema in AI_HANDOFF);
// until that table exists, the row is logged instead of being lost.

const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 20;
};

const REASONS = new Set(['misread', 'wrong', 'missing', 'irrelevant', 'other']);

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const rating = body.rating === 'good' || body.rating === 'bad' ? body.rating : null;
  const query = typeof body.query === 'string' ? body.query.slice(0, 200) : '';
  if (!rating || !query) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const row = {
    rating,
    reason: typeof body.reason === 'string' && REASONS.has(body.reason) ? body.reason : null,
    query,
    city: typeof body.city === 'string' ? body.city.slice(0, 20) : null,
    answer: JSON.stringify(body.answer ?? null).slice(0, 20000),
    trace: JSON.stringify(body.trace ?? null).slice(0, 8000),
    client: 'lab',
  };
  const { error } = await serverDatabase().from('ask_feedback').insert([row]);
  if (error) console.log('[ask-feedback]', JSON.stringify({ ...row, storeError: error.code || error.message }));
  return NextResponse.json({ ok: true });
}
