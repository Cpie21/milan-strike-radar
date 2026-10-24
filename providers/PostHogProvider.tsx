'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { ANALYTICS_VERSION, scrubSdkProperties } from '../lib/analyticsContract'

if (typeof window !== 'undefined') {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    if (key && ['theitalystrike.com', 'www.theitalystrike.com'].includes(window.location.hostname)) {
        posthog.init(key, {
            api_host: host || 'https://us.i.posthog.com',
            person_profiles: 'identified_only',
            debug: false,
            capture_pageview: 'history_change',
            autocapture: true,
            mask_all_text: true,
            mask_all_element_attributes: true,
            enable_recording_console_log: false,
            session_recording: { maskAllInputs: true, maskTextSelector: '*', recordHeaders: false, recordBody: false },
            before_send: event => {
                if (!event) return null;
                let isTest = false;
                try { isTest = sessionStorage.getItem('strike_analytics_test') === '1'; } catch { /* blocked */ }
                event.properties = { ...scrubSdkProperties(event.properties), analytics_version: ANALYTICS_VERSION, environment: 'production', is_test: isTest };
                return event;
            },
        })
    }
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
