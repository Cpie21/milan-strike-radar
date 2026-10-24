// Subscription URLs must outlive a preview deployment and work without login.
export const SUBSCRIPTION_ORIGIN = 'https://www.theitalystrike.com';
export const SUBSCRIPTION_TYPES = ['train', 'subway', 'bus', 'airport'] as const;

export function calendarSubscriptionUrl(region: string, types: string[], protocol: 'https' | 'webcal' = 'https') {
  const url = new URL('/api/calendar', SUBSCRIPTION_ORIGIN);
  url.searchParams.set('types', types.map(type => type.toLowerCase()).join(','));
  url.searchParams.set('region', region.toUpperCase());
  return protocol === 'webcal' ? url.href.replace(/^https:/, 'webcal:') : url.href;
}

// Missing types means all modes for existing subscriptions. An explicit empty
// or invalid filter must not silently subscribe someone to every mode.
export function calendarTypes(value: string | null): Set<string> | null {
  if (value === null) return new Set(SUBSCRIPTION_TYPES);
  const types = value.toLowerCase().split(',').map(type => type.trim());
  if (types.some(type => !SUBSCRIPTION_TYPES.includes(type as typeof SUBSCRIPTION_TYPES[number]))) return null;
  return new Set(types);
}
