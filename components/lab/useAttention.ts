'use client';

import { useEffect, useRef } from 'react';
import { attentionClock } from '../../lib/attention';
import { track } from './track';

/** Counts viewport + foreground exposure, pauses for sheets/background tabs. */
export function useAttention<T extends HTMLElement>(key: string, event: string, properties: Record<string, unknown>, active = true, milestones: readonly number[] = [1, 5, 15]) {
  const ref = useRef<T>(null);
  const latest = useRef(properties);
  useEffect(() => { latest.current = properties; });
  const clock = useRef<ReturnType<typeof attentionClock> | null>(null);
  const identity = useRef('');
  const milestoneKey = milestones.join(',');
  useEffect(() => {
    if (identity.current !== `${key}:${event}:${milestoneKey}`) {
      identity.current = `${key}:${event}:${milestoneKey}`;
      clock.current = attentionClock(seconds => track(event, { ...latest.current, milestone_seconds: seconds }), undefined, milestoneKey.split(',').map(Number));
    }
    const el = ref.current;
    if (!el || !active || !window.IntersectionObserver) return;
    const timerClock = clock.current!;
    let intersecting = false;
    const update = () => timerClock.setVisible(intersecting && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(([entry]) => {
      // Use the viewport for very tall cards; requiring half the whole card
      // would exclude mobile users who can never fit the card on screen.
      intersecting = entry.isIntersecting && entry.boundingClientRect.height > 0 && entry.boundingClientRect.width > 0 && entry.intersectionRect.height >= Math.min(entry.boundingClientRect.height, window.innerHeight) * 0.25;
      update();
    }, { threshold: [0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 1] });
    observer.observe(el);
    document.addEventListener('visibilitychange', update);
    const timer = setInterval(() => timerClock.sample(), 1000);
    return () => {
      timerClock.setVisible(false);
      clearInterval(timer); observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [active, key, event, milestoneKey]);
  return ref;
}
