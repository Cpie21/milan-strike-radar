'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

if (typeof window !== 'undefined') {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

    console.log('PostHog Init Attempt:', { hasKey: !!key, host });

    if (key) {
        posthog.init(key, {
            api_host: host || 'https://us.i.posthog.com',
            person_profiles: 'identified_only',
            debug: true, // Enable debug mode to see logs in browser console
        })
    }
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
    return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
