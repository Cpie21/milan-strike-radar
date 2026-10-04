export const SYNC_LEASE_MS = 6 * 60_000;

export function syncHealth(latest: { status: string; started_at: string } | null, lastSuccess?: string | null, now = Date.now()) {
  const stale = !lastSuccess || !Number.isFinite(Date.parse(lastSuccess)) || now - Date.parse(lastSuccess) > 26 * 3600_000;
  const timedOut = latest?.status === 'running' && (!Number.isFinite(Date.parse(latest.started_at)) || now - Date.parse(latest.started_at) > SYNC_LEASE_MS);
  return { healthy: !stale && !timedOut && latest?.status !== 'failed', stale, timedOut: Boolean(timedOut) };
}
