import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../lib/cities';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { runAsk, type Hints } from '../../../lib/ask/pipeline';
import { reserveAiBudget, settleAiBudget } from '../../../lib/aiBudget';

// A refinement (picking a date or mode after a clarify) continues the same
// question and doesn't count against the daily allowance, but only with the
// token the server issued for that question: a header alone proves nothing.
const SECRET = process.env.ASK_REFINE_SECRET || process.env.FEEDBACK_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';
const refineToken = (ip: string, query: string) => createHmac('sha256', SECRET).update(`${ip}|${query}|${new Date().toISOString().slice(0, 10)}`).digest('base64url');
const validRefine = (token: unknown, ip: string, query: string) => {
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token), b = Buffer.from(refineToken(ip, query));
  return a.length === b.length && timingSafeEqual(a, b);
};
// One understanding call plus up to eight judgements; a ceiling per question.
const ASK_RESERVE_MICRO_USD = 9 * 2000;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_QUERY = 200;
const WINDOW_MS = 60_000;
const LIMIT = 8;
// Best effort per instance; a shared store is needed for a hard global limit.
const hits = new Map<string, number[]>();

// Daily cap per IP, matching the UI's allowance with slack for shared
// networks. Also per instance; the shared AI budget (AI_HANDOFF) is the
// real ceiling.
const DAILY_LIMIT = 12;
const daily = new Map<string, { day: string; count: number }>();
// Only answered questions count: a failure or a refusal never uses one up.
function usedToday(ip: string) {
  const entry = daily.get(ip);
  return entry && entry.day === new Date().toISOString().slice(0, 10) ? entry.count : 0;
}
function countAnswer(ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  daily.set(ip, { day, count: usedToday(ip) + 1 });
  if (daily.size > 20000) daily.clear();
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (rateLimited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let body: { query?: unknown; city?: unknown; hints?: Hints; refineToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > MAX_QUERY) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  const refining = validRefine(body.refineToken, ip, query);
  if (!refining && usedToday(ip) >= DAILY_LIMIT) return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  const city = resolveCity(typeof body.city === 'string' ? body.city : 'MILANO')?.tag;
  if (!city) return NextResponse.json({ error: 'unsupported_city' }, { status: 400 });
  const hints: Hints = {
    date: typeof body.hints?.date === 'string' ? body.hints.date : undefined,
    range: body.hints?.range === 'week' || body.hints?.range === 'upcoming' ? body.hints.range : undefined,
    modes: Array.isArray(body.hints?.modes) ? body.hints.modes.slice(0, 4) : undefined,
  };

  // NDJSON: one line per finished stage, then the final result.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      try {
        const budget = await reserveAiBudget('ask', `ask:${refineToken(ip, query).slice(0, 16)}:${Date.now()}`, ASK_RESERVE_MICRO_USD);
        if (!budget.ok) { send({ type: 'error', error: 'budget' }); return; }
        const result = await runAsk(query, city, hints, send);
        await settleAiBudget(budget, 'cost' in result ? (result as { cost: number }).cost : null);
        if (!refining) countAnswer(ip);
        send({ type: 'final', result, refineToken: refineToken(ip, query) });
      } catch (error) {
        console.error('[ask] failed:', error instanceof Error ? error.message : error);
        send({ type: 'error', error: 'unavailable' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
