import type { EvidenceWindow } from '../strikeEvidence';
import { addDaysIso, weekdayOfIso } from '../romeDate';

// View model for the redesign. Built on the server from aggregateStrikes
// output; everything here is pure so rail, copy and geometry are testable.

export type Lang = 'zh' | 'en';
export type Mode = 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
export type CardStatus = 'CONFIRMED' | 'UNCERTAIN' | 'CANCELLED';
export type Source = { name: string; url: string; authority: string };
export type GuaranteeSource = 'OFFICIAL_STRIKE_NOTICE' | 'STANDARD_RULE' | 'OPERATOR_RULE' | 'UNKNOWN';

// What makes a source specific to this card: the MIT register entry itself
// (union, workforce, date proclaimed) and the operator's own sentence with
// the hours in it. Cheaper and more honest than screenshots.
export type OfficialRecord = {
  unions: string;
  workforce: string; // MIT's own wording, Italian
  sector: string;
  relevance: string; // Nazionale / Regionale / Provinciale ...
  area: string; // MIT region / province as published
  mode: string; // MIT "modalità", e.g. 24 ORE: VARIE MODALITA'
  proclaimed: string | null; // ISO date
  windows: EvidenceWindow[]; // this announcement's own hours
  url: string;
};
export type Quote = { name: string; url: string; excerpt: string; checkedAt: string | null; official: boolean };

export type ModeCard = {
  id: string;
  date: string;
  category: Mode;
  scope: string; // airport cards are split by scope (whole airport vs one airline)
  scopeType: string; // lib/strikeScope ScopeType; rail and aviation subtypes
  indirect: boolean; // rail security/infrastructure/support: staff hours, passenger impact unconfirmed
  lineScope: 'ALL_LINES' | 'SPECIFIC_LINES' | 'UNKNOWN';
  geography: { zh: string; en: string }[]; // official administrative scope beyond this city
  status: CardStatus;
  provider: string;
  national: boolean;
  displayTime: string; // kept for the existing "I'm affected" grouping key
  windows: EvidenceWindow[];
  guarantees: { start: string; end: string }[];
  guaranteeSource: GuaranteeSource;
  guaranteeKind: 'GUARANTEED_SERVICE' | 'PROTECTED_FLIGHTS';
  lines: string[];
  unknownTiming: boolean;
  confidence: string;
  sources: Source[];
  events: { provider: string; status: string; display: string; sources: Source[] }[];
  records: OfficialRecord[];
  quotes: Quote[];
};

export const MODES: Mode[] = ['SUBWAY', 'BUS', 'TRAIN', 'AIRPORT'];
const SEVERITY: Record<CardStatus, number> = { CONFIRMED: 0, UNCERTAIN: 1, CANCELLED: 2 };

export const isActive = (card: ModeCard) => card.status !== 'CANCELLED';
export const tx = (lang: Lang, zh: string, en: string) => (lang === 'en' ? en : zh);

export function sortCards(cards: ModeCard[]) {
  return [...cards].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || MODES.indexOf(a.category) - MODES.indexOf(b.category));
}

// Metro and bus often share one announcement and one schedule; showing the
// same facts twice adds length, not information.
export function groupIdentical(cards: ModeCard[]): ModeCard[][] {
  const groups = new Map<string, ModeCard[]>();
  for (const card of cards) {
    const key = card.status === 'CANCELLED' ? card.id : JSON.stringify([card.status, card.provider, card.windows, card.guarantees, card.scope]);
    groups.set(key, [...(groups.get(key) || []), card]);
  }
  return [...groups.values()];
}

const minutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

// ── Rail ────────────────────────────────────────────────────────────────
// Every tile has the same width. Emphasis comes from fill and glyphs, not
// size; a run of calm days folds into a single tile of that same width.

export type RailDay = { kind: 'day'; date: string; cards: ModeCard[]; joinPrev: boolean; joinNext: boolean; monthStart: boolean };
export type RailFold = { kind: 'fold'; from: string; to: string; days: number; monthStart: boolean };
export type RailTile = RailDay | RailFold;

