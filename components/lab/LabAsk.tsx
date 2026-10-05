'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowCounterClockwise, ArrowUp, CaretDown, CaretRight, Check, Export, ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { LedBoard, LedFace, type Mood } from './Led';
import type { AskResult, Fact, Hints, Judged, StageEvent } from '../../lib/ask/pipeline';
import { dayLabel, modeName, statusLine, tx, type Lang, type Mode, type ModeCard } from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
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
  windows: j.windows, guarantees: j.guarantees, guaranteeSource: j.guarantees.length ? 'OFFICIAL_STRIKE_NOTICE' : 'UNKNOWN', guaranteeKind: j.category === 'AIRPORT' ? 'PROTECTED_FLIGHTS' : 'GUARANTEED_SERVICE',
  lines: j.lines, unknownTiming: !j.windows.length, confidence: '', sources: j.sources, events: [],
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

  async function ask(text: string, next: Hints = {}) {
    const q = text.trim().slice(0, 200);
    if (!q) return;
    const cached = recall(keyOf(q, next));
    if (cached) {
      setAsked(q); setHints(next); setStages(cached.stages); setResult(cached.result); setError(null); setTrace(false); setBusy(false); setOpen(true);
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    // Refining an answer (picking a date or mode) is part of the same question.
    const fresh = q !== asked || !Object.keys(next).length;
    if (fresh && readQuota(today) >= DAILY_QUESTIONS) { setAsked(q); setOpen(true); setResult(null); setStages([]); setError('daily'); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAsked(q); setHints(next); setOpen(true); setBusy(true); setStages([]); setResult(null); setError(null); setTrace(false);
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(fresh ? {} : { 'x-ask-refine': '1' }) }, body: JSON.stringify({ query: q, city: region, hints: next }), signal: controller.signal });
      if (!res.ok || !res.body) {
        const reason = res.status === 429 ? ((await res.json().catch(() => ({}))).error === 'daily_limit' ? 'daily' : 'rate') : 'down';
        setError(reason); setBusy(false); return;
      }
      if (fresh) {
        const count = readQuota(today) + 1;
        try { localStorage.setItem(QUOTA_KEY, JSON.stringify({ date: today, used: count })); } catch { /* ignore */ }
        setUsed(count);
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
            setResult(event.result);
            if (event.result.kind === 'result' || event.result.kind === 'clarify') remember(keyOf(q, next), { stages: seen, result: event.result });
            if (event.result.kind === 'navigate') setTimeout(() => go(event.result.date, event.result.path), 700);
          } else if (event.type === 'error') setError('down');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('down');
    } finally {
      setBusy(false);
    }
  }
  const refine = (patch: Hints) => ask(asked, { ...hints, ...patch, modes: [...(hints.modes || []), ...(patch.modes || [])] });

  const verdict = result?.kind === 'result'
    ? result.view === 'claim' ? CLAIM[result.matches[0]?.claim || 'none']
      : result.view === 'period'
        ? (result.days.length ? [tx(lang, `这段时间有 ${result.days.length} 天有罢工`, `Strikes on ${result.days.length} day(s)`), '', C.pend] : [tx(lang, '这段时间没有已公布的罢工', 'No strikes announced'), '', C.ok])
        : LEVEL[result.level]
    : null;

  // Group matches by mode, in the order the user mentioned them.
  const groups = result?.kind === 'result' ? (() => {
    const order = result.understanding.modes.map(m => m.mode);
    const map = new Map<Mode, Judged[]>();
    result.matches.forEach(m => map.set(m.category, [...(map.get(m.category) || []), m]));
    return [...map].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99);
  })() : [];

  return { lang, today, region, query, setQuery, asked, open, setOpen, busy, stages, result, error, trace, setTrace, focused, setFocused, ask, refine, go, verdict, groups, left, reopen };
}

// The face of the assistant follows what it is doing and what it found.
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
// One input, two homes, one layoutId. On a calm day it lives in the module
// under the "no strikes" card, big and centred; on a strike day it docks at
// the bottom within thumb reach. Switching day moves it between the two, and
// the board above it shrinks into the face on the bar.

