// The lab is an internal prototype: it keeps the live page's event names
// but does not send them, so it never pollutes production analytics.
// Swap this for utils/analytics capture/captureOnce when the lab ships.
export function track(event: string, props?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') console.debug('[lab track]', event, props ?? {});
}
