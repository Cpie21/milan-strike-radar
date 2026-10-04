import type { EvidenceWindow } from '../strikeEvidence';
import { addDaysIso, weekdayOfIso } from '../romeDate';

// View model for the redesign. Built from aggregateStrikes output on the
// server; everything here is pure so the rail and status copy are testable.

export type Mode = 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
export type CardStatus = 'CONFIRMED' | 'UNCERTAIN' | 'CANCELLED';
export type Source = { name: string; url: string; authority: string };

export type ModeCard = {
  id: string;
  date: string;
  scope: string; // airport cards are split by scope (whole airport vs one airline)
  category: Mode;
  status: CardStatus;
  provider: string;
  national: boolean;
  windows: EvidenceWindow[];
  guarantees: { start: string; end: string }[];
  lines: string[];
  unknownTiming: boolean;
  confidence: string;
  sources: Source[];
  events: { provider: string; status: string; display: string; sources: Source[] }[];
};

export const MODES: Mode[] = ['SUBWAY', 'BUS', 'TRAIN', 'AIRPORT'];
const SEVERITY: Record<CardStatus, number> = { CONFIRMED: 0, UNCERTAIN: 1, CANCELLED: 2 };

export const isActive = (card: ModeCard) => card.status !== 'CANCELLED';

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

// ── Rail ────────────────────────────────────────────────────────────────

export type RailDay = { kind: 'day'; date: string; weight: 'event' | 'calm'; cards: ModeCard[]; joinPrev: Mode[]; joinNext: Mode[] };
export type RailGap = { kind: 'gap'; from: string; to: string; days: number };
export type RailMonth = { kind: 'month'; month: number };
export type RailItem = RailDay | RailGap | RailMonth;

const minutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

// A strike continues overnight when one day runs to its end and the next
// day's same-mode strike starts at the beginning — not merely two strikes
// on consecutive days.
export function continuesOvernight(a: ModeCard | undefined, b: ModeCard | undefined) {
  if (!a || !b || !isActive(a) || !isActive(b) || a.category !== b.category) return false;
  const runsToEnd = a.windows.some(w => w.end_kind === 'end_of_service' || (w.end && minutes(w.end) >= 23 * 60 + 59));
  const startsAtMidnight = b.windows.some(w => w.start === null || minutes(w.start) <= 1);
  return runsToEnd && startsAtMidnight;
}

export function buildRail(byDate: Map<string, ModeCard[]>, from: string, to: string, today: string, selected: string, expanded: Set<string>): RailItem[] {
  const items: RailItem[] = [];
  let gap: string[] = [];
  let month = 0;
  const flushGap = () => {
    if (!gap.length) return;
    const key = gap[0];
    if (gap.length >= 2 && !expanded.has(key)) items.push({ kind: 'gap', from: gap[0], to: gap[gap.length - 1], days: gap.length });
    else gap.forEach(date => items.push(day(date)));
    gap = [];
  };
  const day = (date: string): RailDay => {
    const cards = byDate.get(date) || [];
    const prev = byDate.get(addDaysIso(date, -1)) || [];
    const next = byDate.get(addDaysIso(date, 1)) || [];
    return {
      kind: 'day',
      date,
      weight: cards.length ? 'event' : 'calm',
      cards: sortCards(cards),
      joinPrev: cards.filter(c => continuesOvernight(prev.find(p => p.category === c.category), c)).map(c => c.category),
      joinNext: cards.filter(c => continuesOvernight(c, next.find(n => n.category === c.category))).map(c => c.category),
    };
  };
  for (let date = from; date <= to; date = addDaysIso(date, 1)) {
    const m = Number(date.slice(5, 7));
    if (m !== month) {
      flushGap();
      if (month) items.push({ kind: 'month', month: m });
      month = m;
    }
    const pinned = date === today || date === selected || (byDate.get(date)?.length ?? 0) > 0;
    if (pinned) {
      flushGap();
      items.push(day(date));
    } else gap.push(date);
  }
  flushGap();
  return items;
}

// ── Status copy (opening-hours style) ───────────────────────────────────

export type Tone = 'stop' | 'pending' | 'cancelled' | 'over';

const clock = (w: EvidenceWindow, side: 'start' | 'end') =>
  side === 'start' ? (w.start ?? '运营开始') : w.end_kind === 'end_of_service' ? '运营结束' : w.end ?? '运营结束';

