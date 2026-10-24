/** Version cache keys by UTC interval: the first scheduled read blocks on fresh data. */
export function refreshEpoch(now:Date,intervalMs:number) {
  if(!Number.isFinite(now.getTime())||!Number.isSafeInteger(intervalMs)||intervalMs<=0)throw new Error('Invalid refresh interval');
  return String(Math.floor(now.getTime()/intervalMs));
}
export const DAY_MS=86400000;
