'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, CaretDown, Check, Clock, Export, Info, SprayBottle } from '@phosphor-icons/react';
import {
  AXIS_END, AXIS_START, axisPos, markTimes, nowPosition, relativeDay, segments, statusLine, timeSpan, tx, windowsText,
  type Lang, type Mode, type ModeCard, type OfficialRecord,
} from '../../lib/lab/model';
import type { Translation } from '../../lib/lab/translate';
import { LineBadge, ModeGlyph } from './ui';
import { C, EASE, FILLED, MODE_COLOR, NUM, R, SANS, TONAL, TYPE } from './theme';
import { useDoodle } from './useDoodle';
import { track } from './track';
import Graffiti from './Graffiti';

const TITLE: Record<Mode, [string, string]> = { TRAIN: ['火车罢工', 'Train strike'], SUBWAY: ['地铁罢工', 'Metro strike'], BUS: ['公交罢工', 'Bus strike'], AIRPORT: ['机场罢工', 'Airport strike'] };
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const ENAC = 'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/';
const RELEVANCE: Record<string, [string, string]> = { Nazionale: ['全国', 'National'], Regionale: ['大区', 'Regional'], Provinciale: ['省级', 'Provincial'], Locale: ['本地', 'Local'], Aziendale: ['企业内', 'Company'] };

export type CardContext = { today: string; nowMinutes: number; lang: Lang; region: string; cityName: string; sharePath: string; tr: Record<string, Translation> };

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

// ── Time bar ──────────────────────────────────────────────────────────
// Progress-bar practice: one slim track; segments separated by a hairline
// gap rather than butting colours together; labels only where something
// changes (the strike's own edges), never a generic axis; faint hour ticks
// for scale; an open end tapers instead of stopping at a hard edge.

const HOUR_TICKS = [6, 9, 12, 15, 18, 21];

