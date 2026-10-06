'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, ArrowUp, CaretDown, CaretRight, Check, Export, ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { LedBoard, LedFace, type Mood } from './Led';
import type { AskResult, Fact, Hints, Judged, StageEvent } from '../../lib/ask/pipeline';
import { dayLabel, modeName, statusLine, tx, windowsText, type Lang, type Mode, type ModeCard } from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
import { translateProvider } from '../i18n';

// The backend names striking staff in Chinese; English reads its own words.
const who = (provider: string, lang: Lang) => (lang === 'en' ? translateProvider(provider, 'en').replace(/^\w/, ch => ch.toUpperCase()) : provider);
import { Bar } from './LabStrikeCard';
import { LineBadge, ModeBadge, ModeGlyph, Sheet } from './ui';
import { C, EASE, TYPE } from './theme';

const TONE = { stop: C.stop, pending: C.pend, cancelled: C.cancel, over: C.text2 };
const PILL = { background: C.surface2, boxShadow: `inset 0 0 0 1px ${C.lineStrong}, 0 12px 32px rgba(0,0,0,0.5)` };

// Citymapper groups an answer by what you'll ride; each group reuses the
// day board's own row facts so the AI answer looks like the product's facts.

const STAGE_LABEL: Record<StageEvent['id'], [string, string]> = {
  understand: ['理解问题', 'Understanding'], retrieve: ['检索官方记录', 'Searching records'], judge: ['逐条判断相关性', 'Judging relevance'], evidence: ['核对证据', 'Checking evidence'],
};
const FACT: Record<string, [string, string]> = {
  intent: ['类型', 'Intent'], date: ['日期', 'Date'], time: ['时间', 'Time'], city: ['城市', 'City'], mode: ['交通', 'Mode'], line: ['线路', 'Line'],
  range: ['范围', 'Range'], records: ['记录', 'Records'], candidates: ['候选', 'Candidates'], judged: ['已判断', 'Judged'], skipped: ['未判断', 'Skipped'],
  cost: ['花费', 'Cost'], matches: ['相关', 'Relevant'], excluded: ['排除', 'Excluded'], sync: ['更新', 'Synced'],
};
const INTENT: Record<string, [string, string]> = { trip_check: ['行程影响', 'Trip'], day_check: ['某一天', 'One day'], period_check: ['一段时间', 'Period'], claim_check: ['核实消息', 'Verify'], other: ['无关', 'Off topic'] };
const LEVEL: Record<string, [string, string, string]> = {
  high: ['很可能受影响', 'Likely affected', C.stop], unknown: ['有罢工，时段待公布', 'Strike announced, hours pending', C.pend], medium: ['可能受影响', 'Possibly affected', C.pend],
  low: ['影响较小：在保障时段内', 'Low impact: guaranteed hours', C.ok], none: ['你的时间不在罢工时段内', 'Outside the strike hours', C.ok],
  cancelled: ['相关罢工已取消', 'The strike was cancelled', C.ok], clear: ['官方记录中没有相关罢工', 'No relevant strike on record', C.ok],
};
const CLAIM: Record<string, [string, string, string]> = {
  confirms: ['消息属实', 'Accurate', C.stop], exaggerates: ['确有罢工，但消息有夸大', 'Real, but exaggerated', C.pend], contradicts: ['与官方记录不符', 'Contradicts the records', C.ok], none: ['官方记录中查无此事', 'Not in official records', C.ok],
};
const REASON: Record<string, [string, string]> = {
  direct: ['直接相关', 'Direct'], broad: ['全国或综合性罢工', 'National or general'], adjacent: ['影响前往的交通', 'Getting there'], other_operator: ['同类交通，不同运营方', 'Different operator'], unrelated: ['无关', 'Unrelated'],
};
const OVERLAP: Record<string, [string, string]> = {
  strike: ['你的时间在罢工时段内', 'Your time is inside the strike'], guarantee: ['你的时间在保障时段内', 'Your time is in guaranteed hours'], outside: ['你的时间不在罢工时段内', 'Your time is outside the strike'],
};
const EXAMPLES: [string, string][] = [
  ['周五早上 9 点坐 M1 会受影响吗？', 'Is the M1 affected on Friday at 9am?'],
  ['10 月 16 日下午从马尔彭萨起飞', 'Flying from Malpensa on 16 Oct afternoon'],
  ['群里说 12 月 4 号火车全停，是真的吗？', 'Is it true trains stop on 4 Dec?'],
];

// M1–M5 are Milan metro lines; S, R and RE lines are regional trains.
const linesFor = (mode: Mode, lines: string[]) => lines.filter(l => (mode === 'SUBWAY' ? /^M\d$/ : mode === 'TRAIN' ? /^(S|R|RE)\d+$/ : /^$/).test(l));

const asCard = (j: Judged): ModeCard => ({
  id: j.key, date: j.date, category: j.category, scope: '', status: j.status as ModeCard['status'], provider: j.provider, national: j.national, displayTime: '',
  // The event's own guarantee source, never assumed to be the strike notice.
  windows: j.windows, guarantees: j.guarantees, guaranteeSource: j.guaranteeSource as ModeCard['guaranteeSource'], guaranteeKind: j.category === 'AIRPORT' ? 'PROTECTED_FLIGHTS' : 'GUARANTEED_SERVICE',
  lines: j.lines, lineLabels: j.lineLabels, scheduledEnd: null, unknownTiming: !j.windows.length, confidence: '', sources: j.sources, events: [],
  scopeType: j.scopeType, indirect: j.indirect, lineScope: j.lineScope, geography: [], records: [], quotes: [],
});

function Tag({ by, p, lang }: { by: Fact['by']; p?: number | null; lang: Lang }) {
  const label = by === 'jev' ? (p != null ? tx(lang, `把握 ${Math.round(p * 100)}%`, `${Math.round(p * 100)}% sure`) : 'Jev') : by === 'db' ? tx(lang, '数据库', 'DB') : by === 'default' ? tx(lang, '默认', 'Default') : tx(lang, '规则', 'Rule');
  const color = by === 'jev' ? '#9FD8FF' : by === 'rule' ? C.ok : C.text3;
  return <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-[5px]" style={{ color, background: C.surface3 }}>{label}</span>;
}

