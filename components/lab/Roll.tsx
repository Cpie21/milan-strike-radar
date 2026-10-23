'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';

// A value that changes in place (the month over the rail, a count, a
// percentage) rolls to the next one instead of jumping: the old one leaves
// upward and blurs, the new one rises in from below and sharpens. Going back
// (a smaller `order`) runs the other way, so the motion says which way you went.

const roll: Variants = {
  enter: (dir: number) => ({ y: `${dir * 0.55}em`, opacity: 0, filter: 'blur(5px)' }),
  center: { y: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dir: number) => ({ y: `${-dir * 0.55}em`, opacity: 0, filter: 'blur(5px)' }),
};

export function Roll({ value, order }: { value: string | number; order?: number }) {
  const reduce = useReducedMotion();
  const text = String(value);
  const [seen, setSeen] = useState({ text, order, dir: 1 });
  if (seen.text !== text) setSeen({ text, order, dir: order !== undefined && seen.order !== undefined && order < seen.order ? -1 : 1 });
  if (reduce) return <>{text}</>;
  return (
    <span className="relative inline-flex">
      <AnimatePresence initial={false} custom={seen.dir} mode="popLayout">
        <motion.span key={text} custom={seen.dir} variants={roll} initial="enter" animate="center" exit="exit"
          transition={{ y: { type: 'spring', stiffness: 420, damping: 34 }, opacity: { duration: 0.18 }, filter: { duration: 0.22 } }}
          className="inline-block whitespace-nowrap">
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
