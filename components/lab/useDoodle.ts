'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDoodleCount, submitDoodle } from '../../app/actions';
import type { ModeCard } from '../../lib/lab/model';
import { interactionReceipt } from '../../lib/interactionTelemetry';
import { track } from './track';

// Same contract as the live card (components/StrikeCard.tsx): one mark per
// device per city/date/mode (airports also per time window), counts shown
// with the same baseline offsets, polled every five seconds.

const GLOBAL_DOODLE_BASE_OFFSET = 15;

function stableOffset(seed: string, min = 18, spread = 6) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return min + (hash % spread);
}

function baseOffset(card: ModeCard, region: string) {
  if (!card.date.startsWith('2026-05-')) return GLOBAL_DOODLE_BASE_OFFSET;
  return GLOBAL_DOODLE_BASE_OFFSET + stableOffset(`${region}|${card.date}|${card.category}|${card.displayTime}`);
}

function manualBase(card: ModeCard, region: string) {
  return card.date === '2026-03-27' && region === 'MILANO' && card.category === 'BUS' && card.provider.includes('米兰交通局') ? 36 : null;
}

export function useDoodle(card: ModeCard, region: string) {
  const key = useMemo(() => `doodled_${region}|${card.date}|${card.category}|${card.category === 'AIRPORT' ? card.displayTime : ''}`, [region, card.date, card.category, card.displayTime]);
  const manual = manualBase(card, region);
  const offset = baseOffset(card, region);
  const displayTime = card.category === 'AIRPORT' ? card.displayTime : undefined;
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [marked, setMarked] = useState(false);
  const [spraying, setSpraying] = useState(false);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const local = !!localStorage.getItem(key);
      if (manual !== null) {
        if (!alive) return;
        setMarked(local);
        setCount(prev => Math.max(prev, manual + offset + (local ? 1 : 0)));
        setLoaded(true);
        return;
      }
      const server = await getDoodleCount(card.id, card.date, card.category, displayTime, region);
      if (!alive) return;
      setMarked(local);
      setCount(prev => Math.max(prev, server + offset, local ? offset + 1 : 0));
      setLoaded(true);
    };
    sync();
    const timer = setInterval(sync, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [key, card.id, card.date, card.category, displayTime, region, manual, offset]);

  const mark = useCallback(async () => {
    if (marked) return;
    setMarked(true);
    setCount(prev => prev + 1);
    setSpraying(true);
    setTimeout(() => setSpraying(false), 2000);
    let uuid = localStorage.getItem(key);
    if (!uuid) {
      uuid = crypto.randomUUID();
      localStorage.setItem(key, uuid);
    }
    if (manual !== null) return;
    await interactionReceipt('affected_reaction', () => submitDoodle(card.id, uuid!, card.date, card.category, displayTime, region), track, { card_id: card.id, region, transport_type: card.category });
    const latest = await getDoodleCount(card.id, card.date, card.category, displayTime, region);
    setCount(latest + offset);
    track('graffiti_spray_triggered', { transport_type: card.category.toLowerCase(), total_rage_count: latest + offset });
  }, [marked, key, manual, card.id, card.date, card.category, displayTime, region, offset]);

  return { key, count, loaded, marked, spraying, mark };
}
