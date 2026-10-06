'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { ArrowsClockwise, CalendarDots, CaretDown, CaretRight, CheckCircle, DeviceMobile, MapPin, SquaresFour } from '@phosphor-icons/react';
import {
  buildRail, continuesOvernight, dayLabel, daysBetween, isActive, modeName, nextEventDate, sortCards, tx,
  type Lang, type Mode, type ModeCard,
} from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
import { detectBrowserLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import DateRail from './DateRail';
import LabStrikeCard, { type CardContext } from './LabStrikeCard';
import { AskField, AskModule, AskSheet, useAsk } from './LabAsk';
import type { Translation } from '../../lib/lab/translate';
import { CalendarSheet, CitySheet, HomeScreenSheet, SupportSheet, WidgetSheet } from './sheets';
import { ModeBadge } from './ui';
import MonthSheet from './MonthSheet';
import { C, EASE, MODE_COLOR, NUM, R, SANS, SPRING, TONAL, TYPE } from './theme';
import { track } from './track';
import { holdWalls } from './wall/PixelWall';

type City = { tag: string; zh: string; en: string; path: string };
export type CityStatus = Record<string, { today: Mode[]; next: string | null; nextModes: Mode[] }>;
type SheetName = 'city' | 'calendar' | 'widget' | 'home' | 'support' | 'month' | null;
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function romeMinutes() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

export default function LabApp({ city, cities, cards, today, from, to, initialDate, initialMinutes, cityStatus, translations }: {
  city: City; cities: City[]; cards: ModeCard[]; today: string; from: string; to: string; initialDate: string; lastSync: string | null; initialMinutes: number; cityStatus: CityStatus; translations: Record<string, Translation>;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('zh');
  const [selected, setSelected] = useState(initialDate);
  const [direction, setDirection] = useState(0);
  const [now, setNow] = useState(initialMinutes);
  const [month, setMonth] = useState(initialDate);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [wechat, setWechat] = useState(false);

  const byDate = useMemo(() => {
    const map = new Map<string, ModeCard[]>();
    cards.forEach(c => map.set(c.date, [...(map.get(c.date) || []), c]));
    return map;
  }, [cards]);
  const tiles = useMemo(() => buildRail(byDate, from, to, today, selected, new Set(), false), [byDate, from, to, today, selected]);
  const dayCards = sortCards(byDate.get(selected) || []);
  const active = dayCards.filter(isActive);
  const jumpModes = [...new Set(active.map(c => c.category))];
  const next = nextEventDate(byDate, selected);
  const name = lang === 'en' ? city.en : city.zh;
  // The top of the page takes the colours of the modes striking that day; a
  // calm day stays neutral, so colour itself means "something is on".
  // The header is one flat band in exactly the colour Safari gives its bars
  // (theme-color is a single colour), so page and browser meet without a
  // seam; the glow blooms below it, its colours parting only further down.
  const glowModes = jumpModes.slice(0, 2);
  const band = bandColour(glowModes);
  const blobs = glowModes.length
    ? glowModes.map((m, i, all) => `radial-gradient(${all.length > 1 ? '62% 230px' : '90% 250px'} at ${all.length > 1 ? (i ? '82%' : '18%') : '50%'} 70px, ${MODE_COLOR[m].main}30, transparent 70%)`).join(', ')
    : 'radial-gradient(90% 240px at 50% 60px, rgba(255,255,255,0.045), transparent 70%)';
  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', band));
  }, [band]);

  useEffect(() => {
    const tick = () => setNow(romeMinutes());
    const first = setTimeout(() => {
      tick();
      try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        setLang(stored === 'en' || stored === 'zh' ? stored : detectBrowserLanguage());
      } catch { /* storage blocked */ }
      if (/MicroMessenger/i.test(navigator.userAgent)) { setWechat(true); track('wechat_jump_success'); }
      // The page is cached for everyone; the day a link points at is read here.
      const linked = new URLSearchParams(window.location.search).get('date');
      if (linked && /^\d{4}-\d{2}-\d{2}$/.test(linked) && linked !== initialDate && linked >= from && linked <= to) { setSelected(linked); setMonth(linked); }
    }, 0);
    const timer = setInterval(tick, 60_000);
    // A page left open (a Home Screen app, a background tab) fetches the
    // day's data again when it comes back after a while; what you have
    // selected stays as it is.
    let fetched = Date.now();
    const back = () => {
      if (document.visibilityState !== 'visible') return;
      tick();
      if (Date.now() - fetched > 10 * 60_000) { fetched = Date.now(); router.refresh(); }
    };
    document.addEventListener('visibilitychange', back);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', back); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival

  const select = (date: string) => {
    if (date === selected) return;
    holdWalls(520); // the walls hold still while the days slide
    setDirection(Math.sign(daysBetween(selected, date)));
    setSelected(date);
    setMonth(date);
    window.history.replaceState(null, '', date === today ? city.path : `${city.path}?date=${date}`);
  };
  // Forward tap-to-jump (portfolio decision 02): scroll to the card and pulse it.
  const jump = (mode: Mode) => {
    const card = active.find(c => c.category === mode);
    if (!card) return;
    document.getElementById(`card-${card.id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setHighlight(card.id);
    setTimeout(() => setHighlight(null), 1200);
  };
  const openDate = (date: string, path: string) => {
    if (path === city.path) select(date);
    else router.push(`${path}?date=${date}`);
  };
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANGUAGE_STORAGE_KEY, l); } catch { /* ignore */ } };

  const ctx: CardContext = { today, nowMinutes: now, lang, region: city.tag, cityName: name, sharePath: city.path, tr: translations };
  const ask = useAsk({ region: city.tag, lang, today, onOpenDate: (date, path) => openDate(date, path) });
  // A day whose strikes were all called off is a calm day too: the board and
  // its question field sit under the cancelled cards, and the bar goes away.
  const calm = active.length === 0;
  const neighbour = (iso: string, mode: Mode) => (byDate.get(iso) || []).find(c => c.category === mode);
  // Days sit side by side: the old one slides out as the new one slides in,
  // at the pace of the rail's own selection, with nothing fading first.
  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { x: `calc(${d * 100}% + ${d * 16}px)` }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { x: `calc(${d * -100}% - ${d * 16}px)` }),
  };

  return (
    <LayoutGroup>
    <main className="relative min-h-[100dvh]" style={{ background: C.bg, color: C.text, fontFamily: SANS, WebkitFontSmoothing: 'antialiased' }}>
      {/* The band: one flat colour, continuous with Safari's bar */}
      <div className="relative z-[1]" style={{ background: band, transition: 'background-color 0.5s ease' }}>
        <header className="mx-auto max-w-[520px] grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pb-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
          <div className="justify-self-start flex p-[3px] rounded-full" style={{ background: C.surface2 }} role="group" aria-label="语言 / Language">
            {(['zh', 'en'] as Lang[]).map(l => (
              <button key={l} onClick={() => changeLang(l)} aria-pressed={lang === l} className="relative h-7 w-9 rounded-full text-[12.5px] font-semibold" style={{ color: lang === l ? C.text : C.text3 }}>
                {lang === l && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full" style={{ background: C.surface3 }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{l === 'zh' ? '中' : 'EN'}</span>
              </button>
            ))}
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold leading-tight">{tx(lang, '意大利罢工查询', 'Italy Strike Radar')}</p>
            <p className="text-[10px] font-semibold tracking-[0.14em] mt-0.5" style={{ color: C.text3, fontFamily: NUM }}>DEVELOPED BY 21°C</p>
          </div>
          <button onClick={() => setSheet('city')} aria-label={tx(lang, `当前城市 ${name}，切换城市`, `${name}, change city`)} className={`justify-self-end h-[34px] pl-2.5 pr-2 rounded-full flex items-center gap-1 ${TYPE.label}`} style={{ background: C.surface2 }}>
            <MapPin size={14} weight="fill" />{name}<CaretDown size={11} weight="bold" color={C.text3} />
          </button>
        </header>
      </div>
      <div className="relative">
      {/* The glow: the band's colour washing down evenly, and each striking
          mode's light opening up beneath it */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[420px] pointer-events-none" style={{ background: `linear-gradient(180deg, ${band} 0px, ${band}00 300px)`, transition: 'background 0.5s ease' }} />
      <AnimatePresence initial={false}>
        <motion.div key={blobs} aria-hidden className="absolute inset-x-0 top-0 h-[420px] pointer-events-none"
          style={{ background: blobs, WebkitMaskImage: 'linear-gradient(180deg, transparent 0px, #000 90px, #000 55%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0px, #000 90px, #000 55%, transparent 100%)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} />
      </AnimatePresence>
      <div className="relative mx-auto max-w-[520px] pb-[120px]">

        {/* Title left, the way out to the full calendar right, on one baseline */}
        <div className="flex items-end justify-between gap-3 pl-5 pr-4 pt-4 mb-3">
          <h1 className={TYPE.page}>{lang === 'en' ? `${MONTH_EN[Number(month.slice(5, 7)) - 1]} strikes` : `${Number(month.slice(5, 7))}月罢工信息`}</h1>
          <button onClick={() => setSheet('month')} className={`mb-0.5 h-[34px] pl-2.5 pr-3 rounded-full flex items-center gap-1.5 shrink-0 ${TYPE.label}`} style={{ background: C.surface2, color: C.text }}>
            <CalendarDots size={16} weight="bold" />{tx(lang, '全部日期', 'All dates')}
          </button>
        </div>

        <DateRail tiles={tiles} today={today} selected={selected} lang={lang} onSelect={select} onMonth={setMonth} />

        {/* Tap-to-jump: only when there is more than one card to jump between.
            It opens and closes with the day, chips rising in one after another. */}
        <AnimatePresence initial={false}>
          {dayCards.length > 1 && jumpModes.length > 0 && (
            <motion.div key="jump" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.28, ease: EASE }} className="overflow-hidden">
              <div className="flex justify-center gap-2 px-5 pt-2 pb-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {jumpModes.map((mode, i) => (
                    <motion.button key={mode} layout initial={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
                      transition={{ ...SPRING, delay: reduce ? 0 : 0.04 * i }} whileTap={{ scale: 0.95 }} onClick={() => jump(mode)}
                      className={`h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 shrink-0 ${TYPE.label}`} style={{ background: MODE_COLOR[mode].soft, color: MODE_COLOR[mode].main }}>
                      <ModeBadge mode={mode} size={18} />{modeName(mode, lang)}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-4 pt-3">
          <div data-day-stage className="relative -mx-4 px-4" style={{ overflowX: 'clip' }}>
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div key={selected} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={reduce ? { duration: 0.15 } : SPRING} className="flex flex-col gap-3">
              {dayCards.length ? dayCards.map(card => {
                const prev = neighbour(addDaysIso(selected, -1), card.category);
                const nxt = neighbour(addDaysIso(selected, 1), card.category);
                return <LabStrikeCard key={card.id} card={card} ctx={ctx} highlighted={highlight === card.id}
                  prev={continuesOvernight(prev, card) ? prev : undefined} next={continuesOvernight(card, nxt) ? nxt : undefined} />;
              }) : (
                // The day's answer, then (as a footnote of it, not a sibling)
                // when the next strike is.
                <section className="flex flex-col items-center text-center px-6 pt-8 pb-6" style={{ background: C.surface, borderRadius: R.card }}>
                  <CheckCircle size={34} weight="fill" color={C.ok} />
                  <p className={`mt-3 ${TYPE.title}`}>{tx(lang, '无交通罢工', 'No transport strikes')}</p>
                  <p className={`mt-1 ${TYPE.body}`} style={{ color: C.text2 }}>{tx(lang, '安心出行', 'Travel with peace of mind')}</p>
                  {next && (
                    <button onClick={() => select(next)} className={`mt-5 h-9 pl-3.5 pr-2.5 rounded-full flex items-center gap-2 ${TYPE.label}`} style={{ background: C.surface2 }}>
                      <span style={{ color: C.text3 }}>{tx(lang, '下一次', 'Next')}</span>
                      <span className="font-semibold" style={{ color: C.text }}>{dayLabel(next, lang)}</span>
                      <span className="flex gap-1">{[...new Set((byDate.get(next) || []).filter(isActive).map(c => c.category))].map(m => <ModeBadge key={m} mode={m} size={16} />)}</span>
                      <CaretRight size={12} weight="bold" color={C.text3} />
                    </button>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
          </div>

          {/* Outside the per-day transition, so it stays put across calm days */}
          <AnimatePresence initial={false}>
            {calm && (
              <motion.div key="ask" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : 0.32, ease: EASE }} className="overflow-hidden">
                <AskModule ask={ask} nudge={{ key: selected, dir: direction }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tools: one line each says enough */}
          {/* These follow the content above as it grows and shrinks, gliding, never jumping */}
          <motion.div layout="position" transition={SPRING} className="grid grid-cols-3 gap-2.5 mt-3">
            <Tool icon={<DeviceMobile size={19} weight="fill" />} label={tx(lang, '添加到桌面', 'Home Screen')} onClick={() => setSheet('home')} />
            <Tool icon={<SquaresFour size={19} weight="fill" />} label={tx(lang, '添加小组件', 'Widget')} onClick={() => setSheet('widget')} />
            <Tool icon={<ArrowsClockwise size={19} weight="bold" />} label={tx(lang, '同步日历', 'Calendar')} onClick={() => setSheet('calendar')} />
          </motion.div>

          <motion.section layout="position" transition={SPRING} className="mt-3 flex items-center gap-3 px-5 py-4" style={{ background: C.surface, borderRadius: R.card }}>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold">{tx(lang, '支持与反馈', 'Support & feedback')}</p>
              <p className={`mt-0.5 ${TYPE.label} font-normal`} style={{ color: C.text2 }}>{tx(lang, '独立开发不易，如果有用请支持一杯奶茶，也欢迎提建议。', 'Built independently. Buy a bubble tea or send a suggestion.')}</p>
            </div>
            <button onClick={() => setSheet('support')} className={`h-[38px] px-3.5 rounded-full shrink-0 active:scale-95 transition-transform ${TYPE.label} font-semibold`} style={TONAL}>
              {tx(lang, '去看看', 'Open')}
            </button>
          </motion.section>

        </div>
      </div>
      </div>

      <AnimatePresence>
        {!calm && <AskField key="dock" ask={ask} />}
      </AnimatePresence>
      <AskSheet ask={ask} />
      <MonthSheet open={sheet === 'month'} onClose={() => setSheet(null)} lang={lang} byDate={byDate} from={from} to={to} today={today} selected={selected} onSelect={select} />

      <CitySheet open={sheet === 'city'} onClose={() => setSheet(null)} lang={lang} cities={cities} current={city.tag} status={cityStatus} today={today} />
      <CalendarSheet open={sheet === 'calendar'} onClose={() => setSheet(null)} lang={lang} region={city.tag} cityName={name} />
      <WidgetSheet open={sheet === 'widget'} onClose={() => setSheet(null)} lang={lang} region={city.tag} cityName={name} cityPath={city.path} />
      <HomeScreenSheet open={sheet === 'home'} onClose={() => setSheet(null)} lang={lang} />
      <SupportSheet open={sheet === 'support'} onClose={() => setSheet(null)} lang={lang} />

      <AnimatePresence>
        {wechat && (
          <motion.div className="fixed inset-0 z-[120] flex flex-col items-end px-6 pt-6" style={{ background: 'rgba(5,6,8,0.88)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWechat(false)}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden><path d="M12 64 C 30 50, 48 34, 60 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" /><path d="M48 12 L 61 10 L 63 23" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="mt-4 self-center text-center max-w-[300px]">
              <p className="text-[21px] font-bold">{tx(lang, '点击右上角，在浏览器打开', 'Open in your browser')}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: C.text2 }}>{tx(lang, '微信内无法添加到桌面和同步日历。', 'Add to Home Screen and calendar sync don’t work inside WeChat.')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
    </LayoutGroup>
  );
}

function bandColour(modes: Mode[]) {
  if (!modes.length) return '#0A0B0D';
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const avg = modes.map(m => rgb(MODE_COLOR[m].main)).reduce((a, c) => a.map((v, i) => v + c[i] / modes.length), [0, 0, 0]);
  return `#${avg.map((v, i) => Math.round([10, 11, 13][i] + (v - [10, 11, 13][i]) * 0.16).toString(16).padStart(2, '0')).join('')}`;
}

function Tool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="h-[76px] flex flex-col items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap" style={{ background: C.surface, borderRadius: 18 }}>
      <span style={{ color: C.text2 }}>{icon}</span>
      {label}
    </motion.button>
  );
}
