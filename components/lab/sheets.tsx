'use client';

import { useEffect, useState } from 'react';
import { ArrowSquareOut, Check, Copy, MagnifyingGlass } from '@phosphor-icons/react';
import { submitFeedback } from '../../app/actions';
import { buildLabWidgetScript } from '../../lib/lab/widgetScript';
import { LedFace } from './Led';
import { MODES, modeName, relativeDay, tx, type Lang, type Mode } from '../../lib/lab/model';
import { Button, ModeBadge, ModeGlyph, Sheet } from './ui';
import { C } from './theme';
import { track } from './track';

type City = { tag: string; zh: string; en: string; path: string };
type Base = { open: boolean; onClose: () => void; lang: Lang };

const PROD_HOST = 'theitalystrike.com';
const isLocal = (host: string) => host.includes('localhost') || /^[0-9.]+(:[0-9]+)?$/.test(host);

// Opening a guide for three seconds counts as "seen", as on the live page.
function useSeen(open: boolean, event: string) {
  useEffect(() => {
    if (!open) return;
    const started = Date.now();
    const timer = setTimeout(() => track(event, { seconds: Math.round((Date.now() - started) / 1000) }), 3000);
    return () => clearTimeout(timer);
  }, [open, event]);
}

function ModeToggles({ value, onChange, lang }: { value: Set<Mode>; onChange: (v: Set<Mode>) => void; lang: Lang }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {MODES.map(mode => {
        const on = value.has(mode);
        return (
          <button key={mode} aria-pressed={on} onClick={() => { const next = new Set(value); if (on) next.delete(mode); else next.add(mode); onChange(next); }}
            className="h-[68px] rounded-[14px] flex flex-col items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors"
            style={{ background: on ? '#FFFFFF' : '#1E2025', color: on ? '#0A0B0D' : C.text2 }}>
            <ModeGlyph mode={mode} size={20} />
            {modeName(mode, lang)}
          </button>
        );
      })}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[13px] font-semibold tabular-nums" style={{ background: '#272A30' }}>{n}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium leading-6">{title}</p>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  );
}

// ── City ───────────────────────────────────────────────────────────────

export function CitySheet({ cities, current, status, today, ...base }: Base & { cities: City[]; current: string; status: Record<string, { today: Mode[]; next: string | null; nextModes: Mode[] }>; today: string }) {
  const [q, setQ] = useState('');
  const list = cities.filter(c => !q || c.zh.includes(q) || c.en.toLowerCase().includes(q.toLowerCase()) || c.tag.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open={base.open} onClose={base.onClose} title={tx(base.lang, '城市', 'Cities')} tall>
      <label className="flex items-center gap-2 h-10 px-3 rounded-[12px] mb-3" style={{ background: '#1E2025' }}>
        <MagnifyingGlass size={16} color={C.text3} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx(base.lang, '搜索城市', 'Search cities')} aria-label={tx(base.lang, '搜索城市', 'Search cities')}
          className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-white/40" />
      </label>
      <div className="flex flex-col gap-2 pb-2">
        {list.map(city => (
          <a key={city.tag} href={`/lab?city=${city.tag}`} className="flex items-center justify-between gap-3 h-[64px] px-4 rounded-[16px] active:scale-[0.99] transition-transform"
            style={{ background: city.tag === current ? '#272A30' : '#1E2025' }}>
            <span>
              <span className="text-[17px] font-semibold">{base.lang === 'en' ? city.en : city.zh}</span>
              <span className="ml-2 text-[13px]" style={{ color: C.text3 }}>{base.lang === 'en' ? city.zh : city.en}</span>
            </span>
            <CityHeadline s={status[city.tag]} today={today} lang={base.lang} current={city.tag === current} />
          </a>
        ))}
        {!list.length && <p className="py-6 text-center text-[14px]" style={{ color: C.text3 }}>{tx(base.lang, '暂不支持这个城市', 'This city isn’t covered yet')}</p>}
      </div>
    </Sheet>
  );
}

