export const SYNC_LEASE_MS = 6 * 60_000;

export function syncHealth(latest: { status: string; started_at: string } | null, lastSuccess?: string | null, now = Date.now()) {
  const stale = !lastSuccess || !Number.isFinite(Date.parse(lastSuccess)) || now - Date.parse(lastSuccess) > 26 * 3600_000;
  const timedOut = latest?.status === 'running' && (!Number.isFinite(Date.parse(latest.started_at)) || now - Date.parse(latest.started_at) > SYNC_LEASE_MS);
  return { healthy: !stale && !timedOut && latest?.status !== 'failed', stale, timedOut: Boolean(timedOut) };
}

// A running job has not recorded its warnings yet. Keep the last completed
// result's quality instead of advertising a blank in-progress result as clean.
export function syncDataQuality(healthy:boolean,latest:{status:string;warning_count:number;unknown_timing:number|null}|null,lastSuccess:typeof latest) {
  if(!healthy)return 'UNAVAILABLE';
  const result=latest?.status==='running'?lastSuccess:latest;
  return !result||result.warning_count||result.unknown_timing?'PARTIAL':'NO_RECORDED_ISSUES';
}
