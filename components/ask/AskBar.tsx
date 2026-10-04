'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppLanguage } from '../i18n';
import { pickText } from '../i18n';
import type { AskResult, Fact, Hints, Judged, StageEvent } from '../../lib/ask/pipeline';
import type { Mode } from '../../lib/ask/parseQuery';
import { addDaysIso, romeTodayIso, weekdayOfIso } from '../../lib/romeDate';

// The answer is never free text: every line below is a database fact, a
// deterministic computation, or a Jev decision shown with its probability.

type Stage = StageEvent['id'];
const STAGES: Stage[] = ['understand', 'retrieve', 'judge', 'evidence'];
const STAGE_LABEL: Record<Stage, [string, string]> = {
  understand: ['理解问题', 'Understanding'],
  retrieve: ['检索官方记录', 'Searching official records'],
  judge: ['逐条判断相关性', 'Judging each record'],
  evidence: ['核对证据', 'Checking evidence'],
};
const MODE_LABEL: Record<Mode, [string, string]> = { TRAIN: ['火车', 'Train'], SUBWAY: ['地铁', 'Metro'], BUS: ['公交', 'Bus'], AIRPORT: ['机场', 'Airport'] };
const FACT_LABEL: Record<string, [string, string]> = {
  intent: ['问题类型', 'Intent'], date: ['日期', 'Date'], time: ['时间', 'Time'], city: ['城市', 'City'], mode: ['交通', 'Mode'], line: ['线路', 'Line'],
  range: ['范围', 'Range'], records: ['当期记录', 'Records'], candidates: ['候选', 'Candidates'], judged: ['已判断', 'Judged'], skipped: ['未判断', 'Skipped'],
  cost: ['花费', 'Cost'], matches: ['相关', 'Relevant'], excluded: ['排除', 'Excluded'], sync: ['数据更新', 'Data synced'],
};
const INTENT_LABEL: Record<string, [string, string]> = {
  trip_check: ['行程影响', 'Trip impact'], day_check: ['某天罢工', 'One day'], period_check: ['一段时间', 'A period'], claim_check: ['核实消息', 'Verify a claim'], other: ['无关问题', 'Off topic'],
};
const LEVEL: Record<string, { zh: string; en: string; color: string }> = {
  high: { zh: '很可能受影响', en: 'Likely affected', color: '#de4141' },
  unknown: { zh: '有罢工，具体时段待公布', en: 'Strike announced, hours pending', color: '#f5a524' },
  medium: { zh: '可能受影响', en: 'Possibly affected', color: '#f5a524' },
  low: { zh: '影响较小：在保障时段内', en: 'Low impact: within guaranteed hours', color: '#5ab91b' },
  none: { zh: '你的时间不在罢工时段内', en: 'Your time is outside the strike hours', color: '#5ab91b' },
  cancelled: { zh: '相关罢工已取消', en: 'The strike was cancelled', color: '#5ab91b' },
  clear: { zh: '官方记录中没有相关罢工', en: 'No relevant strike in official records', color: '#5ab91b' },
};
const CLAIM: Record<string, { zh: string; en: string; color: string }> = {
  confirms: { zh: '消息属实', en: 'The message is accurate', color: '#de4141' },
  exaggerates: { zh: '确有罢工，但消息有夸大', en: 'Real strike, but exaggerated', color: '#f5a524' },
  contradicts: { zh: '与官方记录不符', en: 'Contradicts official records', color: '#5ab91b' },
  none: { zh: '官方记录中查无此事', en: 'Not found in official records', color: '#5ab91b' },
};
const REASON: Record<string, [string, string]> = {
  direct: ['直接相关：你乘坐的交通方式与运营方', 'Direct: your mode and operator'],
  broad: ['覆盖面广：全国或综合性罢工', 'Broad: national or general strike'],
  adjacent: ['间接相关：影响你前往目的地的交通', 'Indirect: how you get there'],
  other_operator: ['同类交通，但不是你乘坐的运营方', 'Same mode, different operator'],
  unrelated: ['与你的问题无关', 'Unrelated'],
};
const ACTION: Record<string, [string, string]> = {
  as_planned: ['按原计划出行', 'Travel as planned'],
  guarantee_window: ['在保障时段内出行', 'Travel in guaranteed hours'],
  switch_mode: ['改用其他交通方式', 'Use another mode'],
  extra_time: ['预留更多时间', 'Allow extra time'],
  reschedule: ['考虑改期或改时间', 'Consider rescheduling'],
  watch_updates: ['留意运营方公布的时段', 'Watch for operator updates'],
};
const EXAMPLES: [string, string][] = [
  ['周五早上9点坐 M1 会受影响吗？', 'Is the M1 affected Friday at 9am?'],
  ['我10月16日下午从马尔彭萨起飞', 'Flying from Malpensa on 16 Oct afternoon'],
  ['群里说12月4号全意大利火车停运，是真的吗？', 'Is it true all trains stop on 4 Dec?'],
];