export type AskState = ReturnType<typeof useAsk>;

// Daily allowance per device; the API holds a per-IP daily cap as well.
export const DAILY_QUESTIONS = 5;
const QUOTA_KEY = 'lab_ask_quota';
const CACHE_KEY = 'lab_ask_cache';
function readQuota(today: string) {
  try {
    const q = JSON.parse(localStorage.getItem(QUOTA_KEY) || '{}');
    return q.date === today ? Number(q.used) || 0 : 0;
  } catch { return 0; }
}

export function useAsk({ region, lang, today, onOpenDate }: { region: string; lang: Lang; today: string; onOpenDate: (date: string, path: string) => void }) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [hints, setHints] = useState<Hints>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState(false);
  const [focused, setFocused] = useState(false);
  // The server issues a token only with a clarify; answering it continues
  // that held question. Anything else is a new question that counts.
  const token = useRef<string | null>(null);
  const counted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const [used, setUsed] = useState(0);
  useEffect(() => { const t = setTimeout(() => setUsed(readQuota(today)), 0); return () => clearTimeout(t); }, [today]);
  const left = Math.max(DAILY_QUESTIONS - used, 0);

  const go = (date: string, path: string) => { setOpen(false); onOpenDate(date, path); };

  // Answers are kept for the session: asking the same thing again, or
  // reopening the last answer, never spends another question.
  const keyOf = (q: string, h: Hints) => `${region}|${q.toLowerCase().replace(/\s+/g, ' ')}|${JSON.stringify(h)}`;
  const remember = (key: string, value: { stages: StageEvent[]; result: AskResult }) => {
    try {
      const all = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
      all[key] = value;
      const keys = Object.keys(all);
      if (keys.length > 12) delete all[keys[0]];
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(all));
    } catch { /* storage blocked */ }
  };
  const recall = (key: string): { stages: StageEvent[]; result: AskResult } | null => {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}')[key] ?? null; } catch { return null; }
  };
  const reopen = () => { if (result || error) setOpen(true); };
  const [history, setHistory] = useState<PastAnswer[]>([]);
  useEffect(() => { const t = setTimeout(() => setHistory(readHistory(region)), 0); return () => clearTimeout(t); }, [region]);
  const keep = (entry: PastAnswer) => {
    try {
      const all = (JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as PastAnswer[]).filter(h => h.key !== entry.key);
      all.push(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(-12)));
    } catch { /* storage full or blocked */ }
    setHistory(readHistory(region));
  };

  async function ask(text: string, next: Hints = {}) {
    const q = text.trim().slice(0, 200);
    if (!q) return;
    const cached = recall(keyOf(q, next));
    if (cached) {
      setAsked(q); setHints(next); setStages(cached.stages); setResult(cached.result); setError(null); setTrace(false); setBusy(false); setOpen(true);
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    // Answering a clarification continues the held question; anything else
    // is a new one, as the server counts it.
    const sent = q === asked && Object.keys(next).length ? token.current : null;
    if (!sent && readQuota(today) >= DAILY_QUESTIONS) { setAsked(q); setOpen(true); setResult(null); setStages([]); setError('daily'); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAsked(q); setHints(next); setOpen(true); setBusy(true); setStages([]); setResult(null); setError(null); setTrace(false);
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      const post = (refineToken: string | null) => fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, city: region, hints: next, refineToken }), signal: controller.signal });
      let res = await post(sent);
      // a held clarification expires after a while: ask afresh
      if (sent && res.status === 400) { token.current = null; res = await post(null); }
      if (!res.ok || !res.body) {
        const reason = res.status === 429 ? ((await res.json().catch(() => ({}))).error === 'daily_limit' ? 'daily' : 'rate') : 'down';
        setError(reason); setBusy(false); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const seen: StageEvent[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'stage') { seen.push(event); setStages(prev => [...prev, event]); }
          else if (event.type === 'final') {
            const answered = event.result.kind === 'result' || event.result.kind === 'navigate';
            if (event.result.kind === 'clarify') { token.current = event.refineToken ?? null; counted.current = false; }
            else token.current = null;
            // A question is used up only when it is answered, and once.
            if (answered && (!sent || !counted.current)) {
              const count = readQuota(today) + 1;
              try { localStorage.setItem(QUOTA_KEY, JSON.stringify({ date: today, used: count })); } catch { /* ignore */ }
              setUsed(count);
            }
            if (answered) counted.current = true;
            setResult(event.result);
            if (event.result.kind === 'result' || event.result.kind === 'clarify') remember(keyOf(q, next), { stages: seen, result: event.result });
            if (event.result.kind === 'result') keep({ key: keyOf(q, next), q, hints: next, result: event.result, stages: seen, at: Date.now() });
            if (event.result.kind === 'navigate') setTimeout(() => go(event.result.date, event.result.path), 700);
          } else if (event.type === 'error') setError(event.error === 'budget' ? 'budget' : 'down');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('down');
    } finally {
      setBusy(false);
    }
  }
  // Picked modes replace the guessed ones (a correction, not an addition).
  const refine = (patch: Hints) => ask(asked, { ...hints, ...patch });

  const verdict = verdictOf(result, lang);
  const groups = groupsOf(result);

  return { lang, today, region, query, setQuery, asked, hints, open, setOpen, busy, stages, result, error, trace, setTrace, focused, setFocused, ask, refine, go, verdict, groups, left, reopen, history, keyOf };
}

function verdictOf(result: AskResult | null, lang: Lang): string[] | null {
  if (result?.kind !== 'result') return null;
  if (result.view === 'claim') return CLAIM[result.matches[0]?.claim || 'none'];
  if (result.view === 'period') return result.days.length ? [tx(lang, `这段时间有 ${result.days.length} 天有罢工`, `Strikes on ${result.days.length} day(s)`), '', C.pend] : [tx(lang, '这段时间没有已公布的罢工', 'No strikes announced'), '', C.ok];
  return LEVEL[result.level];
}

