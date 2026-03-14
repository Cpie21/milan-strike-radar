/**
 * PostHog Analytics Helpers
 * 
 * captureOnce: fires `posthog.capture` only the FIRST time per device.
 * Uses localStorage as a deduplication store (best-effort IP-level dedup on client).
 */
import posthog from 'posthog-js';

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
    if (typeof window === 'undefined') return;
    const key = `ph_once_${event}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    posthog.capture(event, properties);
}

/**
 * Always capture (for events that can repeat, like graffiti or share).
 */
export function capture(event: string, properties?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    posthog.capture(event, properties);
}