function t(language: AppLanguage, pair: [string, string]) {
  return pickText(language, pair[0], pair[1]);
}

function dateLabel(iso: string, language: AppLanguage) {
  const week = language === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const [, m, d] = iso.split('-').map(Number);
  return language === 'en' ? `${d}/${m} ${week[weekdayOfIso(iso)]}` : `${m}月${d}日 ${week[weekdayOfIso(iso)]}`;
}

function syncLabel(iso: string | null, language: AppLanguage) {
  if (!iso) return pickText(language, '未知', 'unknown');
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function SourceTag({ by, p, language }: { by: Fact['by']; p?: number | null; language: AppLanguage }) {
  const style = by === 'jev' ? 'bg-[#5dcdff]/15 text-[#5dcdff]' : by === 'db' ? 'bg-white/10 text-white/70' : by === 'default' ? 'bg-white/5 text-white/40' : 'bg-[#5ab91b]/15 text-[#8fdc5a]';
  const label = by === 'jev' ? `Jev${p != null ? ` ${Math.round(p * 100)}%` : ''}` : by === 'db' ? pickText(language, '数据库', 'DB') : by === 'default' ? pickText(language, '默认', 'default') : pickText(language, '规则', 'rule');
  return <span className={`text-[10px] font-semibold px-1.5 py-[1px] rounded ${style}`}>{label}</span>;
}

function factValue(fact: Fact, language: AppLanguage) {
  if (fact.label === 'intent') return t(language, INTENT_LABEL[fact.value] || [fact.value, fact.value]);
  if (fact.label === 'sync') return syncLabel(fact.value || null, language);
  return fact.value || pickText(language, '未提及', 'not given');
}

function minutes(value: string | null, fallback: number) {
  if (!value) return fallback;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function Timeline({ match, time, language }: { match: Judged; time: string | null; language: AppLanguage }) {
  const strike = match.windows.map(w => {
    const start = minutes(w.start, 0);
    const end = w.end_kind === 'end_of_service' ? 1440 : minutes(w.end, 1440);
    return { start, end: end <= start ? 1440 : end };
  });
  const cancelled = match.status === 'CANCELLED';
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
        {strike.map((s, i) => (
          <div key={i} className="absolute top-0 h-full" style={{ left: `${(s.start / 1440) * 100}%`, width: `${((s.end - s.start) / 1440) * 100}%`, background: cancelled ? 'rgba(255,255,255,0.25)' : '#de4141' }} />
        ))}
        {!cancelled && match.guarantees.map((g, i) => (
          <div key={`g${i}`} className="absolute top-0 h-full bg-[#5ab91b]" style={{ left: `${(minutes(g.start, 0) / 1440) * 100}%`, width: `${((minutes(g.end, 1440) - minutes(g.start, 0)) / 1440) * 100}%` }} />
        ))}
        {!match.windows.length && <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.12)_0_6px,transparent_6px_12px)]" />}
      </div>
      <div className="relative h-5 text-[10px] text-white/45">
        {[0, 6, 12, 18, 24].map(h => (
          <span key={h} className="absolute -translate-x-1/2 top-1" style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}</span>
        ))}
        {time && (
          <span className="absolute -top-[19px] -translate-x-1/2 flex flex-col items-center" style={{ left: `${(minutes(time, 0) / 1440) * 100}%` }}>
            <span className="w-[2px] h-4 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
            <span className="mt-[3px] px-1 rounded bg-white text-[#0F172A] font-bold">{pickText(language, `你 ${time}`, `You ${time}`)}</span>
          </span>
        )}
      </div>
      <div className="flex gap-3 mt-2 text-[11px] text-white/55">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[#de4141]" />{pickText(language, '罢工时段', 'Strike')}</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-[#5ab91b]" />{pickText(language, '保障时段', 'Guaranteed')}</span>
        {!match.windows.length && <span>{pickText(language, '时段待公布', 'Hours pending')}</span>}
      </div>
    </div>
  );
}

