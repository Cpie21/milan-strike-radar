import { AiBudgetError } from '../aiBudget';
import { cityPath, resolveCity } from '../cities';
import { addDaysIso } from '../romeDate';
import { readCityStrikes, romeToday, serverDatabase } from '../strikeQuery';
import { cardGuaranteeWindows, lineScopeLabels } from '../strikeCardEvidence';
import { windowsDisplay } from '../strikePresentation';
import { geographyContext, indirectRail, type ScopeType } from '../strikeScope';
import type { EvidenceWindow } from '../strikeEvidence';
import { aggregateStrikes, filterStrikesForRegion } from '../../components/utils';
import { choice, decide, noul, type DecisionResult } from './jev';
import { parseQuery, unsupportedPlace, weekEnd, type Abroad, type DateScope, type Mode, type ParsedQuery } from './parseQuery';

// Query → understanding → retrieval → parallel decisions → evidence.
// Jev classifies and judges relevance; code owns dates, clock arithmetic,
// impact levels and every fact shown to the user; the database owns the facts.

export type Intent = 'trip_check' | 'day_check' | 'period_check' | 'claim_check' | 'other';
export type Impact = 'high' | 'unknown' | 'medium' | 'low' | 'none' | 'cancelled';
export type Overlap = 'strike' | 'guarantee' | 'outside' | 'unknown';
export type Reason = 'direct' | 'broad' | 'adjacent' | 'other_operator' | 'unrelated';
export type ClaimVerdict = 'confirms' | 'exaggerates' | 'contradicts';
export type By = 'rule' | 'jev' | 'default';

export type Hints = { date?: string; range?: 'week' | 'upcoming'; modes?: Mode[] };
export type Purpose = 'daily' | 'airport' | 'intercity' | 'abroad' | 'unspecified';

// What the answer took for granted, said out loud so it can be corrected.
// Most questions don't follow a template ("will I hit a strike going to
// school next week?"); rather than ask back or answer for everything, the
// answer reads the likely meaning and shows it.
export type Assumption =
  | { kind: 'local_modes'; modes: Mode[] } // everyday travel: metro, bus/tram, local trains; no flights
  | { kind: 'day_part'; from: string; to: string; zh: string; en: string } // "早上" read as 06:00–10:00
  | { kind: 'abroad'; country: string; zh: string; en: string } // only the Italian part is covered
  | { kind: 'page_city'; city: string }; // no city named: the one being viewed

export type Understanding = {
  query: string;
  intent: Intent;
  intentP: number | null;
  scope: DateScope | null;
  scopeBy: By;
  time: string | null;
  span: { from: string; to: string } | null; // a part of the day instead of a clock time
  city: string;
  cityBy: By;
  modes: { mode: Mode; by: By; p: number | null }[];
  lines: string[];
  purpose: Purpose;
  abroad: Abroad | null;
  assumptions: Assumption[];
  fallback: boolean;
};

export type Candidate = {
  key: string;
  date: string;
  category: Mode;
  city: string;
  path: string;
  provider: string;
  status: string;
  national: boolean;
  windows: EvidenceWindow[];
  display: string;
  guarantees: EvidenceWindow[];
  guaranteeSource: string;
  lineLabels: string[];
  lines: string[];
  lineScope: string;
  scopeType: string;
  indirect: boolean; // rail staff whose passenger impact is unconfirmed
  geography: string[]; // official administrative scope beyond the supported city
  sources: { name: string; url: string; authority: string }[];
};

export type Judged = Candidate & {
  relevance: number | null;
  reason: Reason | null;
  evidence: number | null;
  claim: ClaimVerdict | null;
  overlap: Overlap | null;
  impact: Impact;
};

export type DaySummary = { date: string; path: string; items: { category: Mode; status: string; display: string }[] };