// A strike continues overnight when one day runs to its end and the next
// day's same-mode strike starts at the beginning — not merely two strikes
// on consecutive days.
export function continuesOvernight(a: ModeCard | undefined, b: ModeCard | undefined) {
  if (!a || !b || !isActive(a) || !isActive(b) || a.category !== b.category) return false;
  const runsToEnd = a.windows.some(w => w.end_kind === 'end_of_service' || (w.end && minutes(w.end) >= 23 * 60 + 59));
  const startsAtMidnight = b.windows.some(w => w.start === null || minutes(w.start) <= 1);
  return runsToEnd && startsAtMidnight;
}

function joins(byDate: Map<string, ModeCard[]>, a: string, b: string) {
  const left = byDate.get(a) || [];
  const right = byDate.get(b) || [];
  return left.some(card => continuesOvernight(card, right.find(r => r.category === card.category)));
}

export function buildRail(byDate: Map<string, ModeCard[]>, from: string, to: string, today: string, selected: string, expanded: Set<string>, fold = true): RailTile[] {
  const tiles: RailTile[] = [];
  let run: string[] = [];
  let lastMonth = '';
  const push = (date: string) => {
    tiles.push({
      kind: 'day',
      date,
      cards: sortCards(byDate.get(date) || []),
      joinPrev: joins(byDate, addDaysIso(date, -1), date),
      joinNext: joins(byDate, date, addDaysIso(date, 1)),
      monthStart: date.slice(0, 7) !== lastMonth,
    });
    lastMonth = date.slice(0, 7);
  };
  const flush = () => {
    if (!run.length) return;
    if (fold && run.length >= 2 && !expanded.has(run[0])) {
      tiles.push({ kind: 'fold', from: run[0], to: run[run.length - 1], days: run.length, monthStart: run[0].slice(0, 7) !== lastMonth });
      lastMonth = run[0].slice(0, 7);
    } else run.forEach(push);
    run = [];
  };
  for (let date = from; date <= to; date = addDaysIso(date, 1)) {
    // A fold never spans two months, so month labels stay truthful.
    if (run.length && date.slice(0, 7) !== run[0].slice(0, 7)) flush();
    const pinned = date === today || date === selected || (byDate.get(date)?.length ?? 0) > 0;
    if (pinned) {
      flush();
      push(date);
    } else run.push(date);
  }
  flush();
  return tiles;
}

// ── Copy ────────────────────────────────────────────────────────────────

export type Tone = 'stop' | 'pending' | 'cancelled' | 'over';

const clock = (w: EvidenceWindow, side: 'start' | 'end', lang: Lang) =>
  side === 'start'
    ? (w.start ?? tx(lang, '运营开始', 'start of service'))
    : w.end_kind === 'end_of_service' ? tx(lang, '运营结束', 'end of service') : w.end ?? tx(lang, '运营结束', 'end of service');

export function windowsText(windows: EvidenceWindow[], lang: Lang = 'zh') {
  return windows.map(w => `${clock(w, 'start', lang)}–${clock(w, 'end', lang)}`).join(tx(lang, '、', ', '));
}

export function statusLine(card: ModeCard, today: string, nowMinutes: number, lang: Lang = 'zh'): { text: string; tone: Tone } {
  if (card.status === 'CANCELLED') return { text: tx(lang, '已取消', 'Cancelled'), tone: 'cancelled' };
  if (!card.windows.length) return { text: tx(lang, '已宣布罢工 · 时段待公布', 'Strike announced · hours pending'), tone: 'pending' };
  if (card.date !== today) return { text: tx(lang, `${windowsText(card.windows, lang)} 停运`, `No service ${windowsText(card.windows, lang)}`), tone: 'stop' };
  const spans = card.windows.map(w => ({ w, start: w.start === null ? 0 : minutes(w.start), end: w.end_kind === 'end_of_service' || !w.end ? 1440 : minutes(w.end) }));
  const current = spans.find(s => nowMinutes >= s.start && nowMinutes < s.end);
  if (current) {
    const next = spans.find(s => s.start > current.end);
    const resume = current.w.end_kind === 'end_of_service'
      ? tx(lang, '停运至运营结束', 'until end of service')
      : tx(lang, `${clock(current.w, 'end', lang)} 恢复`, `resumes ${clock(current.w, 'end', lang)}`);
    const again = next ? tx(lang, ` · ${clock(next.w, 'start', lang)} 再次停运`, ` · stops again ${clock(next.w, 'start', lang)}`) : '';
    return { text: tx(lang, `停运中 · ${resume}${again}`, `Stopped · ${resume}${again}`), tone: 'stop' };
  }
  const upcoming = spans.find(s => s.start > nowMinutes);
  if (upcoming) return { text: tx(lang, `${clock(upcoming.w, 'start', lang)} 起停运`, `Stops at ${clock(upcoming.w, 'start', lang)}`), tone: 'stop' };
  return { text: tx(lang, '今天的罢工时段已结束', 'Today’s strike hours are over'), tone: 'over' };
}

