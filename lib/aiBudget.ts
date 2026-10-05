import { serverDatabase } from './strikeQuery';

// One gate for every paid model call outside the sync (Ask, translation):
// reserve before calling, settle with the real cost after. It expects the
// shared monthly ledger RPCs `reserve_ai_budget(purpose, call_key,
// reserve_micro_usd)` → boolean and `settle_ai_budget(call_key,
// actual_micro_usd)`, requested from Codex (AI_HANDOFF, lab v12).
//
// Until those exist the call runs unmetered and is logged as such; nothing
// here claims a cap is in force.

export type Reservation = { ok: boolean; metered: boolean; key: string };

export async function reserveAiBudget(purpose: 'ask' | 'translate', key: string, microUsd: number): Promise<Reservation> {
  try {
    const { data, error } = await serverDatabase().rpc('reserve_ai_budget', { purpose, call_key: key, reserve_micro_usd: Math.ceil(microUsd) });
    // Only the ledger saying "no" is "over budget". A missing function or a
    // database hiccup runs the call unmetered and says so in the logs; it
    // must never tell people the answers are used up when they aren't.
    if (error) {
      console.warn(`[ai-budget] unmetered ${purpose} call ${key}: ${error.code || ''} ${error.message}`);
      return { ok: true, metered: false, key };
    }
    return { ok: data !== false, metered: data === true, key };
  } catch (error) {
    console.warn(`[ai-budget] unmetered ${purpose} call ${key}:`, error instanceof Error ? error.message : error);
    return { ok: true, metered: false, key };
  }
}

export async function settleAiBudget(r: Reservation, actualUsd: number | null) {
  if (!r.metered || !r.ok) return;
  // Unknown cost keeps the reservation (settle is skipped), as the sync does.
  if (actualUsd === null || !Number.isFinite(actualUsd)) return;
  try { await serverDatabase().rpc('settle_ai_budget', { call_key: r.key, actual_micro_usd: Math.ceil(actualUsd * 1e6) }); } catch { /* reservation stands */ }
}
