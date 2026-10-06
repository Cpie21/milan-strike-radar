import { NextRequest, NextResponse } from 'next/server';
import { serverDatabase, romeToday } from '../../../../lib/strikeQuery';
import { BodyError, privateHash, readBoundedJson, requestIdentity, sharedLimit } from '../../../../lib/apiGuard';
import { PALETTE, cleanStrokes, parseWallKey, wallSlots } from '../../../../lib/graffiti';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DEVICE = /^[\w-]{8,64}$/;
const holderOf = (device: string) => privateHash('graffiti',device).slice(0,32);
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control':'no-store' } });
export async function GET(request: NextRequest) {
  try {
    const wall = parseWallKey(request.nextUrl.searchParams.get('key'),romeToday());
    if (!wall) return response({ error:'bad_key' },400);
    const limit = await sharedLimit('graffiti_read',requestIdentity(request));
    if (limit !== 'allowed') return response({ available:false,pieces:[],error:limit === 'limited' ? 'rate_limited' : 'unavailable' },limit === 'limited' ? 429 : 503);
    const device = request.nextUrl.searchParams.get('deviceId') || '';
    const me = DEVICE.test(device) ? holderOf(device) : '';
    const query = serverDatabase().from('lab_graffiti').select('holder,slot,colour,strokes,claimed_at,approved,active').eq('strike_key',wall.key).not('saved_at','is',null);
    // The owner made the wall public (2026-10-06): every saved piece shows to
    // everyone at once. Pieces are strokes in one panel only (no text, no
    // images); `pending` still reports approval for later moderation.
    const { data,error } = await query.order('claimed_at',{ascending:false}).order('holder').limit(60);
    if (error) return response({available:false,pieces:[]},503);
    const pieces = (data || []).reverse().map(({holder,approved,...piece}) => ({...piece,mine:holder===me,pending:!approved}));
    return response({available:true,pieces});
  } catch { return response({available:false,pieces:[]},503); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await readBoundedJson(request,40000);
    const wall = parseWallKey(body.key,romeToday());
    const device = typeof body.deviceId === 'string' ? body.deviceId : '';
    if (!wall || !DEVICE.test(device) || (body.action !== 'claim' && body.action !== 'save')) return response({error:'bad_request'},400);
    const limit = await sharedLimit('graffiti_write',requestIdentity(request));
    if (limit !== 'allowed') return response({available:false,error:limit === 'limited' ? 'rate_limited' : 'unavailable'},limit === 'limited' ? 429 : 503);
    const db = serverDatabase();
    const exists = await db.from('strikes').select('id').eq('date',wall.date).eq('category',wall.mode).in('region',[wall.city,'NATIONAL']).not('status','in','(STALE,CANCELLED)').limit(1);
    if (exists.error) return response({available:false},503);
    if (!exists.data?.length) return response({error:'unknown_strike'},404);
    const holder = holderOf(device); const colour = PALETTE[parseInt(holder.slice(0,8),16)%PALETTE.length];
    const slots = wallSlots(wall.mode);
    if (body.action === 'claim') {
      const {data,error} = await db.rpc('claim_graffiti_panel',{wall_key:wall.key,person:holder,paint_colour:colour,panel_count:slots.length});
      if (error || !data) return response({available:false},503);
      if (data.error) return response({error:data.error},409);
      return response({available:true,...data});
    }
    const mine = await db.from('lab_graffiti').select('slot,colour,saved_at,active').eq('strike_key',wall.key).eq('holder',holder).maybeSingle();
    if (mine.error) return response({ok:false},503);
    if (!mine.data) return response({error:'no_claim'},409);
    if (mine.data.saved_at || !mine.data.active) return response({error:'already_painted'},409);
    const slot = slots[mine.data.slot];
    const strokes = slot ? cleanStrokes(body.strokes,mine.data.colour,slot) : null;
    if (!strokes) return response({error:'bad_strokes'},400);
    const {data,error} = await db.rpc('save_graffiti_piece',{wall_key:wall.key,person:holder,drawing:strokes});
    if (error) return response({ok:false},503);
    if (data !== 'saved') return response({error:data || 'already_painted'},409);
    return response({ok:true,approvalPending:true});
  } catch (error) { return response({ok:false,error:error instanceof BodyError ? error.code : 'unavailable'},error instanceof BodyError ? error.status : 503); }
}