// Two or more windows read as one span with the breaks named, the way an
// itinerary shows a journey and its layover, instead of stacking lines.
export function timeSpan(windows: EvidenceWindow[]) {
  if (!windows.length) return null;
  const sorted = [...windows].sort((a, b) => (a.start === null ? -1 : b.start === null ? 1 : minutes(a.start) - minutes(b.start)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const breaks = sorted.slice(1).flatMap((w, i) => {
    const prev = sorted[i];
    return prev.end && prev.end_kind !== 'end_of_service' && w.start && minutes(w.start) > minutes(prev.end) ? [{ start: prev.end, end: w.start }] : [];
  });
  return { start: first.start, end: last.end_kind === 'end_of_service' ? null : last.end, breaks };
}

// Marks the times inside an operator's sentence so the quote visibly
// carries the hours the card shows. Returns alternating plain/marked parts.
const TIME_PHRASE = /(\b(?:dalle|alle|dopo le|fino alle|dalle ore|alle ore|ore|from|until|to)\s+)(\d{1,2}(?:[:.]\d{2})?)|(\d{1,2}[:.]\d{2})|(termine del servizio|fine (?:del )?servizio|inizio del servizio|end of service|运营结束|服务结束)/gi;
export function markTimes(text: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(TIME_PHRASE)) {
    const lead = m[1] ?? '';
    const value = m[2] ?? m[3] ?? m[4];
    const start = m.index! + lead.length;
    if (start > at) parts.push({ text: text.slice(at, start), mark: false });
    parts.push({ text: value, mark: true });
    at = start + value.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

// An overnight strike reads as one span across both days.
export function overnightLine(card: ModeCard, prev: ModeCard | undefined, next: ModeCard | undefined, lang: Lang = 'zh') {
  const d = (iso: string) => tx(lang, `${Number(iso.slice(8, 10))}日`, `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`);
  const first = next ? card : prev;
  const second = next ? next : card;
  if (!first || !second) return null;
  const start = first.windows.find(w => w.end_kind === 'end_of_service' || (w.end && w.end >= '23:59'))?.start ?? tx(lang, '运营开始', 'start of service');
  const endWindow = second.windows.find(w => w.start === null || w.start <= '00:01');
  const end = endWindow ? clock(endWindow, 'end', lang) : '';
  return tx(lang, `${d(first.date)} ${start} → ${d(second.date)} ${end} 停运`, `No service ${d(first.date)} ${start} → ${d(second.date)} ${end}`);
}

// ── Time ────────────────────────────────────────────────────────────────

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function relativeDay(date: string, today: string, lang: Lang = 'zh') {
  const diff = daysBetween(today, date);
  if (diff === 0) return tx(lang, '今天', 'Today');
  if (diff === 1) return tx(lang, '明天', 'Tomorrow');
  if (diff === -1) return tx(lang, '昨天', 'Yesterday');
  return diff > 0 ? tx(lang, `${diff} 天后`, `In ${diff} days`) : tx(lang, `${-diff} 天前`, `${-diff} days ago`);
}

export function nextEventDate(byDate: Map<string, ModeCard[]>, after: string) {
  return [...byDate.keys()].filter(d => d > after && (byDate.get(d) || []).some(isActive)).sort()[0] ?? null;
}

// The sky follows the selected day's state and Rome's time of day — the
// "strike weather" the page is built around.
export type Sky = 'clear-day' | 'clear-night' | 'storm-day' | 'storm-night';
export function skyFor(cards: ModeCard[], romeMinutes: number): Sky {
  const night = romeMinutes < 6 * 60 + 30 || romeMinutes >= 20 * 60;
  const storm = cards.some(isActive);
  return `${storm ? 'storm' : 'clear'}-${night ? 'night' : 'day'}` as Sky;
}

// ── Service bar geometry ────────────────────────────────────────────────
// Service runs roughly 05:00 to end of service; the axis starts there so
// the dead night hours don't take a quarter of the bar.

export const AXIS_START = 5 * 60;
export const AXIS_END = 24 * 60;
export const axisPos = (m: number) => (Math.min(Math.max(m, AXIS_START), AXIS_END) - AXIS_START) / (AXIS_END - AXIS_START);

export type Segment = { left: number; width: number; fade: boolean; fromNight: boolean };

export function segments(windows: { start: string | null; end: string | null; end_kind?: string }[]): Segment[] {
  return windows.flatMap(w => {
    const rawStart = w.start === null ? 0 : minutes(w.start);
    const toEnd = w.end_kind === 'end_of_service' || !w.end;
    let rawEnd = toEnd ? AXIS_END : minutes(w.end!);
    if (rawEnd <= rawStart) rawEnd = AXIS_END;
    const start = Math.max(rawStart, AXIS_START);
    const end = Math.min(rawEnd, AXIS_END);
    if (end <= start) return [];
    return [{ left: axisPos(start), width: axisPos(end) - axisPos(start), fade: toEnd, fromNight: rawStart < AXIS_START }];
  });
}

// Guaranteed hours inside a strike window are carved out of it, so the bar
// shows them as their own segment instead of a thin line over the strike.
export function carveGuarantees(windows: EvidenceWindow[], guarantees: { start: string; end: string }[]): EvidenceWindow[] {
  if (!guarantees.length) return windows;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const guards = guarantees.map(g => [minutes(g.start), minutes(g.end)] as const).sort((a, b) => a[0] - b[0]);
  return windows.flatMap(w => {
    const start = w.start === null ? 0 : minutes(w.start);
    const open = w.end_kind === 'end_of_service' || !w.end;
    const end = open ? 24 * 60 : minutes(w.end!);
    const pieces: EvidenceWindow[] = [];
    let cursor = start;
    for (const [gs, ge] of guards) {
      if (ge <= cursor || gs >= end) continue;
      if (gs > cursor) pieces.push({ start: cursor === start ? w.start : fmt(cursor), end: fmt(gs), end_kind: 'clock' });
      cursor = Math.max(cursor, ge);
    }
    if (cursor < end) pieces.push({ start: cursor === start ? w.start : fmt(cursor), end: open ? w.end : w.end, end_kind: w.end_kind });
    return pieces;
  });
}

export function nowPosition(nowMinutes: number) {
  return nowMinutes < AXIS_START || nowMinutes > AXIS_END ? null : axisPos(nowMinutes);
}

// ── Labels ──────────────────────────────────────────────────────────────

const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekday = (iso: string, lang: Lang = 'zh') => (lang === 'en' ? WEEK_EN : WEEK_ZH)[weekdayOfIso(iso)];
export const monthLabel = (iso: string, lang: Lang = 'zh') => tx(lang, `${Number(iso.slice(5, 7))}月`, MONTH_EN[Number(iso.slice(5, 7)) - 1]);
export const dayLabel = (iso: string, lang: Lang = 'zh') =>
  tx(lang, `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日 ${weekday(iso)}`, `${weekday(iso, 'en')} ${Number(iso.slice(8, 10))} ${MONTH_EN[Number(iso.slice(5, 7)) - 1]}`);
export const MODE_LABEL: Record<Mode, [string, string]> = { TRAIN: ['火车', 'Train'], SUBWAY: ['地铁', 'Metro'], BUS: ['公交', 'Bus'], AIRPORT: ['机场', 'Airport'] };
export const modeName = (mode: Mode, lang: Lang = 'zh') => MODE_LABEL[mode][lang === 'en' ? 1 : 0];
