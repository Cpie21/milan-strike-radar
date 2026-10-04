'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AXIS_END, AXIS_START, MODES, MODE_ZH, buildRail, continuesOvernight, dayLabel, groupIdentical, overnightLine, isActive, nextEventDate, nowPosition,
  segments, sortCards, statusLine, weekday, windowsText, type Mode, type ModeCard, type RailItem, type Tone,
} from '../../lib/lab/model';
import { ModeIcon, Chevron } from './icons';

const TOKENS = `
.lab{--bg:#F4F4F2;--surface:#FFFFFF;--surface2:#EEEEEB;--text:#141414;--text2:#5C5F64;--text3:#9A9DA2;--line:rgba(0,0,0,.08);
--stop:#D93025;--stopSoft:#FCE8E6;--ok:#1E8E3E;--okSoft:#E6F4EA;--pend:#9A6700;--cancel:#A1A4A9;--sel:#141414;--onSel:#FFFFFF;
background:var(--bg);color:var(--text);min-height:100dvh;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",sans-serif}
@media (prefers-color-scheme:dark){.lab{--bg:#0E0F11;--surface:#18191C;--surface2:#222327;--text:#F2F2F2;--text2:#A6A9AE;--text3:#6C6F75;--line:rgba(255,255,255,.08);
--stop:#FF6B5E;--stopSoft:rgba(255,107,94,.14);--ok:#4CC27A;--okSoft:rgba(76,194,122,.14);--pend:#E8A33D;--cancel:#6C6F75;--sel:#F2F2F2;--onSel:#0E0F11}}
.lab .num{font-variant-numeric:tabular-nums}
.lab .hatch{background:repeating-linear-gradient(135deg,var(--pend) 0 2px,transparent 2px 6px);opacity:.55}
.lab .rail::-webkit-scrollbar{display:none}
`;

const TONE: Record<Tone, string> = { stop: 'var(--stop)', pending: 'var(--pend)', cancelled: 'var(--cancel)', over: 'var(--text2)' };
const LINE_COLORS: Record<string, [string, string]> = {
  M1: ['#E30613', '#fff'], M2: ['#00A13A', '#fff'], M3: ['#F8C300', '#1a1a1a'], M4: ['#0072BC', '#fff'], M5: ['#9A5BA8', '#fff'],
};

function romeNowMinutes() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

function iconColor(card: ModeCard) {
  return card.status === 'CANCELLED' ? 'var(--cancel)' : card.status === 'UNCERTAIN' ? 'var(--pend)' : 'var(--stop)';
}

// ── Rail ────────────────────────────────────────────────────────────────