function CityHeadline({ s, today, lang, current }: { s?: { today: Mode[]; next: string | null; nextModes: Mode[] }; today: string; lang: Lang; current: boolean }) {
  const glyphs = (modes: Mode[], color?: string) => <span className="flex gap-1" style={{ opacity: color ? 0.55 : 1 }}>{modes.map(m => <ModeBadge key={m} mode={m} size={14} />)}</span>;
  return (
    <span className="flex items-center gap-2 shrink-0 text-[13px] font-semibold tabular-nums">
      {s?.today.length ? <>{glyphs(s.today)}<span style={{ color: C.text }}>{tx(lang, '今天', 'Today')}</span></>
        : s?.next ? <>{glyphs(s.nextModes, C.text2)}<span style={{ color: C.text2 }}>{relativeDay(s.next, today, lang)}</span></>
        : <span style={{ color: C.text3 }}>{tx(lang, '近期无罢工', 'All clear')}</span>}
      {current && <Check size={16} weight="bold" />}
    </span>
  );
}

// ── Calendar ───────────────────────────────────────────────────────────

export function CalendarSheet({ region, cityName, ...base }: Base & { region: string; cityName: string }) {
  const [types, setTypes] = useState<Set<Mode>>(new Set(MODES));
  useSeen(base.open, 'CalendarSync_tutorial_success');
  const subscribe = () => {
    if (!types.size) return;
    const host = isLocal(window.location.host) ? PROD_HOST : window.location.host;
    const param = [...types].map(t => (t === 'AIRPORT' ? 'airport' : t.toLowerCase())).join(',');
    track('calendar_sync_clicked', { region });
    window.location.assign(`webcal://${host}/api/calendar?types=${encodeURIComponent(param)}&region=${encodeURIComponent(region)}`);
  };
  return (
    <Sheet open={base.open} onClose={base.onClose} title={tx(base.lang, '同步到本地日历', 'Sync to calendar')}>
      <p className="text-[14.5px] leading-relaxed mb-4" style={{ color: C.text2 }}>
        {tx(base.lang, `把${cityName}的罢工加入手机日历。新公布、改期或取消的罢工会自动同步，不用再回来查。`, `Add ${cityName} strikes to your calendar. New, moved or cancelled strikes update automatically.`)}
      </p>
      <p className="text-[13px] mb-2" style={{ color: C.text3 }}>{tx(base.lang, '同步哪些交通', 'Which transport')}</p>
      <ModeToggles value={types} onChange={setTypes} lang={base.lang} />
      <div className="mt-5">
        <Button className="w-full" onClick={subscribe}>{types.size ? tx(base.lang, '添加到日历', 'Add to Calendar') : tx(base.lang, '至少选择一种交通', 'Choose at least one')}</Button>
      </div>
      <p className="mt-3 text-[12.5px] text-center" style={{ color: C.text3 }}>{tx(base.lang, 'iPhone 和 Mac 会弹出订阅确认；安卓可在 Google 日历中通过网址添加。', 'iPhone and Mac ask to confirm; on Android, add the URL in Google Calendar.')}</p>
    </Sheet>
  );
}

// ── Widget ─────────────────────────────────────────────────────────────

