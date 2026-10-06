import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { serverDatabase } from '../../../../lib/strikeQuery';
import { assignSlot } from '../../../../components/lab/wall/slots';
import { PALETTE } from '../../../../components/lab/graffitiStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The shared graffiti wall (table `lab_graffiti`, migration
// 20261007090000_lab_graffiti.sql).
//   GET  ?key=…                      → everyone's pieces, oldest first
//   POST {action:'claim', key, deviceId, slots}  → your panel and colour
//   POST {action:'save', key, deviceId, strokes} → your piece, once
// Panels are given out by the same rule as the client preview
// (components/lab/wall/slots.ts): the first free panel centre-out, spread
// among the first three by a hash of the person, the oldest repainted when
// the wall is full. Claims are per person (primary key), so a person keeps
// their panel. Two people claiming at the same instant may share a panel;
// that reads as two pieces overlapping, as on a real wall.
// Until the table exists every call answers {available:false} and the
// client keeps the wall on the device.

const SECRET = process.env.ASK_REFINE_SECRET || process.env.FEEDBACK_RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev';
const holderOf = (deviceId: string) => createHmac('sha256', SECRET).update(`graffiti|${deviceId}`).digest('hex').slice(0, 32);
const colourOf = (holder: string) => PALETTE[parseInt(holder.slice(0, 8), 16) % PALETTE.length];
const KEY = /^doodled_[A-Z_]{2,20}\|\d{4}-\d{2}-\d{2}\|[A-Z]{3,8}\|[0-9:\- ]{0,20}$/;
const MAX_STROKES = 80, MAX_POINTS = 4000;

const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
};
const missing = (error: { code?: string; message?: string } | null) => !!error && /PGRST205|42P01|schema cache/i.test(`${error.code} ${error.message}`);

type Stroke = { c: string; w: number; p: number[]; d?: 1 };
function cleanStrokes(input: unknown, colour: string): Stroke[] | null {
  if (!Array.isArray(input) || input.length > MAX_STROKES) return null;
  let points = 0;
  const out: Stroke[] = [];
  for (const s of input) {
    if (!s || typeof s !== 'object' || !Array.isArray((s as Stroke).p)) return null;
    const p = (s as Stroke).p.filter(v => typeof v === 'number' && Number.isFinite(v)).map(v => Math.round(Math.max(-20, Math.min(260, v)) * 2) / 2);
    points += p.length / 2;
    if (points > MAX_POINTS || p.length < 2 || p.length % 2) return null;
    // the colour is the server's, whatever the client sent
    out.push({ c: colour, w: Math.max(0.5, Math.min(3, Number((s as Stroke).w) || 1.5)), p, ...((s as Stroke).d ? { d: 1 as const } : {}) });
  }
  return out;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  const deviceId = request.nextUrl.searchParams.get('deviceId') || '';
  if (!KEY.test(key)) return NextResponse.json({ error: 'bad_key' }, { status: 400 });
  const { data, error } = await serverDatabase().from('lab_graffiti').select('holder, slot, colour, strokes, claimed_at').eq('strike_key', key).order('claimed_at', { ascending: true }).limit(60);
  if (missing(error)) return NextResponse.json({ available: false, pieces: [] });
  if (error) return NextResponse.json({ available: false, pieces: [] }, { status: 503 });
  const me = /^[\w-]{8,64}$/.test(deviceId) ? holderOf(deviceId) : '';
  // holders never leave the server; only "this one is yours"
  const pieces = (data || []).map(({ holder, ...piece }) => ({ ...piece, mine: holder === me }));
  return NextResponse.json({ available: true, pieces }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  let body: { action?: string; key?: string; deviceId?: string; slots?: number; strokes?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const key = String(body.key || ''), deviceId = String(body.deviceId || '');
  if (!KEY.test(key) || !/^[\w-]{8,64}$/.test(deviceId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const db = serverDatabase();
  const holder = holderOf(deviceId), colour = colourOf(holder);
  const mine = await db.from('lab_graffiti').select('slot, strokes').eq('strike_key', key).eq('holder', holder).maybeSingle();
  if (missing(mine.error)) return NextResponse.json({ available: false });
  if (mine.error) return NextResponse.json({ available: false }, { status: 503 });

  if (body.action === 'claim') {
    if (mine.data) return NextResponse.json({ available: true, slot: mine.data.slot, colour, done: (mine.data.strokes as unknown[]).length > 0 });
    const n = Math.max(1, Math.min(32, Math.floor(Number(body.slots) || 1)));
    const { data: rows, error } = await db.from('lab_graffiti').select('slot, claimed_at').eq('strike_key', key);
    if (error) return NextResponse.json({ available: false }, { status: 503 });
    // newest claim per panel decides how recently it was painted
    const taken = new Map<number, number>();
    (rows || []).forEach(r => { if (r.slot < n) taken.set(r.slot, Math.max(taken.get(r.slot) ?? 0, Date.parse(r.claimed_at))); });
    const slots = Array.from({ length: n }, (_, i) => ({ i, x: 0, y: 0, w: 0, h: 0 }));
    const slot = assignSlot(slots, taken, holder).i;
    const ins = await db.from('lab_graffiti').insert({ strike_key: key, holder, slot, colour });
    if (ins.error && !/duplicate|23505/.test(`${ins.error.code} ${ins.error.message}`)) return NextResponse.json({ available: false }, { status: 503 });
    const settled = await db.from('lab_graffiti').select('slot').eq('strike_key', key).eq('holder', holder).maybeSingle();
    return NextResponse.json({ available: true, slot: settled.data?.slot ?? slot, colour, done: false });
  }

  if (body.action === 'save') {
    if (!mine.data) return NextResponse.json({ error: 'no_claim' }, { status: 409 });
    if ((mine.data.strokes as unknown[]).length) return NextResponse.json({ error: 'already_painted' }, { status: 409 }); // one can per strike
    const strokes = cleanStrokes(body.strokes, colour);
    if (!strokes) return NextResponse.json({ error: 'bad_strokes' }, { status: 400 });
    const up = await db.from('lab_graffiti').update({ strokes, updated_at: new Date().toISOString() }).eq('strike_key', key).eq('holder', holder);
    if (up.error) return NextResponse.json({ ok: false }, { status: 503 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