function Rail({ items, today, selected, onSelect, onExpand }: { items: RailItem[]; today: string; selected: string; onSelect: (d: string) => void; onExpand: (from: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!strip || !el) return;
    // Land on the selected day instantly; animate only later moves.
    strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: placed.current ? 'smooth' : 'auto' });
    placed.current = true;
  }, [selected, items.length]);

  return (
    <div ref={ref} className="rail relative flex items-stretch gap-2 overflow-x-auto px-4 py-2 snap-x" style={{ scrollbarWidth: 'none' }}>
      {items.map(item => {
        if (item.kind === 'month') {
          return <div key={`m${item.month}`} className="shrink-0 self-center text-[12px] font-semibold px-1" style={{ color: 'var(--text3)', writingMode: 'vertical-rl' }}>{item.month}月</div>;
        }
        if (item.kind === 'gap') {
          const sameMonth = item.from.slice(5, 7) === item.to.slice(5, 7);
          return (
            <button key={`g${item.from}`} onClick={() => onExpand(item.from)} aria-label={`展开 ${dayLabel(item.from)} 到 ${dayLabel(item.to)}，无罢工`}
              className="shrink-0 w-[58px] h-[68px] rounded-2xl flex flex-col items-center justify-center gap-1 snap-center"
              style={{ border: '1px dashed var(--line)', color: 'var(--text3)' }}>
              <span className="num text-[13px] font-medium">{Number(item.from.slice(8))}–{sameMonth ? Number(item.to.slice(8)) : `${Number(item.to.slice(5, 7))}/${Number(item.to.slice(8))}`}</span>
              <span className="text-[10px]">无罢工</span>
            </button>
          );
        }
        const isSel = item.date === selected;
        const isToday = item.date === today;
        const event = item.weight === 'event';
        const allCancelled = event && item.cards.every(c => !isActive(c));
        return (
          <button key={item.date} data-date={item.date} onClick={() => onSelect(item.date)} aria-pressed={isSel}
            aria-label={`${dayLabel(item.date)}${event ? `，${item.cards.map(c => MODE_ZH[c.category]).join('、')}` : '，无罢工'}`}
            className={`relative shrink-0 h-[68px] rounded-2xl flex flex-col justify-between snap-center transition-colors ${event ? 'px-2.5 py-2 items-start' : 'w-[44px] py-2 items-center'}`}
            style={{
              minWidth: event ? 64 + Math.max(0, item.cards.length - 2) * 20 : undefined,
              background: isSel ? 'var(--sel)' : event && !allCancelled ? 'var(--surface)' : 'transparent',
              color: isSel ? 'var(--onSel)' : event ? 'var(--text)' : 'var(--text2)',
              boxShadow: !isSel && event && !allCancelled ? '0 0 0 1px var(--line)' : undefined,
            }}>
            <span className={`flex items-baseline gap-1 ${event ? '' : 'flex-col items-center gap-0'}`}>
              <span className="text-[11px]" style={{ color: isSel ? 'var(--onSel)' : 'var(--text3)' }}>{isToday ? '今天' : weekday(item.date)}</span>
              <span className="num text-[17px] font-semibold leading-none">{Number(item.date.slice(8))}</span>
            </span>
            {event && (
              <span className="flex gap-1">
                {item.cards.map(card => (
                  <span key={card.id} className="relative" style={{ color: isSel && card.status !== 'CANCELLED' ? 'var(--onSel)' : iconColor(card), opacity: card.status === 'CANCELLED' ? 0.7 : 1 }}>
                    <ModeIcon mode={card.category} size={18} />
                    {card.status === 'CANCELLED' && <span className="absolute left-0 right-0 top-1/2 h-[1.5px] -rotate-45" style={{ background: 'currentColor' }} />}
                  </span>
                ))}
              </span>
            )}
            {!event && isToday && <span className="w-1 h-1 rounded-full" style={{ background: isSel ? 'var(--onSel)' : 'var(--text)' }} />}
            {item.joinNext.length > 0 && (
              <span aria-hidden className="absolute -right-[10px] bottom-[17px] w-[12px] h-[3px] rounded-full" style={{ background: 'var(--stop)' }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Service bar ─────────────────────────────────────────────────────────

function DayBar({ card, nowPos, label }: { card: ModeCard; nowPos: number | null; label?: string }) {
  const strike = segments(card.windows);
  const guarantee = segments(card.guarantees);
  const cancelled = card.status === 'CANCELLED';
  return (
    <div className="flex-1 min-w-0">
      <div className="relative h-[10px] rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        {!card.windows.length && !cancelled && <div className="absolute inset-0 hatch" />}
        {strike.map((s, i) => (
          <div key={i} className="absolute top-0 h-full" style={{
            left: `${s.left * 100}%`, width: `${s.width * 100}%`,
            background: cancelled ? 'var(--cancel)' : 'var(--stop)', opacity: cancelled ? 0.35 : 1,
            WebkitMaskImage: s.fade ? 'linear-gradient(90deg,#000 70%,transparent)' : undefined,
            maskImage: s.fade ? 'linear-gradient(90deg,#000 70%,transparent)' : undefined,
          }} />
        ))}
        {!cancelled && guarantee.map((g, i) => (
          <div key={`g${i}`} className="absolute top-0 h-full" style={{ left: `${g.left * 100}%`, width: `${g.width * 100}%`, background: 'var(--ok)' }} />
        ))}
        {nowPos !== null && <div className="absolute -top-[3px] w-[2px] h-[16px] rounded-full" style={{ left: `calc(${nowPos * 100}% - 1px)`, background: 'var(--text)' }} />}
      </div>
      <div className="num relative h-4 mt-1 text-[10px]" style={{ color: 'var(--text3)' }}>
        <span className="absolute left-0">{label ?? '05'}</span>
        {[12, 18].map(h => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h * 60 - AXIS_START) / (AXIS_END - AXIS_START)) * 100}%` }}>{h}</span>)}
        <span className="absolute right-0">末班</span>
      </div>
    </div>
  );
}

function ServiceBar({ card, prev, next, today, nowMinutes }: { card: ModeCard; prev?: ModeCard; next?: ModeCard; today: string; nowMinutes: number }) {
  // An overnight strike is one event: show both days side by side.
  const pair = prev ? [prev, card] : next ? [card, next] : [card];
  return (
    <div className="flex items-start gap-1.5">
      {pair.map(c => (
        <DayBar key={c.date} card={c} nowPos={c.date === today ? nowPosition(nowMinutes) : null} label={pair.length > 1 ? `${Number(c.date.slice(8))}日` : undefined} />
      )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, <span key={`d${i}`} className="w-px h-[18px] -mt-1" style={{ background: 'var(--text3)' }} />, el] : [el]), [])}
    </div>
  );
}

// ── Day board ───────────────────────────────────────────────────────────

function LineChips({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {lines.slice(0, 6).map(line => {
        const [bg, fg] = LINE_COLORS[line.toUpperCase()] || ['var(--surface2)', 'var(--text2)'];
        return <span key={line} className="text-[11px] font-semibold px-1.5 py-[2px] rounded-md" style={{ background: bg, color: fg }}>{line}</span>;
      })}
    </div>
  );
}

function ModeRow({ card, also = [], prev, next, today, nowMinutes }: { card: ModeCard; also?: ModeCard[]; prev?: ModeCard; next?: ModeCard; today: string; nowMinutes: number }) {
  const [open, setOpen] = useState(false);
  const base = statusLine(card, today, nowMinutes);
  const span = (prev || next) && base.tone === 'stop' && card.date !== today ? overnightLine(card, prev, next) : null;
  const status = span ? { ...base, text: span } : base;
  if (card.status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-3 px-4 py-3" style={{ color: 'var(--text3)' }}>
        <ModeIcon mode={card.category} />
        <span className="text-[15px] line-through">{MODE_ZH[card.category]} · {card.provider}</span>
        <span className="ml-auto text-[13px]">已取消</span>
      </div>
    );
  }
  return (
    <div className="px-4 py-3.5">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1" style={{ color: TONE[status.tone] }}>{[card, ...also].map(c => <ModeIcon key={c.id} mode={c.category} size={22} />)}</span>
          <span className="text-[17px] font-semibold">{[card, ...also].map(c => MODE_ZH[c.category]).join(' · ')}</span>
          {card.scope && <span className="text-[13px]" style={{ color: 'var(--text2)' }}>{card.scope}</span>}
          {card.national && <span className="text-[11px] px-1.5 py-[1px] rounded-md" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>全国</span>}
          <span className="ml-auto" style={{ color: 'var(--text3)' }}><Chevron open={open} /></span>
        </div>
        <p className="num mt-1.5 text-[15px] font-medium" style={{ color: TONE[status.tone] }}>{status.text}</p>
        {card.guarantees.length > 0 && (
          <p className="num mt-0.5 text-[13px]" style={{ color: 'var(--ok)' }}>保障时段 {card.guarantees.map(g => `${g.start}–${g.end}`).join('、')}</p>
        )}
        <div className="mt-3"><ServiceBar card={card} prev={prev} next={next} today={today} nowMinutes={nowMinutes} /></div>
        <div className="mt-2"><LineChips lines={card.lines} /></div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 pt-3 flex flex-col gap-3 text-[13px]" style={{ borderTop: '1px solid var(--line)' }}>
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text3)' }}>罢工主体</p>
                <p>{card.provider}</p>
              </div>
              {card.events.length > 1 && (
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text3)' }}>包含 {card.events.length} 份公告</p>
                  {card.events.map((e, i) => (
                    <p key={i} className="num" style={{ color: e.status === 'CANCELLED' ? 'var(--text3)' : 'var(--text)' }}>
                      {e.provider} · {e.status === 'CANCELLED' ? '已取消' : e.display || '时段待公布'}
                    </p>
                  ))}
                </div>
              )}
              {card.windows.length > 0 && (
                <div>
                  <p className="text-[11px] mb-1" style={{ color: 'var(--text3)' }}>罢工时段</p>
                  <p className="num">{windowsText(card.windows)}{card.unknownTiming ? '（部分公告时段待公布）' : ''}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] mb-1" style={{ color: 'var(--text3)' }}>来源</p>
                <div className="flex flex-col gap-1">
                  {card.sources.slice(0, 3).map(s => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: 'var(--text2)', textDecorationColor: 'var(--line)' }}>
                      {s.authority === 'official' ? '官方' : '报道'} · {s.name}
                    </a>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="flex-1 h-10 rounded-xl text-[14px] font-medium" style={{ background: 'var(--surface2)' }}>分享</button>
                <button className="flex-1 h-10 rounded-xl text-[14px] font-medium" style={{ background: 'var(--stopSoft)', color: 'var(--stop)' }}>我受影响了</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Board({ date, byDate, today, nowMinutes, onSelect }: { date: string; byDate: Map<string, ModeCard[]>; today: string; nowMinutes: number; onSelect: (d: string) => void }) {
  const cards = sortCards(byDate.get(date) || []);
  const active = cards.filter(isActive);
  const unaffected = MODES.filter(m => !cards.some(c => c.category === m));
  const neighbour = (offset: number, mode: Mode) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return (byDate.get(d.toISOString().slice(0, 10)) || []).find(c => c.category === mode);
  };
  const next = nextEventDate(byDate, date);

  return (
    <section aria-live="polite" className="px-4">
      <div className="flex items-baseline justify-between pt-5 pb-3">
        <h2 className="text-[22px] font-bold tracking-tight">{date === today ? '今天' : dayLabel(date)}</h2>
        {date === today && <span className="text-[13px]" style={{ color: 'var(--text3)' }}>{dayLabel(date)}</span>}
      </div>
      <p className="text-[15px] -mt-1 mb-4" style={{ color: active.length ? 'var(--text)' : 'var(--text2)' }}>
        {active.length ? `${active.length} 种交通受影响` : cards.length ? '原定罢工均已取消' : '没有已公布的交通罢工'}
      </p>

      {cards.length > 0 && (
        <div className="rounded-3xl overflow-hidden" style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line)' }}>
          {groupIdentical(cards).map(([card, ...also], i) => {
            const prev = neighbour(-1, card.category);
            const nxt = neighbour(1, card.category);
            return (
              <div key={card.id} style={{ borderTop: i ? '1px solid var(--line)' : undefined }}>
                <ModeRow card={card} also={also} today={today} nowMinutes={nowMinutes}
                  prev={continuesOvernight(prev, card) ? prev : undefined}
                  next={continuesOvernight(card, nxt) ? nxt : undefined} />
              </div>
            );
          })}
        </div>
      )}

      {unaffected.length > 0 && cards.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 text-[14px]" style={{ color: 'var(--text2)' }}>
          <span className="flex gap-1" style={{ color: 'var(--ok)' }}>{unaffected.map(m => <ModeIcon key={m} mode={m} size={16} />)}</span>
          {unaffected.map(m => MODE_ZH[m]).join('、')} · 无罢工
        </div>
      )}

      {!active.length && next && (
        <button onClick={() => onSelect(next)} className="w-full mt-2 flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left" style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line)' }}>
          <span className="text-[13px]" style={{ color: 'var(--text3)' }}>下一次</span>
          <span className="text-[15px] font-semibold">{dayLabel(next)}</span>
          <span className="flex gap-1 ml-auto" style={{ color: 'var(--stop)' }}>
            {sortCards(byDate.get(next) || []).filter(isActive).map(c => <ModeIcon key={c.id} mode={c.category} size={18} />)}
          </span>
          <span style={{ color: 'var(--text3)' }}>›</span>
        </button>
      )}
    </section>
  );
}

// ── City sheet ──────────────────────────────────────────────────────────

function CitySheet({ open, onClose, cities, current }: { open: boolean; onClose: () => void; cities: { tag: string; zh: string; en: string }[]; current: string }) {
  const [q, setQ] = useState('');
  const list = cities.filter(c => !q || c.zh.includes(q) || c.en.toLowerCase().includes(q.toLowerCase()));
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,.35)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label="选择城市" className="fixed z-50 left-0 right-0 bottom-0 mx-auto max-w-[520px] rounded-t-3xl max-h-[80dvh] flex flex-col"
            style={{ background: 'var(--surface)' }} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
            <div className="mx-auto mt-2 w-9 h-1 rounded-full" style={{ background: 'var(--line)' }} />
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h3 className="text-[17px] font-semibold">选择城市</h3>
              <button onClick={onClose} className="text-[15px]" style={{ color: 'var(--text2)' }}>完成</button>
            </div>
            <div className="px-5 pb-2">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索城市" aria-label="搜索城市"
                className="w-full h-10 rounded-xl px-3 text-[15px] outline-none" style={{ background: 'var(--surface2)', color: 'var(--text)' }} />
            </div>
            <div className="overflow-y-auto px-2 pb-6">
              {list.map(c => (
                <a key={c.tag} href={`/lab?city=${c.tag}`} className="flex items-center justify-between px-3 py-3 rounded-xl text-[16px]" style={{ background: c.tag === current ? 'var(--surface2)' : undefined }}>
                  <span>{c.zh} <span className="text-[13px]" style={{ color: 'var(--text3)' }}>{c.en}</span></span>
                  {c.tag === current && <span style={{ color: 'var(--text2)' }}>✓</span>}
                </a>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function LabHome({ city, cities, cards, today, from, to, initialDate, lastSync }: {
  city: { tag: string; zh: string }; cities: { tag: string; zh: string; en: string }[]; cards: ModeCard[];
  today: string; from: string; to: string; initialDate: string; lastSync: string | null;
}) {
  const [selected, setSelected] = useState(initialDate);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nowMinutes, setNowMinutes] = useState(12 * 60);
  const [sheet, setSheet] = useState(false);
  const byDate = useMemo(() => {
    const map = new Map<string, ModeCard[]>();
    cards.forEach(c => map.set(c.date, [...(map.get(c.date) || []), c]));
    return map;
  }, [cards]);
  const items = useMemo(() => buildRail(byDate, from, to, today, selected, expanded), [byDate, from, to, today, selected, expanded]);

  useEffect(() => {
    // Server render uses noon; the client corrects to Rome time after mount.
    const tick = () => setNowMinutes(romeNowMinutes());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const select = (date: string) => {
    setSelected(date);
    window.history.replaceState(null, '', `/lab?city=${city.tag}&date=${date}`);
  };

  const synced = lastSync ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lastSync)) : null;

  return (
    <main className="lab">
      <style>{TOKENS}</style>
      <div className="mx-auto max-w-[520px] pb-16">
        <header className="flex items-center justify-between px-4 pt-[max(16px,env(safe-area-inset-top))] pb-2">
          <button onClick={() => setSheet(true)} className="flex items-center gap-1.5 text-[28px] font-bold tracking-tight" aria-label={`当前城市 ${city.zh}，切换城市`}>
            {city.zh}
            <span className="mt-1" style={{ color: 'var(--text3)' }}><Chevron open={false} /></span>
          </button>
          <label className="relative text-[13px] px-3 h-8 rounded-full flex items-center" style={{ background: 'var(--surface)', boxShadow: '0 0 0 1px var(--line)', color: 'var(--text2)' }}>
            选日期
            <input type="date" min={from} max={to} value={selected} onChange={e => e.target.value && select(e.target.value)} className="absolute inset-0 opacity-0" aria-label="选择日期" />
          </label>
        </header>

        <Rail items={items} today={today} selected={selected} onSelect={select} onExpand={key => setExpanded(prev => new Set(prev).add(key))} />
        <Board date={selected} byDate={byDate} today={today} nowMinutes={nowMinutes} onSelect={select} />

        <footer className="px-6 pt-8 text-[12px] leading-relaxed" style={{ color: 'var(--text3)' }}>
          事实来自意大利交通部（MIT）官方公告和运营商公告{synced ? `，数据更新于 ${synced}（罗马时间）` : ''}。出行前请以运营商最新通知为准。
        </footer>
      </div>
      <CitySheet open={sheet} onClose={() => setSheet(false)} cities={cities} current={city.tag} />
    </main>
  );
}