export function WidgetSheet({ region, cityName, cityPath, ...base }: Base & { region: string; cityName: string; cityPath: string }) {
  const [types, setTypes] = useState<Set<Mode>>(new Set(MODES));
  const [copied, setCopied] = useState(false);
  useSeen(base.open, 'Widgets_tutorial_success');
  const copy = async () => {
    const origin = isLocal(window.location.host) ? `https://${PROD_HOST}` : window.location.origin;
    const code = buildLabWidgetScript({ origin, region, types: [...types], cityName, path: cityPath, lang: base.lang });
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Sheet open={base.open} onClose={base.onClose} title={tx(base.lang, `添加桌面小组件 · ${cityName}`, `Add home widget · ${cityName}`)}>
      <p className="text-[14.5px] leading-relaxed mb-1" style={{ color: C.text2 }}>
        {tx(base.lang, `在桌面上直接看到${cityName}今天和最近的罢工。借助免费的 Scriptable 实现，只需设置一次。`, `See ${cityName} strikes on your Home Screen, via the free Scriptable app. Set it up once.`)}
      </p>
      <WidgetPreview lang={base.lang} cityName={cityName} />
      <Step n={1} title={tx(base.lang, '选择要显示的交通', 'Choose transport')}><ModeToggles value={types} onChange={setTypes} lang={base.lang} /></Step>
      <Step n={2} title={tx(base.lang, '复制代码，并安装 Scriptable', 'Copy the code and get Scriptable')}>
        <div className="flex gap-2">
          <button onClick={copy} disabled={!types.size} className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-1.5 text-[14.5px] font-semibold disabled:opacity-40" style={{ background: '#454A54', color: '#FFFFFF' }}>
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}{copied ? tx(base.lang, '已复制', 'Copied') : tx(base.lang, '复制代码', 'Copy code')}
          </button>
          <a href="https://apps.apple.com/us/app/scriptable/id1405459188" target="_blank" rel="noreferrer" className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-1.5 text-[14.5px] font-semibold" style={{ background: '#272A30' }}>
            Scriptable<ArrowSquareOut size={14} />
          </a>
        </div>
      </Step>
      <Step n={3} title={tx(base.lang, '在 Scriptable 右上角点 +，粘贴代码', 'In Scriptable, tap + and paste')}><Shot src="/assets/widget-step-1.png" /></Step>
      <Step n={4} title={tx(base.lang, '回到桌面，添加 Scriptable 小组件', 'Add a Scriptable widget to your Home Screen')}><Shot src="/assets/widget-step-2.png" /></Step>
      <Step n={5} title={tx(base.lang, '长按小组件，选择刚才的脚本', 'Long-press it and pick the script')}><Shot src="/assets/widget-step-3.png" /></Step>
    </Sheet>
  );
}

// What the widget looks like, calm and on a strike day: the same face.
function WidgetPreview({ lang, cityName }: { lang: Lang; cityName: string }) {
  const [strike, setStrike] = useState(false);
  const row = (mode: Mode, hours: string, dot: string) => (
    <div className="flex items-center gap-2">
      <ModeBadge mode={mode} size={22} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight">{modeName(mode, lang)}<i className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} /></p>
        <p className="text-[11.5px] leading-tight line-clamp-2" style={{ color: C.text2 }}>{hours}</p>
      </div>
    </div>
  );
  return (
    <div className="mt-3 mb-1 flex flex-col items-center gap-3">
      <div className="w-full max-w-[340px] aspect-[2.12/1] rounded-[22px] p-4 flex gap-3 overflow-hidden" style={{ background: strike ? 'linear-gradient(180deg, rgba(255,90,78,0.22), #0E0F12 60%)' : 'linear-gradient(180deg, #16181D, #0E0F12 60%)', boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 14px 30px rgba(0,0,0,0.45)' }}>
        <div className="w-[112px] shrink-0 flex flex-col">
          <LedFace mood={strike ? 'alert' : 'idle'} size={13} flat />
          <p className="mt-2 text-[16px] font-bold leading-tight">{strike ? tx(lang, '今天 2 项罢工', '2 strikes today') : tx(lang, '今日无罢工', 'No strikes today')}</p>
          <p className="text-[11.5px]" style={{ color: C.text3 }}>{strike ? cityName : `${cityName} · ${tx(lang, '安心出行', 'All clear')}`}</p>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2.5 justify-start">
          {strike ? <>
            {row('SUBWAY', tx(lang, '08:45–15:00 · 18:00–运营结束', '08:45–15:00 · 18:00–end of service'), C.stop)}
            {row('BUS', tx(lang, '08:45–15:00 · 18:00–运营结束', '08:45–15:00 · 18:00–end of service'), C.stop)}
          </> : (
            <div className="rounded-[14px] px-3 py-2.5" style={{ background: '#1A1C21' }}>
              <p className="text-[11px]" style={{ color: C.text3 }}>{tx(lang, '下一次', 'Next')}</p>
              <p className="text-[14.5px] font-semibold">{tx(lang, '10月9日 周五', 'Fri 9 Oct')}</p>
              <p className="mt-1.5 flex items-center gap-1 text-[11.5px]" style={{ color: C.text2 }}><ModeBadge mode="SUBWAY" size={18} /><ModeBadge mode="BUS" size={18} /><span className="ml-1">{tx(lang, '4 天后', 'In 4 days')}</span></p>
            </div>
          )}
        </div>
      </div>
      <div className="flex p-[3px] rounded-full" style={{ background: C.surface2 }}>
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => setStrike(v)} className="h-7 px-3 rounded-full text-[12.5px] font-semibold" style={{ background: strike === v ? C.surface3 : 'transparent', color: strike === v ? C.text : C.text3 }}>
            {v ? tx(lang, '罢工日', 'Strike day') : tx(lang, '平日', 'Calm day')}
          </button>
        ))}
      </div>
    </div>
  );
}