export type AskResult =
  | { kind: 'clarify'; missing: 'date' | 'mode'; understanding: Understanding }
  | { kind: 'navigate'; understanding: Understanding; path: string; date: string }
  | { kind: 'out_of_scope'; understanding: Understanding; place?: string; coverage?: { from: string; to: string; reason: 'DATE_OUTSIDE_SYNC_RANGE' } }
  | {
      kind: 'result';
      view: 'trip' | 'day' | 'period' | 'claim';
      understanding: Understanding;
      level: Impact | 'clear';
      matches: Judged[];
      excluded: Judged[];
      days: DaySummary[];
      range: { from: string; to: string };
      checked: { cities: string[]; modes: Mode[] }; // what a "no strike" answer is based on
      lastSync: string | null;
      cost: number;
      unchecked: number; // candidates beyond the judging limit: never read as "no impact"
    };

export type Fact = { label: string; value: string; by: By | 'db'; p?: number | null };
export type StageEvent = { type: 'stage'; id: 'understand' | 'retrieve' | 'judge' | 'evidence'; facts: Fact[]; ms: number; note?: string };

const MODES: Mode[] = ['TRAIN', 'SUBWAY', 'BUS', 'AIRPORT'];
const MODE_EN: Record<Mode, string> = { TRAIN: 'train / railway', SUBWAY: 'metro', BUS: 'bus / tram', AIRPORT: 'flights / airport' };
const MODE_ZH: Record<Mode, string> = { TRAIN: '火车', SUBWAY: '地铁', BUS: '公交', AIRPORT: '机场' };
const IMPACT_ORDER: Impact[] = ['high', 'unknown', 'medium', 'low', 'none', 'cancelled'];
const MAX_JUDGED = 8;

const UNDERSTAND_QUESTIONS = {
  intent: {
    type: 'choice' as const,
    instructions: 'What is the user asking about Italian transport strikes?',
    criteria: {
      trip_check: 'Whether one planned journey of theirs (a trip, commute, train, flight or line at some time) will be affected',
      day_check: 'Which strikes happen on one particular day, without describing a journey',
      period_check: 'Which strikes happen over a period such as this week, next week, this month or upcoming days',
      claim_check: 'Whether a message, news item or rumour they heard about a strike is true',
      other: 'Not a question about Italian transport strikes',
    },
  },
  purpose: {
    type: 'choice' as const,
    instructions: 'What is the travel for, as far as the question says?',
    criteria: {
      daily: 'Everyday local travel: going to school, university, work, shopping or appointments in or around the city',
      airport: 'Catching a flight, or going to or from an airport',
      intercity: 'A trip to another Italian city',
      abroad: 'A trip that crosses into another country, such as a train to Switzerland or France',
      unspecified: 'The question does not say what the travel is for',
    },
  },
  ...Object.fromEntries(MODES.map(mode => [`mode_${mode}`, {
    type: 'noul' as const,
    instructions: `The user's question involves ${MODE_EN[mode]}${mode === 'AIRPORT' ? ', including catching a flight' : ''}.`,
  }])),
};

function judgeQuestions(claim: boolean) {
  return {
    relevant: {
      type: 'noul' as const,
      instructions: 'Would this strike plausibly disrupt the journey or answer the question the user described? Judge operator, line, transport mode and place. A strike by a different operator than the one the user relies on (for example a regional Trenord strike for a high-speed Frecciarossa trip) is not relevant; a national or general strike of the same mode is relevant. For a trip that crosses the border, an Italian strike only affects the Italian part of the route: a Trenord or national rail strike is relevant to a train from Milan to Switzerland (Trenord and Trenitalia run the Italian section), while an airport strike is not relevant to a train trip.',
      criteria: { true: 'The strike can affect what the user asked about', false: 'The strike does not concern what the user asked about' },
    },
    reason: {
      type: 'choice' as const,
      instructions: 'How does this strike relate to what the user asked?',
      criteria: {
        direct: 'Same transport mode and the operator or line the user uses',
        broad: 'A general or national strike that covers the user\'s transport mode',
        adjacent: 'Affects how the user reaches their trip, such as trains or buses to the airport',
        other_operator: 'Same mode but a different operator or line than the user\'s',
        unrelated: 'Unrelated to the user\'s question',
      },
    },
    evidence: {
      type: 'noul' as const,
      instructions: 'The official record states hours and scope concretely enough to answer the user\'s question.',
    },
    ...(claim ? {
      claim: {
        type: 'choice' as const,
        instructions: 'Compare the message the user heard with this official strike record.',
        criteria: {
          confirms: 'The official record supports the message',
          exaggerates: 'There is a strike, but the message overstates its scope, modes or hours',
          contradicts: 'The official record contradicts the message',
        },
      },
    } : {}),
  };
}

