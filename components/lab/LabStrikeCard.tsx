'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, CaretDown, Check, Clock, Export, Info, SealCheck, ShieldCheck, SprayBottle, Translate } from '@phosphor-icons/react';
import {
  AXIS_END, AXIS_START, axisPos, carveGuarantees, markTimes, nowPosition, relativeDay, segments, statusLine, timeSpan, tx, windowsText,
  type Lang, type Mode, type ModeCard, type OfficialRecord,
} from '../../lib/lab/model';
import type { Translation } from '../../lib/lab/translate';
import { LineBadge, ModeBadge, ModeGlyph } from './ui';
import { C, EASE, FILLED, MODE_COLOR, NUM, R, SANS, TONAL, TYPE } from './theme';
import { useDoodle } from './useDoodle';
import { track } from './track';
import PixelWall, { type WallLink } from './wall/PixelWall';

const TITLE: Record<Mode, [string, string]> = { TRAIN: ['火车罢工', 'Train strike'], SUBWAY: ['地铁罢工', 'Metro strike'], BUS: ['公交罢工', 'Bus strike'], AIRPORT: ['机场罢工', 'Airport strike'] };
const MIT = 'https://scioperi.mit.gov.it/mit2/public/scioperi';
const ENAC = 'https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/';
const RELEVANCE: Record<string, [string, string]> = { Nazionale: ['全国', 'National'], Regionale: ['大区', 'Regional'], Provinciale: ['省级', 'Provincial'], Locale: ['本地', 'Local'], Aziendale: ['企业内', 'Company'] };

export type CardContext = { today: string; nowMinutes: number; lang: Lang; region: string; cityName: string; sharePath: string; tr: Record<string, Translation> };

