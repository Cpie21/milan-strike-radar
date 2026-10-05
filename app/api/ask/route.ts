import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../lib/cities';
import { runAsk, type Hints } from '../../../lib/ask/pipeline';

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
function overDaily(ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = daily.get(ip);
  const next = entry && entry.day === day ? { day, count: entry.count + 1 } : { day, count: 1 };
  daily.set(ip, next);
  if (daily.size > 20000) daily.clear();
  return next.count > DAILY_LIMIT;
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
  // Refinements (a picked date or mode) continue the same question.
  const refining = request.headers.get('x-ask-refine') === '1';
  if (!refining && overDaily(ip)) return NextResponse.json({ error: 'daily_limit' }, { status: 429 });

  let body: { query?: unknown; city?: unknown; hints?: Hints };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > MAX_QUERY) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
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
        const result = await runAsk(query, city, hints, send);
        send({ type: 'final', result });
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