export function Bar({ card, now = null, label, lang = 'zh' }: { card: ModeCard; now?: number | null; label?: string; lang?: Lang }) {
  const cancelled = card.status === 'CANCELLED';
  const color = cancelled ? C.cancel : MODE_COLOR[card.category].main;
  const openEnd = card.windows.some(w => w.end_kind === 'end_of_service');
  // Edge labels, thinned so they never collide.
  const edges = card.windows.flatMap(w => [
    w.start ? { t: w.start, x: axisPos(mins(w.start)) } : null,
    w.end_kind !== 'end_of_service' && w.end ? { t: w.end, x: axisPos(mins(w.end)) } : null,
  ]).filter((e): e is { t: string; x: number } => !!e && e.x > 0.001 && e.x < 0.999).sort((a, b) => a.x - b.x)
    .filter((e, i, all) => i === 0 || e.x - all[i - 1].x > 0.12)
    .filter(e => !openEnd || e.x < 0.8);
  const seg = (left: number, width: number) => ({ left: `calc(${left * 100}% + ${left > 0 ? 1 : 0}px)`, width: `calc(${width * 100}% - ${(left > 0 ? 1 : 0) + (left + width < 0.999 ? 1 : 0)}px)` });
  return (
    <div className="relative flex-1 min-w-0">
      <div className="relative h-[8px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        {!card.windows.length && !cancelled && <div className="absolute inset-0" style={{ background: hatch(color), opacity: 0.55 }} />}
        {segments(card.windows).map((s, i) => (
          <div key={i} className="absolute top-0 h-full rounded-full" style={{
            ...seg(s.left, s.width),
            background: card.indirect && !cancelled ? hatch(color) : s.fade ? `linear-gradient(90deg, ${color} 72%, ${color}40)` : color,
          }} />
        ))}
        {!cancelled && segments(card.guarantees).map((g, i) => (
          <div key={`g${i}`} className="absolute top-[2px] h-[4px] rounded-full" style={{ ...seg(g.left, g.width), background: C.ok, opacity: 0.85 }} />
        ))}
      </div>
      {/* Hour ticks for scale */}
      <div aria-hidden className="relative h-[5px]">
        {HOUR_TICKS.map(h => <i key={h} className="absolute top-[2px] w-px h-[3px]" style={{ left: `${axisPos(h * 60) * 100}%`, background: 'rgba(255,255,255,0.14)' }} />)}
      </div>
      {now !== null && (
        <span aria-hidden className="absolute -top-[4px] flex flex-col items-center" style={{ left: `${now * 100}%`, transform: 'translateX(-50%)' }}>
          <i className="w-[2px] h-[16px] rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${C.surface}` }} />
        </span>
      )}
      <div className="relative h-4 mt-0.5 text-[11.5px] font-medium tabular-nums" style={{ color: C.text2, fontFamily: NUM }}>
        {label ? <span style={{ color: C.text3 }}>{label}</span> : <>
          {edges.map(e => <span key={e.t + e.x} className="absolute whitespace-nowrap" style={{ left: `${e.x * 100}%`, transform: `translateX(${e.x < 0.06 ? '0' : '-50%'})` }}>{e.t}</span>)}
          {openEnd && <span className="absolute right-0" style={{ fontFamily: SANS, color: C.text3 }}>{tx(lang, '运营结束', 'End of service')}</span>}
        </>}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────
// Reading order follows the questions people ask, one per band:
//   what & is it sure → when → how far off → (the day at a glance)
//   → does it hit me → the wall and what to do → why we believe it.
// Every fact appears once.

export default function LabStrikeCard({ card, prev, next, ctx, highlighted }: { card: ModeCard; prev?: ModeCard; next?: ModeCard; ctx: CardContext; highlighted: boolean }) {
  const { lang } = ctx;
  const reduce = useReducedMotion();
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
  // Confirmation matters most when it is missing. (Aggregate confidence
  // reads 'reported' whenever any report exists, even beside an operator's
  // own notice, so an official quote outranks it.)
  const officialTiming = card.quotes.some(q => q.official);
  const doubt = pending ? tx(lang, '官方未公布时段', 'no official hours yet')
    : card.confidence === 'conflict' ? tx(lang, '各来源时段不一致', 'sources disagree on hours')
      : card.confidence === 'reported' && !officialTiming ? tx(lang, '时段仅见报道', 'hours only reported')
        : card.status === 'UNCERTAIN' ? tx(lang, '官方状态未定', 'status not final') : null;
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
        <header className="flex flex-col items-center text-center">
          <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: mode.deep }}><ModeGlyph mode={card.category} size={22} color="#FFFFFF" /></span>
          <h3 className={`mt-3 ${TYPE.title}`}>{tx(lang, ...TITLE[card.category])}</h3>
          <p className={`mt-1 flex items-center gap-2 ${TYPE.caption}`} style={{ color: C.text3 }}>
            {card.national && <span className="px-1.5 h-[18px] rounded-[5px] flex items-center" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}
            {!doubt && <span className="flex items-center gap-0.5"><Check size={11} weight="bold" />{tx(lang, '已确认', 'Confirmed')}</span>}
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

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full tabular-nums ${TYPE.label}`} style={{ background: pill.bg, color: pill.color }}>
            {pill.dot ? <motion.i className="w-[7px] h-[7px] rounded-full" style={{ background: mode.main }} animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} /> : <Clock size={13} weight="bold" />}
            {pill.text}
          </span>
          {doubt && (
            <span className={`relative overflow-hidden inline-flex items-center h-7 px-3 rounded-full ${TYPE.label} font-semibold`} style={{ color: C.text, boxShadow: `inset 0 0 0 1.5px ${mode.main}` }}>
              <span aria-hidden className="absolute inset-0" style={{ background: hatch(mode.soft) }} />
              <span className="relative">{tx(lang, `待确认 · ${doubt}`, `Unconfirmed · ${doubt}`)}</span>
            </span>
          )}
        </div>

        <div className="mt-6">
          {overnight ? (
            <div className="flex items-start gap-2">
              {[prev ?? card, next ?? card].map((c, i) => (
                <Bar key={c.id + i} card={c} lang={lang} label={day(c.date, lang)} now={c.date === ctx.today ? nowPosition(ctx.nowMinutes) : null} />
              ))}
            </div>
          ) : <Bar card={card} lang={lang} now={isToday ? nowPosition(ctx.nowMinutes) : null} />}
        </div>

        <Details card={card} lang={lang} breaks={span?.breaks ?? []} say={t => (lang === 'en' && ctx.tr[t.trim()] ? ctx.tr[t.trim()].en : t)} />

        {card.indirect && (
          <p className={`mt-3 flex gap-2 rounded-[12px] px-3.5 py-2.5 ${TYPE.label}`} style={{ background: C.surface2, color: C.text2 }}>
            <Info size={16} weight="fill" color={mode.main} className="shrink-0 mt-px" />
            {tx(lang, '此处为相关人员停工时段；旅客列车的实际影响尚未确认，不代表所有列车停运。', 'These are staff strike hours. Passenger train impact is unconfirmed; this does not mean all trains stop.')}
          </p>
        )}
      </div>

      <Actions card={card} ctx={ctx} />
      <Evidence card={card} ctx={ctx} />
    </motion.article>
  );
}

// ── Details: label left, value right ─────────────────────────────────
// Guaranteed hours that equal the breaks already named under the time are
// not repeated here.

function Details({ card, lang, breaks, say }: { card: ModeCard; lang: Lang; breaks: { start: string; end: string }[]; say: (text: string) => string }) {
  const lines = card.category === 'AIRPORT' && /^AIRLINE/.test(card.scopeType)
    ? tx(lang, '仅该航司航班', 'This airline only')
    : card.lineScope === 'SPECIFIC_LINES' && card.lines.length
      ? <span className="inline-flex flex-wrap justify-end gap-1">{card.lines.slice(0, 6).map(l => /^(M\d|S\d+|R\d+|RE\d+)$/i.test(l) ? <LineBadge key={l} line={l} /> : <span key={l}>{l}</span>)}</span>
      : card.lineScope === 'ALL_LINES' ? tx(lang, '全部线路', 'All lines') : null;
  const sameAsBreaks = card.guarantees.length > 0 && card.guarantees.every(g => breaks.some(b => b.start === g.start && b.end === g.end));
  const guarantee = card.guarantees.length
    ? <span className="tabular-nums" style={{ color: C.ok, fontFamily: NUM, fontSize: 16 }}>{card.guarantees.map(g => `${g.start}–${g.end}`).join('  ')}</span>
    : card.guaranteeSource === 'UNKNOWN' ? null : tx(lang, '无保障计划', 'None');
  const rows: [string, React.ReactNode][] = [
    [tx(lang, '罢工人员', 'Who'), say(card.provider)],
    ...(card.scope ? [[tx(lang, '罢工类型', 'Type'), say(card.scope)] as [string, React.ReactNode]] : []),
    ...(sameAsBreaks ? [] : [[card.guaranteeKind === 'PROTECTED_FLIGHTS' ? tx(lang, '保障航班', 'Protected flights') : tx(lang, '保障时间段', 'Guaranteed hours'), guarantee] as [string, React.ReactNode]]),
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

// ── Evidence ──────────────────────────────────────────────────────────
// Most people want to know only that there is a source and whose. So the
// default is one line naming them; the detail opens on demand, in three
// groups by authority — the register, the operator, the press — each
// announcement once. Italian is shown translated; the original is a tap.

function Evidence({ card, ctx }: { card: ModeCard; ctx: CardContext }) {
  const { lang, tr } = ctx;
  const mode = MODE_COLOR[card.category];
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState(false);
  const groups = groupRecords(card.records);
  const official = card.quotes.filter(q => q.official).slice(0, 2);
  const press = [
    ...card.quotes.filter(q => !q.official).map(q => ({ name: q.name, url: q.url })),
    ...card.sources.filter(s => s.authority !== 'official' && !card.quotes.some(q => q.url === s.url)),
  ].filter((s, i, all) => all.findIndex(o => o.name === s.name) === i);
  const say = (text: string) => (!original && tr[text.trim()] ? tr[text.trim()][lang] : text);
  const translated = [...groups.flatMap(g => [g.workforce, g.mode]), ...official.map(q => q.excerpt)].some(t => t && tr[t.trim()]);
  const names = [
    ...(groups.length ? [tx(lang, '交通部登记', 'MIT register')] : []),
    ...official.map(q => q.name),
    ...(press.length ? [tx(lang, `${press.length} 篇报道`, `${press.length} report${press.length > 1 ? 's' : ''}`)] : []),
  ];

  return (
    <section className="mx-5 pb-4" style={{ borderTop: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center gap-2 py-3.5 text-left">
        <span className={`shrink-0 ${TYPE.label}`} style={{ color: C.text3 }}>{tx(lang, '来源', 'Source')}</span>
        <span className={`flex-1 min-w-0 truncate ${TYPE.label}`} style={{ color: C.text2 }}>{names.length ? names.join(' · ') : tx(lang, '意大利交通部公示', 'Ministry of Transport list')}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="flex"><CaretDown size={13} weight="bold" color={C.text3} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
            <div className="flex flex-col gap-4 pb-1">
              {translated && (
                <div className="flex justify-end">
                  <button onClick={() => setOriginal(v => !v)} className={`h-7 px-2.5 rounded-full ${TYPE.caption}`} style={{ background: C.surface3, color: C.text }}>
                    {original ? tx(lang, '看译文', 'Show translation') : tx(lang, '看意大利语原文', 'Show Italian original')}
                  </button>
                </div>
              )}

              {groups.map(g => (
                <Group key={g.workforce + g.sector} title={tx(lang, '意大利交通部 · 罢工登记', 'Ministry of Transport · strike register')}>
                  {g.unions.map(u => {
                    const own = u.windows.length && windowsText(u.windows, lang) !== windowsText(card.windows, lang) ? windowsText(u.windows, lang) : null;
                    return (
                      <div key={u.name} className="flex items-baseline justify-between gap-3">
                        <span>
                          <span className="font-semibold" style={{ color: C.text, fontFamily: NUM, fontSize: 15 }}>{u.name}</span>
                          {own && <span className={`block ${TYPE.caption}`} style={{ color: C.text3 }}>{own}</span>}
                        </span>
                        {u.proclaimed && <span className={`shrink-0 ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, `${monthDay(u.proclaimed, lang)}宣布`, `called ${monthDay(u.proclaimed, lang)}`)}</span>}
                      </div>
                    );
                  })}
                  {g.workforce && <p className={TYPE.label} style={{ color: C.text2 }}>{say(g.workforce)}</p>}
                  <p className={TYPE.caption} style={{ color: C.text3 }}>
                    {[RELEVANCE[g.relevance] ? tx(lang, ...RELEVANCE[g.relevance]) : g.relevance, g.area && say(g.area), g.mode && say(g.mode)].filter(Boolean).join(' · ')}
                  </p>
                  <a href={g.url} target="_blank" rel="noreferrer" className={`self-start inline-flex items-center gap-1 ${TYPE.caption}`} style={{ color: C.text2 }}>
                    {tx(lang, `打开公示表，查找 ${day(card.date, lang)} · ${g.unions[0]?.name ?? ''}`, `Open the list; look for ${day(card.date, lang)} · ${g.unions[0]?.name ?? ''}`)}<ArrowUpRight size={12} weight="bold" />
                  </a>
                </Group>
              ))}

              {official.map(q => (
                <Group key={q.url} title={`${q.name} · ${tx(lang, '官方公告', 'official notice')}`} aside={q.checkedAt ? tx(lang, `${monthDay(q.checkedAt, lang)}核对`, `checked ${monthDay(q.checkedAt, lang)}`) : undefined}>
                  <p className="text-[14px] leading-[1.55]" style={{ color: C.text2 }}>
                    {markTimes(say(q.excerpt).length > 240 ? `${say(q.excerpt).slice(0, 240)}…` : say(q.excerpt)).map((p, i) => p.mark
                      ? <mark key={i} className="rounded-[4px] px-[3px] font-semibold" style={{ background: mode.soft, color: mode.main }}>{p.text}</mark>
                      : <span key={i}>{p.text}</span>)}
                  </p>
                  <a href={q.url} target="_blank" rel="noreferrer" className={`self-start inline-flex items-center gap-1 ${TYPE.caption}`} style={{ color: C.text2 }}>{tx(lang, '打开公告', 'Open notice')}<ArrowUpRight size={12} weight="bold" /></a>
                </Group>
              ))}

              {(press.length > 0 || (card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE')) && (
                <Group title={tx(lang, '其他参考', 'Also see')}>
                  <div className="flex flex-wrap gap-1.5">
                    {card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE' && <Link href={ENAC}>{tx(lang, 'ENAC 常规保护规则', 'ENAC protection rules')}</Link>}
                    {press.slice(0, 4).map(s => <Link key={s.url} href={s.url}>{s.name}</Link>)}
                  </div>
                </Group>
              )}

              {!groups.length && !official.length && (
                <a href={card.sources.find(s => s.authority === 'official')?.url || MIT} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${TYPE.label}`} style={{ color: C.text2 }}>
                  {tx(lang, '意大利交通部 罢工公示表', 'Ministry of Transport strike list')}<ArrowUpRight size={12} weight="bold" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Group({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 pl-3" style={{ borderLeft: `2px solid ${C.lineStrong}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <h5 className={TYPE.caption} style={{ color: C.text3 }}>{title}</h5>
        {aside && <span className={TYPE.caption} style={{ color: C.text3 }}>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`h-7 px-2.5 rounded-full inline-flex items-center gap-1 ${TYPE.caption}`} style={{ background: C.surface2, color: C.text2 }}>{children}<ArrowUpRight size={11} weight="bold" /></a>;
}

// Two unions striking the same workforce are one register story.
function groupRecords(records: OfficialRecord[]) {
  const groups = new Map<string, OfficialRecord & { unionList: { name: string; proclaimed: string | null; windows: OfficialRecord['windows'] }[] }>();
  for (const r of records) {
    const key = `${r.workforce}|${r.sector}`;
    const g = groups.get(key) ?? { ...r, unionList: [] };
    if (r.unions && !g.unionList.some(u => u.name === r.unions)) g.unionList.push({ name: r.unions, proclaimed: r.proclaimed, windows: r.windows });
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({ ...g, unions: g.unionList }));
}

// ── The wall, then what to do ────────────────────────────────────────
// The buttons sit under the wall they act on. The spray can in
// "我受影响了" is the same object that lands on the wall when pressed.

function Actions({ card, ctx }: { card: ModeCard; ctx: CardContext }) {
  const { lang } = ctx;
  const doodle = useDoodle(card, ctx.region);
  const mode = MODE_COLOR[card.category];
  const [copied, setCopied] = useState(false);
  const [spray, setSpray] = useState(false);
  const react = () => { if (!doodle.marked) { doodle.mark(); setSpray(true); } };
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
      <Graffiti mode={card.category} seed={card.id} storeKey={doodle.key} doodle={doodle} lang={lang} open={spray} onOpen={() => setSpray(true)} onClose={() => setSpray(false)} />
      <div className="mt-3 flex gap-2.5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={share} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`} style={TONAL}>
          {copied ? <Check size={17} weight="bold" /> : <Export size={17} weight="bold" />}{copied ? tx(lang, '已复制链接', 'Link copied') : tx(lang, '分享', 'Share')}
        </motion.button>
        <motion.button whileTap={doodle.marked ? undefined : { scale: 0.97 }} onClick={react} aria-pressed={doodle.marked}
          className={`flex-[1.35] h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`}
          style={doodle.marked ? TONAL : FILLED(mode.deep)}>
          {doodle.marked
            ? <SprayBottle size={18} weight="fill" color={mode.main} />
            : <motion.span layoutId={`can-${card.id}`} className="flex"><SprayBottle size={18} weight="fill" /></motion.span>}
          {!doodle.loaded && doodle.marked ? tx(lang, '获取中...', 'Loading...')
            : doodle.marked ? tx(lang, `${doodle.count} 人已表达不满`, `${doodle.count} people reacted`) : tx(lang, '我受影响了', 'I am affected')}
        </motion.button>
      </div>
    </div>
  );
}
