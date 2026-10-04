'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { isActive, monthLabel, weekday, type Lang, type RailTile } from '../../lib/lab/model';
import { ModeGlyph } from './ui';
import { C, SPRING } from './theme';

const TILE_W = 52;
const GAP = 6;
const INK = '#0E1A2E'; // text on the selected (white) tile

// Apple Sports keeps every row the same size and lets glow and colour carry
// importance; Transit fills the chosen card and points it at the content.
export default function DateRail({ tiles, today, selected, lang, onSelect, onUnfold }: {
  tiles: RailTile[]; today: string; selected: string; lang: Lang;
  onSelect: (date: string) => void; onUnfold: (from: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!strip || !el) return;
    const left = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
    strip.scrollTo({ left, behavior: placed.current && !reduce ? 'smooth' : 'auto' });
    placed.current = true;
  }, [selected, tiles.length, reduce]);

  return (
    <motion.div
      ref={ref}
      layoutScroll
      className="flex overflow-x-auto px-3 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ gap: GAP, maskImage: 'linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)' }}
    >
      {tiles.map(tile => {
        const key = tile.kind === 'day' ? tile.date : `fold-${tile.from}`;
        const date = tile.kind === 'day' ? tile.date : tile.from;
        return (
          <div key={key} className="shrink-0 flex flex-col" style={{ width: TILE_W }}>
            <span className="h-[18px] text-[11px] font-semibold pl-1" style={{ color: C.text2 }}>{tile.monthStart ? monthLabel(date, lang) : ''}</span>
            {tile.kind === 'fold' ? <Fold tile={tile} lang={lang} onUnfold={onUnfold} /> : <Day tile={tile} today={today} selected={selected === tile.date} lang={lang} onSelect={onSelect} />}
          </div>
        );
      })}
    </motion.div>
  );
}

function Fold({ tile, lang, onUnfold }: { tile: Extract<RailTile, { kind: 'fold' }>; lang: Lang; onUnfold: (from: string) => void }) {
  const a = Number(tile.from.slice(8));
  const b = Number(tile.to.slice(8));
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => onUnfold(tile.from)}
      aria-label={lang === 'en' ? `${tile.days} days without strikes, show them` : `${tile.days} 天无罢工，点击展开`}
      className="h-[84px] rounded-[16px] flex flex-col items-center justify-center gap-1"
      style={{ border: `0.5px dashed ${C.hair}`, color: C.text3 }}
    >
      <span className="text-[10.5px]">{lang === 'en' ? 'Clear' : '无罢工'}</span>
      <span className="text-[15px] font-medium tabular-nums" style={{ color: C.text2 }}>{a}–{b}</span>
      <span className="flex gap-[3px]">{[0, 1, 2].map(i => <i key={i} className="w-[3px] h-[3px] rounded-full" style={{ background: C.text3 }} />)}</span>
    </motion.button>
  );
}

function Day({ tile, today, selected, lang, onSelect }: { tile: Extract<RailTile, { kind: 'day' }>; today: string; selected: boolean; lang: Lang; onSelect: (d: string) => void }) {
  const active = tile.cards.filter(isActive);
  const event = tile.cards.length > 0;
  const shown = (active.length ? active : tile.cards).slice(0, 2);
  const extra = (active.length ? active : tile.cards).length - shown.length;
  const isToday = tile.date === today;
  const ink = selected ? INK : C.text;
  const stop = selected ? '#E0473A' : C.stop;

  return (
    <motion.button
      data-date={tile.date}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(tile.date)}
      aria-pressed={selected}
      aria-label={`${tile.date}${event ? '' : lang === 'en' ? ', no strikes' : '，无罢工'}`}
      className="relative h-[84px] rounded-[16px] flex flex-col items-center pt-2.5"
      style={{ background: event && !selected ? (active.length ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)') : 'transparent' }}
    >
      {selected && (
        <motion.span layoutId="rail-selection" transition={SPRING} className="absolute inset-0 rounded-[16px]" style={{ background: '#FFFFFF', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          {/* The notch points at the day board below. */}
          <span className="absolute left-1/2 -bottom-[5px] w-[11px] h-[11px] -translate-x-1/2 rotate-45 rounded-[2px]" style={{ background: '#FFFFFF' }} />
        </motion.span>
      )}
      <span className="relative text-[11px] font-medium" style={{ color: selected ? 'rgba(14,26,46,0.6)' : C.text2 }}>{isToday ? (lang === 'en' ? 'Today' : '今天') : weekday(tile.date, lang)}</span>
      <span className="relative text-[21px] font-semibold tabular-nums leading-[26px] mt-0.5" style={{ color: ink }}>{Number(tile.date.slice(8))}</span>
      <span className="relative mt-auto mb-[13px] h-[16px] flex items-center gap-[3px]">
        {event ? (
          <>
            {shown.map(card => (
              <span key={card.id} className="relative flex">
                <ModeGlyph mode={card.category} size={15} color={isActive(card) ? (card.status === 'UNCERTAIN' ? (selected ? '#B7791F' : C.pend) : stop) : (selected ? 'rgba(14,26,46,0.35)' : C.cancel)} />
                {!isActive(card) && <i className="absolute left-[-1px] right-[-1px] top-1/2 h-[1.5px] -rotate-45 rounded" style={{ background: selected ? 'rgba(14,26,46,0.45)' : C.cancel }} />}
              </span>
            ))}
            {extra > 0 && <span className="text-[10px] font-semibold" style={{ color: selected ? INK : C.text2 }}>+{extra}</span>}
          </>
        ) : (
          <i className="w-1 h-1 rounded-full" style={{ background: selected ? 'rgba(14,26,46,0.35)' : isToday ? C.text : C.text3 }} />
        )}
      </span>
      {/* Overnight strikes: one continuous line along the bottom of both tiles. */}
      {(tile.joinPrev || tile.joinNext) && (
        <span aria-hidden className="absolute bottom-[6px] h-[2.5px] rounded-full" style={{
          left: tile.joinPrev ? -GAP : '50%',
          right: tile.joinNext ? -GAP : '50%',
          marginLeft: tile.joinPrev ? 0 : -1,
          background: stop,
          borderTopLeftRadius: tile.joinPrev ? 0 : 99, borderBottomLeftRadius: tile.joinPrev ? 0 : 99,
          borderTopRightRadius: tile.joinNext ? 0 : 99, borderBottomRightRadius: tile.joinNext ? 0 : 99,
        }} />
      )}
    </motion.button>
  );
}
