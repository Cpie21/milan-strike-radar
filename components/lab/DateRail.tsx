'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { isActive, monthLabel, weekday, type Lang, type ModeCard, type RailTile } from '../../lib/lab/model';
import { ModeGlyph } from './ui';
import { C, MODE_COLOR, NUM, SPRING } from './theme';

const TILE_W = 54;
const GAP = 8;
const PEEK = 56; // how much of the past strip shows at the left edge
const TICK = 8; // a folded day is one tick; the fold's length is its day count

// Two zones, two materials. The future is a row of raised tiles in colour —
// what you plan with. The past is one sunken, monochrome strip of small
// numbers — a record, not a choice — and only its edge peeks in at first.
// Runs of calm days fold to a ruler as long as the days it hides.
export default function DateRail({ tiles, today, selected, lang, onSelect, onUnfold, onMonth }: {
  tiles: RailTile[]; today: string; selected: string; lang: Lang;
  onSelect: (date: string) => void; onUnfold: (from: string) => void; onMonth: (iso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const reduce = useReducedMotion();

  // First paint: the selected day (today, unless a link says otherwise)
  // sits at the left with a sliver of the past showing. Later selections
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
    // At the far end the selection can't reach the anchor; it names the month.
    if (strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2) {
      const el = strip.querySelector<HTMLElement>(`[data-date="${selected}"]`);
      if (el && el.offsetLeft >= strip.scrollLeft) return onMonth(selected);
    }
    const anchor = strip.scrollLeft + PEEK + 12;
    const items = [...strip.querySelectorAll<HTMLElement>('[data-month]')];
    const hit = items.find(el => el.offsetLeft <= anchor && el.offsetLeft + el.offsetWidth + GAP > anchor);
    if (hit?.dataset.month) onMonth(hit.dataset.month);
  };

  const split = tiles.findIndex(t => (t.kind === 'day' ? t.date : t.to) >= today);
  const past = split === -1 ? tiles : tiles.slice(0, split);
  const future = split === -1 ? [] : tiles.slice(split);

  return (
    <motion.div ref={ref} layoutScroll onScroll={onScroll}
      className="relative flex items-end overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ gap: GAP }}>
      {past.length > 0 && (
        <div className="shrink-0 flex flex-col mr-1.5">
          <span className="h-[18px] pl-2 text-[11.5px] font-medium" style={{ color: C.text3 }}>{lang === 'en' ? 'Past' : '过去'}</span>
          <div className="h-[60px] flex items-center gap-0.5 px-1.5 rounded-[18px]" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6), inset 0 0 0 1px ${C.line}` }}>
            {past.map(tile => tile.kind === 'fold'
              ? <PastFold key={`fold-${tile.from}`} days={tile.days} from={tile.from} lang={lang} onUnfold={onUnfold} />
              : <PastDay key={tile.date} tile={tile} selected={tile.date === selected} onSelect={onSelect} />)}
          </div>
        </div>
      )}
      {future.map(tile => {
        const date = tile.kind === 'day' ? tile.date : tile.from;
        const width = tile.kind === 'fold' ? foldWidth(tile.days) : TILE_W;
        return (
          <div key={tile.kind === 'day' ? tile.date : `fold-${tile.from}`} data-month={date} className="shrink-0 flex flex-col" style={{ width }}>
            <span className="h-[18px] pl-1 text-[11.5px] font-medium whitespace-nowrap" style={{ color: C.text3 }}>{tile.monthStart || date === today ? monthLabel(date, lang) : ''}</span>
            {tile.kind === 'fold'
              ? <Fold from={tile.from} to={tile.to} days={tile.days} lang={lang} onUnfold={onUnfold} />
              : <Day tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} />}
          </div>
        );
      })}
    </motion.div>
  );
}

// Past: number only, grey marks, no tile.
function PastDay({ tile, selected, onSelect }: { tile: Extract<RailTile, { kind: 'day' }>; selected: boolean; onSelect: (d: string) => void }) {
  const struck = tile.cards.some(isActive);
  return (
    <motion.button data-date={tile.date} whileTap={{ scale: 0.92 }} onClick={() => onSelect(tile.date)} aria-pressed={selected}
      aria-label={`${tile.date}${struck ? '' : '，无罢工'}`}
      className="relative w-[30px] h-[48px] rounded-[12px] flex flex-col items-center justify-center gap-[5px]">
      {selected && <motion.span layoutId="rail-selection" transition={SPRING} className="absolute inset-0 rounded-[12px] bg-white" />}
      <span className="relative text-[15px] font-medium tabular-nums leading-none" style={{ color: selected ? C.ink : C.text3, fontFamily: NUM }}>{Number(tile.date.slice(8))}</span>
      <i className="relative w-[4px] h-[4px] rounded-full" style={{ background: struck ? (selected ? 'rgba(10,11,13,0.45)' : C.text3) : 'transparent' }} />
    </motion.button>
  );
}

function PastFold({ days, from, lang, onUnfold }: { days: number; from: string; lang: Lang; onUnfold: (from: string) => void }) {
  return (
    <button onClick={() => onUnfold(from)} aria-label={lang === 'en' ? `${days} calm days` : `${days} 天无罢工，点击展开`} className="h-[48px] px-1.5 flex items-center" style={{ gap: 4 }}>
      {Array.from({ length: days }, (_, i) => <i key={i} className="w-[2px] h-[10px] rounded-full" style={{ background: C.line }} />)}
    </button>
  );
}

const foldWidth = (days: number) => 20 + days * TICK;

function Fold({ from, to, days, lang, onUnfold }: { from: string; to: string; days: number; lang: Lang; onUnfold: (from: string) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.95 }} onClick={() => onUnfold(from)}
      aria-label={lang === 'en' ? `${days} days without strikes — show them` : `${days} 天无罢工，点击展开`}
      className="h-[76px] rounded-[22px] flex flex-col items-center pt-[9px]"
      style={{ background: C.surface }}>
      <span className="text-[11.5px] font-medium tabular-nums whitespace-nowrap" style={{ color: C.text3, fontFamily: NUM }}>{Number(from.slice(8))}–{Number(to.slice(8))}</span>
      <span aria-hidden className="mt-[9px] flex" style={{ gap: TICK - 2 }}>
        {Array.from({ length: days }, (_, i) => <i key={i} className="w-[2px] h-[12px] rounded-full" style={{ background: C.lineStrong }} />)}
      </span>
    </motion.button>
  );
}

function Day({ tile, today, selected, lang, onSelect }: { tile: Extract<RailTile, { kind: 'day' }>; today: string; selected: boolean; lang: Lang; onSelect: (d: string) => void }) {
  const active = tile.cards.filter(isActive);
  const shown = (active.length ? active : tile.cards).filter((c, i, all) => all.findIndex(o => o.category === c.category) === i);
  const isToday = tile.date === today;
  const joinColor = active[0] ? MODE_COLOR[active[0].category].main : C.cancel;

  return (
    <motion.button data-date={tile.date} whileTap={{ scale: 0.94 }} onClick={() => onSelect(tile.date)} aria-pressed={selected}
      aria-label={`${tile.date}${active.length ? '' : lang === 'en' ? ', no strikes' : '，无罢工'}`}
      className="relative h-[76px] rounded-[22px] flex flex-col items-center pt-[9px] overflow-visible"
      style={{ background: C.surface }}>
      {selected && (
        <motion.span layoutId="rail-selection" transition={SPRING} className="absolute inset-0 rounded-[22px] bg-white" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          <span className="absolute left-1/2 -bottom-[5px] w-[11px] h-[11px] -translate-x-1/2 rotate-45 rounded-[2px] bg-white" />
        </motion.span>
      )}
      <span className="relative text-[11.5px] font-medium whitespace-nowrap" style={{ color: selected ? 'rgba(10,11,13,0.55)' : isToday ? C.text : C.text3 }}>
        {isToday ? (lang === 'en' ? 'Today' : '今天') : weekday(tile.date, lang)}
      </span>
      <span className="relative text-[23px] font-semibold tabular-nums leading-[26px] mt-[1px]" style={{ color: selected ? C.ink : C.text, fontFamily: NUM }}>{Number(tile.date.slice(8))}</span>
      <span className="relative mt-auto mb-[11px] h-[14px] flex items-center gap-[3px]">
        {shown.slice(0, 2).map(card => <Mark key={card.id} card={card} selected={selected} />)}
        {shown.length > 2 && <span className="text-[10px] font-semibold" style={{ color: selected ? C.ink : C.text2 }}>+{shown.length - 2}</span>}
      </span>
      {/* An overnight strike: one continuous line through both tiles. */}
      {(tile.joinPrev || tile.joinNext) && (
        <span aria-hidden className="absolute bottom-[5px] h-[2px]" style={{
          left: tile.joinPrev ? -GAP : '50%', right: tile.joinNext ? -GAP : '50%', background: joinColor,
          borderRadius: `${tile.joinPrev ? 0 : 2}px ${tile.joinNext ? 0 : 2}px ${tile.joinNext ? 0 : 2}px ${tile.joinPrev ? 0 : 2}px`,
        }} />
      )}
    </motion.button>
  );
}

// Filled glyph: confirmed. Outline glyph: hours not yet published.
// Grey with a stroke: called off.
function Mark({ card, selected }: { card: ModeCard; selected: boolean }) {
  if (!isActive(card)) {
    const grey = selected ? 'rgba(10,11,13,0.35)' : C.cancel;
    return (
      <span className="relative flex">
        <ModeGlyph mode={card.category} size={13} color={grey} />
        <i className="absolute -left-px -right-px top-1/2 h-[1.5px] -rotate-45 rounded" style={{ background: grey }} />
      </span>
    );
  }
  return <ModeGlyph mode={card.category} size={14} weight={card.windows.length ? 'fill' : 'bold'} color={MODE_COLOR[card.category].main} />;
}