// Group matches by mode, in the order the user mentioned them.
function groupsOf(result: AskResult | null): [Mode, Judged[]][] {
  if (result?.kind !== 'result') return [];
  const order = result.understanding.modes.map(m => m.mode);
  const map = new Map<Mode, Judged[]>();
  result.matches.forEach(m => map.set(m.category, [...(map.get(m.category) || []), m]));
  return [...map].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99);
}

// Earlier answers, kept on this device, newest last: the answer sheet shows
// them to the left of the current one.
const HISTORY_KEY = 'lab_ask_history';
export type PastAnswer = { key: string; q: string; hints: Hints; result: AskResult; stages: StageEvent[]; at: number };
function readHistory(region: string): PastAnswer[] {
  try { return (JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as PastAnswer[]).filter(h => h.key.startsWith(`${region}|`)); } catch { return []; }
}

// The face on the page is the assistant at rest: it never keeps an answer's
// mood once the answer is closed, and it goes dark while the answer sheet
// (which has its own face) is open, so two faces are never awake at once.
export function pageMood(a: Pick<AskState, 'open'>, strikeDay: boolean): Mood {
  if (a.open) return 'off';
  return strikeDay ? 'alert' : 'idle';
}

// The face in the answer follows what it is doing and what it found.
export function moodOf(a: Pick<AskState, 'busy' | 'error' | 'result'>): Mood {
  if (a.busy) return 'thinking';
  if (a.error) return 'sorry';
  const r = a.result;
  if (!r) return 'idle';
  if (r.kind === 'out_of_scope') return 'sorry';
  if (r.kind === 'clarify') return 'unsure';
  if (r.kind !== 'result') return 'idle';
  if (r.view === 'claim') return r.matches[0]?.claim === 'confirms' ? 'alarm' : r.matches[0]?.claim === 'exaggerates' ? 'unsure' : 'happy';
  if (r.view === 'period') return r.days.length ? 'unsure' : 'happy';
  return r.level === 'high' ? 'alarm' : r.level === 'medium' || r.level === 'unknown' ? 'unsure' : 'happy';
}

// ── Input ─────────────────────────────────────────────────────────────
// One input, two homes, one layoutId. On a calm day it lives in the module,
// roomy and quiet: the text grows to three lines, examples take turns in the
// empty field, send sits at the thumb. On a strike day it docks at the
// bottom as a pill with the face inside its round end.

