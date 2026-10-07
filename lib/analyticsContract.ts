import type { AskResult, StageEvent } from './ask/pipeline';

export const ANALYTICS_VERSION = 2;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type AnalyticsContext = { requestId: string; distinctId: string; sessionId?: string; isTest: boolean };
export function readAnalyticsContext(raw: unknown): AnalyticsContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.requestId !== 'string' || !UUID_PATTERN.test(a.requestId) || typeof a.distinctId !== 'string' || !UUID_PATTERN.test(a.distinctId)) return null;
  return { requestId: a.requestId, distinctId: a.distinctId, isTest: a.isTest === true,
    ...(typeof a.sessionId === 'string' && UUID_PATTERN.test(a.sessionId) ? { sessionId: a.sessionId } : {}) };
}

// Only aggregate facts. Never spread Understanding (it includes the raw question).
export function askResultProperties(result: AskResult): Record<string, unknown> {
  const u = result.understanding;
  const common = { result_kind: result.kind, intent: u.intent, date_method: u.scopeBy, city_method: u.cityBy,
    modes: u.modes.map(m => m.mode), mode_methods: [...new Set(u.modes.map(m => m.by))],
    fallback: u.fallback, named_line_count: u.lines.length, assumption_count: u.assumptions.length };
  if (result.kind === 'clarify') return { ...common, missing: result.missing };
  if (result.kind === 'out_of_scope') return { ...common, coverage_reason: result.coverage?.reason ?? 'UNSUPPORTED_QUERY' };
  if (result.kind !== 'result') return common;
  return { ...common, view: result.view, level: result.level, match_count: result.matches.length,
    excluded_count: result.excluded.length, unchecked_count: result.unchecked, strike_day_count: result.days.length,
    period_item_count: result.days.reduce((n, d) => n + d.items.length, 0), checked_city_count: result.checked.cities.length,
    cost_usd: result.cost, has_sync_timestamp: !!result.lastSync };
}
export function stageProperties(stage: StageEvent): Record<string, unknown> {
  return { stage: stage.id, duration_ms: stage.ms, rule_fact_count: stage.facts.filter(f => f.by === 'rule').length,
    model_fact_count: stage.facts.filter(f => f.by === 'jev').length,
    default_fact_count: stage.facts.filter(f => f.by === 'default').length,
    low_confidence_fact_count: stage.facts.filter(f => typeof f.p === 'number' && f.p < 0.8).length };
}

export function cleanAnalyticsUrl(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    const url = new URL(raw); url.hash = '';
    // Preserve attribution, strip private query/itinerary and debug parameters.
    const allowed = new Set(['utm_source', 'utm_medium', 'utm_campaign']);
    [...url.searchParams.keys()].forEach(k => { if (!allowed.has(k)) url.searchParams.delete(k); });
    return url.toString();
  } catch { return ''; }
}

export function scrubSdkProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const p = { ...properties };
  for (const key of ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer']) {
    if (key in p) p[key] = cleanAnalyticsUrl(p[key]);
  }
  for (const key of ['query', 'answer', 'trace', 'prompt', 'refineToken', '$request_body', '$response_body']) delete p[key];
  for (const key of ['$set', '$set_once']) if (p[key] && typeof p[key] === 'object') p[key] = scrubSdkProperties(p[key] as Record<string, unknown>);
  return p;
}
