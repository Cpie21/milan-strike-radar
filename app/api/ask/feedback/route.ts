import { ANALYTICS_VERSION, readAnalyticsContext } from '../../../../lib/analyticsContract';
import { requestAnalytics } from '../../../../lib/serverAnalytics';
import { NextRequest, NextResponse } from 'next/server';
import { resolveCity } from '../../../../lib/cities';
import { BodyError, objectRecord, readBoundedJson, requestIdentity, sharedLimit } from '../../../../lib/apiGuard';
import { serverDatabase } from '../../../../lib/strikeQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Good/bad ratings on Ask answers, kept as an evaluation set: the question,
// how it was read and what was shown, so a bad case can be replayed.
// Stored as structured JSON in `ask_feedback` (migration
// 20261006081821_shared_backend_services.sql). A failed write is reported as a failure
// so the client can let the user retry; nothing is claimed as saved.

const MAX_BYTES = 32_000;
const REASONS = new Set(['misread', 'wrong', 'missing', 'irrelevant', 'other']);
// Keep only what a replay needs, and only in known shapes.
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const safeJson = (value: unknown, depth = 0): Json => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth >= 4) return null;
  if (Array.isArray(value)) return value.slice(0, 24).map(v => safeJson(v, depth + 1));
  if (objectRecord(value)) return Object.fromEntries(Object.entries(value).slice(0, 24).map(([k,v]) => [k.slice(0, 64), safeJson(v, depth + 1)]));
  return null;
};
const pick = (value: unknown, keys: string[]): Record<string, Json> =>
  objectRecord(value) ? Object.fromEntries(keys.filter(k => k in value).map(k => [k, safeJson(value[k])])) : {};
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
  let body: Record<string, unknown>;
  try { body = await readBoundedJson(request, MAX_BYTES); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof BodyError ? error.code : 'invalid_json' }, { status: error instanceof BodyError ? error.status : 400 }); }
  const telemetry = requestAnalytics(body.analytics);
  const respond = (error: string | null, status: number) => {
    telemetry.capture(error ? 'ai_feedback_store_failed' : 'ai_feedback_stored', {
      rating: body.rating === 'good' ? 'good' : body.rating === 'bad' ? 'bad' : 'invalid',
      reason: typeof body.reason === 'string' && REASONS.has(body.reason) ? body.reason : null,
      error_code: error, http_status: status,
    });
    telemetry.flush();
    return NextResponse.json(error ? { ok: false, error } : { ok: true }, { status });
  };
  const rating = body.rating === 'good' || body.rating === 'bad' ? body.rating : null;
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!rating || !query || query.length > 200 || (body.reason !== undefined && body.reason !== null && (typeof body.reason !== 'string' || !REASONS.has(body.reason)))) return respond('invalid', 400);
  const city = typeof body.city === 'string' ? resolveCity(body.city)?.tag : null;
  if (body.city !== undefined && body.city !== null && !city) return respond('unsupported_city', 400);
  try {
    const limit = await sharedLimit('ask_feedback', requestIdentity(request));
    if (limit !== 'allowed') return respond(limit === 'limited' ? 'rate_limited' : 'not_stored', limit === 'limited' ? 429 : 503);
    const row = {
      rating,
      reason: typeof body.reason === 'string' && REASONS.has(body.reason) ? body.reason : null,
      query,
      city,
      answer: { ...summariseAnswer(body.answer), ...(readAnalyticsContext(body.analytics) ? { analytics: { requestId: telemetry.id, version: ANALYTICS_VERSION } } : {}) },
      trace: summariseTrace(body.trace),
      client: 'lab',
    };
    if (Buffer.byteLength(JSON.stringify(row.answer)) > 18000 || Buffer.byteLength(JSON.stringify(row.trace)) > 9000) return respond('too_large', 413);
    const { error } = await serverDatabase().from('ask_feedback').insert([row]);
    if (error) {
      console.error('[ask-feedback] not stored:', error.code || error.message);
      return respond('not_stored', 503);
    }
    return respond(null, 200);
  } catch { return respond('not_stored', 503); }
}
