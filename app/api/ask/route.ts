import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../lib/cities';
import { isIsoDate } from '../../../lib/romeDate';
import { runAsk, type Hints } from '../../../lib/ask/pipeline';
import { AiBudgetError } from '../../../lib/aiBudget';
import { BodyError, objectRecord, privateHash, readBoundedJson, requestIdentity, sharedLimit } from '../../../lib/apiGuard';
import { serverDatabase } from '../../../lib/strikeQuery';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const MODES = new Set(['TRAIN', 'SUBWAY', 'BUS', 'AIRPORT']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson(request, 8000);
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 200) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
    const city = resolveCity(typeof body.city === 'string' ? body.city : 'MILANO')?.tag;
    if (!city) return NextResponse.json({ error: 'unsupported_city' }, { status: 400 });
    if (body.hints !== undefined && !objectRecord(body.hints)) return NextResponse.json({ error: 'invalid_hints' }, { status: 400 });
    const raw = objectRecord(body.hints) ? body.hints : {};
    if ((raw.date !== undefined && (typeof raw.date !== 'string' || !isIsoDate(raw.date))) ||
        (raw.range !== undefined && raw.range !== 'week' && raw.range !== 'upcoming') ||
        (raw.modes !== undefined && (!Array.isArray(raw.modes) || raw.modes.length > 4 || raw.modes.some(m => typeof m !== 'string' || !MODES.has(m))))) {
      return NextResponse.json({ error: 'invalid_hints' }, { status: 400 });
    }
    const hints = raw as Hints;
    const subject = requestIdentity(request);
    const limit = await sharedLimit('ask', subject);
    if (limit !== 'allowed') return NextResponse.json({ error: limit === 'limited' ? 'rate_limited' : 'unavailable' }, { status: limit === 'limited' ? 429 : 503 });
    if (body.refineToken !== undefined && body.refineToken !== null && (typeof body.refineToken !== 'string' || !UUID.test(body.refineToken))) return NextResponse.json({ error: 'invalid_refinement' }, { status: 400 });
    const requestId = randomUUID(); const db = serverDatabase();
    const { data: admission, error } = await db.rpc('acquire_ask_session', {
      subject_hash: subject, query_hash: privateHash('ask-query', `${city}|${query}`), request_id: requestId, refine_id: body.refineToken ?? null,
    });
    if (error || !objectRecord(admission)) return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    if (admission.error || typeof admission.id !== 'string') return NextResponse.json({ error: admission.error || 'unavailable' }, { status: admission.error === 'daily_limit' ? 429 : 400 });
    const sessionId = admission.id;
    const encoder = new TextEncoder(); let disconnected = false;
    const stream = new ReadableStream({
      cancel() { disconnected = true; },
      async start(controller) {
        const send = (value: unknown) => { if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
        try {
          const result = await runAsk(query, city, hints, send);
          const outcome = result.kind === 'clarify' ? 'clarify' : result.kind === 'out_of_scope' ? 'released' : 'answered';
          const finalized = await db.rpc('finish_ask_session', { session_id: sessionId, request_id: requestId, outcome });
          if (finalized.error || finalized.data !== true) throw new Error('Question session unavailable');
          send({ type: 'final', result, ...(result.kind === 'clarify' ? { refineToken: sessionId } : {}) });
        } catch (error) {
          send({ type: 'error', error: error instanceof AiBudgetError && error.reason === 'BUDGET_EXHAUSTED' ? 'budget' : 'unavailable' });
          await db.rpc('finish_ask_session', { session_id: sessionId, request_id: requestId, outcome: 'released' });
        } finally { if (!disconnected) controller.close(); }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BodyError ? error.code : 'unavailable' }, { status: error instanceof BodyError ? error.status : 503 });
  }
}
