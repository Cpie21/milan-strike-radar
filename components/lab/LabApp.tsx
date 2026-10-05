'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowsClockwise, CalendarBlank, CaretDown, CaretRight, CheckCircle, MapPin, SquaresFour } from '@phosphor-icons/react';
import {
  buildRail, continuesOvernight, dayLabel, daysBetween, isActive, modeName, nextEventDate, sortCards, tx,
  type Lang, type Mode, type ModeCard,
} from '../../lib/lab/model';
import { addDaysIso } from '../../lib/romeDate';
import { detectBrowserLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import DateRail from './DateRail';
import LabStrikeCard, { type CardContext } from './LabStrikeCard';
import LabAsk from './LabAsk';
import { CalendarSheet, CitySheet, HomeScreenSheet, SupportSheet, WidgetSheet } from './sheets';
import { ModeGlyph } from './ui';
import { C, EASE, R } from './theme';
import { track } from './track';

type City = { tag: string; zh: string; en: string; path: string };
export type CityStatus = Record<string, { today: Mode[]; next: string | null; nextModes: Mode[] }>;
type SheetName = 'city' | 'calendar' | 'widget' | 'home' | 'support' | null;
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function romeMinutes() {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

export default function LabApp({ city, cities, cards, today, from, to, initialDate, initialMinutes, cityStatus }: {
  city: City; cities: City[]; cards: ModeCard[]; today: string; from: string; to: string; initialDate: string; lastSync: string | null; initialMinutes: number; cityStatus: CityStatus;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('zh');
  const [selected, setSelected] = useState(initialDate);
  const [direction, setDirection] = useState(0);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
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
  const tiles = useMemo(() => buildRail(byDate, from, to, today, selected, unfolded), [byDate, from, to, today, selected, unfolded]);
  const dayCards = sortCards(byDate.get(selected) || []);
  const active = dayCards.filter(isActive);
  const jumpModes = [...new Set(active.map(c => c.category))];
  const next = nextEventDate(byDate, selected);
  const name = lang === 'en' ? city.en : city.zh;

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

  const ctx: CardContext = { today, nowMinutes: now, lang, region: city.tag, cityName: name, sharePath: city.path };
  const neighbour = (iso: string, mode: Mode) => (byDate.get(iso) || []).find(c => c.category === mode);
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 24, filter: reduce ? 'none' : 'blur(6px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -16, filter: reduce ? 'none' : 'blur(4px)' }),
  };

  return (
    <main className="min-h-[100dvh]" style={{ background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      <div className="mx-auto max-w-[520px] pb-[120px]">
        {/* Brand and entry points */}
        <header className="flex items-center gap-2 px-5" style={{ paddingTop: 'max(18px, env(safe-area-inset-top))' }}>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold leading-tight">{tx(lang, '意大利罢工查询', 'Italy Strike Radar')}</p>
            <p className="text-[9.5px] font-bold tracking-[0.12em] mt-0.5" style={{ color: C.text3 }}>DEVELOPED BY 21°C</p>
          </div>
          <button onClick={() => setSheet('home')} className="h-[34px] px-3 rounded-full flex items-center text-[13px] font-semibold active:scale-95 transition-transform" style={{ background: C.surface2 }}>
            {tx(lang, '添加到桌面', 'Add to Home')}
          </button>
          <button onClick={() => setSheet('city')} aria-label={tx(lang, `当前城市 ${name}，切换城市`, `${name}, change city`)} className="h-[34px] pl-2.5 pr-2 rounded-full flex items-center gap-1 text-[13px] font-semibold active:scale-95 transition-transform" style={{ background: C.surface2 }}>
            <MapPin size={14} weight="fill" />{name}<CaretDown size={11} weight="bold" color={C.text3} />
          </button>
        </header>

        <div className="flex items-center justify-between px-5 mt-6 mb-3">
          <h1 className="text-[32px] font-bold tracking-tight tabular-nums">{lang === 'en' ? `${MONTH_EN[Number(month.slice(5, 7)) - 1]} strikes` : `${Number(month.slice(5, 7))}月罢工信息`}</h1>
          <label className="relative h-[34px] px-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold" style={{ background: '#FFFFFF', color: C.ink }}>
            <CalendarBlank size={14} weight="bold" />{tx(lang, '选择日期', 'Pick date')}
            <input type="date" min={from} max={to} value={selected} onChange={e => e.target.value && select(e.target.value)} aria-label={tx(lang, '选择日期', 'Pick date')} className="absolute inset-0 opacity-0" />
          </label>
        </div>

        <DateRail tiles={tiles} today={today} selected={selected} lang={lang} onSelect={select} onUnfold={k => setUnfolded(p => new Set(p).add(k))} onMonth={setMonth} />

        {/* Tap-to-jump: only when there is more than one card to jump between */}
        {dayCards.length > 1 && jumpModes.length > 0 && (
          <div className="flex gap-2 px-5 pt-2 pb-1 overflow-x-auto [scrollbar-width:none]">
            {jumpModes.map(mode => (
              <motion.button key={mode} whileTap={{ scale: 0.95 }} onClick={() => jump(mode)} className="h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1.5 text-[13.5px] font-semibold shrink-0" style={{ background: C.surface, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
                <ModeGlyph mode={mode} size={15} color={C.stop} />{modeName(mode, lang)}
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
                <section style={{ background: C.surface, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
                  <div className="flex flex-col items-center text-center px-6 pt-10 pb-8">
                    <CheckCircle size={34} weight="fill" color={C.ok} />
                    <p className="mt-3 text-[20px] font-bold">{tx(lang, '无交通罢工', 'No transport strikes')}</p>
                    <p className="mt-1 text-[14px]" style={{ color: C.text2 }}>{tx(lang, '安心出行', 'Travel with peace of mind')}</p>
                  </div>
                  {next && (
                    <button onClick={() => select(next)} className="w-full flex items-center gap-2 px-5 h-[52px] text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                      <span className="text-[13.5px]" style={{ color: C.text3 }}>{tx(lang, '下一次罢工', 'Next strike')}</span>
                      <span className="text-[14.5px] font-semibold">{dayLabel(next, lang)}</span>
                      <span className="flex gap-1 ml-auto">{[...new Set((byDate.get(next) || []).filter(isActive).map(c => c.category))].map(m => <ModeGlyph key={m} mode={m} size={15} color={C.stop} />)}</span>
                      <CaretRight size={13} weight="bold" color={C.text3} />
                    </button>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Tools: one line each says enough */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Tool icon={<SquaresFour size={18} weight="fill" />} label={tx(lang, '添加小组件', 'Add widget')} onClick={() => setSheet('widget')} />
            <Tool icon={<ArrowsClockwise size={18} weight="bold" />} label={tx(lang, '同步日历', 'Sync calendar')} onClick={() => setSheet('calendar')} />
          </div>

          <section className="mt-3 flex items-center gap-3 px-5 py-4" style={{ background: C.surface, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold">{tx(lang, '支持作者', 'Support the creator')}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: C.text2 }}>{tx(lang, '独立开发不易，如果对你有用请支持一杯奶茶。', 'Built independently. If it helps you, consider buying a bubble tea.')}</p>
            </div>
            <button onClick={() => setSheet('support')} className="h-[38px] px-3.5 rounded-full text-[13px] font-semibold shrink-0 active:scale-95 transition-transform" style={{ background: '#FFFFFF', color: C.ink }}>
              {tx(lang, '支持一下', 'Support')}
            </button>
          </section>

          <footer className="pt-6 flex justify-center">
            <div className="flex p-1 rounded-full" style={{ background: C.surface }} role="group" aria-label="语言 / Language">
              {(['zh', 'en'] as Lang[]).map(l => (
                <button key={l} onClick={() => changeLang(l)} aria-pressed={lang === l} className="h-8 px-4 rounded-full text-[12.5px] font-semibold transition-colors" style={{ background: lang === l ? C.surface3 : 'transparent', color: lang === l ? C.text : C.text3 }}>
                  {l === 'zh' ? '中文' : 'English'}
                </button>
              ))}
            </div>
          </footer>
        </div>
      </div>

      <LabAsk region={city.tag} lang={lang} today={today} onOpenDate={openDate} />

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
  );
}

function Tool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick} className="h-14 px-3.5 flex items-center gap-2.5 text-[15px] font-semibold whitespace-nowrap" style={{ background: C.surface, borderRadius: 18, boxShadow: `inset 0 0 0 1px ${C.line}` }}>
      <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: C.surface3 }}>{icon}</span>
      {label}
    </motion.button>
  );
}
