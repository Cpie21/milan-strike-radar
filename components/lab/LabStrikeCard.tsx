'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowSquareOut, CaretDown, Check, Clock, Export, Info, SprayBottle } from '@phosphor-icons/react';
import DoodleCanvas, { type DoodleCategory } from '../DoodleOverlay';
import {
  AXIS_END, AXIS_START, axisPos, modeName, nowPosition, relativeDay, segments, statusLine, tx,
  type Lang, type Mode, type ModeCard,
} from '../../lib/lab/model';
import { LineBadge, ModeGlyph } from './ui';
import { C, EASE, MODE_COLOR, NUM, R, SANS, TYPE } from './theme';
import { useDoodle } from './useDoodle';
import { track } from './track';

const TITLE: Record<Mode, [string, string]> = { TRAIN: ['火车罢工', 'Train strike'], SUBWAY: ['地铁罢工', 'Metro strike'], BUS: ['公交罢工', 'Bus strike'], AIRPORT: ['机场罢工', 'Airport strike'] };
const DOODLE: Record<Mode, DoodleCategory> = { TRAIN: 'train', SUBWAY: 'subway', BUS: 'bus', AIRPORT: 'plane' };
const TICKS = [5, 12, 18];
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const ENAC = 'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/';

export type CardContext = { today: string; nowMinutes: number; lang: Lang; region: string; cityName: string; sharePath: string };

