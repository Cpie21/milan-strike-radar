'use client';

import { MODES, modeName, tx, type Lang, type ModeCard } from '../../lib/lab/model';
import { addDaysIso, weekdayOfIso } from '../../lib/romeDate';
import { strikeModes } from './DateRail';
import { ModeBadge, Sheet } from './ui';
import { C, NUM, TYPE } from './theme';

const HEAD_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const HEAD_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Every date on one page, a month per block, the same badges as the rail.
// The rail is for "this week"; this is for "when is the next one, and how
// many are there this month".
export default function MonthSheet({ open, onClose, lang, byDate, from, to, today, selected, onSelect }: {
  open: boolean; onClose: () => void; lang: Lang; byDate: Map<string, ModeCard[]>;
  from: string; to: string; today: string; selected: string; onSelect: (date: string) => void;
}) {
  const months: string[] = [];
  // From this month on: the past is for the rail's strip, not for planning.
  for (let m = today.slice(0, 7); m <= to.slice(0, 7); m = addDaysIso(`${m}-28`, 7).slice(0, 7)) months.push(m);
  const used = new Set([...byDate.values()].flat().filter(c => c.status !== 'CANCELLED').map(c => c.category));

  return (
    <Sheet open={open} onClose={onClose} title={tx(lang, '全部日期', 'All dates')} large>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pb-3">
        {MODES.filter(m => used.has(m)).map(m => (
          <span key={m} className={`flex items-center gap-1.5 ${TYPE.caption}`} style={{ color: C.text2 }}><ModeBadge mode={m} size={14} />{modeName(m, lang)}</span>
        ))}
      </div>
      <div className="flex flex-col gap-6 pb-2">
        {months.map(month => {
          const first = `${month}-01`;
          const lead = (weekdayOfIso(first) + 6) % 7;
          const days: string[] = [];
          for (let d = first; d.startsWith(month); d = addDaysIso(d, 1)) days.push(d);
          const struck = days.filter(d => d >= today && strikeModes({ cards: byDate.get(d) || [] }).length).length;
          return (
            <section key={month}>
              <h3 className="flex items-baseline gap-2 mb-2">
                <span className={TYPE.title}>{tx(lang, `${Number(month.slice(5))}月`, MONTH_EN[Number(month.slice(5)) - 1])}</span>
                <span className={TYPE.caption} style={{ color: C.text3 }}>{struck ? tx(lang, `${struck} 天有罢工`, `${struck} strike day${struck > 1 ? 's' : ''}`) : tx(lang, '没有已公布的罢工', 'No strikes announced')}</span>
              </h3>
              <div className="grid grid-cols-7 gap-1">
                {(lang === 'en' ? HEAD_EN : HEAD_ZH).map((h, i) => <span key={i} className={`text-center pb-1 ${TYPE.caption}`} style={{ color: C.text3 }}>{h}</span>)}
                {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
                {days.map(date => {
                  const inRange = date >= from && date <= to;
                  const modes = strikeModes({ cards: byDate.get(date) || [] });
                  const isSel = date === selected;
                  const isToday = date === today;
                  const past = date < today;
                  return (
                    <button key={date} disabled={!inRange} onClick={() => { onSelect(date); onClose(); }} aria-pressed={isSel}
                      aria-label={`${date}${modes.length ? '' : tx(lang, '，无罢工', ', no strikes')}`}
                      className="h-[54px] rounded-[14px] flex flex-col items-center pt-[7px] gap-[5px] disabled:opacity-25"
                      style={{ background: isSel ? '#FFFFFF' : modes.length && !past ? C.surface2 : 'transparent', opacity: past && !isSel ? 0.4 : 1, boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${C.text2}` : undefined }}>
                      <span className="text-[16px] font-semibold tabular-nums leading-none" style={{ color: isSel ? C.ink : C.text, fontFamily: NUM }}>{Number(date.slice(8))}</span>
                      <span className="h-[14px] flex items-center">
                        {modes.slice(0, 3).map((m, i) => <span key={m} className="relative flex" style={{ marginLeft: i ? -3 : 0, zIndex: 3 - i }}><ModeBadge mode={m} size={14} ring={isSel ? '#FFFFFF' : modes.length && !past ? C.surface2 : C.surface} /></span>)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
