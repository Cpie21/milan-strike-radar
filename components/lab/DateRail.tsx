'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { isActive, monthLabel, weekday, type Lang, type RailTile } from '../../lib/lab/model';
import { ModeGlyph } from './ui';
import { C, SPRING } from './theme';

const TILE_W = 54;
const GAP = 8;

// Equal widths keep the rhythm regular; strike days earn weight through a
// filled tile, a red base and mode glyphs. Calm runs fold into one tile.
export default function DateRail({ tiles, today, selected, lang, onSelect, onUnfold, onMonth }: {
  tiles: RailTile[]; today: string; selected: string; lang: Lang;
  onSelect: (date: string) => void; onUnfold: (from: string) => void; onMonth: (iso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!strip || !el) return;
    strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: placed.current && !reduce ? 'smooth' : 'auto' });
    placed.current = true;
  }, [selected, tiles.length, reduce]);

  // The title follows the month in the middle of the rail.
  const onScroll = () => {
    const strip = ref.current;
    if (!strip) return;
    const mid = strip.scrollLeft + strip.clientWidth / 2;
    const items = [...strip.querySelectorAll<HTMLElement>('[data-month]')];
    const hit = items.find(el => el.offsetLeft <= mid && el.offsetLeft + el.offsetWidth + GAP > mid);
    if (hit?.dataset.month) onMonth(hit.dataset.month);
  };

  return (
    <motion.div ref={ref} layoutScroll onScroll={onScroll}
      className="flex overflow-x-auto px-4 pt-1 pb-3 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ gap: GAP }}>
      {tiles.map(tile => {
        const date = tile.kind === 'day' ? tile.date : tile.from;
        return (
          <div key={tile.kind === 'day' ? tile.date : `fold-${tile.from}`} data-month={date} className="shrink-0 flex flex-col snap-center" style={{ width: TILE_W }}>
            <span className="h-[18px] pl-1 text-[11px] font-semibold" style={{ color: C.text3 }}>{tile.monthStart ? monthLabel(date, lang) : ''}</span>
            {tile.kind === 'fold'
              ? <Fold from={tile.from} to={tile.to} days={tile.days} lang={lang} onUnfold={onUnfold} />
              : <Day tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} />}
          </div>
        );
      })}
    </motion.div>
  );
}

function Fold({ from, to, days, lang, onUnfold }: { from: string; to: string; days: number; lang: Lang; onUnfold: (from: string) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={() => onUnfold(from)}
      aria-label={lang === 'en' ? `${days} days without strikes — show them` : `${days} 天无罢工，点击展开`}
      className="h-[76px] rounded-[22px] flex flex-col items-center justify-center gap-[3px]"
      style={{ border: `1px dashed ${C.lineStrong}`, color: C.text3 }}>
      <span className="text-[15px] font-semibold tabular-nums" style={{ color: C.text2 }}>{Number(from.slice(8))}–{Number(to.slice(8))}</span>
      <span className="text-[10.5px]">{lang === 'en' ? 'clear' : '无罢工'}</span>
    </motion.button>
  );
}

function Day({ tile, today, selected, lang, onSelect }: { tile: Extract<RailTile, { kind: 'day' }>; today: string; selected: boolean; lang: Lang; onSelect: (d: string) => void }) {
  const active = tile.cards.filter(isActive);
  const shown = (active.length ? active : tile.cards).filter((c, i, all) => all.findIndex(o => o.category === c.category) === i);
  const strike = active.length > 0;
  const isToday = tile.date === today;
  const stop = selected ? '#E2483C' : C.stop;

  return (
    <motion.button data-date={tile.date} whileTap={{ scale: 0.94 }} onClick={() => onSelect(tile.date)} aria-pressed={selected}
      aria-label={`${tile.date}${strike ? '' : lang === 'en' ? ', no strikes' : '，无罢工'}`}
      className="relative h-[76px] rounded-[22px] flex flex-col items-center pt-[9px] overflow-visible"
      style={{ background: strike ? C.surface2 : tile.cards.length ? C.surface : 'transparent', boxShadow: strike || tile.cards.length ? `inset 0 0 0 1px ${C.line}` : undefined, opacity: tile.date < today && !selected ? 0.45 : 1 }}>
      {/* Strike days keep the original red base, now a quiet hint. */}
      {strike && !selected && <span aria-hidden className="absolute inset-0 rounded-[22px]" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(255,90,78,0.22) 100%)' }} />}
      {selected && (
        <motion.span layoutId="rail-selection" transition={SPRING} className="absolute inset-0 rounded-[22px] bg-white" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span className="absolute left-1/2 -bottom-[5px] w-[11px] h-[11px] -translate-x-1/2 rotate-45 rounded-[2px] bg-white" />
        </motion.span>
      )}
      <span className="relative text-[11px] font-medium" style={{ color: selected ? 'rgba(10,11,13,0.55)' : C.text3 }}>{isToday ? (lang === 'en' ? 'Today' : '今天') : weekday(tile.date, lang)}</span>
      <span className="relative text-[21px] font-bold tabular-nums leading-[26px] mt-[1px]" style={{ color: selected ? C.ink : strike ? C.text : C.text2 }}>{Number(tile.date.slice(8))}</span>
      <span className="relative mt-auto mb-[11px] h-[14px] flex items-center gap-[3px]">
        {tile.cards.length ? shown.slice(0, 2).map(card => (
          <span key={card.id} className="relative flex">
            <ModeGlyph mode={card.category} size={13} color={isActive(card) ? (card.status === 'UNCERTAIN' ? C.pend : stop) : (selected ? 'rgba(10,11,13,0.3)' : C.cancel)} />
            {!isActive(card) && <i className="absolute -left-px -right-px top-1/2 h-[1.5px] -rotate-45 rounded" style={{ background: selected ? 'rgba(10,11,13,0.4)' : C.cancel }} />}
          </span>
        )) : isToday && !selected ? <i className="w-[5px] h-[5px] rounded-full" style={{ background: C.text2 }} /> : null}
        {shown.length > 2 && <span className="text-[10px] font-bold" style={{ color: selected ? C.ink : C.text2 }}>+{shown.length - 2}</span>}
      </span>
      {/* An overnight strike: one continuous line through both tiles. */}
      {(tile.joinPrev || tile.joinNext) && (
        <span aria-hidden className="absolute bottom-[5px] h-[2px]" style={{
          left: tile.joinPrev ? -GAP : '50%', right: tile.joinNext ? -GAP : '50%', background: stop,
          borderRadius: `${tile.joinPrev ? 0 : 2}px ${tile.joinNext ? 0 : 2}px ${tile.joinNext ? 0 : 2}px ${tile.joinPrev ? 0 : 2}px`,
        }} />
      )}
    </motion.button>
  );
}
