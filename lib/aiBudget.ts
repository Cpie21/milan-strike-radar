import { serverDatabase } from './strikeQuery';
export type Reservation = { ok: boolean; metered: boolean; key: string; reason?: 'UNAVAILABLE' | 'BUDGET_EXHAUSTED' | 'TRANSLATION_DISABLED' | 'INVALID_RESERVATION' };
// RPCs serialize on sync's USD 0.20 monthly ledger. Never fall back to an
// instance ledger: reservation identity and original month must be durable.
export async function reserveAiBudget(purpose: 'ask' | 'translate', key: string, microUsd: number): Promise<Reservation> {
  const denied = (reason: Reservation['reason']): Reservation => ({ ok: false, metered: false, key, reason });
  if (purpose === 'translate') return denied('TRANSLATION_DISABLED');
  const micro = Math.ceil(microUsd);
  if (!Number.isSafeInteger(micro) || micro < 1 || micro > 2000 || key.length < 8 || key.length > 160) return denied('INVALID_RESERVATION');
  try {
    const { data, error } = await serverDatabase().rpc('reserve_ai_budget', { purpose, call_key: key, reserve_micro_usd: micro });
    if (error || typeof data !== 'boolean') return denied('UNAVAILABLE');
    return data ? { ok: true, metered: true, key } : denied('BUDGET_EXHAUSTED');
  } catch { return denied('UNAVAILABLE'); }
}
export async function settleAiBudget(r: Reservation, actualUsd: number | null) {
  if (!r.ok || !r.metered || actualUsd === null || !Number.isFinite(actualUsd) || actualUsd < 0) return;
  const actual = Math.ceil(actualUsd * 1e6);
  if (!Number.isSafeInteger(actual)) return;
  try {
    const { error } = await serverDatabase().rpc('settle_ai_budget', { call_key: r.key, actual_micro_usd: actual });
    if (error) console.warn('[ai-budget] settlement unavailable; reservation retained');
  } catch { /* Unknown billing or DB failure retains the full reservation. */ }
}
export class AiBudgetError extends Error {
  constructor(public readonly reason: Reservation['reason']) { super('Paid decision unavailable'); }
}