function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function spans(windows: EvidenceWindow[]) {
  return windows.map(w => {
    const start = w.start === null ? 0 : minutes(w.start);
    const end = w.end_kind === 'end_of_service' || w.end === null ? 1440 : minutes(w.end);
    return { start, end: end <= start ? 1440 : end };
  });
}

function at(t: number, windows: EvidenceWindow[], guarantees: EvidenceWindow[]): Overlap {
  if (guarantees.some(g => t >= (g.start === null ? 0 : minutes(g.start)) && t < (g.end_kind === 'end_of_service' || !g.end ? 1440 : minutes(g.end)))) return 'guarantee';
  return spans(windows).some(s => t >= s.start && t < s.end) ? 'strike' : 'outside';
}
// A clock time, or a span ("evening"): any strike minute in the span counts.
export function computeOverlap(time: string | null, windows: EvidenceWindow[], guarantees: EvidenceWindow[], span: { from: string; to: string } | null = null): Overlap | null {
  if (!time && !span) return null;
  if (!windows.length) return 'unknown';
  if (time) return at(minutes(time), windows, guarantees);
  const seen = new Set<Overlap>();
  for (let t = minutes(span!.from); t < minutes(span!.to); t += 5) seen.add(at(t, windows, guarantees));
  return seen.has('strike') ? 'strike' : seen.has('guarantee') ? 'guarantee' : 'outside';
}

export function computeImpact(status: string, windows: EvidenceWindow[], overlap: Overlap | null): Impact {
  if (status === 'CANCELLED') return 'cancelled';
  if (!windows.length) return 'unknown';
  if (overlap === 'guarantee') return 'low';
  if (overlap === 'strike') return 'high';
  if (overlap === 'outside') return 'none';
  const covered = spans(windows).reduce((sum, s) => sum + s.end - s.start, 0);
  return covered >= 12 * 60 ? 'high' : 'medium';
}

function heuristicIntent(parsed: ParsedQuery): Intent {
  if (/真的吗|是真的|属实|听说|群里|据说|谣言|\btrue\b|rumou?r/i.test(parsed.text)) return 'claim_check';
  if (parsed.scope?.kind === 'range') return 'period_check';
  if (parsed.time || parsed.lines.length || /我|坐|乘|赶|去|回|飞|commute|\bmy\b|\bi\b/i.test(parsed.text)) return 'trip_check';
  return parsed.scope ? 'day_check' : 'trip_check';
}

function applyHints(parsed: ParsedQuery, hints: Hints): { scopeBy: By } {
  if (hints.date && /^\d{4}-\d{2}-\d{2}$/.test(hints.date)) parsed.scope = { kind: 'day', date: hints.date, text: hints.date };
  if (hints.range === 'week') parsed.scope = { kind: 'range', from: parsed.today, to: weekEnd(parsed.today), text: 'this week' };
  if (hints.range === 'upcoming') parsed.scope = { kind: 'range', from: parsed.today, to: addDaysIso(parsed.today, 14), text: 'upcoming' };
  // Modes picked in a clarify or a correction replace the guessed ones.
  if (hints.modes?.length) parsed.modes = [...new Set(hints.modes.filter(m => MODES.includes(m)))];
  return { scopeBy: 'rule' };
}

async function lastSuccessfulSync() {
  const { data } = await serverDatabase().from('strike_sync_runs').select('completed_at').eq('status', 'success').order('completed_at', { ascending: false }).limit(1).maybeSingle();
  return data?.completed_at ?? null;
}

