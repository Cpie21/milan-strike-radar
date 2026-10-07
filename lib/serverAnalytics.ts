import { after } from 'next/server';
import { PostHog } from 'posthog-node';
import { ANALYTICS_VERSION, readAnalyticsContext } from './analyticsContract';

// Optional, bounded, post-response telemetry. Analytics outages never fail Ask.
export function requestAnalytics(raw: unknown) {
  const context = readAnalyticsContext(raw);
  const events: { event: string; timestamp: Date; properties: Record<string, unknown> }[] = [];
  const started = Date.now();
  let scheduled = false;
  return {
    id: context?.requestId ?? null,
    capture(event: string, properties: Record<string, unknown> = {}) {
      if (!context || !process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.VERCEL_ENV !== 'production') return;
      events.push({ event, timestamp: new Date(), properties: { ...properties, request_id: context.requestId, $session_id: context.sessionId,
        analytics_version: ANALYTICS_VERSION, environment: 'production', surface: 'ask_api', is_test: context.isTest,
        elapsed_ms: Date.now() - started, $process_person_profile: false } });
    },
    flush() {
      if (scheduled || !events.length || !context) return;
      scheduled = true;
      try {
        after(async () => {
          let client: PostHog | undefined;
          try {
            client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
              flushAt: 100, flushInterval: 0, requestTimeout: 2000, fetchRetryCount: 0, disableGeoip: true });
            for (const e of events) client.capture({ distinctId: context.distinctId, ...e });
            await client.flush();
          } catch { console.warn('[analytics] delivery unavailable'); }
          finally { if (client) await client.shutdown(2500).catch(() => {}); }
        });
      } catch { /* no request context: analytics must remain optional */ }
    },
  };
}
