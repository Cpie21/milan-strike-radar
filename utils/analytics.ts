/**
 * PostHog Analytics Helpers
 * 
 * captureOnce: fires `posthog.capture` only the FIRST time per device.
 * Uses localStorage as a deduplication store (best-effort IP-level dedup on client).
 */
import posthog from 'posthog-js';
import { ANALYTICS_VERSION, readAnalyticsContext, type AnalyticsContext } from '../lib/analyticsContract';

export function analyticsEnabled(): boolean {
    return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY &&
        ['theitalystrike.com', 'www.theitalystrike.com'].includes(window.location.hostname) &&
        !posthog.has_opted_out_capturing();
}

export function analyticsIsTest(): boolean {
    try { return sessionStorage.getItem('strike_analytics_test') === '1'; } catch { return false; }
}

export function analyticsContext(requestId: string): AnalyticsContext | null {
    if (!analyticsEnabled()) return null;
    try { return readAnalyticsContext({ requestId, distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id(), isTest: analyticsIsTest() }); }
    catch { return null; }
}

/**
 * Detect the device type for the `device` property.
 */
export function getDeviceType(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    return 'desktop';
}

/**
 * Detect if user is coming from WeChat browser.
 */
export function isWeChatBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /MicroMessenger/i.test(navigator.userAgent);
}

/**
 * Capture a PostHog event ONCE per device.
 * Skips if the event has already been recorded in localStorage.
 */
export function captureOnce(event: string, properties?: Record<string, unknown>): void {
    if (!analyticsEnabled()) return;
    const key = `ph_once_${event}`;
    try { if (localStorage.getItem(key)) return; } catch { /* storage blocked */ }
    if (capture(event, properties)) { try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ } }
}

/**
 * Always capture (for events that can repeat, like graffiti or share).
 */
export function capture(event: string, properties?: Record<string, unknown>): boolean {
    if (!analyticsEnabled()) return false;
    try {
        return !!posthog.capture(event, { ...properties, analytics_version: ANALYTICS_VERSION, environment: 'production',
            surface: 'site', device: getDeviceType(), is_test: analyticsIsTest() }, { transport: 'sendBeacon', send_instantly: true });
    } catch { return false; }
}

export function trackSource(url: string, properties?: Record<string, unknown>): void {
    try { capture('official_source_clicked', { ...properties, source_host: new URL(url).hostname }); } catch { /* malformed source cannot interrupt navigation */ }
}