const mins = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
const day = (iso: string, lang: Lang) => tx(lang, `${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);

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

const hatch = (color: string) => `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`;

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
// The hero (mode, title, hours, state) is centred: a day holds one to
// three cards, and a centred column keeps the eye on one fact at a time.

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
  const guaranteeLabel = card.guaranteeKind === 'PROTECTED_FLIGHTS' ? tx(lang, '保障航班', 'Protected flights') : tx(lang, '保障时间段', 'Guaranteed hours');
  const official = card.sources.find(s => s.authority === 'official')?.url || MIT;
  const reported = card.sources.filter(s => s.authority !== 'official').filter((s, i, all) => all.findIndex(o => o.name === s.name) === i);

  // Pill: live state on the day, otherwise length and distance.
  const pill = pending
    ? { text: tx(lang, '时段待公布', 'Hours pending'), color: C.text2, bg: C.surface3, dot: false }
    : live ? { text: status.text, color: mode.main, bg: mode.soft, dot: true }
      : isToday ? { text: status.text, color: C.text, bg: C.surface3, dot: false }
        : { text: `${relativeDay(card.date, ctx.today, lang)} · ${overnight ? tx(lang, '跨夜', 'Overnight') : hoursText(card, lang)}`, color: C.text2, bg: C.surface3, dot: false };
  const sub = (text: string) => <span className="text-[16px] font-semibold ml-1" style={{ color: C.text3, fontFamily: SANS }}>{text}</span>;

  return (
    <motion.article id={`card-${card.id}`} className="relative overflow-hidden"
      style={{ background: C.surface, borderRadius: R.card }}
      animate={{ boxShadow: highlighted ? [`0 0 0 0px ${mode.main}`, `0 0 0 3px ${mode.main}`, `0 0 0 0px ${mode.main}`] : '0 0 0 0px rgba(0,0,0,0)' }}
      transition={{ duration: 1.1, ease: EASE }}>
      {/* The mode's colour washes in from the top: which card is which, at a glance */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[180px] pointer-events-none" style={{ background: `linear-gradient(180deg, ${mode.soft}, transparent)` }} />
      <div className="relative px-5 pt-6">
        <header className="flex flex-col items-center text-center">
          <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: mode.main }}><ModeGlyph mode={card.category} size={22} color={mode.ink} /></span>
          <h3 className={`mt-3 flex items-center gap-1.5 ${TYPE.title}`}>
            {tx(lang, ...TITLE[card.category])}
            {card.national && <span className="text-[11.5px] font-medium px-1.5 h-[19px] rounded-[6px] flex items-center" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}
          </h3>
          <p className={`mt-0.5 max-w-full truncate ${TYPE.label}`} style={{ color: C.text2 }}>{card.scope ? `${card.scope} · ` : ''}{card.provider}</p>
        </header>

        {/* Strike time, large: the one thing people need to read */}
        <div className="mt-5 flex flex-col items-center gap-0.5 text-center" style={{ fontFamily: NUM }}>
          {pending ? (
            <p className={TYPE.page} style={{ color: C.text2, fontFamily: SANS }}>{tx(lang, '时段待公布', 'To be announced')}</p>
          ) : overnight ? (
            <p className={TYPE.display}>
              {(prev ? prev : card).windows.find(w => w.end_kind === 'end_of_service' || (w.end && w.end >= '23:59'))?.start ?? '00:00'}
              {sub(day((prev ?? card).date, lang))}
              <span className="mx-2" style={{ color: C.text3 }}>→</span>
              {(next ? next : card).windows.find(w => w.start === null || w.start <= '00:01')?.end ?? '24:00'}
              {sub(day((next ?? card).date, lang))}
            </p>
          ) : card.windows.map((w, i) => (
            <p key={i} className={TYPE.display}>
              {w.start ?? <span className="text-[22px]" style={{ fontFamily: SANS }}>{tx(lang, '运营开始', 'Start of service')}</span>}
              <span className="mx-2" style={{ color: C.text3 }}>–</span>
              {w.end_kind === 'end_of_service' ? <span className="text-[22px]" style={{ fontFamily: SANS }}>{tx(lang, '运营结束', 'end of service')}</span> : w.end}
            </p>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full tabular-nums ${TYPE.label}`} style={{ background: pill.bg, color: pill.color }}>
            {pill.dot ? <motion.i className="w-[7px] h-[7px] rounded-full" style={{ background: mode.main }} animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} /> : <Clock size={13} weight="bold" />}
            {pill.text}
          </span>
          <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full ${TYPE.label}`} style={{ color: pending ? C.text3 : C.text2, boxShadow: `inset 0 0 0 1px ${C.lineStrong}` }}>
            {pending ? tx(lang, '待确认', 'Pending') : <><Check size={12} weight="bold" />{tx(lang, '已确认', 'Confirmed')}</>}
          </span>
        </div>

        {/* Progress through the day; now marker on the day itself */}
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

        {/* Label-over-value grid */}
        <dl className="mt-4 grid grid-cols-2 gap-px rounded-[16px] overflow-hidden text-center" style={{ background: C.line }}>
          <div className="p-3.5" style={{ background: C.surface2 }}>
            <dt className={`mb-1 ${TYPE.caption}`} style={{ color: C.text3 }}>{guaranteeLabel}</dt>
            <dd className="text-[17px] font-semibold tabular-nums leading-snug" style={{ color: card.guarantees.length ? C.ok : C.text2, fontFamily: card.guarantees.length ? NUM : SANS }}>
              {card.guarantees.length
                ? card.guarantees.map(g => <span key={g.start} className="block">{g.start}–{g.end}</span>)
                : <span className="text-[14px]">{card.guaranteeSource === 'UNKNOWN' ? tx(lang, '保障信息待核实', 'Unverified') : tx(lang, '无保障计划', 'None')}</span>}
            </dd>
          </div>
          <div className="p-3.5" style={{ background: C.surface2 }}>
            <dt className={`mb-1 ${TYPE.caption}`} style={{ color: C.text3 }}>{card.category === 'AIRPORT' ? tx(lang, '受影响机场', 'Airports') : tx(lang, '受影响线路', 'Affected lines')}</dt>
            <dd className="flex flex-wrap justify-center gap-1 text-[14px] font-semibold leading-snug">
              {card.category === 'AIRPORT' && /^AIRLINE/.test(card.scopeType)
                ? <span>{tx(lang, '仅该航司航班', 'This airline only')}</span>
                : card.lineScope === 'SPECIFIC_LINES' && card.lines.length
                  ? card.lines.slice(0, 6).map(l => /^(M\d|S\d+|R\d+|RE\d+)$/i.test(l) ? <LineBadge key={l} line={l} /> : <span key={l}>{l}</span>)
                  : card.lineScope === 'ALL_LINES'
                    ? <span>{tx(lang, '全部线路', 'All lines')}</span>
                    : <span style={{ color: C.text2 }}>{tx(lang, '待核实', 'Unverified')}</span>}
            </dd>
          </div>
        </dl>

        {card.indirect && (
          <p className={`mt-3 flex gap-2 text-left rounded-[12px] px-3.5 py-2.5 ${TYPE.label}`} style={{ background: C.surface2, color: C.text2 }}>
            <Info size={16} weight="fill" color={mode.main} className="shrink-0 mt-px" />
            {tx(lang, '此处为相关人员停工时段；旅客列车的实际影响尚未确认，不代表所有列车停运。', 'These are staff strike hours. Passenger train impact is unconfirmed; this does not mean all trains stop.')}
          </p>
        )}
        {card.geography.map(g => <p key={g.zh} className={`mt-2.5 text-center ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, g.zh, g.en)}</p>)}

        {card.events.length > 1 && (
          <div className="mt-2 flex flex-col items-center">
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

      <footer className={`mx-5 py-3.5 flex flex-col items-center gap-1 ${TYPE.caption}`} style={{ borderTop: `1px solid ${C.line}`, color: C.text3 }}>
        <a href={official} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ textDecorationColor: C.lineStrong }}>{tx(lang, '来源: 意大利交通部官网 (MIT) ➔', 'Source: Italian Ministry of Transport (MIT) →')}</a>
        {card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE' && (
          <a href={ENAC} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ textDecorationColor: C.lineStrong }}>{tx(lang, '常规保护规则：ENAC ↗', 'Standard protection rules: ENAC ↗')}</a>
        )}
        {reported.length > 0 && (
          <span className="flex flex-wrap justify-center gap-x-2">
            <span>{tx(lang, '补充公告时段 · 以运营商最新通知为准', 'Reported timing · check the operator')}</span>
            {reported.slice(0, 3).map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2" style={{ textDecorationColor: C.lineStrong }}>{s.name}<ArrowSquareOut size={10} /></a>)}
          </span>
        )}
      </footer>
    </motion.article>
  );
}

