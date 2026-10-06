'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { monthLabel, weekday, type Lang, type Mode, type RailTile } from '../../lib/lab/model';
import { ModeBadge } from './ui';
import { C, MODE_COLOR, NUM, SPRING } from './theme';

const TILE_W = 54;
const PAST_W = 34;
const GAP = 8;
const PEEK = 56; // how much of the past strip shows at the left edge
const MONTH_SEP = 10; // extra room before a new month

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
  const pastMonths = past.reduce<(typeof past)[]>((groups, t) => {
    const last = groups[groups.length - 1];
    if (last && last[0].date.slice(0, 7) === t.date.slice(0, 7)) last.push(t); else groups.push([t]);
    return groups;
  }, []);

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
      {/* The past: one sunken strip, still split and labelled by month */}
      {past.length > 0 && (
        <div className="shrink-0 flex flex-col mr-1">
          <div className="h-[18px] flex px-1">
            {pastMonths.map((g, k) => (
              <span key={g[0].date} className="text-[11.5px] font-semibold whitespace-nowrap overflow-visible" style={{ width: g.length * PAST_W + (k ? MONTH_SEP : 0), paddingLeft: k ? MONTH_SEP + 2 : 4, color: C.text3 }}>
                {monthLabel(g[0].date, lang)}{k === pastMonths.length - 1 ? ` · ${lang === 'en' ? 'past' : '过去'}` : ''}
              </span>
            ))}
          </div>
          <div className="h-[76px] flex px-1 rounded-[22px]" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: `inset 0 1px 3px rgba(0,0,0,0.6), inset 0 0 0 1px ${C.line}` }}>
            {pastMonths.map((g, k) => (
              <div key={g[0].date} className="flex" style={{ paddingLeft: k ? MONTH_SEP : 0, borderLeft: k ? `1px solid ${C.lineStrong}` : 'none', marginLeft: k ? 0 : 0 }}>
                {g.map(tile => <Day key={tile.date} tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} past />)}
              </div>
            ))}
          </div>
        </div>
      )}
      {future.map((tile, i) => {
        // The mode that runs on overnight into the next day, if any.
        const after = future[i + 1];
        const bridge = tile.joinNext && after ? strikeModes(tile).find(m => strikeModes(after).includes(m)) ?? null : null;
        const before = future[i - 1];
        const fromPrev = tile.joinPrev && before ? strikeModes(tile).find(m => strikeModes(before).includes(m)) ?? null : null;
        // Strong where you are, weak on the day it continues into.
        const focus = tile.date === selected || (bridge !== null && after?.date === selected) || (fromPrev !== null && before?.date === selected);
        // Where the next day's joined badge sits, measured from this tile's left edge.
        const nextRow = after ? 18 + (Math.min(3, strikeModes(after).length) - 1) * 14 : 18;
        const reach = TILE_W + GAP + (after?.monthStart ? MONTH_SEP : 0) + TILE_W / 2 - nextRow / 2 + 9;
        return (
          <div key={tile.date} data-month={tile.date} className="relative shrink-0 flex flex-col" style={{ width: TILE_W, marginLeft: tile.monthStart && i > 0 ? MONTH_SEP : 0, zIndex: bridge ? 2 : 1 }}>
            {/* A new month: its name in full strength, and a rule before it */}
            {tile.monthStart && i > 0 && <i aria-hidden className="absolute top-[3px] bottom-[2px] w-px" style={{ left: -(MONTH_SEP + GAP) / 2 - 0.5, background: C.lineStrong }} />}
            <span className="h-[18px] pl-1 text-[11.5px] whitespace-nowrap" style={{ color: tile.monthStart ? C.text2 : C.text3, fontWeight: tile.monthStart ? 650 : 500 }}>{tile.monthStart || tile.date === today ? monthLabel(tile.date, lang) : ''}</span>
            <Day tile={tile} today={today} selected={tile.date === selected} lang={lang} onSelect={onSelect} bridge={bridge} fromPrev={fromPrev} focus={focus} reach={reach} />
          </div>
        );
      })}
    </motion.div>
  );
}