function AskInput({ a, big }: { a: AskState; big?: boolean }) {
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const { lang, query, setQuery, busy, setFocused, left, focused } = a;
  const out = left === 0;
  const send = () => { if (query.trim() && !busy && !out) a.ask(query); };
  // Examples take turns in the empty field, so it shows what it can do
  // without a row of suggestions.
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!big || focused || query || reduce) return;
    const t = setInterval(() => setN(k => k + 1), 3600);
    return () => clearInterval(t);
  }, [big, focused, query, reduce]);
  const example = out ? tx(lang, '今天的提问次数用完了，明天再来', 'No questions left today') : tx(lang, ...EXAMPLES[n % EXAMPLES.length]);
  // Grow with the text, up to three lines.
  useEffect(() => {
    const el = field.current;
    if (!big || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 3 * 24)}px`;
  }, [big, query]);
  const sendButton = (
    <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={!query.trim() || busy || out} aria-label={tx(lang, '发送', 'Send')}
      className={`relative shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${big ? 'w-10 h-10' : 'w-11 h-11'}`} style={{ background: query.trim() ? '#F2A33A' : C.surface3, color: query.trim() ? '#1A1204' : '#FFFFFF' }}>
      <ArrowUp size={18} weight="bold" />
    </motion.button>
  );
  const common = {
    value: query, maxLength: 200, enterKeyHint: 'send' as const, disabled: out,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setQuery(e.target.value.replace(/\n/g, ' ')),
    onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    'aria-label': tx(lang, '用一句话问罢工', 'Ask about strikes'),
  };
  return (
    <motion.form layoutId="ask-input" transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      onSubmit={e => { e.preventDefault(); send(); }}
      className={`relative w-full ${big ? 'rounded-[26px] pl-4 pr-1.5 py-1.5 flex items-end gap-2' : 'h-[56px] rounded-full pl-[58px] pr-1.5 flex items-center gap-2'}`}
      style={big ? { background: C.surface2, boxShadow: `inset 0 0 0 1px ${focused ? 'rgba(242,163,58,0.45)' : C.line}` } : PILL}>
      {/* While it works, a slow warm light travels the edge: the board's glow. */}
      {big && busy && <span aria-hidden className="pointer-events-none absolute -inset-px rounded-[27px] overflow-hidden" style={{ WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', padding: 1.5 }}>
        <motion.span className="absolute left-1/2 top-1/2 w-[700px] h-[700px] -ml-[350px] -mt-[350px]" style={{ background: 'conic-gradient(from 0deg, transparent 0 70%, rgba(255,170,50,0.95) 85%, transparent 100%)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }} />
      </span>}
      {big ? (
        <>
          <div className="relative flex-1 min-w-0 py-[8px]">
            <textarea ref={field} {...common} rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              className="block w-full resize-none bg-transparent outline-none text-white text-[16px] leading-6 pr-2 disabled:opacity-60" style={{ minHeight: 24 }} />
            {!query && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={example} aria-hidden className="absolute inset-x-0 top-[8px] pointer-events-none text-[16px] leading-6 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}
                  initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={{ duration: 0.28, ease: EASE }}>
                  {example}
                </motion.span>
              </AnimatePresence>
            )}
          </div>
          {sendButton}
        </>
      ) : (
        <>
          <input ref={field} {...common} placeholder={example}
            className="relative flex-1 min-w-0 bg-transparent outline-none text-white text-[16px] placeholder:text-white/40 disabled:opacity-60" />
          {sendButton}
        </>
      )}
    </motion.form>
  );
}

function LastAnswer({ a, compact }: { a: AskState; compact?: boolean }) {
  if (!(a.result || a.error) || a.open || a.busy) return null;
  return (
    <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} onClick={a.reopen}
      className={`max-w-full flex items-center gap-1.5 rounded-full ${compact ? 'h-8 px-3 mb-2 self-start' : 'h-8 px-3 mt-3'} text-[12.5px]`} style={{ ...PILL, color: C.text2 }}>
      <ArrowCounterClockwise size={13} weight="bold" />
      <span className="truncate max-w-[240px]">{tx(a.lang, `回到上一个回答：${a.asked}`, `Back to: ${a.asked}`)}</span>
    </motion.button>
  );
}

// The docked bar (strike days). The face sits inside the pill, left, with
// the text after it; idle on a strike day, it is on alert.
export function AskField({ ask: a }: { ask: AskState }) {
  const reduce = useReducedMotion();
  const mood = pageMood(a, true);
  return (
    <motion.div className="fixed z-[80] inset-x-0 bottom-0 pointer-events-none" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
      initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto max-w-[520px] px-4 pointer-events-auto flex flex-col">
        <AnimatePresence><LastAnswer a={a} compact /></AnimatePresence>
        <div className="relative">
          <AskInput a={a} />
          {/* Centred on the pill's round end, as Apple centres a leading icon in
              a capsule: the face's middle sits on the end circle's centre. */}
          <span className="absolute left-0 inset-y-0 w-[56px] z-10 flex items-center justify-center pointer-events-none">
            <motion.span layoutId="ask-face" transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="flex"><LedFace mood={mood} size={17} cols={13} attend={a.focused} round={42} /></motion.span>
          </span>
        </div>
        {a.left <= 2 && (
          <p className="mt-1.5 text-center text-[11.5px] font-medium" style={{ color: C.text3 }}>
            {a.left === 0 ? tx(a.lang, `每天可以问 ${DAILY_QUESTIONS} 次`, `${DAILY_QUESTIONS} questions a day`) : tx(a.lang, `今天还可以问 ${a.left} 次`, `${a.left} question${a.left === 1 ? '' : 's'} left today`)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// The calm-day module. On a day with no strike there is room, and a reason,
// to put the question front and centre: people arrive with something to
// check. The board hangs from a rail along the module's top edge, rods and
// all, as boards hang over platforms; it stays mounted while you move
// between calm days and glances the way you went.
export function AskModule({ ask: a, nudge }: { ask: AskState; nudge?: { key: string; dir: number } }) {
  return (
    <motion.section layout transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="relative mt-3 overflow-hidden px-3 pb-4" style={{ background: C.surface, borderRadius: 24 }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[170px] pointer-events-none" style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(255,160,40,0.10), transparent 70%)' }} />
      {/* The rail the board hangs from, fixed along the top edge */}
      <span aria-hidden className="absolute left-[16%] right-[16%] top-0 h-[5px] rounded-b-[3px]" style={{ background: 'linear-gradient(180deg,#5A5E66,#2A2C31)', boxShadow: '0 1px 2px rgba(0,0,0,0.6)' }} />
      <div className="relative mx-auto w-[88%] mt-[22px]">
        {[0, 1].map(i => <i key={i} aria-hidden className="absolute bottom-full h-[22px] w-[3px]" style={{ [i ? 'right' : 'left']: '24%', background: 'linear-gradient(90deg,#26282D,#73777F,#26282D)' } as React.CSSProperties} />)}
        <motion.div layoutId="ask-face" transition={{ type: 'spring', stiffness: 300, damping: 34 }}><LedBoard mood={pageMood(a, false)} nudge={nudge} attend={a.focused} /></motion.div>
      </div>
      <div className="relative flex flex-col items-center px-1">
        <p className="mt-4 text-[18px] font-semibold">{tx(a.lang, '有什么想确认的？', 'Anything to check?')}</p>
        <p className={`mt-1 mb-4 ${TYPE.label}`} style={{ color: C.text3 }}>{tx(a.lang, '某天、某条线路，或群里听到的消息', 'A day, a line, or something you heard')}</p>
        <AskInput a={a} big />
        <AnimatePresence><LastAnswer a={a} /></AnimatePresence>
      </div>
    </motion.section>
  );
}

// The answer sheet: the current answer, and the earlier ones to its left,
// one page each, a swipe apart (the past sits left, as on the date rail).
export function AskSheet({ ask: a }: { ask: AskState }) {
  const { lang, open, setOpen } = a;
  const current = a.keyOf(a.asked, a.hints);
  const past = a.history.filter(h => h.key !== current);
  // Each earlier answer as the sheet would have shown it, opened read-only
  // apart from its own trace and follow-up chips.
  const [traces, setTraces] = useState<Record<string, boolean>>({});
  const pages: AskState[] = [
    ...past.map(h => ({
      ...a, asked: h.q, hints: h.hints, busy: false, error: null, result: h.result, stages: h.stages,
      verdict: verdictOf(h.result, lang), groups: groupsOf(h.result),
      trace: !!traces[h.key],
      setTrace: ((v: boolean | ((x: boolean) => boolean)) => setTraces(t => ({ ...t, [h.key]: typeof v === 'function' ? v(!!t[h.key]) : v }))) as AskState['setTrace'],
      refine: (patch: Hints) => a.ask(h.q, { ...h.hints, ...patch }),
    })),
    a,
  ];
  const [index, setIndex] = useState(pages.length - 1);
  const strip = useRef<HTMLDivElement | null>(null);
  // Opening, or a new answer: back to the newest page.
  const last = pages.length - 1;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { const el = strip.current; if (el) el.scrollLeft = el.scrollWidth; setIndex(last); }, 0);
    return () => clearTimeout(t);
  }, [open, current, last]);
  const shown = pages[Math.min(index, last)];
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={tx(lang, '回答', 'Answer')} tall fit expand={shown.trace}
      header={<div className="flex items-center gap-3 min-w-0"><LedFace mood={moodOf(shown)} size={18} /><p className="text-[16px] font-semibold leading-snug line-clamp-2">“{shown.asked}”</p></div>}>
      {pages.length > 1 && (
        // where you are among your answers: the newest is the rightmost
        <div className="pt-0.5 pb-1 flex items-center justify-center gap-[5px]" aria-hidden>
          {pages.map((_, i) => <i key={i} className="h-[6px] rounded-full transition-all duration-300" style={{ width: i === index ? 16 : 6, background: i === index ? C.text : 'rgba(255,255,255,0.22)' }} />)}
        </div>
      )}
      <div ref={strip} onScroll={e => { const el = e.currentTarget; setIndex(Math.round(el.scrollLeft / el.clientWidth)); }}
        className="-mx-5 flex items-start overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map((p, i) => (
          <div key={i === last ? 'now' : p.asked + i} data-sheet-page={i === index ? '' : undefined} className="w-full shrink-0 snap-center px-5" aria-hidden={i !== index}>
            <AnswerBody a={p} active={i === index} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function AnswerBody({ a, active }: { a: AskState; active: boolean }) {
  const { lang, today, asked, busy, stages, trace, setTrace, error, result, refine, go, verdict, groups, setQuery } = a;
  const ask = a.ask;
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
      {busy ? (
        // Thinking is quick, so it says one thing at a time.
        <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }} className="pt-6 pb-10 flex flex-col items-center gap-3">
          <AnimatePresence mode="wait">
            <motion.p key={stages.length} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="text-[15px]" style={{ color: C.text2 }}>
              {tx(lang, ...THINKING[Math.min(stages.length, THINKING.length - 1)])}
            </motion.p>
          </AnimatePresence>
          <span className="flex gap-1.5">{[0, 1, 2, 3].map(i => <motion.i key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < stages.length ? '#F2A33A' : C.surface3 }} animate={i === stages.length ? { opacity: [0.3, 1, 0.3] } : { opacity: 1 }} transition={{ repeat: Infinity, duration: 0.9 }} />)}</span>
        </motion.div>
      ) : (
      <motion.div key="done" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>

      {error && <p className="mt-4 rounded-[12px] px-3 py-2.5 text-[14px]" style={{ background: C.surface2, color: C.text }}>{error === 'daily' ? tx(lang, `今天的 ${DAILY_QUESTIONS} 次提问已经用完了，明天再来。日历里的信息不受影响。`, `You've used today's ${DAILY_QUESTIONS} questions. The calendar still has everything.`) : error === 'rate' ? tx(lang, '问得太频繁了，请稍等一分钟。', 'Too many questions — wait a minute.') : error === 'budget' ? tx(lang, '这个月的问答额度用完了，日历里的信息不受影响。', 'This month\'s answers are used up; the calendar still has everything.') : tx(lang, '暂时回答不了，请直接查看日历。', 'Unavailable right now — use the calendar.')}</p>}

      {result?.kind === 'clarify' && (
        <div className="mt-4">
          <p className="text-[16px] font-semibold">{result.missing === 'date' ? tx(lang, '你想查哪一天？', 'Which day?') : tx(lang, '你会坐哪些交通？可以多选', 'Which transport? Pick any')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.missing === 'date' ? <>
              <Chip onClick={() => refine({ date: today })}>{tx(lang, '今天', 'Today')}</Chip>
              <Chip onClick={() => refine({ date: addDaysIso(today, 1) })}>{tx(lang, '明天', 'Tomorrow')}</Chip>
              <Chip onClick={() => refine({ range: 'week' })}>{tx(lang, '本周', 'This week')}</Chip>
              <Chip onClick={() => refine({ range: 'upcoming' })}>{tx(lang, '最近两周', 'Next 2 weeks')}</Chip>
            </> : null}
          </div>
          {result.missing === 'mode' && <ModePicker lang={lang} initial={[]} onConfirm={modes => refine({ modes })} />}
        </div>
      )}

      {result?.kind === 'navigate' && <p className="mt-4 text-[16px] font-semibold">{tx(lang, `正在打开 ${dayLabel(result.date, lang)}…`, `Opening ${dayLabel(result.date, lang)}…`)}</p>}

      {result?.kind === 'out_of_scope' && (
        <div className="mt-4">
          <p className="text-[16px] font-semibold">{result.coverage
            ? tx(lang, `我只能查今天到 ${dayLabel(result.coverage.to, lang)} 之间的罢工`, `I can only look from today to ${dayLabel(result.coverage.to, lang)}`)
            : result.place
            ? tx(lang, `暂时不覆盖「${result.place}」，目前只有 20 个城市的数据`, `“${result.place}” isn't covered yet — only 20 cities for now`)
            : tx(lang, '我只能回答意大利交通罢工的问题', 'I can only answer questions about Italian transport strikes')}</p>
          {!result.place && !result.coverage && <div className="mt-3 flex flex-col items-start gap-2">{EXAMPLES.map(e => <Chip key={e[0]} onClick={() => { const q = tx(lang, e[0], e[1]); setQuery(q); ask(q); }}>{tx(lang, e[0], e[1])}</Chip>)}</div>}
        </div>
      )}

      {result?.kind === 'result' && verdict && (
        <div className="mt-4 flex flex-col gap-3">
          {/* The answer is said by the face above: a speech bubble in the
              verdict's colour, its tail pointing up at the face, with "was this
              helpful?" as the bubble's last line. */}
          <div className="relative mt-1">
            <span aria-hidden className="absolute -top-[6px] left-[26px] w-[14px] h-[14px] rotate-45 rounded-[3px]" style={{ background: bubble(verdict[2]) }} />
            <div className="relative rounded-[20px] rounded-tl-[10px] px-4 pt-3.5 pb-2.5" style={{ background: bubble(verdict[2]) }}>
              <p className="text-[19px] font-bold flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: verdict[2] }} />{verdict[1] ? tx(lang, verdict[0], verdict[1]) : verdict[0]}</p>
              <p className="mt-1 text-[13px] tabular-nums" style={{ color: C.text2 }}>
                {result.range.from === result.range.to ? dayLabel(result.range.from, lang) : `${dayLabel(result.range.from, lang)} – ${dayLabel(result.range.to, lang)}`}
                {result.understanding.time ? ` · ${result.understanding.time}` : ''}
              </p>
              <Feedback key={asked} ask={a} inline />
            </div>
          </div>

          <Assumptions ask={a} result={result} />

          {result.unchecked > 0 && (
            <p className="rounded-[12px] px-3.5 py-2.5 text-[13px]" style={{ background: C.surface2, color: C.text2 }}>
              {tx(lang, `还有 ${result.unchecked} 条记录没有逐条判断，结论可能不完整，请在日历里查看那天。`, `${result.unchecked} more records weren't checked one by one; see the day in the calendar.`)}
            </p>
          )}
          {result.view === 'period' && result.days.map(day => (
            <button key={day.date} onClick={() => go(day.date, day.path)} className="flex items-center gap-3 rounded-[16px] px-4 py-3 text-left" style={{ background: C.surface2 }}>
              <span className="text-[15px] font-semibold w-[104px] shrink-0">{dayLabel(day.date, lang)}</span>
              <span className="flex-1 flex flex-col gap-0.5">
                {day.items.map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-[13px] tabular-nums" style={{ color: item.status === 'CANCELLED' ? C.cancel : C.text }}>
                    {item.status === 'CANCELLED' ? <ModeGlyph mode={item.category} size={14} color={C.cancel} /> : <ModeBadge mode={item.category} size={14} />}
                    <span className={item.status === 'CANCELLED' ? 'line-through' : ''}>{item.display || tx(lang, '时段待公布', 'hours pending')}</span>
                  </span>
                ))}
              </span>
              <CaretRight size={14} weight="bold" color={C.text3} />
            </button>
          ))}

          {groups.map(([mode, items]) => (
            <div key={mode} className="rounded-[18px] overflow-hidden" style={{ background: C.surface2 }}>
              <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[13px] font-medium" style={{ color: C.text3 }}>
                <ModeBadge mode={mode} size={14} />{tx(lang, '你提到的：', 'You mentioned: ')}{modeName(mode, lang)}
                {linesFor(mode, result.understanding.lines).length > 0 && <span className="flex gap-1">{linesFor(mode, result.understanding.lines).map(l => <LineBadge key={l} line={l} />)}</span>}
              </div>
              {items.map(item => {
                const card = asCard(item);
                const status = statusLine(card, today, -1, lang);
                return (
                  <div key={item.key} className="px-4 py-3" style={{ borderTop: `1px solid ${C.line}` }}>
                    <p className="text-[15px] font-semibold leading-snug">{who(item.provider, lang)}{item.national && <span className="ml-1.5 text-[11px] px-1.5 rounded-[5px]" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}</p>
                    {item.reason && item.status !== 'CANCELLED' && <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.text2 }}>{tx(lang, ...REASON[item.reason])}<Tag by="jev" p={item.relevance} lang={lang} /></p>}
                    <p className="mt-1 text-[14.5px] font-medium tabular-nums" style={{ color: TONE[status.tone] }}>{status.text}</p>
                    {item.guarantees.length > 0 && <p className="text-[12.5px] tabular-nums" style={{ color: C.run }}>{tx(lang, '保障', 'Guaranteed')} {windowsText(item.guarantees, lang)}</p>}
                    <div className="mt-2.5"><Bar card={card} /></div>
                    {item.overlap && item.overlap !== 'unknown' && item.status !== 'CANCELLED' && (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium">{result.understanding.span && item.overlap === 'strike' ? tx(lang, '你说的时段里有一部分在罢工时段内', 'Part of the time you gave is inside the strike') : tx(lang, ...OVERLAP[item.overlap])}<Tag by="rule" lang={lang} /></p>
                    )}
                    <button onClick={() => go(item.date, item.path)} className="mt-2 text-[13px] font-semibold" style={{ color: '#9FD8FF' }}>{tx(lang, `查看 ${dayLabel(item.date, lang)} 全部 →`, `See all of ${dayLabel(item.date, lang)} →`)}</button>
                  </div>
                );
              })}
            </div>
          ))}

          {result.view !== 'period' && result.understanding.modes.filter(m => !groups.some(([mode]) => mode === m.mode)).map(m => (
            <div key={m.mode} className="flex items-center gap-2.5 rounded-[18px] px-4 py-3" style={{ background: C.surface2 }}>
              <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: `${C.ok}22` }}><Check size={15} weight="bold" color={C.ok} /></span>
              <span className="flex-1 text-[15px]">{tx(lang, '你提到的：', 'You mentioned: ')}{modeName(m.mode, lang)}{linesFor(m.mode, result.understanding.lines).map(l => <span key={l} className="ml-1.5"><LineBadge line={l} /></span>)}</span>
              <span className="text-[13px] font-semibold" style={{ color: C.ok }}>{tx(lang, '没有相关罢工', 'No strike')}</span>
            </div>
          ))}

          {result.level === 'clear' && <Checked ask={a} result={result} />}

          {result.excluded.length > 0 && (
            <p className="text-[12.5px] px-1" style={{ color: C.text3 }}>
              {tx(lang, `已排除 ${result.excluded.length} 条无关记录：`, `Excluded ${result.excluded.length}: `)}{result.excluded.map(e => `${modeName(e.category, lang)} ${who(e.provider, lang)}`).join(tx(lang, '、', ', '))}
            </p>
          )}
        </div>
      )}

      {result?.kind === 'result' && <ShareAnswer ask={a} />}
      {result?.kind === 'clarify' && <Feedback key={asked} ask={a} />}

      {stages.length > 0 && (
        <div className="mt-3 mb-1">
          <button data-sheet-fit={active ? '' : undefined} onClick={e => { const el = e.currentTarget; setTrace(v => !v); if (!trace) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380); }} aria-expanded={trace} className="w-full flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: C.surface2, color: C.text2 }}>
            <span>{tx(lang, `完整判断过程 · ${stages.length} 步 · ${(stages.reduce((s, x) => s + x.ms, 0) / 1000).toFixed(1)} 秒`, `Full decision trace · ${stages.length} steps`)}</span>
            <motion.span animate={{ rotate: trace ? 180 : 0 }} className="flex"><CaretDown size={13} weight="bold" /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {trace && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
                <Stages stages={stages} lang={lang} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}

function Stages({ stages, busy = false, lang }: { stages: StageEvent[]; busy?: boolean; lang: Lang }) {
  return (
    <ol className="mt-3 flex flex-col gap-1.5">
      {(['understand', 'retrieve', 'judge', 'evidence'] as const).map((id, i) => {
        const stage = stages.find(s => s.id === id);
        const pending = !stage && busy && i === stages.length;
        if (!stage && !pending) return null;
        return (
          <motion.li key={id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-[12px] px-3 py-2" style={{ background: C.surface2 }}>
            <div className="flex items-center gap-2 text-[13px] font-medium">
              {stage ? <Check size={13} weight="bold" color={C.ok} /> : <motion.span className="w-[7px] h-[7px] rounded-full" style={{ background: '#9FD8FF' }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} />}
              {tx(lang, ...STAGE_LABEL[id])}
              {stage && <span className="ml-auto text-[11.5px] tabular-nums" style={{ color: C.text3 }}>{stage.ms} ms</span>}
            </div>
            {stage && stage.facts.some(f => f.value) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {stage.facts.filter(f => f.value).map((f, k) => (
                  <span key={k} className="flex items-center gap-1 text-[11.5px] rounded-[7px] px-1.5 py-[2px]" style={{ background: C.surface2 }}>
                    <span style={{ color: C.text3 }}>{tx(lang, ...(FACT[f.label] || [f.label, f.label]))}</span>
                    <span>{f.label === 'intent' ? tx(lang, ...(INTENT[f.value] || [f.value, f.value])) : f.label === 'sync' ? f.value.slice(5, 16).replace('T', ' ') : f.value}</span>
                    <Tag by={f.by} p={f.p} lang={lang} />
                  </span>
                ))}
              </div>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

const THINKING: [string, string][] = [['正在理解你的问题…', 'Reading your question…'], ['正在查官方记录…', 'Checking official records…'], ['正在逐条判断…', 'Weighing each strike…'], ['正在核对证据…', 'Checking the evidence…'], ['马上好…', 'Almost there…']];

// Share an answer: the question, the verdict and a link to the day.
function ShareAnswer({ ask: a }: { ask: AskState }) {
  const { lang, asked, result, verdict } = a;
  const [copied, setCopied] = useState(false);
  if (result?.kind !== 'result') return null;
  const share = async () => {
    const day = result.range.from;
    const url = `${window.location.origin}${window.location.pathname}?date=${day}`;
    const head = verdict ? (verdict[1] ? tx(lang, verdict[0], verdict[1]) : verdict[0]) : '';
    const text = tx(lang, `我问：${asked}\n答：${head}（${dayLabel(day, lang)}）`, `Q: ${asked}\nA: ${head} (${dayLabel(day, lang)})`);
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text, url }); } catch { /* dismissed */ } return; }
    await navigator.clipboard?.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={share} className="mt-4 w-full h-11 rounded-[14px] flex items-center justify-center gap-1.5 text-[14.5px] font-semibold" style={{ background: C.surface3, color: '#FFFFFF' }}>
      {copied ? <Check size={16} weight="bold" /> : <Export size={16} weight="bold" />}{copied ? tx(lang, '已复制，可以发给朋友', 'Copied') : tx(lang, '分享这个回答', 'Share this answer')}
    </button>
  );
}

// After an answer: was it good? Each rating keeps the question, how it was
// read and what was shown, so bad cases can be replayed and fixed.
const BAD_REASONS: [string, string, string][] = [['misread', '理解错了', 'Misread'], ['irrelevant', '有无关结果', 'Irrelevant results'], ['wrong', '结论不对', 'Wrong answer'], ['missing', '漏了信息', 'Missing something']];
const bubble = (color: string) => `color-mix(in srgb, ${color} 17%, ${C.surface})`;

function Feedback({ ask: a, inline = false }: { ask: AskState; inline?: boolean }) {
  const { lang, asked, result, stages } = a;
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Only say thanks when it was actually stored; otherwise offer a retry.
  const send = async (r: 'good' | 'bad', why: string | null = null) => {
    setFailed(false);
    try {
      const res = await fetch('/api/ask/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: r, reason: why, query: asked, city: a.region, answer: result, trace: stages.map(s => ({ id: s.id, ms: s.ms, facts: s.facts })) }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch { setFailed(true); setRating(null); setReason(null); }
  };
  const chip = inline ? 'rgba(255,255,255,0.08)' : C.surface3;
  return (
    <div className={inline ? 'mt-3 pt-2.5' : 'mt-4 rounded-[14px] px-4 py-3'} style={inline ? { borderTop: '1px solid rgba(255,255,255,0.08)' } : { background: C.surface2 }}>
      {rating === null ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13px]" style={{ color: failed ? C.stop : C.text2 }}>{failed ? tx(lang, '没提交成功，再点一次试试', 'Not sent — try again') : tx(lang, '这个回答有帮助吗？', 'Was this helpful?')}</span>
          <button onClick={() => { setRating('good'); send('good'); }} aria-label={tx(lang, '答得好', 'Good answer')} className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[12.5px] font-medium" style={{ background: chip, color: C.text }}><ThumbsUp size={14} weight="bold" />{tx(lang, '答得好', 'Good')}</button>
          <button onClick={() => setRating('bad')} aria-label={tx(lang, '答得不好', 'Bad answer')} className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[12.5px] font-medium" style={{ background: chip, color: C.text }}><ThumbsDown size={14} weight="bold" />{tx(lang, '不好', 'Bad')}</button>
        </div>
      ) : rating === 'bad' && reason === null ? (
        <div>
          <p className="text-[13.5px]" style={{ color: C.text2 }}>{tx(lang, '哪里不好？', 'What went wrong?')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BAD_REASONS.map(([key, zh, en]) => (
              <button key={key} onClick={() => { setReason(key); send('bad', key); }} className="h-8 px-3 rounded-full text-[13px]" style={{ background: chip, color: C.text }}>{tx(lang, zh, en)}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[13.5px] flex items-center gap-1.5" style={{ color: C.text2 }}><Check size={14} weight="bold" color={C.ok} />{tx(lang, '谢谢，我们会用它改进回答', 'Thanks — this helps us improve')}</p>
      )}
    </div>
  );
}

// Transport, several at once, then confirm: one tap per mode would send a
// question for each.
function ModePicker({ lang, initial, onConfirm }: { lang: Lang; initial: Mode[]; onConfirm: (modes: Mode[]) => void }) {
  const [picked, setPicked] = useState<Mode[]>(initial);
  const toggle = (m: Mode) => setPicked(p => (p.includes(m) ? p.filter(x => x !== m) : [...p, m]));
  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-2">
        {(['SUBWAY', 'BUS', 'TRAIN', 'AIRPORT'] as Mode[]).map(m => {
          const on = picked.includes(m);
          return (
            <motion.button key={m} whileTap={{ scale: 0.95 }} onClick={() => toggle(m)} aria-pressed={on}
              className="relative h-[68px] rounded-[16px] flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold" style={{ background: on ? C.surface3 : C.surface2, boxShadow: on ? 'inset 0 0 0 1.5px rgba(255,255,255,0.7)' : 'none', color: on ? C.text : C.text2 }}>
              {on ? <ModeBadge mode={m} size={22} /> : <ModeGlyph mode={m} size={20} />}{modeName(m, lang)}
              {on && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#FFFFFF' }}><Check size={10} weight="bold" color="#000" /></span>}
            </motion.button>
          );
        })}
      </div>
      <button disabled={!picked.length} onClick={() => onConfirm(picked)} className="mt-3 w-full h-11 rounded-[14px] text-[14.5px] font-semibold disabled:opacity-40" style={{ background: '#454A54', color: '#FFFFFF' }}>
        {picked.length ? tx(lang, `按 ${picked.map(m => modeName(m, lang)).join('、')} 查`, `Check ${picked.map(m => modeName(m, lang)).join(', ')}`) : tx(lang, '至少选一种', 'Pick at least one')}
      </button>
    </div>
  );
}

// What the answer took for granted, each correctable where it can be.
function Assumptions({ ask: a, result }: { ask: AskState; result: Extract<AskResult, { kind: 'result' }> }) {
  const { lang } = a;
  const [editing, setEditing] = useState(false);
  const list = result.understanding.assumptions || [];
  const local = list.find(x => x.kind === 'local_modes');
  const part = list.find(x => x.kind === 'day_part');
  const abroad = list.find(x => x.kind === 'abroad');
  if (!local && !part && !abroad) return null;
  return (
    <div className="flex flex-col gap-2">
      {(local || part) && (
        <div className="rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: C.surface2, color: C.text2 }}>
          <span style={{ color: C.text3 }}>{tx(lang, '我是这样理解的：', 'Read as: ')}</span>
          {local && local.kind === 'local_modes' && <>{tx(lang, '日常出行，查', 'everyday travel: ')}{local.modes.map(m => modeName(m, lang)).join(tx(lang, '、', ', '))}{tx(lang, '（不含机场）', ' (no flights)')}</>}
          {local && part && tx(lang, '；', '; ')}
          {part && part.kind === 'day_part' && <>{tx(lang, `${part.zh}按 ${part.from}–${part.to} 算`, `${part.en} as ${part.from}–${part.to}`)}</>}
          {local && !editing && <button onClick={() => setEditing(true)} className="ml-1.5 font-semibold" style={{ color: '#9FD8FF' }}>{tx(lang, '改交通', 'Change')}</button>}
          {editing && local && local.kind === 'local_modes' && <ModePicker lang={lang} initial={local.modes} onConfirm={modes => { setEditing(false); a.refine({ modes }); }} />}
        </div>
      )}
      {abroad && abroad.kind === 'abroad' && (
        <div className="rounded-[14px] px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: C.surface2, color: C.text2 }}>
          <p className="text-[14px] font-semibold" style={{ color: C.text }}>{tx(lang, `去${abroad.zh}：这里只覆盖意大利境内这一段`, `To ${abroad.en}: only the Italian part is covered`)}</p>
          <p className="mt-1">{tx(lang,
            `到边境前的列车由 Trenord 或 Trenitalia 运营，会受意大利铁路罢工影响，上面的结论就是这一段的。过境后由${abroad.country === 'CH' ? '瑞士联邦铁路 SBB' : '当地铁路'}运营，不在意大利的罢工登记里，本站没有那一段的数据。`,
            `Up to the border the train is run by Trenord or Trenitalia and is affected by Italian rail strikes; the answer above is about that part. Past the border it is run by ${abroad.country === 'CH' ? 'Swiss Federal Railways (SBB)' : 'the local railway'}, which is not in Italy's strike register and not covered here.`)}</p>
        </div>
      )}
    </div>
  );
}

const romeStamp = (iso: string, lang: Lang) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return tx(lang, `${p.month}月${p.day}日 ${p.hour}:${p.minute}`, `${p.day}/${p.month} ${p.hour}:${p.minute}`);
};

// A "no strike" answer says what it is based on.
function Checked({ ask: a, result }: { ask: AskState; result: Extract<AskResult, { kind: 'result' }> }) {
  const { lang } = a;
  const modes = result.checked?.modes.length ? result.checked.modes : (['SUBWAY', 'BUS', 'TRAIN', 'AIRPORT'] as Mode[]);
  const range = result.range.from === result.range.to ? dayLabel(result.range.from, lang) : `${dayLabel(result.range.from, lang)} – ${dayLabel(result.range.to, lang)}`;
  return (
    <div className="rounded-[14px] px-3.5 py-3 text-[13px]" style={{ background: C.surface2, color: C.text2 }}>
      <p className="font-semibold" style={{ color: C.text }}>{tx(lang, '查过的范围', 'What was checked')}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        <li className="flex items-center gap-1.5"><Check size={12} weight="bold" color={C.ok} />{tx(lang, '意大利交通部罢工登记，以及运营方公告', 'Italy\'s official strike register and operator notices')}</li>
        <li className="flex items-center gap-1.5"><Check size={12} weight="bold" color={C.ok} /><span className="flex items-center gap-1">{modes.map(m => <ModeBadge key={m} mode={m} size={14} />)}</span>{modes.map(m => modeName(m, lang)).join(tx(lang, '、', ', '))} · {range}</li>
        {result.lastSync && <li className="flex items-center gap-1.5"><Check size={12} weight="bold" color={C.ok} />{tx(lang, `数据更新于 ${romeStamp(result.lastSync, lang)}`, `Data as of ${romeStamp(result.lastSync, lang)}`)}</li>}
      </ul>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="h-10 px-4 rounded-full text-[14px] font-medium text-left" style={{ background: C.surface3 }}>
      {children}
    </motion.button>
  );
}
