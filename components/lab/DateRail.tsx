'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { monthLabel, weekday, type Lang, type Mode, type RailTile } from '../../lib/lab/model';
import { ModeBadge } from './ui';
import { C, NUM, SPRING } from './theme';

const TILE_W = 54;
const PAST_W = 34;
const GAP = 8;
const PEEK = 56; // how much of the past strip shows at the left edge

// Every column says the same three things on the same three lines:
//   weekday · date · what strikes (signage badges, or nothing).
// No folds: an unbroken run of dates is easier to read than a ruler of
// hidden days, and the month sheet covers long jumps. The past keeps the
// same lines in a different material: one sunken, monochrome strip.
export default function DateRail({ tiles, today, selected, lang, onSelect, onMonth }: {
  tiles: RailTile[]; today: string; selected: string; lang: Lang;
  onSelect: (date: string) => void; onMonth: (iso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const reduce = useReducedMotion();
  const days = tiles.filter((t): t is Extract<RailTile, { kind: 'day' }> => t.kind === 'day');
  const past = days.filter(t => t.date < today);
  const future = days.filter(t => t.date >= today);

  // First paint: the selected day (today, unless a link says otherwise)
  // sits at the left with the edge of the past showing. Later selections
  // only scroll when the tile is out of view.
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!strip || !el) return;
    const x = el.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    const left = x - PEEK;
    const visible = x >= strip.scrollLeft + 8 && x + el.offsetWidth <= strip.scrollLeft + strip.clientWidth - 16;
    if (!placed.current) strip.scrollLeft = left;
    else if (!visible) strip.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' });
    placed.current = true;
  }, [selected, tiles.length, reduce]);

  // The title follows the month at the left anchor.
  const onScroll = () => {
    const strip = ref.current;
    if (!strip) return;
    const anchor = strip.scrollLeft + PEEK + 12;
    const items = [...strip.querySelectorAll<HTMLElement>('[data-month]')];
    const hit = items.find(el => el.offsetLeft <= anchor && el.offsetLeft + el.offsetWidth + GAP > anchor);
    if (hit?.dataset.month) onMonth(hit.dataset.month);
  };

  return (
    <motion.div ref={ref} layoutScroll onScroll={onScroll}
      className="relative flex items-end overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ gap: GAP }}>
      {past.length > 0 && (
        <div className="shrink-0 flex flex-col mr-1">
          <span className="h-[18px] pl-2 text-[11.5px] font-medium" style={{ color: C.text3 }}>{lang === 'en' ? 'Past' : '过去'}</span>
          <div className="h-[76px] flex px-1 rounded-[22px]" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6), inset 0 0 0 1px ${C.line}` }}>
            {past.map(tile => <Day key={tile.date} tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} past />)}
          </div>
        </div>
      )}
      {future.map(tile => (
        <div key={tile.date} data-month={tile.date} className="shrink-0 flex flex-col" style={{ width: TILE_W }}>
          <span className="h-[18px] pl-1 text-[11.5px] font-medium whitespace-nowrap" style={{ color: C.text3 }}>{tile.monthStart || tile.date === today ? monthLabel(tile.date, lang) : ''}</span>
          <Day tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} />
        </div>
      ))}
    </motion.div>
  );
}

// A day either has a strike or it doesn't; called-off strikes don't mark
// the rail. The card explains the rest.
export const strikeModes = (tile: { cards: { category: Mode; status: string }[] }) =>
  [...new Set(tile.cards.filter(c => c.status !== 'CANCELLED').map(c => c.category))];

function Day({ tile, today, selected, lang, onSelect, past }: { tile: Extract<RailTile, { kind: 'day' }>; today: string; selected: boolean; lang: Lang; onSelect: (d: string) => void; past?: boolean }) {
  const modes = strikeModes(tile);
  const isToday = tile.date === today;
  const ring = selected ? '#FFFFFF' : C.surface;
  return (
    <motion.button data-date={tile.date} whileTap={{ scale: 0.94 }} onClick={() => onSelect(tile.date)} aria-pressed={selected}
      aria-label={`${tile.date}${modes.length ? '' : lang === 'en' ? ', no strikes' : '，无罢工'}`}
      className="relative h-[76px] flex flex-col items-center pt-[9px] shrink-0"
      style={{ width: past ? PAST_W : '100%', borderRadius: past ? 16 : 22, background: past ? 'transparent' : C.surface }}>
      {selected && (
        <motion.span layoutId="rail-selection" transition={SPRING} className="absolute inset-0 bg-white" style={{ borderRadius: past ? 16 : 22, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span className="absolute left-1/2 -bottom-[5px] w-[11px] h-[11px] -translate-x-1/2 rotate-45 rounded-[2px] bg-white" />
        </motion.span>
      )}
      <span className="relative h-[15px] text-[11.5px] font-medium leading-[15px] whitespace-nowrap" style={{ color: selected ? 'rgba(10,11,13,0.55)' : isToday ? C.text : C.text3 }}>
        {isToday ? (lang === 'en' ? 'Today' : '今天') : past ? weekday(tile.date, lang).replace('周', '').slice(0, lang === 'en' ? 2 : 1) : weekday(tile.date, lang)}
      </span>
      <span className="relative mt-[2px] font-semibold tabular-nums leading-[26px]" style={{ fontSize: past ? 17 : 23, color: selected ? C.ink : past ? C.text3 : C.text, fontFamily: NUM }}>{Number(tile.date.slice(8))}</span>
      <span className="relative mt-auto mb-[9px] h-[18px] flex items-center">
        {past
          ? modes.length > 0 && <i className="w-[5px] h-[5px] rounded-full" style={{ background: selected ? 'rgba(10,11,13,0.45)' : C.text3 }} />
          : modes.slice(0, 3).map((m, i) => <span key={m} style={{ marginLeft: i ? -4 : 0, zIndex: 3 - i }} className="relative flex"><ModeBadge mode={m} size={18} ring={ring} /></span>)}
      </span>
      {/* An overnight strike: one continuous line through both tiles. */}
      {!past && (tile.joinPrev || tile.joinNext) && (
        <span aria-hidden className="absolute bottom-[4px] h-[2px]" style={{
          left: tile.joinPrev ? -GAP : '50%', right: tile.joinNext ? -GAP : '50%', background: selected ? 'rgba(10,11,13,0.25)' : 'rgba(255,255,255,0.22)',
        }} />
      )}
    </motion.button>
  );
}