function Actions({ card, ctx }: { card: ModeCard; ctx: CardContext }) {
  const { lang } = ctx;
  const doodle = useDoodle(card, ctx.region);
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
    <div className="px-5 pt-4 pb-4">
      <div className="flex gap-2.5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={share} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`} style={{ background: C.surface3 }}>
          {copied ? <Check size={17} weight="bold" /> : <Export size={17} weight="bold" />}{copied ? tx(lang, '已复制链接', 'Link copied') : tx(lang, '分享', 'Share')}
        </motion.button>
        <motion.button whileTap={doodle.marked ? undefined : { scale: 0.97 }} onClick={doodle.mark} aria-pressed={doodle.marked}
          className={`flex-[1.35] h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`}
          style={doodle.marked ? { background: MODE_COLOR[card.category].soft, color: MODE_COLOR[card.category].main } : { background: MODE_COLOR[card.category].main, color: MODE_COLOR[card.category].ink }}>
          <SprayBottle size={18} weight="fill" />
          {!doodle.loaded && doodle.marked ? tx(lang, '获取中...', 'Loading...')
            : doodle.marked ? tx(lang, `${doodle.count} 人已表达不满`, `${doodle.count} people reacted`) : tx(lang, '我受影响了', 'I am affected')}
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {doodle.marked && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} className="overflow-hidden">
            <div className="h-[200px] mt-3"><DoodleCanvas category={DOODLE[card.category]} count={doodle.count} isAnimating={doodle.spraying} isDark seed={card.id} /></div>
            <p className={`text-center pt-1 ${TYPE.label}`} style={{ color: C.text2 }}>
              {tx(lang, '还有 ', 'Another ')}<strong style={{ color: C.text }}>{tx(lang, `${Math.max(doodle.count, 1)} 人`, `${Math.max(doodle.count, 1)}`)}</strong>
              {tx(lang, ` 也被影响了，和你一起在${modeName(card.category).replace('机场', '飞机')}上猛猛涂鸦`, ` people were affected by this ${modeName(card.category, 'en').toLowerCase()} strike too`)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
