'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDots, CalendarPlus, CaretDown, DeviceMobile, Heart, SquaresFour } from '@phosphor-icons/react';
import {
  buildRail, dayLabel, daysBetween, isActive, modeName, nextEventDate, skyFor, sortCards, statusLine, tx,
  type Lang, type Mode, type ModeCard,
} from '../../lib/lab/model';
import { detectBrowserLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import DateRail from './DateRail';
import DayBoard, { type BoardContext } from './DayBoard';
import LabAsk from './LabAsk';
import { CalendarSheet, CitySheet, HomeScreenSheet, SupportSheet, WidgetSheet } from './sheets';
import { Card, CardHeader, Hairline } from './ui';
import { C, EASE, SKY, glass } from './theme';
import { track } from './track';

type City = { tag: string; zh: string; en: string; path: string };
export type CityStatus = Record<string, { today: Mode[]; next: string | null; nextModes: Mode[] }>;
type SheetName = 'city' | 'calendar' | 'widget' | 'home' | 'support' | null;

function romeMinutes() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

export default function LabApp({ city, cities, cards, today, from, to, initialDate, lastSync, initialMinutes, cityStatus }: {
  city: City; cities: City[]; cards: ModeCard[]; today: string; from: string; to: string; initialDate: string; lastSync: string | null; initialMinutes: number; cityStatus: CityStatus;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('zh');
  const [selected, setSelected] = useState(initialDate);
  const [direction, setDirection] = useState(0);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(initialMinutes);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [compact, setCompact] = useState(false);
  const [wechat, setWechat] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, ModeCard[]>();
    cards.forEach(c => map.set(c.date, [...(map.get(c.date) || []), c]));
    return map;
  }, [cards]);
  const tiles = useMemo(() => buildRail(byDate, from, to, today, selected, unfolded), [byDate, from, to, today, selected, unfolded]);
  const sky = SKY[skyFor(byDate.get(selected) || [], now)];
  const name = lang === 'en' ? city.en : city.zh;

  // Client-only facts: Rome clock, language, WeChat, scroll position.
  useEffect(() => {
    const tick = () => setNow(romeMinutes());
    const first = setTimeout(() => {
      tick();
      try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        setLang(stored === 'en' || stored === 'zh' ? stored : detectBrowserLanguage());
      } catch { /* storage blocked */ }
      if (/MicroMessenger/i.test(navigator.userAgent)) { setWechat(true); track('wechat_jump_success'); }
      // Deep links land on the day, not on the hero.
      if (initialDate !== today) railRef.current?.scrollIntoView({ block: 'start' });
    }, 0);
    const timer = setInterval(tick, 60_000);
    const onScroll = () => setCompact(window.scrollY > 190);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener('scroll', onScroll); };
  }, [initialDate, today]);

  const select = (date: string) => {
    setDirection(Math.sign(daysBetween(selected, date)));
    setSelected(date);
    window.history.replaceState(null, '', `/lab?city=${city.tag}&date=${date}`);
  };
  const openDate = (date: string, path: string) => {
    if (path === city.path) { select(date); railRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
    else router.push(`/lab?city=${cities.find(c => c.path === path)?.tag ?? city.tag}&date=${date}`);
  };
  const changeLang = (next: Lang) => {
    setLang(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  // ── Hero (Apple Weather): label, city, one huge thin figure, a line ──
  const todayCards = sortCards(byDate.get(today) || []).filter(isActive);
  const next = nextEventDate(byDate, today);
  const hero = (() => {
    if (todayCards.length) {
      const first = statusLine(todayCards[0], today, now, lang);
      const modes = [...new Set(todayCards.map(c => modeName(c.category, lang)))].join(' · ');
      const live = first.text.startsWith(tx(lang, '停运中', 'Stopped'));
      return { big: live ? tx(lang, '停运中', 'Stopped') : tx(lang, '今天', 'Today'), unit: '', line: `${modes} · ${first.text.replace(tx(lang, '停运中 · ', 'Stopped · '), '')}`, tone: C.stop };
    }
    if (next) {
      const modes = [...new Set((byDate.get(next) || []).filter(isActive).map(c => modeName(c.category, lang)))].join(' · ');
      return { big: String(daysBetween(today, next)), unit: tx(lang, '天后', 'days'), line: tx(lang, `下次罢工 · ${dayLabel(next, lang)} · ${modes}`, `Next strike · ${dayLabel(next, lang)} · ${modes}`), tone: C.text };
    }
    return { big: tx(lang, '平静', 'Clear'), unit: '', line: tx(lang, '近期没有已公布的罢工', 'No strikes announced'), tone: C.text };
  })();

  const ctx: BoardContext = { today, nowMinutes: now, lang, region: city.tag, cityName: name, sharePath: city.path, lastSync };
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 18, filter: reduce ? 'none' : 'blur(8px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -12, filter: reduce ? 'none' : 'blur(6px)' }),
  };

  return (
    <main className="relative min-h-[100dvh] text-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      {/* The sky: state of the selected day + Rome's time of day. */}
      <AnimatePresence initial={false}>
        <motion.div key={sky.base} aria-hidden className="fixed inset-0 -z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE }}
          style={{ backgroundImage: `${sky.glow}, ${sky.base}` }} />
      </AnimatePresence>

      {/* Compact header once the hero scrolls away, as Weather does. */}
      <AnimatePresence>
        {compact && (
          <motion.div className="fixed top-0 inset-x-0 z-[60] flex justify-center" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: EASE }}
            style={{ ...glass(sky.card), paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: 10, borderRadius: 0 }}>
            <span className="text-[15px] font-semibold">{name}</span>
            <span className="mx-2" style={{ color: C.text3 }}>|</span>
            <span className="text-[15px] tabular-nums" style={{ color: C.text2 }}>{hero.big}{hero.unit && ` ${hero.unit}`}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-[520px] px-4 pb-[120px]">
        <header className="pt-[max(56px,calc(env(safe-area-inset-top)+36px))] pb-8 text-center">
          <p className="text-[12px] font-semibold tracking-[0.06em]" style={{ color: C.text2 }}>{tx(lang, `今天 · ${dayLabel(today, lang)}`, `Today · ${dayLabel(today, lang)}`)}</p>
          <button onClick={() => setSheet('city')} className="mt-1 inline-flex items-center gap-1 text-[34px] leading-tight" aria-label={tx(lang, `${name}，切换城市`, `${name}, change city`)}>
            {name}<CaretDown size={16} weight="bold" color={C.text2} className="mt-1.5" />
          </button>
          <motion.p key={hero.big} initial={{ opacity: 0, filter: reduce ? 'none' : 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 0.5, ease: EASE }}
            className="mt-1 leading-none tabular-nums" style={{ fontWeight: 200, color: hero.tone }}>
            <span className="text-[92px] tracking-[-0.04em]">{hero.big}</span>
            {hero.unit && <span className="text-[28px] font-light ml-1">{hero.unit}</span>}
          </motion.p>
          <p className="mt-2 text-[17px] font-medium px-6 leading-snug">{hero.line}</p>
        </header>

        <div className="flex flex-col gap-3">
          <div ref={railRef} className="scroll-mt-14">
            <Card tint={sky.card}>
              <CardHeader icon={<CalendarDots size={14} weight="bold" />} label={tx(lang, '罢工日历', 'Strike calendar')}
                trailing={
                  <label className="relative h-7 px-2.5 rounded-full flex items-center gap-1 text-[12.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.14)', color: C.text }}>
                    {tx(lang, '选日期', 'Pick date')}
                    <input type="date" min={from} max={to} value={selected} onChange={e => e.target.value && select(e.target.value)} aria-label={tx(lang, '选择日期', 'Pick a date')} className="absolute inset-0 opacity-0" />
                  </label>
                } />
              <DateRail tiles={tiles} today={today} selected={selected} lang={lang} onSelect={select} onUnfold={key => setUnfolded(prev => new Set(prev).add(key))} />
            </Card>
          </div>

          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div key={selected} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.26, ease: EASE }}>
              <DayBoard date={selected} byDate={byDate} ctx={ctx} tint={sky.card} onSelect={select} />
            </motion.div>
          </AnimatePresence>

          {/* Apple Weather's small square modules: one job each. */}
          <div className="grid grid-cols-2 gap-3">
            <Tool tint={sky.card} icon={<SquaresFour size={14} weight="bold" />} label={tx(lang, '桌面小组件', 'Widget')} title={tx(lang, '桌面看罢工', 'On your Home Screen')} note={tx(lang, '一次设置，常驻桌面', 'Set it up once')} onClick={() => setSheet('widget')} />
            <Tool tint={sky.card} icon={<CalendarPlus size={14} weight="bold" />} label={tx(lang, '订阅日历', 'Calendar')} title={tx(lang, '自动同步', 'Stays in sync')} note={tx(lang, '罢工出现在你的日历里', 'Strikes in your calendar')} onClick={() => setSheet('calendar')} />
            <Tool tint={sky.card} icon={<DeviceMobile size={14} weight="bold" />} label={tx(lang, '主屏幕', 'Home Screen')} title={tx(lang, '像 App 一样', 'Like an app')} note={tx(lang, '从桌面一键打开', 'Open in one tap')} onClick={() => setSheet('home')} />
            <Tool tint={sky.card} icon={<Heart size={14} weight="bold" />} label={tx(lang, '支持与反馈', 'Support')} title={tx(lang, '请杯奶茶', 'Buy a drink')} note={tx(lang, '也欢迎反馈问题', 'Or send feedback')} onClick={() => setSheet('support')} />
          </div>

          <footer className="pt-4 pb-2 flex flex-col items-center gap-3">
            <div className="flex items-center p-1 rounded-full" style={glass(sky.card)} role="group" aria-label={tx(lang, '语言', 'Language')}>
              {(['zh', 'en'] as Lang[]).map(l => (
                <button key={l} onClick={() => changeLang(l)} aria-pressed={lang === l} className="h-8 px-4 rounded-full text-[13px] font-semibold transition-colors" style={{ background: lang === l ? '#FFFFFF' : 'transparent', color: lang === l ? '#0E1A2E' : C.text2 }}>
                  {l === 'zh' ? '中文' : 'English'}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-center leading-relaxed px-6" style={{ color: C.text3 }}>
              {tx(lang, '数据来自意大利交通部（MIT）与运营商公告，出行前请以运营商最新通知为准。Developed by 21°C', 'Data from the Italian Ministry of Transport (MIT) and operators. Check operator notices before you travel. Developed by 21°C')}
            </p>
          </footer>
        </div>
      </div>

      <LabAsk region={city.tag} tint={sky.tint} lang={lang} today={today} onOpenDate={openDate} onOpenCities={() => setSheet('city')} />

      <CitySheet open={sheet === 'city'} onClose={() => setSheet(null)} tint={sky.tint} lang={lang} cities={cities} current={city.tag} status={cityStatus} today={today} />
      <CalendarSheet open={sheet === 'calendar'} onClose={() => setSheet(null)} tint={sky.tint} lang={lang} region={city.tag} cityName={name} />
      <WidgetSheet open={sheet === 'widget'} onClose={() => setSheet(null)} tint={sky.tint} lang={lang} region={city.tag} cityName={city.zh} cityPath={city.path} />
      <HomeScreenSheet open={sheet === 'home'} onClose={() => setSheet(null)} tint={sky.tint} lang={lang} />
      <SupportSheet open={sheet === 'support'} onClose={() => setSheet(null)} tint={sky.tint} lang={lang} />

      <AnimatePresence>
        {wechat && (
          <motion.div className="fixed inset-0 z-[120] flex flex-col items-end px-6 pt-6" style={{ background: 'rgba(5,10,20,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWechat(false)}>
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden><path d="M12 64 C 30 50, 48 34, 60 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" /><path d="M48 12 L 61 10 L 63 23" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="mt-4 self-center text-center max-w-[300px]">
              <p className="text-[22px] font-semibold">{tx(lang, '在浏览器中打开', 'Open in your browser')}</p>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: C.text2 }}>{tx(lang, '点右上角 ···，选择“在默认浏览器中打开”，才能添加到主屏幕和订阅日历。', 'Tap ··· at the top right and choose “Open in browser” to add it to your Home Screen and subscribe.')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function Tool({ tint, icon, label, title, note, onClick }: { tint: string; icon: React.ReactNode; label: string; title: string; note: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick} className="text-left rounded-[22px] aspect-[1/0.86] flex flex-col" style={glass(tint)}>
      <CardHeader icon={icon} label={label} />
      <Hairline />
      <span className="px-4 pt-3 text-[21px] font-semibold leading-tight">{title}</span>
      <span className="px-4 pb-3.5 mt-auto text-[13px] leading-snug" style={{ color: C.text2 }}>{note}</span>
    </motion.button>
  );
}