// A day either has a strike or it doesn't; called-off strikes don't mark
// the rail. The card explains the rest.
export const strikeModes = (tile: { cards: { category: Mode; status: string }[] }) =>
  [...new Set(tile.cards.filter(c => c.status !== 'CANCELLED').map(c => c.category))];

function Day({ tile, today, selected, lang, onSelect, past, bridge = null, fromPrev = null, focus = false, reach = 0 }: {
  tile: Extract<RailTile, { kind: 'day' }>; today: string; selected: boolean; lang: Lang; onSelect: (d: string) => void; past?: boolean;
  bridge?: Mode | null; fromPrev?: Mode | null; focus?: boolean; reach?: number;
}) {
  const modes = strikeModes(tile);
  const isToday = tile.date === today;
  const ring = selected ? '#FFFFFF' : C.surface;
  // An overnight strike: the two days' badges are joined like two stops on
  // a transit map, by one line in the mode's colour at the badges' own
  // height, below the dates. It is drawn by the first day (above the next
  // day's tile) and stops exactly at the next badge's edge, so nothing is
  // covered and there is no seam. The joined mode sits at the inner end of
  // each badge row, so the line runs badge to badge.
  const ordered = [...modes].sort((a, b) => (a === fromPrev ? -1 : b === fromPrev ? 1 : 0)).sort((a, b) => (a === bridge ? 1 : b === bridge ? -1 : 0));
  const rowW = 18 + (Math.min(3, ordered.length) - 1) * 14;
  // Opaque, so it reads the same over the white selected day and the dark one.
  const tint = (m: Mode) => (focus ? MODE_COLOR[m].main : `color-mix(in srgb, ${MODE_COLOR[m].main} 45%, ${C.surface2})`);
  return (
    <motion.button data-date={tile.date} whileTap={{ scale: 0.94 }} onClick={() => onSelect(tile.date)} aria-pressed={selected}
      aria-label={`${tile.date}${modes.length ? '' : lang === 'en' ? ', no strikes' : '，无罢工'}`}
      className="relative h-[76px] flex flex-col items-center pt-[9px] shrink-0"
      style={{ width: past ? PAST_W : '100%', borderRadius: past ? 16 : 22, background: past ? 'transparent' : C.surface }}>
      {selected && (
        // a touch larger than the tile, without moving what's on it
        <motion.span layoutId="rail-selection" transition={SPRING} className={`absolute bg-white ${past ? 'inset-0' : '-inset-[3px]'}`} style={{ borderRadius: past ? 16 : 25, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }} />
      )}
      <span className="relative h-[15px] text-[11.5px] font-medium leading-[15px] whitespace-nowrap" style={{ color: selected ? 'rgba(10,11,13,0.55)' : isToday ? C.text : C.text3 }}>
        {isToday ? (lang === 'en' ? 'Today' : '今天') : past ? weekday(tile.date, lang).replace('周', '').slice(0, lang === 'en' ? 2 : 1) : weekday(tile.date, lang)}
      </span>
      <span className="relative mt-[2px] font-semibold tabular-nums leading-[26px]" style={{ fontSize: past ? 17 : 23, color: selected ? C.ink : past ? C.text3 : C.text, fontFamily: NUM }}>{Number(tile.date.slice(8))}</span>
      {!past && bridge && (() => {
        const start = TILE_W / 2 + rowW / 2 - 9;
        return <span aria-hidden className="absolute bottom-[15px] h-[6px] rounded-l-full" style={{ left: start, width: reach - 9 - start, background: tint(bridge) }} />;
      })()}
      <span className="relative mt-auto mb-[9px] h-[18px] flex items-center">
        {past
          ? modes.length > 0 && <i className="w-[5px] h-[5px] rounded-full" style={{ background: selected ? 'rgba(10,11,13,0.45)' : C.text3 }} />
          : ordered.slice(0, 3).map((m, i) => <span key={m} style={{ marginLeft: i ? -4 : 0, zIndex: 3 - i, }} className="relative flex"><ModeBadge mode={m} size={18} ring={ring} /></span>)}
      </span>
    </motion.button>
  );
}
