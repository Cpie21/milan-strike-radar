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
import { AskField, AskSheet, useAsk } from './LabAsk';
import type { Translation } from '../../lib/lab/translate';
import { CalendarSheet, CitySheet, HomeScreenSheet, SupportSheet, WidgetSheet } from './sheets';
import { ModeBadge } from './ui';
import MonthSheet from './MonthSheet';
import { C, EASE, MODE_COLOR, NUM, R, SANS, TONAL, TYPE } from './theme';
import { track } from './track';

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
  // The page glow takes the colours of the modes striking that day; a calm
  // day stays neutral, so colour itself means "something is on".
  const glow = jumpModes.length
    ? jumpModes.slice(0, 2).map((m, i, all) => `radial-gradient(${all.length > 1 ? '70%' : '110%'} 70% at ${all.length > 1 ? (i ? '85%' : '15%') : '50%'} -5%, ${MODE_COLOR[m].main}38, transparent 72%)`).join(', ')
    : 'radial-gradient(110% 70% at 50% -5%, rgba(255,255,255,0.06), transparent 72%)';

  useEffect(() => {
    const tick = () => setNow(romeMinutes());
    const first = setTimeout(() => {
      tick();
      try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        setLang(stored === 'en' || stored === 'zh' ? stored : detectBrowserLanguage());
      } catch { /* storage blocked */ }
      if (/MicroMessenger/i.test(navigator.userAgent)) { setWechat(true); track('wechat_jump_success'); }
    }, 0);
    const timer = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const select = (date: string) => {
    if (date === selected) return;
    setDirection(Math.sign(daysBetween(selected, date)));
    setSelected(date);
    setMonth(date);
    window.history.replaceState(null, '', `/lab?city=${city.tag}&date=${date}`);
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
    else router.push(`/lab?city=${cities.find(c => c.path === path)?.tag ?? city.tag}&date=${date}`);
  };
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem(LANGUAGE_STORAGE_KEY, l); } catch { /* ignore */ } };

  const ctx: CardContext = { today, nowMinutes: now, lang, region: city.tag, cityName: name, sharePath: city.path, tr: translations };
  const ask = useAsk({ region: city.tag, lang, today, onOpenDate: (date, path) => openDate(date, path) });
  const calm = dayCards.length === 0;
  const neighbour = (iso: string, mode: Mode) => (byDate.get(iso) || []).find(c => c.category === mode);
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 24, filter: reduce ? 'none' : 'blur(6px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -16, filter: reduce ? 'none' : 'blur(4px)' }),
  };

  return (
    <LayoutGroup>
    <main className="relative min-h-[100dvh]" style={{ background: C.bg, color: C.text, fontFamily: SANS, WebkitFontSmoothing: 'antialiased' }}>
      <AnimatePresence initial={false}>
        <motion.div key={glow} aria-hidden className="absolute inset-x-0 top-0 h-[460px] pointer-events-none" style={{ background: glow }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} />
      </AnimatePresence>
      <div className="relative mx-auto max-w-[520px] pb-[120px]">
        {/* Brand centred between the two entry points */}
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
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

        <div className="flex flex-col items-center px-5 mt-7 mb-4">
          <h1 className={TYPE.page}>{lang === 'en' ? `${MONTH_EN[Number(month.slice(5, 7)) - 1]} strikes` : `${Number(month.slice(5, 7))}月罢工信息`}</h1>
          <button onClick={() => setSheet('month')} className={`mt-2.5 h-[32px] px-3 rounded-full flex items-center gap-1.5 ${TYPE.label}`} style={{ background: C.surface2, color: C.text2 }}>
            <CalendarDots size={15} weight="bold" />{tx(lang, '查看全部日期', 'All dates')}
          </button>
        </div>

        <DateRail tiles={tiles} today={today} selected={selected} lang={lang} onSelect={select} onMonth={setMonth} />

        {/* Tap-to-jump: only when there is more than one card to jump between */}
        {dayCards.length > 1 && jumpModes.length > 0 && (
          <div className="flex justify-center gap-2 px-5 pt-2 pb-1">
            {jumpModes.map(mode => (
              <motion.button key={mode} whileTap={{ scale: 0.95 }} onClick={() => jump(mode)} className={`h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 shrink-0 ${TYPE.label}`} style={{ background: MODE_COLOR[mode].soft, color: MODE_COLOR[mode].main }}>
                <ModeBadge mode={mode} size={18} />{modeName(mode, lang)}
              </motion.button>
            ))}
          </div>
        )}

        <div className="px-4 pt-3">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div key={selected} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.24, ease: EASE }} className="flex flex-col gap-3">
              {dayCards.length ? dayCards.map(card => {
                const prev = neighbour(addDaysIso(selected, -1), card.category);
                const nxt = neighbour(addDaysIso(selected, 1), card.category);
                return <LabStrikeCard key={card.id} card={card} ctx={ctx} highlighted={highlight === card.id}
                  prev={continuesOvernight(prev, card) ? prev : undefined} next={continuesOvernight(card, nxt) ? nxt : undefined} />;
              }) : (
                <section style={{ background: C.surface, borderRadius: R.card }}>
                  <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
                    <CheckCircle size={34} weight="fill" color={C.ok} />
                    <p className={`mt-3 ${TYPE.title}`}>{tx(lang, '无交通罢工', 'No transport strikes')}</p>
                    <p className={`mt-1 ${TYPE.body}`} style={{ color: C.text2 }}>{tx(lang, '安心出行', 'Travel with peace of mind')}</p>
                  </div>
                  {next && (
                    <button onClick={() => select(next)} className="w-full flex items-center gap-2 px-5 h-[52px] text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                      <span className={TYPE.label} style={{ color: C.text3 }}>{tx(lang, '下一次罢工', 'Next strike')}</span>
                      <span className="text-[15px] font-semibold">{dayLabel(next, lang)}</span>
                      <span className="flex gap-1 ml-auto">{[...new Set((byDate.get(next) || []).filter(isActive).map(c => c.category))].map(m => <ModeBadge key={m} mode={m} size={16} />)}</span>
                      <CaretRight size={13} weight="bold" color={C.text3} />
                    </button>
                  )}
                  <div className="px-4 pt-4 pb-4" style={{ borderTop: `1px solid ${C.line}` }}>
                    <p className={`mb-2.5 text-center ${TYPE.label}`} style={{ color: C.text3 }}>{tx(lang, '想确认别的日子、线路或听到的消息？', 'Checking another day, line or rumour?')}</p>
                    <AskField ask={ask} variant="inline" />
                  </div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Tools: one line each says enough */}
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            <Tool icon={<DeviceMobile size={19} weight="fill" />} label={tx(lang, '添加到桌面', 'Home Screen')} onClick={() => setSheet('home')} />
            <Tool icon={<SquaresFour size={19} weight="fill" />} label={tx(lang, '添加小组件', 'Widget')} onClick={() => setSheet('widget')} />
            <Tool icon={<ArrowsClockwise size={19} weight="bold" />} label={tx(lang, '同步日历', 'Calendar')} onClick={() => setSheet('calendar')} />
          </div>

          <section className="mt-3 flex items-center gap-3 px-5 py-4" style={{ background: C.surface, borderRadius: R.card }}>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold">{tx(lang, '支持作者', 'Support the creator')}</p>
              <p className={`mt-0.5 ${TYPE.label} font-normal`} style={{ color: C.text2 }}>{tx(lang, '独立开发不易，如果对你有用请支持一杯奶茶。', 'Built independently. If it helps you, consider buying a bubble tea.')}</p>
            </div>
            <button onClick={() => setSheet('support')} className={`h-[38px] px-3.5 rounded-full shrink-0 active:scale-95 transition-transform ${TYPE.label} font-semibold`} style={TONAL}>
              {tx(lang, '支持一下', 'Support')}
            </button>
          </section>

        </div>
      </div>

      {!calm && <AskField ask={ask} variant="dock" />}
      <AskSheet ask={ask} />
      <MonthSheet open={sheet === 'month'} onClose={() => setSheet(null)} lang={lang} byDate={byDate} from={from} to={to} today={today} selected={selected} onSelect={select} />

      <CitySheet open={sheet === 'city'} onClose={() => setSheet(null)} lang={lang} cities={cities} current={city.tag} status={cityStatus} today={today} />
      <CalendarSheet open={sheet === 'calendar'} onClose={() => setSheet(null)} lang={lang} region={city.tag} cityName={name} />
      <WidgetSheet open={sheet === 'widget'} onClose={() => setSheet(null)} lang={lang} region={city.tag} cityName={city.zh} cityPath={city.path} />
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

function Tool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={onClick} className="h-[76px] flex flex-col items-center justify-center gap-1.5 text-[13px] font-medium whitespace-nowrap" style={{ background: C.surface, borderRadius: 18 }}>
      <span style={{ color: C.text2 }}>{icon}</span>
      {label}
    </motion.button>
  );
}