type EventRow = {
  id?: string | number;
  source_key?: string;
  source_url?: string;
  provider?: string;
  status?: string;
  region?: string;
  windows?: EvidenceWindow[];
  guarantee_windows?: { start: string; end: string }[];
  timing_evidence?: { sources?: { name: string; url: string; authority: string }[]; fields?: Parameters<typeof geographyContext>[0] } | null;
};
type DayRow = EventRow & { date: string; category: Mode; affected_lines?: string[]; strike_events?: EventRow[]; scopeType?: string; lineScope?: 'ALL_LINES' | 'SPECIFIC_LINES' | 'UNKNOWN' };

async function loadCandidates(cityTags: string[], from: string, to: string): Promise<Candidate[]> {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const tag of cityTags) {
    const scoped = filterStrikesForRegion(await readCityStrikes(tag, from), tag);
    const rows = scoped as unknown as EventRow[];
    const nationalIds = new Set(rows.filter(r => String(r.region).toUpperCase() === 'NATIONAL').map(r => String(r.source_key || r.id)));
    for (const row of aggregateStrikes(scoped, tag) as unknown as DayRow[]) {
      if (row.date < from || row.date > to || !MODES.includes(row.category)) continue;
      const events = row.strike_events?.length ? row.strike_events : [row];
      for (const event of events) {
        const national = nationalIds.has(String(event.source_key || event.id));
        const key = `${event.source_key || event.id || event.provider}|${row.date}|${row.category}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const windows: EvidenceWindow[] = event.windows || [];
        out.push({
          key,
          date: row.date,
          category: row.category,
          city: tag,
          path: cityPath(tag),
          provider: event.provider || row.provider || '',
          status: event.status || row.status || 'CONFIRMED',
          national,
          windows,
          display: windows.length ? windowsDisplay(windows) : '',
          // Each event from its own fields: its guarantees (with their real
          // source) and its own line scope, never the merged card's.
          guarantees: cardGuaranteeWindows({ guaranteeSource: event.timing_evidence?.fields?.guaranteeSource, guarantee_windows: event.guarantee_windows, guaranteeEvidenceWindows: event.timing_evidence?.fields?.guaranteeEvidenceWindows?.value }),
          guaranteeSource: event.timing_evidence?.fields?.guaranteeSource || 'UNKNOWN',
          lines: event.timing_evidence?.fields?.lineScope?.value.kind === 'SPECIFIC_LINES' ? event.timing_evidence.fields.lineScope.value.affectedLineNames : [],
          lineScope: event.timing_evidence?.fields?.lineScope?.value.kind || 'UNKNOWN',
          lineLabels: lineScopeLabels(event.timing_evidence?.fields?.lineScope?.value),
          scopeType: row.scopeType || '',
          indirect: row.category === 'TRAIN' && !!row.scopeType && indirectRail(row.scopeType as ScopeType),
          geography: [geographyContext(event.timing_evidence?.fields || undefined, 'en')].filter(Boolean),
          sources: [
            ...(event.source_url ? [{ name: '意大利交通部 MIT', url: event.source_url, authority: 'official' }] : []),
            ...(event.timing_evidence?.sources || []).map(s => ({ name: s.name, url: s.url, authority: s.authority })),
          ].filter((s, i, all) => all.findIndex(o => o.url === s.url) === i),
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
}

export async function runAsk(query: string, pageCity: string, hints: Hints, emit: (event: StageEvent) => void): Promise<AskResult> {
  const today = romeToday();
  let cost = 0;

  // 1. Understanding: rules for facts, Jev for intent and semantic modes.
  let started = Date.now();
  const parsed = parseQuery(query, today);
  const { scopeBy } = applyHints(parsed, hints);
  // A place this site doesn't cover is said plainly, before any paid call,
  // instead of answering for the page's city.
  const place = unsupportedPlace(query);
  if (place && !parsed.cities.length) {
    return { kind: 'out_of_scope', place, understanding: { query, intent: 'other', intentP: null, scope: parsed.scope, scopeBy: 'default', time: parsed.time, span: null, city: pageCity, cityBy: 'default', modes: [], lines: parsed.lines, purpose: 'unspecified', abroad: parsed.abroad, assumptions: [], fallback: true } };
  }
  let understood: DecisionResult | null = null;
  try {
    understood = await decide({ query, today, page_city: resolveCity(pageCity)?.en }, UNDERSTAND_QUESTIONS);
    cost += understood.cost;
  } catch (error) {
    if (error instanceof AiBudgetError) throw error;
    console.error('[ask] understanding fallback:', error instanceof Error ? error.message : error);
  }
  const intentAnswer = choice(understood, 'intent');
  const intent = (intentAnswer?.value as Intent) || heuristicIntent(parsed);
  const modeSet = new Map<Mode, { by: By; p: number | null }>();
  parsed.modes.forEach(mode => modeSet.set(mode, { by: 'rule', p: null }));
  // A named mode or line ("M1") is the user's choice; the model may only
  // infer modes when none was named ("going to the airport" → train, bus).
  const namedModes = parsed.modes.length > 0 || parsed.lines.length > 0;
  for (const mode of MODES) {
    const p = noul(understood, `mode_${mode}`);
    if (p !== null && p >= 0.5 && !namedModes && !modeSet.has(mode)) modeSet.set(mode, { by: 'jev', p });
    else if (p !== null && modeSet.has(mode)) modeSet.set(mode, { by: 'rule', p });
  }
  // What the travel is for decides which transport is plausible when none
  // was named. Everyday travel (school, work) is metro, bus/tram and local
  // trains, never a flight; a trip abroad is a train unless they fly.
  const purposeAnswer = choice(understood, 'purpose');
  const purpose: Purpose = parsed.abroad ? 'abroad' : parsed.daily ? 'daily' : (purposeAnswer && purposeAnswer.p >= 0.5 ? purposeAnswer.value as Purpose : 'unspecified');
  const assumptions: Assumption[] = [];
  if (!namedModes && purpose === 'daily') {
    modeSet.clear();
    (['SUBWAY', 'BUS', 'TRAIN'] as Mode[]).forEach(mode => modeSet.set(mode, { by: parsed.daily ? 'rule' : 'jev', p: parsed.daily ? null : purposeAnswer?.p ?? null }));
    assumptions.push({ kind: 'local_modes', modes: ['SUBWAY', 'BUS', 'TRAIN'] });
  }
  if (!namedModes && purpose === 'abroad' && !modeSet.has('AIRPORT')) { modeSet.clear(); modeSet.set('TRAIN', { by: 'rule', p: null }); }
  if (parsed.abroad) assumptions.push({ kind: 'abroad', ...parsed.abroad });
  if (parsed.dayPart) assumptions.push({ kind: 'day_part', ...parsed.dayPart });
  const pageTag = resolveCity(pageCity)?.tag || 'MILANO';
  // The page city is where the user is; a named city may be a destination, so both are searched.
  const city = parsed.cities.includes(pageTag) ? pageTag : parsed.cities[0] || pageTag;
  const understanding: Understanding = {
    query,
    intent,
    intentP: intentAnswer?.p ?? null,
    scope: parsed.scope,
    scopeBy: parsed.scope ? scopeBy : 'default',
    time: parsed.time,
    span: parsed.dayPart ? { from: parsed.dayPart.from, to: parsed.dayPart.to } : null,
    city,
    cityBy: parsed.cities.length ? 'rule' : 'default',
    modes: [...modeSet].map(([mode, v]) => ({ mode, ...v })),
    lines: parsed.lines,
    purpose,
    abroad: parsed.abroad,
    assumptions,
    fallback: !understood,
  };
  if (!parsed.cities.length) assumptions.push({ kind: 'page_city', city });
  const cityLabel = resolveCity(city)?.zh || city;
  emit({
    type: 'stage', id: 'understand', ms: Date.now() - started,
    note: understood ? undefined : 'jev_unavailable',
    facts: [
      { label: 'intent', value: intent, by: understood ? 'jev' : 'rule', p: understanding.intentP },
      { label: 'purpose', value: purpose === 'unspecified' ? '' : purpose, by: parsed.abroad || parsed.daily ? 'rule' : 'jev', p: parsed.abroad || parsed.daily ? null : purposeAnswer?.p ?? null },
      { label: 'date', value: parsed.scope ? (parsed.scope.kind === 'day' ? parsed.scope.date : `${parsed.scope.from} → ${parsed.scope.to}`) : '', by: parsed.scope ? 'rule' : 'default' },
      { label: 'time', value: parsed.time || (understanding.span ? `${understanding.span.from}–${understanding.span.to}` : ''), by: 'rule' },
      { label: 'city', value: cityLabel, by: understanding.cityBy },
      ...understanding.modes.map(m => ({ label: 'mode', value: MODE_ZH[m.mode], by: m.by, p: m.p })),
      ...parsed.lines.map(line => ({ label: 'line', value: line, by: 'rule' as const })),
    ],
  });

  // 2. Branching: decide what is still missing before touching the database.
  if (intent === 'other' && (intentAnswer?.p ?? 0) >= 0.6 && !modeSet.size) return { kind: 'out_of_scope', understanding };
  let view: 'trip' | 'day' | 'period' | 'claim';
  if (intent === 'claim_check') view = 'claim';
  else if (intent === 'period_check' || parsed.scope?.kind === 'range') view = 'period';
  else if (intent === 'day_check') view = 'day';
  else view = 'trip';

  if (!parsed.scope) {
    if (view === 'trip' || view === 'day') return { kind: 'clarify', missing: 'date', understanding };
    parsed.scope = { kind: 'range', from: today, to: addDaysIso(today, 14), text: 'upcoming' };
    understanding.scope = parsed.scope;
  }
  if (view === 'trip' && !modeSet.size) return { kind: 'clarify', missing: 'mode', understanding };

  // Do not call an empty database result 'clear' outside the sync horizon.
  const coverage = { from: today, to: addDaysIso(today, 90), reason: 'DATE_OUTSIDE_SYNC_RANGE' as const };
  const requestedFrom = parsed.scope.kind === 'day' ? parsed.scope.date : parsed.scope.from;
  const requestedTo = parsed.scope.kind === 'day' ? parsed.scope.date : parsed.scope.to;
  if (requestedFrom < coverage.from || requestedTo > coverage.to) return { kind: 'out_of_scope', understanding, coverage };

  if (view === 'day' && !modeSet.size && parsed.scope.kind === 'day') return { kind: 'navigate', understanding, path: cityPath(city), date: parsed.scope.date };

  // 3. Retrieval: deterministic date and city filtering in the database.
  started = Date.now();
  const from = parsed.scope.kind === 'day' ? parsed.scope.date : parsed.scope.from;
  const to = parsed.scope.kind === 'day' ? parsed.scope.date : parsed.scope.to;
  const cityTags = [...new Set([city, ...parsed.cities, pageTag])].slice(0, 3);
  const [all, lastSync] = await Promise.all([loadCandidates(cityTags, from, to), lastSuccessfulSync()]);
  const wanted = new Set(modeSet.keys());
  const named = namedModes;
  // Trains and buses reach airports, so an airport trip also judges them,
  // unless the user named the transport: then nothing else is paid for.
  if (wanted.has('AIRPORT') && view === 'trip' && !named) { wanted.add('TRAIN'); wanted.add('BUS'); }
  // Candidates naming the user's line come first; identical notices (same
  // staff, hours, status, guarantees, scope) are judged once, keeping every
  // source on the one row.
  const sameNotice = (a: Candidate, b: Candidate) => a.date === b.date && a.category === b.category && a.provider === b.provider && a.display === b.display && a.status === b.status
    && JSON.stringify(a.guarantees) === JSON.stringify(b.guarantees) && a.guaranteeSource === b.guaranteeSource && a.lineScope === b.lineScope && JSON.stringify(a.lines) === JSON.stringify(b.lines);
  const pool = (wanted.size ? all.filter(c => wanted.has(c.category)) : all)
    .sort((a, b) => Number(parsed.lines.some(l => b.lines.includes(l))) - Number(parsed.lines.some(l => a.lines.includes(l))))
    .reduce<Candidate[]>((out, c) => {
      const twin = out.find(o => sameNotice(o, c));
      if (twin) twin.sources = [...twin.sources, ...c.sources].filter((s, i, list) => list.findIndex(o => o.url === s.url) === i);
      else out.push({ ...c, sources: [...c.sources] });
      return out;
    }, []);
  emit({
    type: 'stage', id: 'retrieve', ms: Date.now() - started,
    facts: [
      { label: 'range', value: from === to ? from : `${from} → ${to}`, by: 'db' },
      { label: 'records', value: String(all.length), by: 'db' },
      { label: 'candidates', value: String(pool.length), by: 'db' },
    ],
  });

  // Period overviews list facts per day; no per-record judgement is needed.
  if (view === 'period') {
    const byDay = new Map<string, DaySummary>();
    for (const c of pool) {
      const day = byDay.get(c.date) || { date: c.date, path: c.path, items: [] };
      const same = day.items.find(i => i.category === c.category && i.status === c.status);
      if (!same) day.items.push({ category: c.category, status: c.status, display: c.display });
      else if (c.display && !same.display.includes(c.display)) same.display = same.display ? `${same.display}; ${c.display}` : c.display;
      byDay.set(c.date, day);
    }
    const days = [...byDay.values()];
    const active = pool.filter(c => c.status !== 'CANCELLED');
    emit({ type: 'stage', id: 'evidence', ms: 0, facts: [{ label: 'sync', value: lastSync || '', by: 'db' }] });
    return { kind: 'result', view, understanding, level: active.length ? 'medium' : 'clear', matches: [], excluded: [], days, range: { from, to }, checked: { cities: cityTags, modes: [...wanted] }, lastSync, cost, unchecked: 0 };
  }

  // 4. Parallel decisions: one Jev call per candidate, all at once.
  started = Date.now();
  const judgedPool = pool.slice(0, MAX_JUDGED);
  let jevFailures = 0;
  let denied: AiBudgetError | null = null;
  const judged: Judged[] = await Promise.all(judgedPool.map(async candidate => {
    const overlap = computeOverlap(parsed.time, candidate.windows, candidate.guarantees, understanding.span);
    const impact = candidate.indirect && candidate.status !== 'CANCELLED' ? 'unknown' : computeImpact(candidate.status, candidate.windows, overlap);
    let result: DecisionResult | null = null;
    try {
      result = await decide({
        user_question: query,
        user_trip: {
          date: parsed.scope?.kind === 'day' ? parsed.scope.date : `${from} to ${to}`,
          time: parsed.time || (understanding.span ? `${parsed.dayPart?.en} (${understanding.span.from}-${understanding.span.to})` : 'not specified'),
          transport: understanding.modes.map(m => MODE_EN[m.mode]),
          lines: parsed.lines,
          city: resolveCity(city)?.en,
          purpose,
          ...(parsed.abroad ? { crosses_border_to: parsed.abroad.en } : {}),
        },
        strike: {
          date: candidate.date,
          transport: MODE_EN[candidate.category],
          striking_staff: candidate.provider,
          area: candidate.national ? 'registered as a national strike' : `shown for ${resolveCity(candidate.city)?.en}`,
          status: candidate.status === 'CANCELLED' ? 'cancelled / revoked' : candidate.status === 'UNCERTAIN' ? 'announced, hours not yet published' : 'confirmed',
          hours: candidate.display || 'not published',
          hours_covered_of_24: candidate.windows.length ? Math.round(spans(candidate.windows).reduce((sum, s) => sum + s.end - s.start, 0) / 60) : null,
          guaranteed_service: candidate.guarantees.map(g => `${g.start ?? 'start of service'}-${g.end_kind === 'end_of_service' ? 'end of service' : g.end}`).join(', ') || 'none published',
          guarantee_source: candidate.guaranteeSource,
          affected_lines: candidate.lineScope === 'UNKNOWN' ? 'unknown' : candidate.lineScope === 'SPECIFIC_LINES' ? candidate.lines : candidate.lineLabels.join('; ') || candidate.lineScope,
          staff_scope: candidate.scopeType || 'unknown',
          passenger_impact: candidate.indirect ? 'staff strike; passenger train impact unconfirmed' : 'direct service',
          official_geography: candidate.geography,
        },
        computed_by_code: {
          user_time_vs_strike: overlap === 'strike' ? 'inside strike hours' : overlap === 'guarantee' ? 'inside guaranteed service hours' : overlap === 'outside' ? 'outside strike hours' : overlap === 'unknown' ? 'strike hours unknown' : 'user gave no time',
        },
      }, judgeQuestions(view === 'claim'));
      cost += result.cost;
    } catch (error) {
      if (error instanceof AiBudgetError) denied = error;
      jevFailures += 1;
      console.error('[ask] judgement fallback:', error instanceof Error ? error.message : error);
    }
    return {
      ...candidate,
      relevance: result ? noul(result, 'relevant') : wanted.size ? (modeSet.has(candidate.category) ? 1 : 0.4) : null,
      reason: (choice(result, 'reason')?.value as Reason) ?? null,
      evidence: noul(result, 'evidence'),
      claim: (choice(result, 'claim')?.value as ClaimVerdict) ?? null,
      overlap,
      impact,
    };
  }));
  // Wait for every attempted decision to settle before returning a budget error.
  if (denied) throw denied;
  emit({
    type: 'stage', id: 'judge', ms: Date.now() - started,
    note: jevFailures ? 'jev_unavailable' : undefined,
    facts: [
      { label: 'judged', value: String(judged.length), by: 'jev' },
      ...(pool.length > MAX_JUDGED ? [{ label: 'skipped', value: String(pool.length - MAX_JUDGED), by: 'rule' as const }] : []),
      { label: 'cost', value: `$${cost.toFixed(5)}`, by: 'jev' },
    ],
  });

  // 5. Evidence assembly: relevance threshold, ordering and the overall level.
  started = Date.now();
  // Shown: only what is about the user's transport and judged more likely
  // relevant than not. Two unions striking the same staff at the same hours
  // are one strike to a traveller, so identical rows collapse into one.
  const isRelevant = (j: Judged) => (j.relevance === null || j.relevance >= 0.5) && (!named || modeSet.has(j.category));
  const sameStrike = (a: Judged, b: Judged) => a.date === b.date && a.category === b.category && a.provider === b.provider && a.display === b.display && a.status === b.status;
  const matches = judged.filter(isRelevant)
    .sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact) || (b.relevance ?? 1) - (a.relevance ?? 1))
    .filter((j, i, all) => all.findIndex(o => sameStrike(o, j)) === i);
  const excluded = judged.filter(j => !isRelevant(j));
  // Beyond the judging limit nothing was checked: that is "unknown", not "clear".
  const unchecked = Math.max(0, pool.length - MAX_JUDGED);
  const level: Impact | 'clear' = matches.length ? matches[0].impact : unchecked ? 'unknown' : 'clear';
  emit({
    type: 'stage', id: 'evidence', ms: Date.now() - started,
    facts: [
      { label: 'matches', value: String(matches.length), by: 'rule' },
      { label: 'excluded', value: String(excluded.length), by: 'jev' },
      { label: 'sync', value: lastSync || '', by: 'db' },
    ],
  });
  return { kind: 'result', view, understanding, level, matches, excluded, days: [], range: { from, to }, checked: { cities: cityTags, modes: [...wanted] }, lastSync, cost, unchecked };
}

