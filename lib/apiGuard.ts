import { createHmac } from 'node:crypto';
import { serverDatabase } from './strikeQuery';
export class BodyError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export function objectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
// Bound the incoming byte stream before decoding/parsing, including chunked bodies.
export async function readBoundedJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new BodyError(413, 'too_large');
  if (!request.body) throw new BodyError(400, 'invalid_json');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new BodyError(413, 'too_large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!objectRecord(data)) throw new BodyError(400, 'invalid_json');
    return data;
  } catch (error) { if (error instanceof BodyError) throw error; throw new BodyError(400, 'invalid_json'); }
  finally { reader.releaseLock(); }
}
export function privateHash(namespace: string, value: string): string {
  const secret = process.env.FEEDBACK_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Private identity unavailable');
  return createHmac('sha256', secret).update(`${namespace}|${value}`).digest('hex');
}
export function requestIdentity(request: Request): string {
  // Vercel overwrites x-forwarded-for. Do not accept client-selected IDs for quotas.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  return privateHash('api-ip', ip);
}
export async function sharedLimit(bucket: string, subjectHash: string): Promise<'allowed' | 'limited' | 'unavailable'> {
  try {
    const { data, error } = await serverDatabase().rpc('consume_api_limit', { bucket, subject_hash: subjectHash });
    return error || typeof data !== 'boolean' ? 'unavailable' : data ? 'allowed' : 'limited';
  } catch { return 'unavailable'; }
}
