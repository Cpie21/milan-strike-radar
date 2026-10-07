import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../lib/cities';
import { isIsoDate } from '../../../lib/romeDate';
import { runAsk, type Hints } from '../../../lib/ask/pipeline';
import { AiBudgetError } from '../../../lib/aiBudget';
import { BodyError, objectRecord, privateHash, readBoundedJson, requestIdentity, sharedLimit } from '../../../lib/apiGuard';
import { serverDatabase } from '../../../lib/strikeQuery';
import { requestAnalytics } from '../../../lib/serverAnalytics';
import { askResultProperties, stageProperties } from '../../../lib/analyticsContract';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const MODES = new Set(['TRAIN', 'SUBWAY', 'BUS', 'AIRPORT']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  let telemetry = requestAnalytics(null);
  const reject = (error: string, status: number) => {
    telemetry.capture('ai_query_rejected', { error_code: error, http_status: status }); telemetry.flush();
    return NextResponse.json({ error }, { status });
  };
  try {
    const body = await readBoundedJson(request, 8000);
    telemetry = requestAnalytics(body.analytics);
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 200) return reject('invalid_query', 400);
    const city = resolveCity(typeof body.city === 'string' ? body.city : 'MILANO')?.tag;
    if (!city) return reject('unsupported_city', 400);
    if (body.hints !== undefined && !objectRecord(body.hints)) return reject('invalid_hints', 400);
    const raw = objectRecord(body.hints) ? body.hints : {};
    if ((raw.date !== undefined && (typeof raw.date !== 'string' || !isIsoDate(raw.date))) ||
        (raw.range !== undefined && raw.range !== 'week' && raw.range !== 'upcoming') ||
        (raw.modes !== undefined && (!Array.isArray(raw.modes) || raw.modes.length > 4 || raw.modes.some(m => typeof m !== 'string' || !MODES.has(m))))) {
      return reject('invalid_hints', 400);
    }
    const hints = raw as Hints;
    const subject = requestIdentity(request);
    const limit = await sharedLimit('ask', subject);
    if (limit !== 'allowed') return reject(limit === 'limited' ? 'rate_limited' : 'unavailable', limit === 'limited' ? 429 : 503);
    if (body.refineToken !== undefined && body.refineToken !== null && (typeof body.refineToken !== 'string' || !UUID.test(body.refineToken))) return reject('invalid_refinement', 400);
    const requestId = randomUUID(); const db = serverDatabase();
    const { data: admission, error } = await db.rpc('acquire_ask_session', {
      subject_hash: subject, query_hash: privateHash('ask-query', `${city}|${query}`), request_id: requestId, refine_id: body.refineToken ?? null,
    });
    if (error || !objectRecord(admission)) return reject('unavailable', 503);
    if (admission.error || typeof admission.id !== 'string') return reject(admission.error === 'daily_limit' ? 'daily_limit' : 'invalid_refinement', admission.error === 'daily_limit' ? 429 : 400);
    telemetry.capture('ai_query_started', { region: city, is_refinement: !!body.refineToken });
    const sessionId = admission.id;
    const encoder = new TextEncoder(); let disconnected = false;
    const stream = new ReadableStream({
      cancel() { disconnected = true; telemetry.capture('ai_client_disconnected'); },
      async start(controller) {
        const send = (value: unknown) => { if (!disconnected) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
        try {
          const result = await runAsk(query, city, hints, value => {
            telemetry.capture('ai_stage_completed', stageProperties(value)); send(value);
          });
          const outcome = result.kind === 'clarify' ? 'clarify' : result.kind === 'out_of_scope' ? 'released' : 'answered';
          const finalized = await db.rpc('finish_ask_session', { session_id: sessionId, request_id: requestId, outcome });
          if (finalized.error || finalized.data !== true) throw new Error('Question session unavailable');
          telemetry.capture('ai_query_completed', { ...askResultProperties(result), client_disconnected: disconnected });
          send({ type: 'final', result, ...(result.kind === 'clarify' ? { refineToken: sessionId } : {}) });
        } catch (error) {
          telemetry.capture('ai_query_failed', { error_code: error instanceof AiBudgetError && error.reason === 'BUDGET_EXHAUSTED' ? 'budget' : 'unavailable', client_disconnected: disconnected });
          send({ type: 'error', error: error instanceof AiBudgetError && error.reason === 'BUDGET_EXHAUSTED' ? 'budget' : 'unavailable' });
          await db.rpc('finish_ask_session', { session_id: sessionId, request_id: requestId, outcome: 'released' });
        } finally { telemetry.flush(); if (!disconnected) controller.close(); }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reject(error instanceof BodyError ? error.code : 'unavailable', error instanceof BodyError ? error.status : 503);
  }
}
