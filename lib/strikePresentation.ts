import { evidenceTimeLabel, type EvidenceWindow, type TimingEvidence } from './strikeEvidence';

export type StrikeEvent = {
  id?: string | number;
  source_key?: string;
  source_url?: string;
  provider?: string;
  status?: string;
  unions?: string;
  windows: EvidenceWindow[];
  guarantee_windows: { start: string; end: string }[];
  timing_evidence?: TimingEvidence | null;
  affected_lines?: string[];
  region?: string;
};

export function clockMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function upcomingJourneyDays(now = new Date()) {
  const today=new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const cursor=new Date(`${today}T12:00:00Z`), days:string[]=[];
  // The date navigator must expose the same 90-day span as synchronization.
  for(let i=0;i<=90;i++,cursor.setUTCDate(cursor.getUTCDate()+1)) days.push(cursor.toISOString().slice(0,10));
  return days;
}

// Merge impact intervals, retaining symbolic endpoints. These describe the
// union of possible disruptions, not a promise that every operator is stopped.
export function mergeEvidenceWindows(input: EvidenceWindow[]) {
  const sorted = input.map(w => ({ ...w })).sort((a, b) => (a.start === null ? -1 : clockMinutes(a.start)) - (b.start === null ? -1 : clockMinutes(b.start)));
  const result: EvidenceWindow[] = [];
  for (const window of sorted) {
    const prior = result.at(-1);
    const end = prior?.end_kind === 'end_of_service' ? Infinity : prior?.end ? clockMinutes(prior.end) : -1;
    const start = window.start === null ? -1 : clockMinutes(window.start);
    if (prior && start <= end) {
      if (window.end_kind === 'end_of_service' || window.end && prior.end && clockMinutes(window.end) > clockMinutes(prior.end)) {
        prior.end = window.end;
        prior.end_kind = window.end_kind;
      }
    } else result.push(window);
  }
  return result;
}

export function numericWindows(windows: EvidenceWindow[]) {
  return windows.filter((w): w is EvidenceWindow & { start: string; end: string } => w.start !== null && w.end !== null && w.end_kind === 'clock').map(w => ({ start: w.start, end: w.end }));
}

export function eventWindows(event: { strike_windows?: { start: string; end: string }[]; timing_evidence?: TimingEvidence | null; duration_hours?: string }) {
  if (event.timing_evidence?.windows.length) return event.timing_evidence.windows;
  const windows = event.strike_windows || [];
  if (windows.length === 1 && windows[0].start === '00:00' && windows[0].end === '24:00' && /待|多时段|部分时段/.test(event.duration_hours || '')) return [];
  return windows.map(w => ({ ...w, end_kind: 'clock' as const }));
}

export function intersectGuarantees(events: StrikeEvent[]) {
  if (!events.length || events.some(e => !e.guarantee_windows.length)) return [];
  let common = [...events[0].guarantee_windows];
  for (const event of events.slice(1)) {
    common = common.flatMap(a => event.guarantee_windows.flatMap(b => {
      const start = a.start > b.start ? a.start : b.start;
      const end = a.end < b.end ? a.end : b.end;
      return start < end ? [{ start, end }] : [];
    }));
  }
  return numericWindows(mergeEvidenceWindows(common.map(w => ({ ...w, end_kind: 'clock' }))));
}

export function windowsDisplay(windows: EvidenceWindow[], language: 'zh' | 'en' = 'zh') {
  return windows.length ? windows.map(w => evidenceTimeLabel(w, language)).join(', ') : language === 'zh' ? '具体时段待公布' : 'Time to be confirmed';
}

export function windowsDuration(windows: EvidenceWindow[]) {
  if (!windows.length) return '时段待公布';
  if (windows.some(w => w.start === null || w.end_kind === 'end_of_service')) return '分时段（按运营时间）';
  const total = windows.reduce((sum,w) => sum + clockMinutes(w.end!) - clockMinutes(w.start!), 0);
  const hours = Math.floor(total / 60), minutes = total % 60;
  return `${hours ? `${hours}小时` : ''}${minutes ? `${minutes}分钟` : ''}`;
}

// A day axis is valid for every city. Symbolic edges use a striped continuation,
// not a made-up service closing time. All numeric windows remain exact.
export function strikeTimeline(windows: EvidenceWindow[], guarantees: { start: string; end: string }[] = [], cancelled = false, hasUnknown = false) {
  const bounded = windows.filter(w => w.start !== null && w.end !== null).map(w => ({ start: clockMinutes(w.start!), end: clockMinutes(w.end!) }));
  const open = windows.filter(w => w.start === null || w.end_kind === 'end_of_service').map(w => ({ start: w.start === null ? 0 : clockMinutes(w.start), end: w.end === null ? 1440 : clockMinutes(w.end) }));
  const protectedTimes = guarantees.map(w => ({ start: clockMinutes(w.start), end: clockMinutes(w.end) }));
  const points = [...new Set([0, 1440, ...[...bounded, ...open, ...protectedTimes].flatMap(w => [w.start, w.end])])].filter(p => Number.isFinite(p) && p >= 0 && p <= 1440).sort((a,b)=>a-b);
  return points.slice(0,-1).map((start,index) => {
    const end = points[index+1], mid = (start+end)/2;
    const includes = (list: typeof bounded) => list.some(w => mid >= w.start && mid < w.end);
    const type = cancelled ? 'grey' : includes(protectedTimes) ? 'green' : includes(bounded) ? 'red' : includes(open) ? 'open' : windows.length && !hasUnknown ? 'grey' : 'unknown';
    return { colorType: type, widthPct: (end-start)/1440*100, startMin:start, endMin:end };
  });
}