function MatchCard({ match, time, language, onOpenDate }: { match: Judged; time: string | null; language: AppLanguage; onOpenDate: (date: string, path: string) => void }) {
  const cancelled = match.status === 'CANCELLED';
  return (
    <div className={`rounded-2xl border border-white/10 p-4 ${cancelled ? 'bg-white/[0.03]' : 'bg-white/[0.06]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-white/50">{dateLabel(match.date, language)} · {t(language, MODE_LABEL[match.category])}{match.national ? pickText(language, ' · 全国', ' · national') : ''}</div>
          <div className={`text-[16px] font-bold leading-snug ${cancelled ? 'text-white/50 line-through' : 'text-white'}`}>{match.provider}</div>
        </div>
        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${cancelled ? 'bg-white/10 text-white/60' : match.status === 'UNCERTAIN' ? 'bg-[#f5a524]/20 text-[#f5a524]' : 'bg-[#de4141]/20 text-[#ff8a8a]'}`}>
          {cancelled ? pickText(language, '已取消', 'Cancelled') : match.status === 'UNCERTAIN' ? pickText(language, '待确认', 'Pending') : pickText(language, '已确认', 'Confirmed')}
        </span>
      </div>
      <Timeline match={match} time={time} language={language} />
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-white/45">{pickText(language, '罢工时段', 'Hours')}</dt>
        <dd className="text-white">{match.display || pickText(language, '待公布', 'Not yet published')}</dd>
        <dt className="text-white/45">{pickText(language, '保障时段', 'Guaranteed')}</dt>
        <dd className="text-white">{match.guarantees.length ? match.guarantees.map(g => `${g.start}–${g.end}`).join(', ') : pickText(language, '未公布', 'None published')}</dd>
        {match.lines.length > 0 && <>
          <dt className="text-white/45">{pickText(language, '受影响', 'Affects')}</dt>
          <dd className="text-white">{match.lines.slice(0, 4).join(' / ')}</dd>
        </>}
      </dl>
      <div className="mt-3 flex flex-col gap-2">
        {match.reason && !cancelled && (
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-white/75">{t(language, REASON[match.reason])}</span>
            <SourceTag by="jev" p={match.relevance} language={language} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
          <span className="text-[13px] font-semibold text-white">→ {t(language, ACTION[match.action])}</span>
          <SourceTag by={match.impact === 'cancelled' || match.impact === 'unknown' || match.overlap === 'guarantee' || match.overlap === 'outside' ? 'rule' : 'jev'} language={language} />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-[11px]">
          {match.sources.slice(0, 2).map(source => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 text-white/60 hover:text-white">
              {source.authority === 'official' ? pickText(language, '官方来源', 'Official') : pickText(language, '报道来源', 'Reported')}: {source.name}
            </a>
          ))}
          {match.evidence != null && match.evidence < 0.5 && <span className="text-[#f5a524]">{pickText(language, '官方信息不够具体', 'Official details are thin')}</span>}
        </div>
        <button onClick={() => onOpenDate(match.date, match.path)} className="text-[12px] font-bold text-[#5dcdff]">
          {pickText(language, '查看当天全部 →', 'See the whole day →')}
        </button>
      </div>
    </div>
  );
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function AskBar({ regionTag, language, onOpenDate }: { regionTag: string; language: AppLanguage; onOpenDate: (date: string, path: string) => void }) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [hints, setHints] = useState<Hints>({});
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask(text: string, nextHints: Hints = {}) {
    const q = text.trim().slice(0, 200);
    if (!q) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAsked(q);
    setHints(nextHints);
    setOpen(true);
    setStatus('loading');
    setStages([]);
    setResult(null);
    setError(null);
    setShowExcluded(false);
    setShowTrace(false);
    inputRef.current?.blur();
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, city: regionTag, hints: nextHints }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        setError(response.status === 429 ? 'rate_limited' : 'unavailable');
        setStatus('error');
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line);
          if (event.type === 'stage') setStages(prev => [...prev, event]);
          else if (event.type === 'final') {
            setResult(event.result);
            setStatus('done');
            if (event.result.kind === 'navigate') {
              setTimeout(() => goTo(event.result.date, event.result.path), 900);
            }
          } else if (event.type === 'error') {
            setError('unavailable');
            setStatus('error');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('unavailable');
        setStatus('error');
      }
    }
  }

  const goTo = (date: string, path: string) => { setOpen(false); onOpenDate(date, path); };
  const refine = (patch: Hints) => ask(asked, { ...hints, ...patch, modes: [...(hints.modes || []), ...(patch.modes || [])] });
  const today = romeTodayIso();
  const understanding = result?.understanding;
  const verdict = result?.kind === 'result'
    ? result.view === 'claim'
      ? CLAIM[result.matches[0]?.claim || 'none']
      : result.view === 'period'
        ? { zh: result.days.length ? `这段时间有 ${result.days.length} 天有罢工` : '这段时间没有已公布的罢工', en: result.days.length ? `Strikes on ${result.days.length} day(s)` : 'No published strikes in this period', color: result.days.length ? '#f5a524' : '#5ab91b' }
        : LEVEL[result.level]
    : null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label={pickText(language, '罢工问答结果', 'Strike answer')}
            className="fixed z-[75] left-1/2 bottom-[88px] flex flex-col w-[min(560px,calc(100%-24px))] max-h-[calc(100dvh-120px)] overflow-y-auto rounded-[28px] border border-white/15 bg-[#0b1118]/95 backdrop-blur-xl shadow-2xl p-5 text-white"
            initial={{ opacity: 0, y: 24, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 24, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-semibold leading-snug text-white/90">“{asked}”</p>
              <button onClick={() => setOpen(false)} aria-label={pickText(language, '关闭', 'Close')} className="shrink-0 w-8 h-8 rounded-full bg-white/10 text-white/70">✕</button>
            </div>

            {/* The pipeline itself is part of the answer: what was read, by whom.
                Expanded while working; once answered it folds under the verdict. */}
            {status !== 'loading' && stages.length > 0 && (
              <button onClick={() => setShowTrace(v => !v)} className={`${result?.kind === 'result' ? 'order-last' : ''} mt-4 w-full flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] text-white/60`}>
                <span>✓ {pickText(language, `判断过程 · ${stages.length} 步 · ${(stages.reduce((sum, s) => sum + s.ms, 0) / 1000).toFixed(1)} 秒`, `How this was decided · ${stages.length} steps · ${(stages.reduce((sum, s) => sum + s.ms, 0) / 1000).toFixed(1)}s`)}</span>
                <span>{showTrace ? '−' : '+'}</span>
              </button>
            )}
            {(status === 'loading' || showTrace) && <ol className={`${result?.kind === 'result' ? 'order-last' : ''} mt-2 flex flex-col gap-2`}>
              {STAGES.filter(id => id !== 'judge' || stages.some(s => s.id === 'judge') || status === 'loading').map(id => {
                const stage = stages.find(s => s.id === id);
                const pending = !stage && status === 'loading' && STAGES.indexOf(id) === stages.length;
                if (!stage && !pending) return null;
                return (
                  <li key={id} className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 font-semibold text-white/80">
                        {stage ? <span className="text-[#8fdc5a]">✓</span> : <motion.span className="w-2 h-2 rounded-full bg-[#5dcdff]" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} />}
                        {t(language, STAGE_LABEL[id])}
                      </span>
                      {stage && <span className="text-white/35">{stage.ms} ms</span>}
                    </div>
                    {stage?.note === 'jev_unavailable' && <p className="mt-1 text-[11px] text-[#f5a524]">{pickText(language, 'AI 判断暂不可用，已改用规则匹配', 'AI unavailable; matched by rules')}</p>}
                    {stage && stage.facts.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {stage.facts.filter(f => f.value || f.label === 'date' || f.label === 'time').map((fact, i) => (
                          <span key={i} className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px]">
                            <span className="text-white/45">{t(language, FACT_LABEL[fact.label] || [fact.label, fact.label])}</span>
                            <span className="text-white/90">{factValue(fact, language)}</span>
                            <SourceTag by={fact.by} p={fact.p} language={language} />
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>}

            {status === 'error' && (
              <p className="mt-4 rounded-xl bg-[#de4141]/15 px-3 py-2 text-[13px] text-[#ff8a8a]">
                {error === 'rate_limited' ? pickText(language, '提问太频繁了，请稍等一分钟', 'Too many questions; wait a minute') : pickText(language, '暂时无法回答，请直接查看日历', 'Unavailable right now; please use the calendar')}
              </p>
            )}

            {result?.kind === 'clarify' && (
              <div className="mt-4">
                <p className="text-[15px] font-bold">{result.missing === 'date' ? pickText(language, '你想查哪一天？', 'Which day?') : pickText(language, '你乘坐什么交通？', 'Which transport?')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.missing === 'date' ? <>
                    <Chip onClick={() => refine({ date: today })}>{pickText(language, '今天', 'Today')}</Chip>
                    <Chip onClick={() => refine({ date: addDaysIso(today, 1) })}>{pickText(language, '明天', 'Tomorrow')}</Chip>
                    <Chip onClick={() => refine({ range: 'week' })}>{pickText(language, '本周', 'This week')}</Chip>
                    <Chip onClick={() => refine({ range: 'upcoming' })}>{pickText(language, '最近两周', 'Next 2 weeks')}</Chip>
                    <label className="relative rounded-full border border-white/20 px-4 py-2 text-[13px] font-semibold text-white/80">
                      {pickText(language, '选择日期', 'Pick a date')}
                      <input type="date" min={today} className="absolute inset-0 opacity-0" onChange={e => e.target.value && refine({ date: e.target.value })} />
                    </label>
                  </> : (Object.keys(MODE_LABEL) as Mode[]).map(mode => (
                    <Chip key={mode} onClick={() => refine({ modes: [mode] })}>{t(language, MODE_LABEL[mode])}</Chip>
                  ))}
                </div>
              </div>
            )}

            {result?.kind === 'navigate' && (
              <p className="mt-4 text-[15px] font-bold">{pickText(language, `正在打开 ${dateLabel(result.date, language)} 的全部罢工…`, `Opening ${dateLabel(result.date, language)}…`)}</p>
            )}

            {result?.kind === 'out_of_scope' && (
              <div className="mt-4">
                <p className="text-[15px] font-bold">{pickText(language, '我只能回答意大利交通罢工相关的问题', 'I can only answer questions about Italian transport strikes')}</p>
                <div className="mt-3 flex flex-col gap-2">
                  {EXAMPLES.map(example => <Chip key={example[0]} onClick={() => { setQuery(t(language, example)); ask(t(language, example)); }}>{t(language, example)}</Chip>)}
                </div>
              </div>
            )}

            {result?.kind === 'result' && verdict && understanding && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="rounded-2xl px-4 py-3" style={{ background: `${verdict.color}22`, border: `1px solid ${verdict.color}55` }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: verdict.color, boxShadow: `0 0 10px ${verdict.color}` }} />
                    <span className="text-[18px] font-black">{pickText(language, verdict.zh, verdict.en)}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-white/55">
                    {result.range.from === result.range.to ? dateLabel(result.range.from, language) : `${dateLabel(result.range.from, language)} – ${dateLabel(result.range.to, language)}`}
                    {understanding.time ? ` · ${understanding.time}` : ''}
                    {understanding.modes.length ? ` · ${understanding.modes.map(m => t(language, MODE_LABEL[m.mode])).join(' / ')}` : ''}
                    {understanding.lines.length ? ` · ${understanding.lines.join(' / ')}` : ''}
                  </p>
                </div>

                {result.view === 'period' && result.days.map(day => (
                  <button key={day.date} onClick={() => goTo(day.date, day.path)} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-left">
                    <span className="text-[15px] font-bold">{dateLabel(day.date, language)}</span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {day.items.map((item, i) => (
                        <span key={i} className={`text-[11px] font-semibold px-2 py-1 rounded-full ${item.status === 'CANCELLED' ? 'bg-white/10 text-white/45 line-through' : 'bg-[#de4141]/20 text-[#ff8a8a]'}`}>
                          {t(language, MODE_LABEL[item.category])}{item.display ? ` ${item.display}` : ''}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}

                {result.matches.map(match => <MatchCard key={match.key} match={match} time={understanding.time} language={language} onOpenDate={goTo} />)}

                {result.excluded.length > 0 && (
                  <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
                    <button onClick={() => setShowExcluded(v => !v)} className="w-full flex items-center justify-between text-[12px] text-white/60">
                      <span>{pickText(language, `已排除 ${result.excluded.length} 条与你无关的记录`, `${result.excluded.length} unrelated record(s) excluded`)}</span>
                      <span>{showExcluded ? '−' : '+'}</span>
                    </button>
                    {showExcluded && result.excluded.map(item => (
                      <div key={item.key} className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                        <span className="text-white/70">{t(language, MODE_LABEL[item.category])} · {item.provider}{item.reason ? ` · ${t(language, REASON[item.reason])}` : ''}</span>
                        <SourceTag by="jev" p={item.relevance} language={language} />
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] leading-relaxed text-white/40">
                  {pickText(
                    language,
                    `事实来自意大利交通部官方记录，数据更新于 ${syncLabel(result.lastSync, language)}（罗马时间）。“规则”为程序计算，“Jev”为决策模型判断，百分比是它的把握程度。`,
                    `Facts come from official Italian records, synced ${syncLabel(result.lastSync, language)} (Rome). “Rule” is computed by code; “Jev” is a model decision with its confidence.`,
                  )}
                </p>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Floating entry, centred at the bottom of the page. */}
      <div className="fixed z-[80] left-1/2 -translate-x-1/2 bottom-[max(16px,env(safe-area-inset-bottom))] w-[min(560px,calc(100%-24px))]">
        <AnimatePresence>
          {focused && !query && !open && (
            <motion.div className="mb-2 flex flex-col items-center gap-1.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              {EXAMPLES.map(example => (
                <button key={example[0]} onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(t(language, example)); ask(t(language, example)); }}
                  className="rounded-full bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1.5 text-[12px] text-white/85">
                  {t(language, example)}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {status === 'loading' && (
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 right-0 h-[52px] -m-[2px] rounded-full overflow-hidden blur-[1px]">
            <motion.div className="absolute left-1/2 top-1/2 w-[700px] h-[700px] -ml-[350px] -mt-[350px]"
              style={{ background: 'conic-gradient(#5dcdff, #a78bfa, #ff8a8a, #FFEC20, #5dcdff)' }}
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }} />
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); ask(query); }}
          className="relative flex items-center gap-2 rounded-full p-1.5 pl-4 bg-[#0b1118]/85 backdrop-blur-xl border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.45)]"
        >
          <span aria-hidden className="text-[16px]">✦</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={200}
            enterKeyHint="send"
            aria-label={pickText(language, '用一句话问罢工', 'Ask about strikes')}
            placeholder={pickText(language, '问一句：周五早上坐地铁受影响吗？', 'Ask: is my Friday metro affected?')}
            className="flex-1 min-w-0 bg-transparent text-[15px] text-white placeholder:text-white/40 outline-none"
          />
          <button type="submit" disabled={!query.trim() || status === 'loading'} aria-label={pickText(language, '发送', 'Send')}
            className="shrink-0 w-10 h-10 rounded-full bg-white text-[#0F172A] font-black disabled:opacity-30 transition-opacity">
            ↑
          </button>
        </form>
      </div>
    </>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-white/90 text-left active:scale-95 transition-transform">
      {children}
    </button>
  );
}