function Shot({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="w-full max-w-[260px] rounded-[14px]" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }} />;
}

// ── Add to Home Screen ─────────────────────────────────────────────────

function useIsSafari() {
  const [safari, setSafari] = useState(true);
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const thirdParty = /CriOS|FxiOS|EdgiOS|OPiOS|mercury|DuckDuckGo|Brave|Arc/i.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const macSafari = /Macintosh/.test(ua) && /Version\/[\d.]+.*Safari/.test(ua) && !/Chrome|Arc|Edg|Chromium/i.test(ua);
    const id = setTimeout(() => setSafari(standalone || macSafari || (ios && !thirdParty && /Version/.test(ua))), 0);
    return () => clearTimeout(id);
  }, []);
  return safari;
}

export function HomeScreenSheet(base: Base) {
  const safari = useIsSafari();
  const [copied, setCopied] = useState(false);
  useSeen(base.open, 'AppToDesktop_tutorial_success');
  return (
    <Sheet open={base.open} onClose={base.onClose} title={tx(base.lang, '添加网站到桌面', 'Add website to Home Screen')}>
      <p className="text-[14.5px] leading-relaxed mb-1" style={{ color: C.text2 }}>{tx(base.lang, '像 App 一样从桌面一键打开，不用每次搜索。', 'Open it from your Home Screen like an app.')}</p>
      {!safari && (
        <div className="my-3 rounded-[14px] p-3.5" style={{ background: 'rgba(245,181,68,0.13)' }}>
          <p className="text-[14px] font-medium" style={{ color: C.pend }}>{tx(base.lang, '需要在 Safari 中操作', 'This works in Safari')}</p>
          <button onClick={async () => { await navigator.clipboard?.writeText(window.location.href.replace('/lab', '')); setCopied(true); }} className="mt-2 h-9 px-3 rounded-[10px] text-[13.5px] font-semibold flex items-center gap-1.5" style={{ background: '#272A30' }}>
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}{copied ? tx(base.lang, '已复制，去 Safari 粘贴', 'Copied — paste in Safari') : tx(base.lang, '复制链接', 'Copy link')}
          </button>
        </div>
      )}
      <Step n={1} title={tx(base.lang, '点击底部的分享按钮', 'Tap Share')}><Shot src="/assets/tutorial-step-1.png" /></Step>
      <Step n={2} title={tx(base.lang, '向上滑，展开更多选项', 'Scroll for more options')}><Shot src="/assets/tutorial-step-2.png" /></Step>
      <Step n={3} title={tx(base.lang, '选择“添加到主屏幕”', 'Choose “Add to Home Screen”')}><Shot src="/assets/tutorial-step-3.png" /></Step>
      <Step n={4} title={tx(base.lang, '点右上角“添加”', 'Tap Add')}><Shot src="/assets/tutorial-step-4.png" /></Step>
    </Sheet>
  );
}

// ── Support and feedback ───────────────────────────────────────────────

