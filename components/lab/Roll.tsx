'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';

// A value that changes in place (the month over the rail, a count, a
// percentage) rolls to the next one instead of jumping, character by
// character: only what changed moves (10 → 11 rolls the last digit, the 1
// stays). The old character leaves upward and blurs, the new one rises in
// and sharpens; going back (a smaller `order`) runs the other way, so the
// motion says which way you went. Numbers line up from the right, words
// from the left.

const roll: Variants = {
  enter: (dir: number) => ({ y: `${dir * 0.55}em`, opacity: 0, filter: 'blur(5px)' }),
  center: { y: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dir: number) => ({ y: `${-dir * 0.55}em`, opacity: 0, filter: 'blur(5px)' }),
};
const MOVE = { y: { type: 'spring', stiffness: 420, damping: 34 }, opacity: { duration: 0.18 }, filter: { duration: 0.22 } } as const;

function Slot({ ch, dir, appear }: { ch: string; dir: number; appear: boolean }) {
  return (
    <span className="relative inline-flex">
      <AnimatePresence initial={appear} custom={dir} mode="popLayout">
        <motion.span key={ch} custom={dir} variants={roll} initial="enter" animate="center" exit="exit" transition={MOVE} className="inline-block whitespace-pre">
          {ch}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Roll({ value, order }: { value: string | number; order?: number }) {
  const reduce = useReducedMotion();
  const text = String(value);
  // the first frame shows the value as it is; only changes move
  const [seen, setSeen] = useState({ text, order, dir: 1, changed: false });
  if (seen.text !== text) setSeen({ text, order, changed: true, dir: order !== undefined && seen.order !== undefined && order < seen.order ? -1 : 1 });
  if (reduce) return <>{text}</>;
  const chars = [...text];
  const fromRight = /^\d+$/.test(text);
  return (
    <span className="relative inline-flex">
      <AnimatePresence initial={false} custom={seen.dir} mode="popLayout">
        {chars.map((ch, i) => {
          const slot = fromRight ? chars.length - 1 - i : i;
          return (
            // a slot that goes (11 → 9) leaves like a character; one that comes rolls in inside
            <motion.span key={`slot-${slot}`} custom={seen.dir} variants={roll} initial={false} animate="center" exit="exit" transition={MOVE} className="inline-flex">
              <Slot ch={ch} dir={seen.dir} appear={seen.changed} />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}
