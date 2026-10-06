import { serverDatabase } from './strikeQuery';

// Every paid call requires an explicit successful shared-ledger reservation.
// Budget infrastructure failure is service unavailability, not permission to
// spend without a limit. Translation is free-only by the user's instruction.
export type Reservation = { ok: boolean; metered: boolean; key: string; reason?: 'UNAVAILABLE' | 'BUDGET_EXHAUSTED' | 'TRANSLATION_DISABLED' | 'INVALID_RESERVATION' };

export async function reserveAiBudget(purpose: 'ask' | 'translate', key: string, microUsd: number): Promise<Reservation> {
  const denied=(reason:Reservation['reason']):Reservation=>({ok:false,metered:false,key,reason});
  if(purpose==='translate')return denied('TRANSLATION_DISABLED');
  const reserve=Math.ceil(microUsd);
  if(!Number.isSafeInteger(reserve)||reserve<=0)return denied('INVALID_RESERVATION');
  try {
    const { data, error } = await serverDatabase().rpc('reserve_ai_budget', { purpose, call_key: key, reserve_micro_usd: reserve });
    if(error || typeof data!=='boolean') {
      console.warn('[ai-budget] paid call blocked: reservation service unavailable');
      return denied('UNAVAILABLE');
    }
    return data===true ? {ok:true,metered:true,key} : denied('BUDGET_EXHAUSTED');
  } catch {
    console.warn('[ai-budget] paid call blocked: reservation service unavailable');
    return denied('UNAVAILABLE');
  }
}

export async function settleAiBudget(r: Reservation, actualUsd: number | null) {
  if (!r.metered || !r.ok) return;
  // Unknown cost keeps the reservation (settle is skipped), as the sync does.
  if (actualUsd === null || !Number.isFinite(actualUsd) || actualUsd < 0 || !Number.isSafeInteger(Math.ceil(actualUsd * 1e6))) return;
  try { await serverDatabase().rpc('settle_ai_budget', { call_key: r.key, actual_micro_usd: Math.ceil(actualUsd * 1e6) }); } catch { /* reservation stands */ }
}