export function SupportSheet(base: Base) {
  const [cups, setCups] = useState(1);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const send = async () => {
    if (!text.trim()) { setState('error'); setError(tx(base.lang, '先写点内容', 'Write something first')); return; }
    setState('sending');
    const res = await submitFeedback(text, name);
    if (res.success) { setState('sent'); setText(''); }
    else { setState('error'); setError(res.error || tx(base.lang, '提交失败，请稍后再试', 'Couldn’t send. Try again later.')); }
  };
  return (
    <Sheet open={base.open} onClose={base.onClose} title={tx(base.lang, '支持与反馈', 'Support & feedback')} tall>
      <p className="text-[14.5px] leading-relaxed" style={{ color: C.text2 }}>{tx(base.lang, '感谢您愿意点进这个界面！独立开发不易，如果对你有用请支持一杯奶茶。', 'Thanks for opening this panel! If the tool helps you, consider buying a bubble tea.')}</p>
      <div className="mt-4 rounded-[18px] p-4" style={{ background: '#1E2025' }}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">{tx(base.lang, '奶茶 · 每杯 2€', 'Drinks · 2€ each')}</span>
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: '#1E2025' }}>
            {[1, 2, 3, 5].map(n => (
              <button key={n} aria-pressed={cups === n} onClick={() => setCups(n)} className="w-9 h-8 rounded-full text-[14px] font-semibold tabular-nums transition-colors" style={{ background: cups === n ? '#FFFFFF' : 'transparent', color: cups === n ? '#0A0B0D' : C.text2 }}>{n}</button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Button className="w-full" href="https://revolut.me/cpie21" onClick={() => track('donate_coffee_clicked', { payment_method: 'Revolut', amount: cups * 2 })}>
            {tx(base.lang, `点击支持开发者 ${cups * 2}€`, `Support the developer ${cups * 2}€`)}
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/wechat-qr-round.png" alt={tx(base.lang, '微信赞赏码', 'WeChat appreciation code')} className="w-[84px] h-[84px] rounded-full" />
          <p className="text-[13.5px] leading-snug" style={{ color: C.text2 }}>{tx(base.lang, '或者扫描微信赞赏码', 'Or scan the WeChat appreciation code')}</p>
        </div>
      </div>

      <h3 className="mt-6 mb-2 text-[15px] font-semibold">{tx(base.lang, '可以来点建议', 'Suggestions are welcome')}</h3>
            <input value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder={tx(base.lang, '您的昵称是', 'Your nickname')} aria-label={tx(base.lang, '昵称', 'Name')}
        className="w-full h-11 px-3 rounded-[12px] bg-transparent outline-none text-[15px] placeholder:text-white/40" style={{ background: '#1E2025' }} />
      <textarea value={text} onChange={e => { setText(e.target.value.slice(0, 1000)); if (state === 'error') setState('idle'); }} rows={4} placeholder={tx(base.lang, '说点什么吗', 'Anything to share?')} aria-label={tx(base.lang, '反馈内容', 'Feedback')}
        className="mt-2 w-full p-3 rounded-[12px] bg-transparent outline-none text-[15px] leading-relaxed resize-none placeholder:text-white/40" style={{ background: '#1E2025' }} />
      {state === 'error' && <p className="mt-1 text-[13px]" style={{ color: C.stop }}>{error}</p>}
      {state === 'sent' && <p className="mt-1 text-[13px]" style={{ color: C.ok }}>{tx(base.lang, '收到了，谢谢你。', 'Got it — thank you.')}</p>}
      <div className="mt-3"><Button className="w-full" tone="quiet" onClick={send}>{state === 'sending' ? tx(base.lang, '发送中…', 'Sending…') : tx(base.lang, '发送反馈', 'Send feedback')}</Button></div>

      <a href="https://xhslink.com/m/6T4mEqx0B1s" target="_blank" rel="noreferrer" className="mt-5 mb-2 flex items-center justify-between h-12 px-4 rounded-[14px]" style={{ background: '#1E2025' }}>
        <span className="text-[15px] font-medium">{tx(base.lang, '或者点个关注 · 小红书', 'Or follow along · Xiaohongshu')}</span>
        <ArrowSquareOut size={15} color={C.text2} />
      </a>
    </Sheet>
  );
}