export function windowsText(windows: EvidenceWindow[]) {
  return windows.map(w => `${clock(w, 'start')}–${clock(w, 'end')}`).join('、');
}

export function statusLine(card: ModeCard, today: string, nowMinutes: number): { text: string; tone: Tone } {
  if (card.status === 'CANCELLED') return { text: '已取消', tone: 'cancelled' };
  if (!card.windows.length) return { text: '已宣布罢工 · 时段待公布', tone: 'pending' };
  if (card.date !== today) return { text: `${windowsText(card.windows)} 停运`, tone: 'stop' };
  const spans = card.windows.map(w => ({ w, start: w.start === null ? 0 : minutes(w.start), end: w.end_kind === 'end_of_service' || !w.end ? 1440 : minutes(w.end) }));
  const current = spans.find(s => nowMinutes >= s.start && nowMinutes < s.end);
  if (current) {
    const next = spans.find(s => s.start > current.end);
    const resume = current.w.end_kind === 'end_of_service' ? '停运至运营结束' : `${clock(current.w, 'end')} 恢复`;
    return { text: `停运中 · ${resume}${next ? ` · ${clock(next.w, 'start')} 再次停运` : ''}`, tone: 'stop' };
  }
  const upcoming = spans.find(s => s.start > nowMinutes);
  if (upcoming) return { text: `${clock(upcoming.w, 'start')} 起停运`, tone: 'stop' };
  return { text: '今天的罢工时段已结束', tone: 'over' };
}

// An overnight strike reads as one span across both days.
export function overnightLine(card: ModeCard, prev?: ModeCard, next?: ModeCard) {
  const d = (iso: string) => `${Number(iso.slice(8, 10))}日`;
  if (next) {
    const start = card.windows.find(w => w.end_kind === 'end_of_service' || (w.end && w.end >= '23:59'))?.start ?? '运营开始';
    const end = next.windows.find(w => w.start === null || w.start <= '00:01');
    return `${d(card.date)} ${start} → ${d(next.date)} ${end ? clock(end, 'end') : ''} 停运`;
  }
  if (prev) {
    const start = prev.windows.find(w => w.end_kind === 'end_of_service' || (w.end && w.end >= '23:59'))?.start ?? '运营开始';
    const end = card.windows.find(w => w.start === null || w.start <= '00:01');
    return `${d(prev.date)} ${start} → ${d(card.date)} ${end ? clock(end, 'end') : ''} 停运`;
  }
  return null;
}

// ── Service bar geometry ────────────────────────────────────────────────

// Service runs roughly 05:00 to end of service; the axis starts there so
// the dead night hours don't take a quarter of the bar.
export const AXIS_START = 5 * 60;
export const AXIS_END = 24 * 60;

export type Segment = { left: number; width: number; fade: boolean; fromNight: boolean };

export function segments(windows: { start: string | null; end: string | null; end_kind?: string }[]): Segment[] {
  const span = AXIS_END - AXIS_START;
  return windows.flatMap(w => {
    const rawStart = w.start === null ? 0 : minutes(w.start);
    const toEnd = w.end_kind === 'end_of_service' || !w.end;
    let rawEnd = toEnd ? AXIS_END : minutes(w.end!);
    if (rawEnd <= rawStart) rawEnd = AXIS_END;
    const start = Math.max(rawStart, AXIS_START);
    const end = Math.min(rawEnd, AXIS_END);
    if (end <= start) return [];
    return [{ left: (start - AXIS_START) / span, width: (end - start) / span, fade: toEnd, fromNight: rawStart < AXIS_START }];
  });
}

export function nowPosition(nowMinutes: number) {
  if (nowMinutes < AXIS_START || nowMinutes > AXIS_END) return null;
  return (nowMinutes - AXIS_START) / (AXIS_END - AXIS_START);
}

// ── Labels ──────────────────────────────────────────────────────────────

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const weekday = (iso: string) => WEEK[weekdayOfIso(iso)];
export const dayLabel = (iso: string) => `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日 ${weekday(iso)}`;
export const MODE_ZH: Record<Mode, string> = { TRAIN: '火车', SUBWAY: '地铁', BUS: '公交', AIRPORT: '机场' };

export function nextEventDate(byDate: Map<string, ModeCard[]>, after: string) {
  return [...byDate.keys()].filter(d => d > after && (byDate.get(d) || []).some(isActive)).sort()[0] ?? null;
}
