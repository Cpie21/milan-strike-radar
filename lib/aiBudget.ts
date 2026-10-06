import { serverDatabase } from './strikeQuery';

// Every paid call requires an explicit successful shared-ledger reservation.
// Budget infrastructure failure is service unavailability, not permission to
// spend without a limit. Translation is free-only by the user's instruction.
export type Reservation = { ok: boolean; metered: boolean; key: string; reason?: 'UNAVAILABLE' | 'BUDGET_EXHAUSTED' | 'TRANSLATION_DISABLED' | 'INVALID_RESERVATION'; micro?: number; via?: 'rpc' | 'ledger' };

// The shared monthly ledger (`ai_monthly_budget`, migration
// 20261004215721) caps all paid calls at USD 0.20 a month, below the owner's
// CNY 3. Until the `reserve_ai_budget` / `settle_ai_budget` functions exist,
// a reservation is made on that same ledger row with an atomic
// compare-and-set update (service role only): still metered, still capped,
// never unmetered. Anything uncertain is "unavailable".
const CAP_MICRO_USD = 200_000;
const ledgerMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
type Db = ReturnType<typeof serverDatabase>;

async function ledgerAdjust(db: Db, delta: number, enforceCap: boolean, disable = false): Promise<boolean | null> {
  const month = ledgerMonth();
  const seed = await db.from('ai_monthly_budget').upsert({ month }, { onConflict: 'month', ignoreDuplicates: true });
  if (seed.error) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await db.from('ai_monthly_budget').select('charged_micro_usd, disabled').eq('month', month).maybeSingle();
    if (error || !data || typeof data.charged_micro_usd !== 'number') return null;
    if (enforceCap && (data.disabled || data.charged_micro_usd + delta > CAP_MICRO_USD)) return false;
    const next = Math.max(0, data.charged_micro_usd + delta);
    const { data: rows, error: err } = await db.from('ai_monthly_budget')
      .update({ charged_micro_usd: next, ...(disable ? { disabled: true } : {}) })
      .eq('month', month).eq('charged_micro_usd', data.charged_micro_usd).select('month');
    if (err) return null;
    if (rows && rows.length === 1) return true; // nobody changed it in between
  }
  return null;
}

export async function reserveAiBudget(purpose: 'ask' | 'translate', key: string, microUsd: number): Promise<Reservation> {
  const denied=(reason:Reservation['reason']):Reservation=>({ok:false,metered:false,key,reason});
  if(purpose==='translate')return denied('TRANSLATION_DISABLED');
  const reserve=Math.ceil(microUsd);
  if(!Number.isSafeInteger(reserve)||reserve<=0)return denied('INVALID_RESERVATION');
  try {
    const db = serverDatabase();
    const { data, error } = await db.rpc('reserve_ai_budget', { purpose, call_key: key, reserve_micro_usd: reserve });
    if (error?.code === 'PGRST202') {
      const ok = await ledgerAdjust(db, reserve, true);
      if (ok === true) return { ok: true, metered: true, key, micro: reserve, via: 'ledger' };
      if (ok === false) return denied('BUDGET_EXHAUSTED');
      console.warn('[ai-budget] paid call blocked: ledger unavailable');
      return denied('UNAVAILABLE');
    }
    if(error || typeof data!=='boolean') {
      console.warn('[ai-budget] paid call blocked: reservation service unavailable');
      return denied('UNAVAILABLE');
    }
    return data===true ? {ok:true,metered:true,key,micro:reserve,via:'rpc'} : denied('BUDGET_EXHAUSTED');
  } catch {
    console.warn('[ai-budget] paid call blocked: reservation service unavailable');
    return denied('UNAVAILABLE');
  }
}

export async function settleAiBudget(r: Reservation, actualUsd: number | null) {
  if (!r.metered || !r.ok) return;
  // Unknown cost keeps the reservation (settle is skipped), as the sync does.
  if (actualUsd === null || !Number.isFinite(actualUsd) || actualUsd < 0 || !Number.isSafeInteger(Math.ceil(actualUsd * 1e6))) return;
  const actual = Math.ceil(actualUsd * 1e6);
  try {
    if (r.via === 'ledger' && r.micro) {
      // Return what wasn't spent; spending past the reservation stops further calls.
      await ledgerAdjust(serverDatabase(), actual - r.micro, false, actual > r.micro);
      return;
    }
    await serverDatabase().rpc('settle_ai_budget', { call_key: r.key, actual_micro_usd: actual });
  } catch { /* reservation stands */ }
}
