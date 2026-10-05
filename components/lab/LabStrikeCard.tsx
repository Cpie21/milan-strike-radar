'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, CaretDown, Check, Clock, Export, Info, SprayBottle } from '@phosphor-icons/react';
import {
  AXIS_END, AXIS_START, axisPos, markTimes, nowPosition, relativeDay, segments, statusLine, timeSpan, tx,
  type Lang, type Mode, type ModeCard, type OfficialRecord,
} from '../../lib/lab/model';
import { LineBadge, ModeGlyph } from './ui';
import { C, EASE, FILLED, MODE_COLOR, NUM, R, SANS, TONAL, TYPE } from './theme';
import { useDoodle } from './useDoodle';
import { track } from './track';
import Graffiti from './Graffiti';

const TITLE: Record<Mode, [string, string]> = { TRAIN: ['火车罢工', 'Train strike'], SUBWAY: ['地铁罢工', 'Metro strike'], BUS: ['公交罢工', 'Bus strike'], AIRPORT: ['机场罢工', 'Airport strike'] };
const TICKS = [5, 12, 18];
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const ENAC = 'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/';

export type CardContext = { today: string; nowMinutes: number; lang: Lang; region: string; cityName: string; sharePath: string };

const mins = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
const day = (iso: string, lang: Lang) => tx(lang, `${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);
const monthDay = (iso: string, lang: Lang) => tx(lang, `${Number(iso.slice(5, 7))}月${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);
const hatch = (color: string) => `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`;

function hoursText(card: ModeCard, lang: Lang) {
  const total = card.windows.reduce((sum, w) => {
    const start = w.start === null ? AXIS_START : mins(w.start);
    const end = w.end_kind === 'end_of_service' || !w.end ? AXIS_END : mins(w.end);
    return sum + Math.max(0, end - start);
  }, 0) / 60;
  if (total >= 18.9) return tx(lang, '24小时', '24 hours');
  const value = Math.round(total * 2) / 2;
  return tx(lang, `${value}小时`, `${value} hours`);
}

// ── Time bar: the original "当日进度条", aligned to service hours ──────
// Strike hours take the mode's colour; staff-only rail hours and
// unpublished hours are hatched in it, since passenger impact is open.

export function Bar({ card, now = null, label, lang = 'zh' }: { card: ModeCard; now?: number | null; label?: string; lang?: Lang }) {
  const cancelled = card.status === 'CANCELLED';
  const color = cancelled ? C.cancel : MODE_COLOR[card.category].main;
  return (
    <div className="relative flex-1 min-w-0">
      <div className="relative h-[10px] rounded-full overflow-hidden" style={{ background: C.surface3 }}>
        {!card.windows.length && !cancelled && <div className="absolute inset-0" style={{ background: hatch(color), opacity: 0.6 }} />}
        {segments(card.windows).map((s, i) => (
          <div key={i} className="absolute top-0 h-full" style={{
            left: `${s.left * 100}%`, width: `${s.width * 100}%`, background: card.indirect && !cancelled ? hatch(color) : color,
            borderRadius: `${s.left === 0 ? 0 : 5}px 5px 5px ${s.left === 0 ? 0 : 5}px`,
            WebkitMaskImage: s.fade ? 'linear-gradient(90deg,#000 62%,transparent)' : undefined,
            maskImage: s.fade ? 'linear-gradient(90deg,#000 62%,transparent)' : undefined,
          }} />
        ))}
        {!cancelled && segments(card.guarantees).map((g, i) => (
          <div key={`g${i}`} className="absolute top-0 h-full" style={{ left: `${g.left * 100}%`, width: `${g.width * 100}%`, background: C.ok }} />
        ))}
      </div>
      {now !== null && <span aria-hidden className="absolute -top-[5px] h-[20px] w-[3px] rounded-full bg-white" style={{ left: `calc(${now * 100}% - 1.5px)`, boxShadow: `0 0 0 2px ${C.surface}` }} />}
      <div className="relative h-4 mt-1.5 text-[11.5px] font-medium tabular-nums" style={{ color: C.text3, fontFamily: NUM }}>
        {label ? <span>{label}</span> : <>
          {TICKS.map(h => <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${axisPos(h * 60) * 100}%` }}>{String(h).padStart(2, '0')}:00</span>)}
          <span className="absolute right-0" style={{ fontFamily: SANS }}>{tx(lang, '→ 运营结束', '→ End of service')}</span>
        </>}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────
// Reading order follows the questions people ask, one per band:
//   what & is it sure → when → how far off → (the day at a glance)
//   → the details that answer "does it hit me" → act → why we believe it.
// The hero is centred; details are label/value rows that wrap cleanly.

export default function LabStrikeCard({ card, prev, next, ctx, highlighted }: { card: ModeCard; prev?: ModeCard; next?: ModeCard; ctx: CardContext; highlighted: boolean }) {
  const { lang } = ctx;
  const reduce = useReducedMotion();
  const [events, setEvents] = useState(false);
  const isToday = card.date === ctx.today;
  const mode = MODE_COLOR[card.category];

  if (card.status === 'CANCELLED') {
    return (
      <div id={`card-${card.id}`} className="flex items-center gap-3 px-4 py-3.5" style={{ background: C.surface, borderRadius: R.card }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.surface2 }}><ModeGlyph mode={card.category} size={18} color={C.cancel} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold line-through" style={{ color: C.text3 }}>{tx(lang, ...TITLE[card.category])}</span>
          <span className={`block truncate ${TYPE.label}`} style={{ color: C.text3 }}>{card.provider}</span>
        </span>
        <span className={`px-2.5 h-6 rounded-full flex items-center ${TYPE.label}`} style={{ background: C.surface2, color: C.text2 }}>{tx(lang, '已取消', 'Cancelled')}</span>
      </div>
    );
  }

  const status = statusLine(card, ctx.today, ctx.nowMinutes, lang);
  const live = isToday && status.text.startsWith(tx(lang, '停运中', 'Stopped'));
  const overnight = prev || next;
  const pending = !card.windows.length;
  // Confirmation matters most when it is missing: unconfirmed gets a
  // marked chip in the hero; confirmed is a quiet tick beside the title.
  // (Aggregate confidence reads 'reported' whenever any report exists, even
  // beside an operator's own notice, so an official quote outranks it.)
  const officialTiming = card.quotes.some(q => q.official);
  const doubt = pending ? tx(lang, '官方未公布时段', 'no official hours yet')
    : card.confidence === 'conflict' ? tx(lang, '各来源时段不一致', 'sources disagree on hours')
      : card.confidence === 'reported' && !officialTiming ? tx(lang, '时段仅见报道', 'hours only reported')
        : card.status === 'UNCERTAIN' ? tx(lang, '官方状态未定', 'status not final') : null;
  const unconfirmed = doubt !== null;
  const span = timeSpan(card.windows);

  const pill = live ? { text: status.text, color: mode.main, bg: mode.soft, dot: true }
    : isToday && !pending ? { text: status.text, color: C.text, bg: C.surface3, dot: false }
      : { text: `${relativeDay(card.date, ctx.today, lang)}${pending ? '' : ` · ${overnight ? tx(lang, '跨夜', 'Overnight') : hoursText(card, lang)}`}`, color: C.text2, bg: C.surface3, dot: false };
  const sub = (text: string) => <span className="text-[16px] font-semibold ml-1" style={{ color: C.text3, fontFamily: SANS }}>{text}</span>;
  const word = (text: string) => <span className="text-[24px]" style={{ fontFamily: SANS }}>{text}</span>;

  return (
    <motion.article id={`card-${card.id}`} className="relative overflow-hidden"
      style={{ background: C.surface, borderRadius: R.card }}
      animate={{ boxShadow: highlighted ? [`0 0 0 0px ${mode.main}`, `0 0 0 3px ${mode.main}`, `0 0 0 0px ${mode.main}`] : '0 0 0 0px rgba(0,0,0,0)' }}
      transition={{ duration: 1.1, ease: EASE }}>
      <div aria-hidden className="absolute inset-x-0 top-0 h-[180px] pointer-events-none" style={{ background: `linear-gradient(180deg, ${mode.soft}, transparent)` }} />
      <div className="relative px-5 pt-6">
        {/* What, and how sure */}
        <header className="flex flex-col items-center text-center">
          <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: mode.main }}><ModeGlyph mode={card.category} size={22} color={C.ink} /></span>
          <h3 className={`mt-3 ${TYPE.title}`}>{tx(lang, ...TITLE[card.category])}</h3>
          <p className={`mt-1 flex items-center gap-2 ${TYPE.caption}`} style={{ color: C.text3 }}>
            {card.national && <span className="px-1.5 h-[18px] rounded-[5px] flex items-center" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}
            {!unconfirmed && <span className="flex items-center gap-0.5"><Check size={11} weight="bold" />{tx(lang, '已确认', 'Confirmed')}</span>}
          </p>
        </header>

        {/* When: one line, whatever the number of windows */}
        <div className="mt-4 flex flex-col items-center text-center" style={{ fontFamily: NUM }}>
          {pending ? (
            <p className={TYPE.page} style={{ color: C.text2, fontFamily: SANS }}>{tx(lang, '时段待公布', 'Hours to be announced')}</p>
          ) : overnight ? (
            <p className={TYPE.display}>
              {(prev ? prev : card).windows.find(w => w.end_kind === 'end_of_service' || (w.end && w.end >= '23:59'))?.start ?? '00:00'}
              {sub(day((prev ?? card).date, lang))}
              <span className="mx-2" style={{ color: C.text3 }}>→</span>
              {(next ? next : card).windows.find(w => w.start === null || w.start <= '00:01')?.end ?? '24:00'}
              {sub(day((next ?? card).date, lang))}
            </p>
          ) : span && (
            <>
              <p className={TYPE.display}>
                {span.start ?? word(tx(lang, '运营开始', 'Start'))}
                <span className="mx-2" style={{ color: C.text3 }}>–</span>
                {span.end ?? word(tx(lang, '运营结束', 'End of service'))}
              </p>
              {span.breaks.map(b => (
                <p key={b.start} className={`mt-1.5 flex items-center gap-1.5 tabular-nums ${TYPE.label}`} style={{ color: C.ok, fontFamily: SANS }}>
                  <i className="w-[6px] h-[6px] rounded-full" style={{ background: C.ok }} />
                  {tx(lang, `中间 ${b.start}–${b.end} 恢复运行`, `Runs again ${b.start}–${b.end}`)}
                </p>
              ))}
            </>
          )}
        </div>

        {/* How far off, or what's happening now */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full tabular-nums ${TYPE.label}`} style={{ background: pill.bg, color: pill.color }}>
            {pill.dot ? <motion.i className="w-[7px] h-[7px] rounded-full" style={{ background: mode.main }} animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} /> : <Clock size={13} weight="bold" />}
            {pill.text}
          </span>
          {unconfirmed && (
            <span className={`relative overflow-hidden inline-flex items-center h-7 px-3 rounded-full ${TYPE.label} font-semibold`} style={{ color: C.text, boxShadow: `inset 0 0 0 1.5px ${mode.main}` }}>
              <span aria-hidden className="absolute inset-0" style={{ background: hatch(mode.soft) }} />
              <span className="relative">{tx(lang, `待确认 · ${doubt}`, `Unconfirmed · ${doubt}`)}</span>
            </span>
          )}
        </div>

        <div className="mt-6">
          {overnight ? (
            <div className="flex items-start gap-1.5">
              {[prev ?? card, next ?? card].map((c, i) => (
                <div key={c.id + i} className="flex-1 flex items-start gap-1.5">
                  {i === 1 && <span className="w-px h-[16px] -mt-[3px]" style={{ background: C.text3 }} />}
                  <Bar card={c} lang={lang} label={day(c.date, lang)} now={c.date === ctx.today ? nowPosition(ctx.nowMinutes) : null} />
                </div>
              ))}
            </div>
          ) : <Bar card={card} lang={lang} now={isToday ? nowPosition(ctx.nowMinutes) : null} />}
        </div>

        <Details card={card} lang={lang} />

        {card.indirect && (
          <p className={`mt-3 flex gap-2 rounded-[12px] px-3.5 py-2.5 ${TYPE.label}`} style={{ background: C.surface2, color: C.text2 }}>
            <Info size={16} weight="fill" color={mode.main} className="shrink-0 mt-px" />
            {tx(lang, '此处为相关人员停工时段；旅客列车的实际影响尚未确认，不代表所有列车停运。', 'These are staff strike hours. Passenger train impact is unconfirmed; this does not mean all trains stop.')}
          </p>
        )}

        {card.events.length > 1 && (
          <div className="mt-1 flex flex-col items-center">
            <button onClick={() => setEvents(v => !v)} aria-expanded={events} className={`h-9 flex items-center gap-1 ${TYPE.label}`} style={{ color: C.text2 }}>
              {tx(lang, '查看各公告时段', 'Timing by announcement')}
              <motion.span animate={{ rotate: events ? 180 : 0 }} className="flex"><CaretDown size={12} weight="bold" /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {events && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className={`w-full overflow-hidden text-center tabular-nums ${TYPE.label}`} style={{ color: C.text2 }}>
                  {card.events.map((e, i) => <li key={i} className="py-1">{e.provider} · {e.status === 'CANCELLED' ? tx(lang, '已取消', 'cancelled') : e.display || tx(lang, '时段待公布', 'pending')}</li>)}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Always visible: these drive sharing, the product's main channel */}
      <Actions card={card} ctx={ctx} />
      <Evidence card={card} lang={lang} confirmed={!unconfirmed} />
    </motion.article>
  );
}

// ── Details: label left, value right; long values wrap under themselves ──

function Details({ card, lang }: { card: ModeCard; lang: Lang }) {
  const lines = card.category === 'AIRPORT' && /^AIRLINE/.test(card.scopeType)
    ? tx(lang, '仅该航司航班', 'This airline only')
    : card.lineScope === 'SPECIFIC_LINES' && card.lines.length
      ? <span className="inline-flex flex-wrap justify-end gap-1">{card.lines.slice(0, 6).map(l => /^(M\d|S\d+|R\d+|RE\d+)$/i.test(l) ? <LineBadge key={l} line={l} /> : <span key={l}>{l}</span>)}</span>
      : card.lineScope === 'ALL_LINES' ? tx(lang, '全部线路', 'All lines') : null;
  const guarantee = card.guarantees.length
    ? <span className="tabular-nums" style={{ color: C.ok, fontFamily: NUM, fontSize: 16 }}>{card.guarantees.map(g => `${g.start}–${g.end}`).join('  ')}</span>
    : card.guaranteeSource === 'UNKNOWN' ? null : tx(lang, '无保障计划', 'None');
  const rows: [string, React.ReactNode][] = [
    [tx(lang, '罢工人员', 'Who'), card.provider],
    ...(card.scope ? [[tx(lang, '罢工类型', 'Type'), card.scope] as [string, React.ReactNode]] : []),
    [card.guaranteeKind === 'PROTECTED_FLIGHTS' ? tx(lang, '保障航班', 'Protected flights') : tx(lang, '保障时间段', 'Guaranteed hours'), guarantee],
    [card.category === 'AIRPORT' ? tx(lang, '受影响机场', 'Airports') : tx(lang, '受影响线路', 'Affected lines'), lines],
  ];
  return (
    <div className="mt-5">
      <dl className="rounded-[16px] px-3.5" style={{ background: C.surface2 }}>
        {rows.map(([label, value], i) => (
          <div key={label} className="flex items-baseline gap-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : undefined }}>
            <dt className={`shrink-0 ${TYPE.label}`} style={{ color: C.text3 }}>{label}</dt>
            <dd className="flex-1 min-w-0 text-right text-[14.5px] font-medium leading-snug" style={{ color: value === null ? C.text3 : C.text }}>{value ?? tx(lang, '待核实', 'Unverified')}</dd>
          </div>
        ))}
      </dl>
      {card.geography.map(g => <p key={g.zh} className={`mt-2 px-1 ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, g.zh, g.en)}</p>)}
    </div>
  );
}

// ── Evidence: the register entry and the operator's own sentence ──────
// "Source: MIT" on every card says nothing. What makes a source specific is
// what only this strike has: its union, the date it was proclaimed, MIT's
// own wording, and the operator's sentence with these hours in it.

function Evidence({ card, lang, confirmed }: { card: ModeCard; lang: Lang; confirmed: boolean }) {
  const mode = MODE_COLOR[card.category];
  const groups = groupRecords(card.records);
  const quotes = card.quotes.slice(0, 2);
  const others = card.sources.filter(s => s.authority !== 'official' && !card.quotes.some(q => q.url === s.url)).filter((s, i, all) => all.findIndex(o => o.name === s.name) === i);
  return (
    <section className="mx-5 pt-4 pb-5" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-2.5">
        <h4 className={TYPE.label} style={{ color: C.text2 }}>{tx(lang, '信息来源', 'Where this comes from')}</h4>
        {confirmed && <span className={`flex items-center gap-1 ${TYPE.caption}`} style={{ color: C.text3 }}><Check size={11} weight="bold" />{tx(lang, '官方登记在案', 'On the official register')}</span>}
      </div>
      <div className="flex flex-col gap-2">
        {groups.map(g => (
          <a key={g.workforce + g.sector} href={g.url} target="_blank" rel="noreferrer" className="block rounded-[14px] p-3.5" style={{ background: C.surface2 }}>
            <span className="flex items-center gap-2">
              <span className="h-[20px] px-1.5 rounded-[5px] flex items-center text-[11px] font-semibold tracking-wide" style={{ ...FILLED(), fontFamily: NUM }}>MIT</span>
              <span className={`flex-1 ${TYPE.label}`} style={{ color: C.text }}>{tx(lang, '意大利交通部 罢工登记', 'Ministry of Transport register')}</span>
              <ArrowUpRight size={14} weight="bold" color={C.text3} />
            </span>
            <span className="mt-2.5 flex flex-col gap-1.5">
              {g.unions.map(u => (
                <span key={u.name} className={`flex items-baseline justify-between gap-3 ${TYPE.label}`}>
                  <span className="font-semibold" style={{ color: C.text, fontFamily: NUM, fontSize: 15, letterSpacing: '0.01em' }}>{u.name}</span>
                  {u.proclaimed && <span className={TYPE.caption} style={{ color: C.text3 }}>{tx(lang, `${monthDay(u.proclaimed, lang)}宣布`, `proclaimed ${monthDay(u.proclaimed, lang)}`)}</span>}
                </span>
              ))}
            </span>
            {g.workforce && <span className={`mt-2 block ${TYPE.caption}`} style={{ color: C.text2 }}>“{g.workforce}”</span>}
            <span className={`mt-1 block ${TYPE.caption}`} style={{ color: C.text3 }}>{[g.relevance, g.area, g.mode].filter(Boolean).join(' · ')}</span>
            <span className={`mt-2 block ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, `在公示表中查找 ${day(card.date, lang)} · ${g.unions[0]?.name ?? ''}`, `Look for ${day(card.date, lang)} · ${g.unions[0]?.name ?? ''} in the list`)}</span>
          </a>
        ))}
        {quotes.map(q => (
          <a key={q.url} href={q.url} target="_blank" rel="noreferrer" className="block rounded-[14px] p-3.5" style={{ background: C.surface2 }}>
            <span className="flex items-center gap-2">
              <span className={`flex-1 ${TYPE.label}`} style={{ color: C.text }}>{q.name}{q.official ? tx(lang, ' 官网原文', ' — official notice') : tx(lang, ' 报道原文', ' — report')}</span>
              {q.checkedAt && <span className={TYPE.caption} style={{ color: C.text3 }}>{tx(lang, `${monthDay(q.checkedAt, lang)}核对`, `checked ${monthDay(q.checkedAt, lang)}`)}</span>}
              <ArrowUpRight size={14} weight="bold" color={C.text3} />
            </span>
            <span className="mt-2 block text-[13.5px] leading-[1.5]" style={{ color: C.text2 }}>
              “{markTimes(q.excerpt.length > 220 ? `${q.excerpt.slice(0, 220)}…` : q.excerpt).map((p, i) => p.mark
                ? <mark key={i} className="rounded-[4px] px-[3px] font-semibold" style={{ background: mode.soft, color: mode.main }}>{p.text}</mark>
                : <span key={i}>{p.text}</span>)}”
            </span>
          </a>
        ))}
        {!groups.length && !quotes.length && (
          <a href={card.sources.find(s => s.authority === 'official')?.url || MIT} target="_blank" rel="noreferrer" className={`flex items-center justify-between rounded-[14px] p-3.5 ${TYPE.label}`} style={{ background: C.surface2, color: C.text }}>
            {tx(lang, '意大利交通部 罢工公示表', 'Ministry of Transport strike list')}<ArrowUpRight size={14} weight="bold" color={C.text3} />
          </a>
        )}
      </div>
      {(others.length > 0 || (card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE')) && (
        <p className={`mt-2.5 flex flex-wrap gap-x-3 gap-y-1 ${TYPE.caption}`} style={{ color: C.text3 }}>
          {card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE' && <a href={ENAC} target="_blank" rel="noreferrer" className="underline underline-offset-2">{tx(lang, '常规保护规则：ENAC', 'Standard protection rules: ENAC')}</a>}
          {others.slice(0, 3).map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.name}</a>)}
        </p>
      )}
    </section>
  );
}

// Two unions striking the same workforce are one register story.
function groupRecords(records: OfficialRecord[]) {
  const groups = new Map<string, OfficialRecord & { unionList: { name: string; proclaimed: string | null }[] }>();
  for (const r of records) {
    const key = `${r.workforce}|${r.sector}`;
    const g = groups.get(key) ?? { ...r, unionList: [] };
    if (r.unions && !g.unionList.some(u => u.name === r.unions)) g.unionList.push({ name: r.unions, proclaimed: r.proclaimed });
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({ ...g, unions: g.unionList }));
}

// ── Actions + the wall ───────────────────────────────────────────────

function Actions({ card, ctx }: { card: ModeCard; ctx: CardContext }) {
  const { lang } = ctx;
  const doodle = useDoodle(card, ctx.region);
  const mode = MODE_COLOR[card.category];
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${ctx.sharePath}?date=${card.date}`;
    track('share_intent_clicked', { strike_date: card.date, transport_type: card.category.toLowerCase() });
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      try { await navigator.share({ title: `${ctx.cityName}${tx(lang, ...TITLE[card.category])}`, url }); } catch { /* dismissed */ }
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="px-5 pt-5 pb-5">
      <div className="flex gap-2.5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={share} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`} style={TONAL}>
          {copied ? <Check size={17} weight="bold" /> : <Export size={17} weight="bold" />}{copied ? tx(lang, '已复制链接', 'Link copied') : tx(lang, '分享', 'Share')}
        </motion.button>
        <motion.button whileTap={doodle.marked ? undefined : { scale: 0.97 }} onClick={doodle.mark} aria-pressed={doodle.marked}
          className={`flex-[1.35] h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`}
          style={doodle.marked ? TONAL : FILLED(mode.main)}>
          <SprayBottle size={18} weight="fill" color={doodle.marked ? mode.main : undefined} />
          {!doodle.loaded && doodle.marked ? tx(lang, '获取中...', 'Loading...')
            : doodle.marked ? tx(lang, `${doodle.count} 人已表达不满`, `${doodle.count} people reacted`) : tx(lang, '我受影响了', 'I am affected')}
        </motion.button>
      </div>
      <Graffiti mode={card.category} seed={card.id} storeKey={doodle.key} doodle={doodle} lang={lang} />
    </div>
  );
}