const mins = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
const day = (iso: string, lang: Lang) => tx(lang, `${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);
const monthDay = (iso: string, lang: Lang) => tx(lang, `${Number(iso.slice(5, 7))}月${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);
const LINK = '#7AB0FF'; // links read as links: blue and underlined
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
  // Guaranteed hours inside the strike are cut out of it and drawn full
  // height in timetable ivory: two equal-weight fills, never a line on a line.
  const strike = cancelled ? card.windows : carveGuarantees(card.windows, card.guarantees);
  const edgeOf = (t: string | null, x: number, ok = false) => (t ? { t, x, ok } : null);
  const edges = [
    ...card.windows.flatMap(w => [edgeOf(w.start, w.start ? axisPos(mins(w.start)) : 0), w.end_kind !== 'end_of_service' ? edgeOf(w.end, w.end ? axisPos(mins(w.end)) : 1) : null]),
    ...(cancelled ? [] : card.guarantees.flatMap(g => [g.start ? edgeOf(g.start, axisPos(mins(g.start)), true) : null, g.end && g.end_kind !== 'end_of_service' ? edgeOf(g.end, axisPos(mins(g.end)), true) : null])),
  ].filter((e): e is { t: string; x: number; ok: boolean } => !!e && e.x > 0.001 && e.x < 0.999)
    // A strike edge a minute off a guarantee edge (05:59 / 06:00) is one
    // change: label it once, by the guarantee.
    .filter((e, _, all) => e.ok || !all.some(o => o.ok && Math.abs(mins(o.t) - mins(e.t)) <= 2))
    .sort((a, b) => a.x - b.x)
    .filter((e, i, all) => i === 0 || e.x - all[i - 1].x > 0.14)
    .filter(e => !openEnd || e.x < 0.8);
  const seg = (left: number, width: number) => ({ left: `calc(${left * 100}% + ${left > 0 ? 1 : 0}px)`, width: `calc(${width * 100}% - ${(left > 0 ? 1 : 0) + (left + width < 0.999 ? 1 : 0)}px)` });
  return (
    <div className="relative flex-1 min-w-0">
      <div className="relative h-[8px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        {!card.windows.length && !cancelled && <div className="absolute inset-0" style={{ background: hatch(color), opacity: 0.55 }} />}
        {segments(strike).map((s, i) => (
          <div key={i} className="absolute top-0 h-full rounded-full" style={{
            ...seg(s.left, s.width),
            background: card.indirect && !cancelled ? hatch(color) : s.fade ? `linear-gradient(90deg, ${color} 72%, ${color}40)` : color,
          }} />
        ))}
        {!cancelled && segments(card.guarantees).map((g, i) => (
          <div key={`g${i}`} className="absolute top-0 h-full rounded-full" style={{ ...seg(g.left, g.width), background: C.run }} />
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
          {edges.map(e => <span key={e.t + e.x} className="absolute whitespace-nowrap" style={{ left: `${e.x * 100}%`, transform: `translateX(${e.x < 0.06 ? '0' : e.x > 0.94 ? '-100%' : '-50%'})`, color: e.ok ? C.run : C.text2 }}>{e.t}</span>)}
          {openEnd && <span className="absolute right-0" style={{ fontFamily: SANS, color: C.text3 }}>{tx(lang, '末班车', 'Last service')}</span>}
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
  const live = isToday && status.text.startsWith(tx(lang, '罢工时段内', 'In strike hours'));
  const overnight = prev || next;
  const pending = !card.windows.length;
  // Confirmation matters most when it is missing. (Aggregate confidence
  // reads 'reported' whenever any report exists, even beside an operator's
  // own notice, so an official quote outranks it.)
  const doubt = pending ? tx(lang, '官方未公布时段', 'no official hours yet')
    : card.confidence === 'conflict' ? tx(lang, '各来源时段不一致', 'sources disagree on hours')
      : card.confidence === 'reported' ? tx(lang, '时段来源自报道', 'hours from press reports')
        : card.status === 'UNCERTAIN' ? tx(lang, '官方状态未定', 'status not final') : null;
  const span = timeSpan(card.windows);
  // A gap between windows is only "guaranteed" if a guarantee covers it;
  // otherwise it is just outside the published strike hours.
  // Strike windows often stop a minute short of a guarantee (05:59 / 06:00),
  // so a gap counts as guaranteed when a guarantee covers it within 2 min.
  const near = (a: string, b: string) => Math.abs(mins(a) - mins(b)) <= 2;
  const inGuarantee = (b: { start: string; end: string }) => card.guarantees.some(g => (g.start === null || g.start <= b.start || near(g.start, b.start)) && (g.end_kind === 'end_of_service' || (g.end !== null && (g.end >= b.end || near(g.end, b.end)))));
  const openBreaks = (span?.breaks ?? []).filter(b => !inGuarantee(b));

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
          <ModeBadge mode={card.category} size={44} />
          <h3 className={`mt-3 ${TYPE.title}`}>{tx(lang, ...TITLE[card.category])}</h3>
          <p className={`mt-1 flex items-center gap-2 ${TYPE.caption}`} style={{ color: C.text3 }}>
            {card.national && <span className="px-1.5 h-[18px] rounded-[5px] flex items-center" style={{ background: C.surface3, color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}
            {!doubt && <span className="flex items-center gap-0.5"><Check size={11} weight="bold" />{tx(lang, '已确认', 'Confirmed')}</span>}
            {/* how far off: a footnote to what, not a headline of its own */}
            {!isToday && <span>{!doubt || card.national ? '· ' : ''}{relativeDay(card.date, ctx.today, lang)}</span>}
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
                {span.end ?? word(tx(lang, '运营结束', 'end of service'))}
              </p>
              {/* The notice says "end of service"; a timetable time is only a reference beside it */}
              {span.end === null && card.scheduledEnd && (
                <a href={card.scheduledEnd.source} target="_blank" rel="noreferrer" className={`mt-1 ${TYPE.caption} underline underline-offset-2`} style={{ color: C.text3, fontFamily: SANS, textDecorationColor: C.lineStrong }}>
                  {tx(lang, `时刻表末班参考：${card.scheduledEnd.label}`, `Timetable last service: ${card.scheduledEnd.label}`)}
                </a>
              )}
              {/* Guaranteed gaps have their own row below; plain gaps say so here */}
              {openBreaks.length > 0 && (
                <p className={`mt-1 flex items-center gap-1.5 tabular-nums ${TYPE.label}`} style={{ color: C.text2, fontFamily: SANS }}>
                  <i className="w-[6px] h-[6px] rounded-full" style={{ background: C.text3 }} />
                  {tx(lang, `${openBreaks.map(b => `${b.start}–${b.end}`).join('、')} 不在已公布罢工时段内`, `${openBreaks.map(b => `${b.start}–${b.end}`).join(', ')} outside the published strike hours`)}
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {/* Only today earns a status line; other days say how far off in the header */}
          {isToday && (
            <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full tabular-nums ${TYPE.label}`} style={{ background: pill.bg, color: pill.color }}>
              {pill.dot ? <motion.i className="w-[7px] h-[7px] rounded-full" style={{ background: mode.main }} animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} /> : <Clock size={13} weight="bold" />}
              {pill.text}
            </span>
          )}
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

        <Details card={card} lang={lang} say={t => (lang === 'en' && ctx.tr[t.trim()] ? ctx.tr[t.trim()].en : t)} />

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
// Guaranteed hours lead, in their own row and in green: they are the hours
// you can still travel, which is what people look for first after "when".

const GUARANTEE_FROM: Record<string, [string, string]> = {
  OFFICIAL_STRIKE_NOTICE: ['来自罢工公告', 'From the strike notice'], OPERATOR_RULE: ['运营方的保障规则', 'Operator’s guarantee rules'],
  STANDARD_RULE: ['法定最低服务', 'Statutory minimum service'],
};

function Details({ card, lang, say }: { card: ModeCard; lang: Lang; say: (text: string) => string }) {
  const impacts = card.impacts ?? [];
  const lineImpacts = impacts.filter(i => i.lines);
  const routes = [...new Set(lineImpacts.flatMap(i => i.routes))].filter(r => /^(M\d|S\d+|R\d+|RE\d+|T\d+)$/i.test(r)).sort();
  const lines = card.category === 'AIRPORT' && /^AIRLINE/.test(card.scopeType)
    ? tx(lang, '仅该航司航班', 'This airline only')
    : card.lineScope === 'SPECIFIC_LINES' && card.lines.length
      ? <span className="inline-flex flex-wrap justify-end gap-1">{card.lines.slice(0, 6).map(l => /^(M\d|S\d+|R\d+|RE\d+)$/i.test(l) ? <LineBadge key={l} line={l} /> : <span key={l}>{l}</span>)}</span>
      : lineImpacts.length
        ? <span className="inline-flex flex-col items-end gap-1.5">
            <span>{lineImpacts.map(i => tx(lang, i.zh, i.en)).join(tx(lang, '；', '; '))}</span>
            {routes.length > 0 && <span className="inline-flex flex-wrap justify-end gap-1">{routes.slice(0, 8).map(r => <LineBadge key={r} line={r} />)}</span>}
          </span>
        : card.lineLabels.length ? card.lineLabels.join(tx(lang, '；', '; '))
          : card.lineScope === 'ALL_LINES' ? tx(lang, '全部线路', 'All lines') : null;
  const scopeNote = impacts.filter(i => !i.lines).map(i => tx(lang, i.zh, i.en));
  const rows: [string, React.ReactNode][] = [
    [tx(lang, '罢工人员', 'Who'), say(card.provider)],
    ...(card.scope ? [[tx(lang, '罢工类型', 'Type'), say(card.scope)] as [string, React.ReactNode]] : []),
    ...(card.category === 'AIRPORT' && scopeNote.length ? [[tx(lang, '影响范围', 'Scope'), scopeNote.join(tx(lang, '；', '; '))] as [string, React.ReactNode]] : []),
    ...(card.category !== 'AIRPORT' || lines ? [[card.category === 'AIRPORT' ? tx(lang, '受影响机场', 'Airports') : tx(lang, '受影响线路', 'Affected lines'), lines] as [string, React.ReactNode]] : []),
  ];
  const airport = card.guaranteeKind === 'PROTECTED_FLIGHTS';
  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {/* The guaranteed hours, on their own */}
      <section className="rounded-[16px] px-3.5 py-3" style={{ background: card.guarantees.length ? C.okSoft : C.surface2, boxShadow: card.guarantees.length ? `inset 0 0 0 1px ${C.ok}33` : 'none' }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} weight="fill" color={card.guarantees.length ? C.ok : C.text3} />
          <span className={`${TYPE.label} font-semibold`} style={{ color: card.guarantees.length ? C.ok : C.text2 }}>{airport ? tx(lang, '保障航班', 'Protected flights') : tx(lang, '保障时段', 'Guaranteed hours')}</span>
          {card.guarantees.length > 0 && GUARANTEE_FROM[card.guaranteeSource] && <span className={`ml-auto ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, ...GUARANTEE_FROM[card.guaranteeSource])}</span>}
        </div>
        {card.guarantees.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.guarantees.map((g, i) => (
              <span key={i} className="h-8 px-3 rounded-full inline-flex items-center tabular-nums text-[15px] font-semibold" style={{ background: 'rgba(61,220,132,0.16)', color: C.ok, fontFamily: NUM }}>{windowsText([g], lang)}</span>
            ))}
          </div>
        ) : (
          <p className={`mt-1 ${TYPE.label}`} style={{ color: C.text3 }}>{card.guaranteeSource === 'UNKNOWN' ? tx(lang, '还没有公布，以运营方通知为准', 'Not published yet; check the operator') : tx(lang, '这次没有保障时段', 'No guaranteed hours this time')}</p>
        )}
      </section>
      <dl className="rounded-[16px] px-3.5" style={{ background: C.surface2 }}>
        {rows.map(([label, value], i) => (
          <div key={label} className="flex items-baseline gap-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : undefined }}>
            <dt className={`shrink-0 ${TYPE.label}`} style={{ color: C.text3 }}>{label}</dt>
            <dd className="flex-1 min-w-0 text-right text-[14.5px] font-medium leading-snug" style={{ color: value === null ? C.text3 : C.text }}>{value ?? tx(lang, '待核实', 'Unverified')}</dd>
          </div>
        ))}
      </dl>
      {card.geography.map(g => <p key={g.zh} className={`px-1 ${TYPE.caption}`} style={{ color: C.text3 }}>{tx(lang, g.zh, g.en)}</p>)}
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
  // Lead with the one thing people want from a source: who stands behind it.
  const official1 = groups.length > 0 || official.length > 0;
  const lead = groups.length ? tx(lang, '意大利交通部已登记', 'On the Ministry register')
    : official.length ? tx(lang, `${official[0].name} 已发公告`, `${official[0].name} has announced it`)
      : tx(lang, '目前仅见媒体报道', 'Only press reports so far');
  const rest = [
    ...(groups.length ? official.map(q => tx(lang, `${q.name} 官网`, `${q.name} site`)) : official.slice(1).map(q => q.name)),
    ...(press.length ? [tx(lang, `${press.length} 篇报道`, `${press.length} report${press.length > 1 ? 's' : ''}`)] : []),
  ];

  return (
    <section className="mx-5 mb-5 rounded-[16px] overflow-hidden" style={{ background: C.surface2 }}>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: official1 ? C.okSoft : C.surface3 }}>
          {official1 ? <SealCheck size={18} weight="fill" color={C.ok} /> : <Info size={17} weight="fill" color={C.text2} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-semibold leading-snug" style={{ color: C.text }}>{lead}</span>
          <span className={`block truncate ${TYPE.caption}`} style={{ color: C.text3 }}>{[...rest, open ? tx(lang, '收起', 'Hide') : tx(lang, '查看原文与链接', 'Originals and links')].join(' · ')}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="flex"><CaretDown size={14} weight="bold" color={C.text3} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
            <div className="flex flex-col gap-5 px-4 pt-1 pb-5" style={{ borderTop: `1px solid ${C.line}` }}>
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
                  <a href={g.url} target="_blank" rel="noreferrer" className={`self-start inline-flex items-center gap-1 underline underline-offset-2 ${TYPE.caption}`} style={{ color: LINK, textDecorationColor: 'rgba(122,176,255,0.5)' }}>
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
                  <a href={q.url} target="_blank" rel="noreferrer" className={`self-start inline-flex items-center gap-1 underline underline-offset-2 ${TYPE.caption}`} style={{ color: LINK, textDecorationColor: 'rgba(122,176,255,0.5)' }}>{tx(lang, '打开公告', 'Open notice')}<ArrowUpRight size={12} weight="bold" /></a>
                </Group>
              ))}

              {/* After the text it applies to, as translated posts do it */}
              {translated && (
                <button onClick={() => setOriginal(v => !v)} className={`-mt-2 self-start flex items-center gap-1.5 ${TYPE.caption}`} style={{ color: C.text3 }}>
                  <Translate size={13} weight="bold" />
                  {original ? tx(lang, '意大利语原文 · ', 'Italian original · ') : tx(lang, '译自意大利语 · ', 'Translated from Italian · ')}
                  <span className="font-semibold underline underline-offset-2" style={{ color: C.text2, textDecorationColor: C.lineStrong }}>{original ? tx(lang, '看译文', 'Show translation') : tx(lang, '看原文', 'Show original')}</span>
                </button>
              )}

              {(press.length > 0 || (card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE')) && (
                <Group title={tx(lang, '其他参考', 'Also see')}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE' && <Link href={ENAC}>{tx(lang, 'ENAC 常规保护规则', 'ENAC protection rules')}</Link>}
                    {press.slice(0, 4).map(s => <Link key={s.url} href={s.url}>{s.name}</Link>)}
                  </div>
                </Group>
              )}

              {!groups.length && !official.length && (
                <a href={card.sources.find(s => s.authority === 'official')?.url || MIT} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 underline underline-offset-2 ${TYPE.label}`} style={{ color: LINK, textDecorationColor: 'rgba(122,176,255,0.5)' }}>
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
    <div className="flex flex-col gap-2 first:pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h5 className="text-[12px] font-semibold tracking-wide" style={{ color: C.text3 }}>{title}</h5>
        {aside && <span className={TYPE.caption} style={{ color: C.text3 }}>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 underline underline-offset-2 ${TYPE.label}`} style={{ color: LINK, textDecorationColor: 'rgba(122,176,255,0.5)' }}>{children}<ArrowUpRight size={11} weight="bold" /></a>;
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
  const [hint, setHint] = useState(0);
  const wall = useRef<WallLink | null>(null);
  const reduce = useReducedMotion();
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
  const footer = (
    <div className="flex gap-2.5">
      <motion.button whileTap={{ scale: 0.97 }} onClick={share} className={`flex-1 h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`} style={TONAL}>
        {copied ? <Check size={17} weight="bold" /> : <Export size={17} weight="bold" />}{copied ? tx(lang, '已复制链接', 'Link copied') : tx(lang, '分享', 'Share')}
      </motion.button>
      <motion.button whileTap={doodle.marked ? undefined : { scale: 0.97 }} onClick={react} aria-pressed={doodle.marked}
        onPointerDown={() => wall.current?.anticipate(true)} onPointerUp={() => wall.current?.anticipate(false)} onPointerLeave={() => wall.current?.anticipate(false)} onPointerCancel={() => wall.current?.anticipate(false)}
        className={`flex-[1.35] h-12 rounded-[14px] flex items-center justify-center gap-1.5 ${TYPE.action}`}
        style={doodle.marked ? TONAL : { ...FILLED(mode.deep), boxShadow: `0 6px 20px ${mode.soft}` }}>
        {/* The can shakes in time with the puff of paint in the scene above */}
        <motion.span key={hint} className="flex" animate={doodle.marked || reduce ? undefined : { rotate: [0, -16, 13, -9, 5, 0], y: [0, -2, 0, -1, 0, 0] }} transition={{ duration: 0.6 }}>
          <SprayBottle size={18} weight="fill" color={doodle.marked ? mode.main : undefined} />
        </motion.span>
        {!doodle.loaded && doodle.marked ? tx(lang, '获取中...', 'Loading...')
          : doodle.marked ? tx(lang, `${doodle.count} 人已表达不满`, `${doodle.count} people reacted`) : tx(lang, '我受影响了', 'I am affected')}
      </motion.button>
    </div>
  );
  return (
    <div className="px-5 pt-5 pb-4">
      <PixelWall mode={card.category} seed={card.id} storeKey={doodle.key} doodle={doodle} lang={lang} open={spray} onOpen={() => setSpray(true)} onClose={() => setSpray(false)}
        note={statusLine(card, ctx.today, ctx.nowMinutes, lang).text}
        onLink={l => { wall.current = l; }} onHint={() => setHint(h => h + 1)} footer={footer} />
    </div>
  );
}
