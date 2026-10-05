'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, CaretRight, Check, Sparkle } from '@phosphor-icons/react';
import type { AskResult, Fact, Hints, Judged, StageEvent } from '../../lib/ask/pipeline';
import { dayLabel, modeName, statusLine, tx, type Lang, type Mode, type ModeCard } from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
import { Bar } from './LabStrikeCard';
import { LineBadge, ModeGlyph, Sheet } from './ui';
import { C, EASE, MODE_COLOR } from './theme';

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
  const label = by === 'jev' ? `Jev${p != null ? ` ${Math.round(p * 100)}%` : ''}` : by === 'db' ? tx(lang, '数据库', 'DB') : by === 'default' ? tx(lang, '默认', 'Default') : tx(lang, '规则', 'Rule');
  const color = by === 'jev' ? '#9FD8FF' : by === 'rule' ? C.ok : C.text3;
  return <span className="text-[10.5px] font-semibold px-1.5 py-[1px] rounded-[5px]" style={{ color, background: C.surface3 }}>{label}</span>;
}

export default function LabAsk({ region, lang, today, onOpenDate }: {
  region: string; lang: Lang; today: string; onOpenDate: (date: string, path: string) => void;
}) {
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
  const reduce = useReducedMotion();

  const go = (date: string, path: string) => { setOpen(false); onOpenDate(date, path); };

  async function ask(text: string, next: Hints = {}) {
    const q = text.trim().slice(0, 200);
    if (!q) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAsked(q); setHints(next); setOpen(true); setBusy(true); setStages([]); setResult(null); setError(null); setTrace(false);
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, city: region, hints: next }), signal: controller.signal });
      if (!res.ok || !res.body) { setError(res.status === 429 ? 'rate' : 'down'); setBusy(false); return; }
      const reader = res.body.getReader();
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

  return (
    <>
      {/* Floating entry: one sentence in, a fact card out. */}
      <div className="fixed z-[80] inset-x-0 bottom-0 pointer-events-none" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <AnimatePresence>
          {focused && !query && (
            <motion.div key="scrim" aria-hidden className="fixed inset-x-0 bottom-0 h-[300px] -z-10" style={{ background: 'linear-gradient(180deg, rgba(4,8,16,0) 0%, rgba(4,8,16,0.7) 55%)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          )}
          {focused && !query && (
            <motion.div className="mx-auto max-w-[520px] px-4 mb-2 flex flex-col items-start gap-1.5 pointer-events-auto"
              initial={{ opacity: 0, y: 8, filter: reduce ? 'none' : 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.24, ease: EASE }}>
              {EXAMPLES.map(e => (
                <button key={e[0]} onMouseDown={ev => ev.preventDefault()} onClick={() => { const q = tx(lang, e[0], e[1]); setQuery(q); ask(q); }}
                  className="h-9 px-3.5 rounded-full text-[13.5px]" style={{ ...PILL, color: C.text }}>
                  {tx(lang, e[0], e[1])}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mx-auto max-w-[520px] px-4 flex items-center gap-2 pointer-events-auto">
          <form onSubmit={e => { e.preventDefault(); ask(query); }} className="relative flex-1 h-[52px] rounded-full flex items-center gap-2 pl-4 pr-1.5" style={PILL}>
            {busy && (
              <span aria-hidden className="pointer-events-none absolute -inset-[1.5px] rounded-full overflow-hidden" style={{ WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', padding: 1.5 }}>
                <motion.span className="absolute left-1/2 top-1/2 w-[640px] h-[640px] -ml-[320px] -mt-[320px]" style={{ background: 'conic-gradient(#9FD8FF, #C4B5FD, #FFB4A8, #FFE8A3, #9FD8FF)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }} />
              </span>
            )}
            <Sparkle size={17} weight="fill" color={C.text2} />
            <input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} maxLength={200} enterKeyHint="send"
              aria-label={tx(lang, '用一句话问罢工', 'Ask about strikes')} placeholder={tx(lang, '问一句：周五坐地铁受影响吗？', 'Ask: is my Friday metro affected?')}
              className="flex-1 min-w-0 bg-transparent outline-none text-[16px] text-white placeholder:text-white/45" />
            <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={!query.trim() || busy} aria-label={tx(lang, '发送', 'Send')}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-35" style={{ background: '#FFFFFF', color: C.ink }}>
              <ArrowUp size={18} weight="bold" />
            </motion.button>
          </form>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={tx(lang, '问答', 'Ask')}>
        <p className="text-[17px] font-semibold leading-snug">“{asked}”</p>

        {/* While working, the steps are the answer; afterwards they fold away. */}
        {(busy || trace) && (
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
        )}

        {error && <p className="mt-4 rounded-[12px] px-3 py-2.5 text-[14px]" style={{ background: C.stopSoft, color: C.stop }}>{error === 'rate' ? tx(lang, '问得太频繁了，请稍等一分钟。', 'Too many questions — wait a minute.') : tx(lang, '暂时回答不了，请直接查看日历。', 'Unavailable right now — use the calendar.')}</p>}

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
                      <ModeGlyph mode={item.category} size={14} color={item.status === 'CANCELLED' ? C.cancel : MODE_COLOR[item.category].main} />
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
                  <ModeGlyph mode={mode} size={14} />{tx(lang, '你提到的：', 'You mentioned: ')}{modeName(mode, lang)}
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

        {!busy && stages.length > 0 && (
          <button onClick={() => setTrace(v => !v)} className="mt-4 w-full flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13px]" style={{ background: C.surface2, color: C.text2 }}>
            <span>{tx(lang, `判断过程 · ${stages.length} 步 · ${(stages.reduce((s, x) => s + x.ms, 0) / 1000).toFixed(1)} 秒`, `How this was decided · ${stages.length} steps`)}</span>
            <span>{trace ? '−' : '+'}</span>
          </button>
        )}
        <p className="mt-3 mb-1 text-[11.5px] leading-relaxed" style={{ color: C.text3 }}>
          {tx(lang, '事实来自官方记录；“规则”为程序计算，“Jev”为决策模型的判断及把握程度。', 'Facts come from official records; “Rule” is computed, “Jev” is a model decision with its confidence.')}
        </p>
      </Sheet>
    </>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="h-10 px-4 rounded-full text-[14px] font-medium text-left" style={{ background: C.surface3 }}>
      {children}
    </motion.button>
  );
}
