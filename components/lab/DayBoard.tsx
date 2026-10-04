'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowSquareOut, CaretDown, CaretRight, Check, CheckCircle, Clock, Export, Megaphone, SprayBottle } from '@phosphor-icons/react';
import DoodleCanvas, { type DoodleCategory } from '../DoodleOverlay';
import {
  AXIS_END, AXIS_START, MODES, axisPos, continuesOvernight, dayLabel, groupIdentical, isActive, modeName, nextEventDate,
  nowPosition, overnightLine, relativeDay, segments, sortCards, statusLine, tx, windowsText,
  type Lang, type Mode, type ModeCard, type Tone,
} from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
import { Card, CardHeader, Hairline, LineBadge, ModeGlyph } from './ui';
import { C, EASE, SPRING_SOFT } from './theme';
import { useDoodle } from './useDoodle';
import { track } from './track';

export const TONE: Record<Tone, string> = { stop: C.stop, pending: C.pend, cancelled: C.cancel, over: C.text2 };
const HOURS = [5, 9, 12, 15, 18, 21];
const DOODLE: Record<Mode, DoodleCategory> = { TRAIN: 'train', SUBWAY: 'subway', BUS: 'bus', AIRPORT: 'plane' };

export type BoardContext = {
  today: string;
  nowMinutes: number;
  lang: Lang;
  region: string;
  cityName: string;
  sharePath: string;
  lastSync: string | null;
};

const mins = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };

function trailingLabel(card: ModeCard, ctx: BoardContext) {
  const { lang } = ctx;
  if (card.status === 'CANCELLED') return { text: tx(lang, '已取消', 'Cancelled'), color: C.cancel };
  if (!card.windows.length) return { text: tx(lang, '待公布', 'Pending'), color: C.pend };
  if (card.date === ctx.today) {
    const tone = statusLine(card, ctx.today, ctx.nowMinutes, lang);
    if (tone.tone === 'over') return { text: tx(lang, '已结束', 'Over'), color: C.text2 };
    if (tone.text.startsWith(tx(lang, '停运中', 'Stopped'))) return { text: tx(lang, '进行中', 'Now'), color: C.stop };
    const start = card.windows.map(w => (w.start === null ? 0 : mins(w.start))).find(s => s > ctx.nowMinutes);
    if (start !== undefined) {
      const diff = start - ctx.nowMinutes;
      return { text: diff >= 60 ? tx(lang, `${Math.round(diff / 60)} 小时后`, `in ${Math.round(diff / 60)} h`) : tx(lang, `${diff} 分钟后`, `in ${diff} min`), color: C.text };
    }
  }
  const covered = segments(card.windows).reduce((sum, s) => sum + s.width, 0);
  if (covered > 0.95) return { text: tx(lang, '全天', 'All day'), color: C.text };
  const hours = card.windows.reduce((sum, w) => {
    const start = w.start === null ? AXIS_START : mins(w.start);
    const end = w.end_kind === 'end_of_service' || !w.end ? AXIS_END : mins(w.end);
    return sum + Math.max(0, end - start);
  }, 0) / 60;
  return { text: tx(lang, `约 ${Math.round(hours)} 小时`, `~${Math.round(hours)} h`), color: C.text };
}

// ── Bar ────────────────────────────────────────────────────────────────