function AskInput({ a, big, autoFocus }: { a: AskState; big?: boolean; autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { lang, query, setQuery, busy, setFocused, left, focused } = a;
  const out = left === 0;
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  return (
    <motion.form layoutId="ask-input" transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      onSubmit={e => { e.preventDefault(); a.ask(query); }}
      className={`relative w-full flex items-center gap-2 ${big ? 'h-[60px] rounded-[22px] pl-5 pr-2' : 'h-[56px] rounded-full pl-[78px] pr-1.5'}`}
      style={big ? { background: C.surface2 } : PILL}>
      {/* A slow warm ring, the board's light reflected in the field */}
      {big && <span aria-hidden className="pointer-events-none absolute -inset-px rounded-[23px] overflow-hidden" style={{ WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', padding: 1 }}>
        <motion.span className="absolute left-1/2 top-1/2 w-[700px] h-[700px] -ml-[350px] -mt-[350px]" style={{ background: 'conic-gradient(from 0deg, rgba(255,170,50,0.9), rgba(255,95,80,0.5), rgba(150,120,255,0.55), rgba(255,170,50,0.9))', opacity: focused || busy ? 1 : 0.45 }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: busy ? 2.2 : 9, ease: 'linear' }} />
      </span>}
      <input ref={input} value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={200} enterKeyHint="send" disabled={out}
        aria-label={tx(lang, '用一句话问罢工', 'Ask about strikes')}
        placeholder={out ? tx(lang, '今天的提问次数用完了，明天再来', 'No questions left today') : tx(lang, '比如：周五早上 9 点坐 M1 受影响吗？', 'e.g. Is the M1 running Friday at 9?')}
        className={`relative flex-1 min-w-0 bg-transparent outline-none text-white placeholder:text-white/40 disabled:opacity-60 ${big ? 'text-[16px]' : 'text-[16px]'}`} />
      <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={!query.trim() || busy || out} aria-label={tx(lang, '发送', 'Send')}
        className="relative w-11 h-11 rounded-full flex items-center justify-center transition-opacity disabled:opacity-35" style={{ background: query.trim() ? '#F2A33A' : '#3A3F48', color: query.trim() ? '#1A1204' : '#FFFFFF' }}>
        <ArrowUp size={18} weight="bold" />
      </motion.button>
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

// The docked bar (strike days).
export function AskField({ ask: a }: { ask: AskState }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="fixed z-[80] inset-x-0 bottom-0 pointer-events-none" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
      initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto max-w-[520px] px-4 pointer-events-auto flex flex-col">
        <AnimatePresence><LastAnswer a={a} compact /></AnimatePresence>
        <div className="relative">
          <AskInput a={a} />
          <motion.span layoutId="ask-face" transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="absolute left-3 -top-[13px] z-10"><LedFace mood={moodOf(a)} size={16} /></motion.span>
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
// check. A hanging board, one question, one field, nothing else to choose
// from. It stays mounted while you move between calm days; the board
// announces each day as it passes.
export function AskModule({ ask: a, lines, message }: { ask: AskState; lines: string[]; message?: string }) {
  return (
    <motion.section layout transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="relative mt-3 overflow-hidden" style={{ background: C.surface, borderRadius: 24 }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[150px] pointer-events-none" style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(255,160,40,0.14), transparent 70%)' }} />
      <div className="relative flex flex-col items-center px-4 pb-5">
        <motion.div layoutId="ask-face" transition={{ type: 'spring', stiffness: 300, damping: 34 }}><LedBoard mood={moodOf(a)} lines={lines} message={message} /></motion.div>
        <p className="mt-4 text-[18px] font-semibold">{tx(a.lang, '有什么想确认的？', 'Anything to check?')}</p>
        <p className={`mt-1 mb-4 ${TYPE.label}`} style={{ color: C.text3 }}>{tx(a.lang, '某天、某条线路，或群里听到的消息', 'A day, a line, or something you heard')}</p>
        <AskInput a={a} big />
        <AnimatePresence><LastAnswer a={a} /></AnimatePresence>
        {a.left <= 2 && <p className="mt-2 text-[11.5px] font-medium" style={{ color: C.text3 }}>{a.left === 0 ? tx(a.lang, `每天可以问 ${DAILY_QUESTIONS} 次`, `${DAILY_QUESTIONS} questions a day`) : tx(a.lang, `今天还可以问 ${a.left} 次`, `${a.left} left today`)}</p>}
      </div>
    </motion.section>
  );
}

export function AskSheet({ ask: a }: { ask: AskState }) {
  const { lang, today, open, setOpen, asked, busy, stages, trace, setTrace, error, result, refine, go, verdict, groups, setQuery } = a;
  const ask = a.ask;
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={tx(lang, '回答', 'Answer')} tall dismissFromTop
      header={<div className="flex items-center gap-3 min-w-0"><LedFace mood={moodOf(a)} size={18} /><p className="text-[16px] font-semibold leading-snug line-clamp-2">“{asked}”</p></div>}>
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

      {error && <p className="mt-4 rounded-[12px] px-3 py-2.5 text-[14px]" style={{ background: C.surface2, color: C.text }}>{error === 'daily' ? tx(lang, `今天的 ${DAILY_QUESTIONS} 次提问已经用完了，明天再来。日历里的信息不受影响。`, `You've used today's ${DAILY_QUESTIONS} questions. The calendar still has everything.`) : error === 'rate' ? tx(lang, '问得太频繁了，请稍等一分钟。', 'Too many questions — wait a minute.') : tx(lang, '暂时回答不了，请直接查看日历。', 'Unavailable right now — use the calendar.')}</p>}

      {result?.kind === 'clarify' && (
        <div className="mt-4">
          <p className="text-[16px] font-semibold">{result.missing === 'date' ? tx(lang, '你想查哪一天？', 'Which day?') : tx(lang, '你坐什么交通？', 'Which transport?')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.missing === 'date' ? <>
              <Chip onClick={() => refine({ date: today })}>{tx(lang, '今天', 'Today')}</Chip>
              <Chip onClick={() => refine({ date: addDaysIso(today, 1) })}>{tx(lang, '明天', 'Tomorrow')}</Chip>
              <Chip onClick={() => refine({ range: 'week' })}>{tx(lang, '本周', 'This week')}</Chip>
              <Chip onClick={() => refine({ range: 'upcoming' })}>{tx(lang, '最近两周', 'Next 2 weeks')}</Chip>
            </> : (['SUBWAY', 'BUS', 'TRAIN', 'AIRPORT'] as Mode[]).map(m => (
              <Chip key={m} onClick={() => refine({ modes: [m] })}><span className="flex items-center gap-1.5"><ModeGlyph mode={m} size={15} />{modeName(m, lang)}</span></Chip>
            ))}
          </div>
        </div>
      )}

      {result?.kind === 'navigate' && <p className="mt-4 text-[16px] font-semibold">{tx(lang, `正在打开 ${dayLabel(result.date, lang)}…`, `Opening ${dayLabel(result.date, lang)}…`)}</p>}

      {result?.kind === 'out_of_scope' && (
        <div className="mt-4">
          <p className="text-[16px] font-semibold">{tx(lang, '我只能回答意大利交通罢工的问题', 'I can only answer questions about Italian transport strikes')}</p>
          <div className="mt-3 flex flex-col items-start gap-2">{EXAMPLES.map(e => <Chip key={e[0]} onClick={() => { const q = tx(lang, e[0], e[1]); setQuery(q); ask(q); }}>{tx(lang, e[0], e[1])}</Chip>)}</div>
        </div>
      )}

      {result?.kind === 'result' && verdict && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-[18px] px-4 py-3.5" style={{ background: `${verdict[2]}24` }}>
            <p className="text-[19px] font-bold flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: verdict[2] }} />{verdict[1] ? tx(lang, verdict[0], verdict[1]) : verdict[0]}</p>
            <p className="mt-1 text-[13px] tabular-nums" style={{ color: C.text2 }}>
              {result.range.from === result.range.to ? dayLabel(result.range.from, lang) : `${dayLabel(result.range.from, lang)} – ${dayLabel(result.range.to, lang)}`}
              {result.understanding.time ? ` · ${result.understanding.time}` : ''}
            </p>
          </div>

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
                    <p className="text-[15px] font-semibold leading-snug">{item.provider}{item.national && <span className="ml-1.5 text-[11px] px-1.5 rounded-[5px]" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}</p>
                    {item.reason && item.status !== 'CANCELLED' && <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: C.text2 }}>{tx(lang, ...REASON[item.reason])}<Tag by="jev" p={item.relevance} lang={lang} /></p>}
                    <p className="mt-1 text-[14.5px] font-medium tabular-nums" style={{ color: TONE[status.tone] }}>{status.text}</p>
                    {item.guarantees.length > 0 && <p className="text-[12.5px] tabular-nums" style={{ color: C.ok }}>{tx(lang, '保障', 'Guaranteed')} {item.guarantees.map(g => `${g.start}–${g.end}`).join(tx(lang, '、', ', '))}</p>}
                    <div className="mt-2.5"><Bar card={card} /></div>
                    {item.overlap && item.overlap !== 'unknown' && item.status !== 'CANCELLED' && (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium">{tx(lang, ...OVERLAP[item.overlap])}<Tag by="rule" lang={lang} /></p>
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

          {result.excluded.length > 0 && (
            <p className="text-[12.5px] px-1" style={{ color: C.text3 }}>
              {tx(lang, `已排除 ${result.excluded.length} 条无关记录：`, `Excluded ${result.excluded.length}: `)}{result.excluded.map(e => `${modeName(e.category, lang)} ${e.provider}`).join('、')}
            </p>
          )}
        </div>
      )}

      {result?.kind === 'result' && <ShareAnswer ask={a} />}
      {(result?.kind === 'result' || result?.kind === 'clarify') && <Feedback key={asked} ask={a} />}

      {stages.length > 0 && (
        <div className="mt-3 mb-1">
          <button onClick={() => setTrace(v => !v)} aria-expanded={trace} className="w-full flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: C.surface2, color: C.text2 }}>
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
    </Sheet>
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
    const url = `${window.location.origin}${window.location.pathname}?city=${a.region}&date=${day}`;
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
function Feedback({ ask: a }: { ask: AskState }) {
  const { lang, asked, result, stages } = a;
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const send = (r: 'good' | 'bad', why: string | null = null) => {
    fetch('/api/ask/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: r, reason: why, query: asked, answer: result, trace: stages.map(s => ({ id: s.id, ms: s.ms, facts: s.facts })) }),
    }).catch(() => {});
  };
  return (
    <div className="mt-4 rounded-[14px] px-4 py-3" style={{ background: C.surface2 }}>
      {rating === null ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[13.5px]" style={{ color: C.text2 }}>{tx(lang, '这个回答有帮助吗？', 'Was this helpful?')}</span>
          <button onClick={() => { setRating('good'); send('good'); }} aria-label={tx(lang, '答得好', 'Good answer')} className="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium" style={{ background: C.surface3, color: C.text }}><ThumbsUp size={15} weight="bold" />{tx(lang, '答得好', 'Good')}</button>
          <button onClick={() => setRating('bad')} aria-label={tx(lang, '答得不好', 'Bad answer')} className="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium" style={{ background: C.surface3, color: C.text }}><ThumbsDown size={15} weight="bold" />{tx(lang, '不好', 'Bad')}</button>
        </div>
      ) : rating === 'bad' && reason === null ? (
        <div>
          <p className="text-[13.5px]" style={{ color: C.text2 }}>{tx(lang, '哪里不好？', 'What went wrong?')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BAD_REASONS.map(([key, zh, en]) => (
              <button key={key} onClick={() => { setReason(key); send('bad', key); }} className="h-8 px-3 rounded-full text-[13px]" style={{ background: C.surface3, color: C.text }}>{tx(lang, zh, en)}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[13.5px] flex items-center gap-1.5" style={{ color: C.text2 }}><Check size={14} weight="bold" color={C.ok} />{tx(lang, '谢谢，我们会用它改进回答', 'Thanks — this helps us improve')}</p>
      )}
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