export function Bar({ card, label, now = null }: { card: ModeCard; label?: string; now?: number | null }) {
  const cancelled = card.status === 'CANCELLED';
  return (
    <div className="relative flex-1 min-w-0">
      {/* Hour ticks sit just around the bar, so every row aligns to the shared axis without lines crossing text. */}
      <div aria-hidden className="absolute inset-x-0 -top-[5px] h-[18px] pointer-events-none">
        {HOURS.slice(1).map(h => <span key={h} className="absolute top-0 bottom-0 w-px" style={{ left: `${axisPos(h * 60) * 100}%`, background: 'rgba(255,255,255,0.09)' }} />)}
      </div>
      <div className="relative h-[8px] rounded-full overflow-hidden" style={{ background: C.track }}>
        {!card.windows.length && !cancelled && (
          <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(135deg, ${C.pend} 0 2px, transparent 2px 6px)`, opacity: 0.6 }} />
        )}
        {segments(card.windows).map((s, i) => (
          <div key={i} className="absolute top-0 h-full rounded-full" style={{
            left: `${s.left * 100}%`, width: `${s.width * 100}%`, background: cancelled ? C.cancel : C.stop,
            borderTopLeftRadius: s.left === 0 ? 0 : undefined, borderBottomLeftRadius: s.left === 0 ? 0 : undefined,
            WebkitMaskImage: s.fade ? 'linear-gradient(90deg,#000 65%,transparent)' : undefined,
            maskImage: s.fade ? 'linear-gradient(90deg,#000 65%,transparent)' : undefined,
          }} />
        ))}
        {!cancelled && segments(card.guarantees).map((g, i) => (
          <div key={`g${i}`} className="absolute top-0 h-full" style={{ left: `${g.left * 100}%`, width: `${g.width * 100}%`, background: C.ok }} />
        ))}
      </div>
      {now !== null && (
        <span aria-hidden className="absolute -top-[6px] h-[20px] w-[2px] rounded-full bg-white" style={{ left: `calc(${now * 100}% - 1px)`, boxShadow: '0 0 0 2px rgba(0,0,0,0.18)' }} />
      )}
      {label && <div className="mt-1 text-[10.5px] font-medium" style={{ color: C.text3 }}>{label}</div>}
    </div>
  );
}

function Bars({ card, prev, next, lang, today, now }: { card: ModeCard; prev?: ModeCard; next?: ModeCard; lang: Lang; today: string; now: number }) {
  const at = (c: ModeCard) => (c.date === today ? nowPosition(now) : null);
  if (!prev && !next) return <Bar card={card} now={at(card)} />;
  // An overnight strike is one event: both days side by side, split at midnight.
  const pair = prev ? [prev, card] : [card, next!];
  const label = (iso: string) => tx(lang, `${Number(iso.slice(8))}日`, `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`);
  return (
    <div className="flex items-start gap-1">
      <Bar card={pair[0]} label={label(pair[0].date)} now={at(pair[0])} />
      <span className="w-px h-[14px] -mt-[3px]" style={{ background: C.text2 }} />
      <Bar card={pair[1]} label={label(pair[1].date)} now={at(pair[1])} />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────

function ModeRow({ group, prev, next, ctx }: { group: ModeCard[]; prev?: ModeCard; next?: ModeCard; ctx: BoardContext }) {
  const [card] = group;
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const { lang } = ctx;
  const base = statusLine(card, ctx.today, ctx.nowMinutes, lang);
  const span = (prev || next) && base.tone === 'stop' && card.date !== ctx.today ? overnightLine(card, prev, next, lang) : null;
  const status = span ? { ...base, text: span } : base;
  const trailing = (prev || next) && card.status !== 'CANCELLED' && card.date !== ctx.today ? { text: tx(lang, '跨夜', 'Overnight'), color: C.text } : trailingLabel(card, ctx);
  const title = group.map(c => modeName(c.category, lang)).join(' · ');

  if (card.status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ModeGlyph mode={card.category} size={17} color={C.cancel} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] truncate line-through" style={{ color: C.text3 }}>{title} · {card.scope || card.provider}</span>
        <span className="text-[13px]" style={{ color: C.text3 }}>{tx(lang, '已取消', 'Cancelled')}</span>
      </div>
    );
  }

  const guaranteeLabel = card.guaranteeKind === 'PROTECTED_FLIGHTS' ? tx(lang, '保障航班', 'Protected flights') : tx(lang, '保障时段', 'Guaranteed');
  const guaranteeOrigin = card.guaranteeSource === 'OFFICIAL_STRIKE_NOTICE' ? tx(lang, '官方公告', 'official notice') : card.guaranteeSource === 'STANDARD_RULE' ? tx(lang, '常规规则', 'standard rule') : '';

  return (
    <div className="px-4 py-3.5">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="w-full text-left">
        <div className="flex items-center gap-2.5">
          <span className="h-[30px] min-w-[30px] px-[6.5px] rounded-[9px] flex items-center justify-center gap-1 shrink-0" style={{ background: `${TONE[status.tone]}26` }}>
            {group.map(c => <ModeGlyph key={c.id} mode={c.category} size={17} color={TONE[status.tone]} />)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[16px] font-semibold truncate">{title}</span>
              {card.national && <span className="text-[11px] px-1.5 rounded-[5px] shrink-0" style={{ background: 'rgba(255,255,255,0.14)', color: C.text2 }}>{tx(lang, '全国', 'National')}</span>}
            </span>
            {card.scope && <span className="block text-[12px] truncate" style={{ color: C.text2 }}>{card.scope}</span>}
          </span>
          <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: trailing.color }}>{trailing.text}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING_SOFT} className="shrink-0 flex" style={{ color: C.text3 }}><CaretDown size={14} weight="bold" /></motion.span>
        </div>
        <p className="mt-2 text-[15px] font-medium tabular-nums leading-snug" style={{ color: TONE[status.tone] }}>{status.text}</p>
        {card.guarantees.length > 0 && (
          <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: C.ok }}>
            {guaranteeLabel} {card.guarantees.map(g => `${g.start}–${g.end}`).join(tx(lang, '、', ', '))}{guaranteeOrigin && <span style={{ color: C.text3 }}> · {guaranteeOrigin}</span>}
          </p>
        )}
        <div className="mt-3.5"><Bars card={card} prev={prev} next={next} lang={lang} today={ctx.today} now={ctx.nowMinutes} /></div>
        {card.lines.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {card.lines.slice(0, 8).map(line => <LineBadge key={line} line={line} />)}
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0, filter: reduce ? 'none' : 'blur(6px)' }}
            animate={{ height: 'auto', opacity: 1, filter: 'blur(0px)' }}
            exit={{ height: 0, opacity: 0, filter: reduce ? 'none' : 'blur(6px)' }}
            transition={{ height: SPRING_SOFT, opacity: { duration: 0.2 }, filter: { duration: 0.25 } }}
            className="overflow-hidden"
          >
            <Details card={card} group={group} ctx={ctx} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Details({ card, group, ctx }: { card: ModeCard; group: ModeCard[]; ctx: BoardContext }) {
  const { lang } = ctx;
  const sources = group.flatMap(c => c.sources).filter((s, i, all) => all.findIndex(o => o.url === s.url || o.name === s.name) === i);
  return (
    <div className="mt-3.5 rounded-[14px] p-3.5 flex flex-col gap-3 text-[13.5px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <Field label={tx(lang, '罢工主体', 'Who is striking')}>{card.provider}</Field>
      {card.events.length > 1 && (
        <Field label={tx(lang, `包含 ${card.events.length} 份公告`, `${card.events.length} announcements`)}>
          {card.events.map((e, i) => (
            <span key={i} className="block tabular-nums" style={{ color: e.status === 'CANCELLED' ? C.text3 : C.text }}>
              {e.provider} · {e.status === 'CANCELLED' ? tx(lang, '已取消', 'cancelled') : e.display || tx(lang, '时段待公布', 'hours pending')}
            </span>
          ))}
        </Field>
      )}
      {card.windows.length > 0 && (
        <Field label={tx(lang, '罢工时段', 'Strike hours')}>
          <span className="tabular-nums">{windowsText(card.windows, lang)}</span>
          {card.unknownTiming && <span style={{ color: C.pend }}>{tx(lang, '（部分公告时段待公布）', ' (some announcements pending)')}</span>}
        </Field>
      )}
      <Field label={tx(lang, '来源', 'Sources')}>
        {sources.slice(0, 4).map(s => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 py-0.5" style={{ color: C.text2 }}>
            <span className="truncate">{s.authority === 'official' ? tx(lang, '官方', 'Official') : tx(lang, '报道', 'Reported')} · {s.name}</span>
            <ArrowSquareOut size={12} className="shrink-0" />
          </a>
        ))}
        {card.category === 'AIRPORT' && card.guaranteeSource === 'STANDARD_RULE' && (
          <a href="https://www.enac.gov.it/trasporto-aereo/diritto-alla-mobilita/scioperi-nel-trasporto-aereo/prestazioni-minime-garantite/" target="_blank" rel="noreferrer" className="flex items-center gap-1 py-0.5" style={{ color: C.text2 }}>
            {tx(lang, '常规保护规则 · ENAC', 'Standard protection rules · ENAC')}<ArrowSquareOut size={12} />
          </a>
        )}
      </Field>
      <Actions card={card} ctx={ctx} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] mb-0.5" style={{ color: C.text3 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Actions({ card, ctx }: { card: ModeCard; ctx: BoardContext }) {
  const { lang } = ctx;
  const doodle = useDoodle(card, ctx.region);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${ctx.sharePath}?date=${card.date}`;
    const title = tx(lang, `${ctx.cityName} ${dayLabel(card.date, lang)} ${modeName(card.category, lang)}罢工`, `${ctx.cityName} ${modeName(card.category, lang)} strike, ${dayLabel(card.date, lang)}`);
    track('share_intent_clicked', { strike_date: card.date, transport_type: card.category.toLowerCase() });
    if (navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      try { await navigator.share({ title, url }); } catch { /* dismissed */ }
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <>
      <div className="flex gap-2 pt-1">
        <motion.button whileTap={{ scale: 0.97 }} onClick={share} className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-1.5 text-[14.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.14)' }}>
          {copied ? <Check size={16} weight="bold" /> : <Export size={16} weight="bold" />}
          {copied ? tx(lang, '已复制链接', 'Link copied') : tx(lang, '分享', 'Share')}
        </motion.button>
        <motion.button whileTap={doodle.marked ? undefined : { scale: 0.97 }} onClick={doodle.mark} aria-pressed={doodle.marked}
          className="flex-[1.4] h-11 rounded-[12px] flex items-center justify-center gap-1.5 text-[14.5px] font-semibold"
          style={{ background: doodle.marked ? 'rgba(242,86,74,0.35)' : C.stopSolid }}>
          <SprayBottle size={17} weight="fill" />
          {doodle.marked
            ? (doodle.loaded ? tx(lang, `${doodle.count} 人受影响`, `${doodle.count} affected`) : tx(lang, '获取中…', 'Loading…'))
            : tx(lang, '我受影响了', 'I’m affected')}
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {doodle.marked && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden">
            <div className="h-[200px] -mx-1"><DoodleCanvas category={DOODLE[card.category]} count={doodle.count} isAnimating={doodle.spraying} isDark seed={card.id} /></div>
            <p className="text-center text-[13px] pb-1" style={{ color: C.text2 }}>
              {tx(lang, `还有 ${Math.max(doodle.count, 1)} 人也被影响了，和你一起在${modeName(card.category)}上猛猛涂鸦`, `${Math.max(doodle.count, 1)} people were affected by this ${modeName(card.category, 'en').toLowerCase()} strike too`)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Board ──────────────────────────────────────────────────────────────

export default function DayBoard({ date, byDate, ctx, tint, onSelect }: { date: string; byDate: Map<string, ModeCard[]>; ctx: BoardContext; tint: string; onSelect: (d: string) => void }) {
  const { lang } = ctx;
  const cards = sortCards(byDate.get(date) || []);
  const active = cards.filter(isActive);
  const groups = groupIdentical(cards);
  const covered = new Set(cards.map(c => c.category));
  const clear = MODES.filter(m => !covered.has(m));
  const next = nextEventDate(byDate, date);
  const neighbour = (iso: string, mode: Mode) => (byDate.get(iso) || []).find(c => c.category === mode);
  const synced = ctx.lastSync ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ctx.lastSync)) : null;

  return (
    <Card tint={tint}>
      <CardHeader icon={<Clock size={14} weight="bold" />} label={dayLabel(date, lang)} trailing={<span className="text-[13px] font-semibold" style={{ color: C.text2 }}>{relativeDay(date, ctx.today, lang)}</span>} />
      <Hairline />

      {cards.length === 0 ? (
        <div className="px-4 py-5 flex items-start gap-3">
          <CheckCircle size={28} weight="fill" color={C.ok} className="shrink-0" />
          <div>
            <p className="text-[17px] font-semibold">{tx(lang, '没有已公布的交通罢工', 'No transport strikes announced')}</p>
            <p className="mt-0.5 text-[13.5px] leading-snug" style={{ color: C.text2 }}>{tx(lang, '地铁、公交、火车和机场按正常时刻运行。出行前仍建议查看运营商通知。', 'Metro, bus, rail and airports run as scheduled. Check operator notices before travelling.')}</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Shared time axis, Transit-style: one scale for every row below. */}
          <div className="relative mx-4 mt-3 h-[14px] text-[10.5px] font-medium tabular-nums" style={{ color: C.text3 }}>
            {HOURS.map(h => <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${axisPos(h * 60) * 100}%` }}>{String(h).padStart(2, '0')}</span>)}
            <span className="absolute right-0">{tx(lang, '末班', 'Last')}</span>
          </div>
          {groups.map((group, i) => {
            const card = group[0];
            const prev = neighbour(addDaysIso(date, -1), card.category);
            const nxt = neighbour(addDaysIso(date, 1), card.category);
            return (
              <div key={card.id}>
                {i > 0 && <Hairline />}
                <ModeRow group={group} ctx={ctx}
                  prev={continuesOvernight(prev, card) ? prev : undefined}
                  next={continuesOvernight(card, nxt) ? nxt : undefined} />
              </div>
            );
          })}
        </div>
      )}

      {clear.length > 0 && cards.length > 0 && (
        <>
          <Hairline />
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: `${C.ok}22` }}><Check size={15} weight="bold" color={C.ok} /></span>
            <span className="flex-1 text-[15px]" style={{ color: C.text2 }}>{clear.map(m => modeName(m, lang)).join(' · ')}</span>
            <span className="text-[13px] font-semibold" style={{ color: C.ok }}>{tx(lang, '正常运行', 'Normal service')}</span>
          </div>
        </>
      )}

      {!active.length && next && (
        <>
          <Hairline />
          <button onClick={() => onSelect(next)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
            <span className="text-[13px]" style={{ color: C.text3 }}>{tx(lang, '下一次', 'Next')}</span>
            <span className="text-[15px] font-semibold">{dayLabel(next, lang)}</span>
            <span className="flex gap-1 ml-auto">{sortCards(byDate.get(next) || []).filter(isActive).map(c => <ModeGlyph key={c.id} mode={c.category} size={16} color={C.stop} />)}</span>
            <CaretRight size={14} weight="bold" color={C.text3} />
          </button>
        </>
      )}

      <Hairline />
      {/* Flighty-style advisory line: who said so, and how fresh it is. */}
      <a href="https://scioperi.mit.gov.it/mit2/public/scioperi" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-3 text-[12.5px]" style={{ color: C.text3 }}>
        <Megaphone size={15} weight="fill" />
        <span className="flex-1">{tx(lang, '来源：意大利交通部（MIT）及运营商公告', 'Source: Italian Ministry of Transport (MIT) and operators')}</span>
        {synced && <span className="tabular-nums">{tx(lang, `更新于 ${synced}`, `Updated ${synced}`)}</span>}
      </a>
    </Card>
  );
}
