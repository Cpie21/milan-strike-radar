'use client';

import { useEffect, useRef, useState } from 'react';

// ── Figma asset URLs ──────────────────────────────────────────



const imgEllipse13 = '/assets/imgEllipse13.svg';
const imgVector = '/assets/imgVector.svg';
const imgContainer = '/assets/imgContainer.svg';
const imgContainer1 = '/assets/imgContainer1.svg';
const imgContainer2 = '/assets/imgContainer2.svg';
const imgContainer3 = '/assets/imgContainer3.svg';
const imgGroup30 = '/assets/imgGroup30.svg';
const imgContainer4 = '/assets/imgContainer4.svg';
const imgVector1 = '/assets/imgVector1.svg';
const imgVectorStroke = '/assets/imgVectorStroke.svg';
const imgContainer5 = '/assets/imgContainer5.svg';
const imgContainer6 = '/assets/imgContainer6.svg';
const imgContainer7 = '/assets/imgContainer7.svg';
const imgContainer8 = '/assets/imgContainer8.svg';
const imgLine1 = '/assets/imgLine1.svg';
const imgEllipse15 = '/assets/imgEllipse15.svg';
const imgVector2 = '/assets/imgVector2.svg';
const imgFrame32 = '/assets/imgFrame32.svg';
const imgContainer9 = '/assets/imgContainer9.svg';
const imgFrame34 = '/assets/imgFrame34.svg';
const imgContainer10 = '/assets/imgContainer10.svg';
const imgGroup = '/assets/imgGroup.svg';
const imgFrame100 = '/assets/imgFrame100.svg';
const imgContainer11 = '/assets/imgContainer11.svg';


// SVG radial gradient for the active compact card (Figma exact)
const cardBg = `url('data:image/svg+xml;utf8,<svg viewBox="0 0 366 168" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect x="0" y="0" height="100%" width="100%" fill="url(%23grad)" opacity="0.5"/><defs><radialGradient id="grad" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="10" gradientTransform="matrix(12.189 16.8 -36.6 20.226 244.11 -0.000001029)"><stop stop-color="rgba(251,251,251,1)" offset="0.81751"/><stop stop-color="rgba(252,211,212,1)" offset="0.86313"/><stop stop-color="rgba(253,171,173,1)" offset="0.90875"/><stop stop-color="rgba(254,130,134,1)" offset="0.95438"/><stop stop-color="rgba(255,90,95,1)" offset="1"/></radialGradient></defs></svg>'), linear-gradient(90deg, rgb(255,255,255) 0%, rgb(255,255,255) 100%)`;

export default function StrikeApp({ initialStrikes }: { initialStrikes: any[] }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const formatT = (d: Date) =>
    [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');

  const [filters, setFilters] = useState<Record<string, boolean>>({
    '火车': true, '地铁': true, '公交': false, '机场': true,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const [activeStrikeId, setActiveStrikeId] = useState<number | null>(null);


  // ── Infinite-scroll date picker ─────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const CN_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const CN_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const currentYear = today.getFullYear();

  const makeDays = (startOffset: number, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + startOffset + i);
      return d;
    });

  // days[0] = earliest; days[days.length-1] = today+90 (3 months future boundary)
  const [days, setDays] = useState<Date[]>(() => makeDays(-30, 120));
  const earliestOffset = useRef(-30); // tracks how far into the past we've loaded

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [visibleMonth, setVisibleMonth] = useState<{ month: number; year: number }>({
    month: today.getMonth(),
    year: today.getFullYear(),
  });

  const dateListRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMore = useRef(false);

  // Scroll today to left edge on mount
  useEffect(() => {
    const container = dateListRef.current;
    const todayEl = todayRef.current;
    if (container && todayEl) {
      // scroll so today is at the very left of the visible area
      container.scrollLeft = todayEl.offsetLeft - 20; // 20px = left padding
    }
  }, []);

  // Infinite left-load via IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = dateListRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore.current) {
          // Hard boundary: don't load earlier than Sep 1 2025
          const boundary = new Date(2025, 8, 1); // Sep 1 2025 (month is 0-indexed)
          const earliest = days[0];
          if (earliest <= boundary) return;

          isLoadingMore.current = true;
          const prevScrollWidth = container.scrollWidth;
          const prevScrollLeft = container.scrollLeft;
          earliestOffset.current -= 30;
          const newDays = makeDays(earliestOffset.current, 30);
          setDays(prev => [...newDays, ...prev]);
          // After DOM update, compensate scroll position to prevent jump
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const delta = container.scrollWidth - prevScrollWidth;
              container.scrollLeft = prevScrollLeft + delta;
              isLoadingMore.current = false;
            });
          });
        }
      },
      { root: container, rootMargin: '0px 0px 0px 100px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Track visible month as user scrolls
  const handleDateScroll = () => {
    const container = dateListRef.current;
    if (!container) return;
    // find the day cell nearest to left edge of viewport
    const containerLeft = container.getBoundingClientRect().left;
    const children = Array.from(container.children).slice(1); // skip sentinel
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (rect.right > containerLeft) {
        // find the data-date attribute
        const dateStr = (child as HTMLElement).dataset.date;
        if (dateStr) {
          const d = new Date(dateStr);
          setVisibleMonth({ month: d.getMonth(), year: d.getFullYear() });
        }
        break;
      }
    }
  };


  const toggleFilter = (key: string) => setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const filterKeys = ['火车', '地铁', '公交', '机场'];

  const renderFilterIcon = (key: string, selected: boolean) => {
    const c = selected ? 'white' : 'black';
    const Slash = ({ x }: { x: number }) => selected ? (
      <rect width="14.2858" height="1.70069"
        transform={`matrix(0.55545 -0.83155 0.55545 0.83155 ${x} 11.8794)`}
        fill="#FF5A5F" />
    ) : null;
    if (key === '火车') return (
      <svg viewBox="0 0 9.35156 13.2936" fill="none" className="block w-[9px] h-[11px]" overflow="visible">
        <path d="M4.67578 0.648926C2.35156 0.648926 0 0.922364 0 2.97314V8.52393C0 9.64502 0.929688 10.5474 2.05078 10.5474L1.36719 11.231C1.20312 11.395 1.33984 11.7231 1.58594 11.7231H2.21484C2.29688 11.7231 2.37891 11.6958 2.43359 11.6411L3.5 10.5474H5.85156L6.91797 11.6411C6.97266 11.6958 7.05469 11.7231 7.13672 11.7231H7.76562C8.01172 11.7231 8.14844 11.395 7.95703 11.231L7.30078 10.5474C8.42188 10.5474 9.35156 9.64502 9.35156 8.52393V2.97314C9.35156 0.922364 7 0.648926 4.67578 0.648926ZM2.05078 9.39893C1.55859 9.39893 1.17578 8.98877 1.17578 8.52393C1.17578 8.03174 1.55859 7.64893 2.05078 7.64893C2.54297 7.64893 2.92578 8.03174 2.92578 8.52393C2.92578 8.98877 2.54297 9.39893 2.05078 9.39893ZM4.10156 5.29736H1.17578V2.97314H4.10156V5.29736ZM7.30078 9.39893C6.80859 9.39893 6.42578 8.98877 6.42578 8.52393C6.42578 8.03174 6.80859 7.64893 7.30078 7.64893C7.79297 7.64893 8.17578 8.03174 8.17578 8.52393C8.17578 8.98877 7.79297 9.39893 7.30078 9.39893ZM8.17578 5.29736H5.25V2.97314H8.17578V5.29736Z" fill={c} />
        <Slash x={0.233887} />
      </svg>
    );
    if (key === '地铁') return (
      <svg viewBox="0 0 9.46924 13.2936" fill="none" className="block w-[9px] h-[11px]" overflow="visible">
        <path d="M4.79346 0.648926C2.22314 0.648926 0.117676 0.922364 0.117676 2.97314V8.52393C0.117676 9.64502 1.04736 10.5474 2.16846 10.5474L1.48486 11.231C1.3208 11.395 1.45752 11.7231 1.70361 11.7231H7.8833C8.15674 11.7231 8.26611 11.395 8.10205 11.231L7.41846 10.5474C8.53955 10.5474 9.46924 9.64502 9.46924 8.52393V2.97314C9.46924 0.922364 7.36377 0.648926 4.79346 0.648926ZM2.16846 9.39893C1.67627 9.39893 1.29346 8.98877 1.29346 8.52393C1.29346 8.03174 1.67627 7.64893 2.16846 7.64893C2.66064 7.64893 3.04346 8.03174 3.04346 8.52393C3.04346 8.98877 2.66064 9.39893 2.16846 9.39893ZM4.21924 5.89893H1.29346V2.97314H4.21924V5.89893ZM7.41846 9.39893C6.92627 9.39893 6.54346 8.98877 6.54346 8.52393C6.54346 8.03174 6.92627 7.64893 7.41846 7.64893C7.91064 7.64893 8.29346 8.03174 8.29346 8.52393C8.29346 8.98877 7.91064 9.39893 7.41846 9.39893ZM8.29346 5.89893H5.36768V2.97314H8.29346V5.89893Z" fill={c} />
        <Slash x={0} />
      </svg>
    );
    if (key === '公交') return (
      <svg viewBox="0 0 9.35156 11.0742" fill="none" className="block w-[9px] h-[11px]">
        <path d="M0 8.14844C0 8.66797 0.246094 9.13281 0.601562 9.46094V10.1992C0.601562 10.6914 0.984375 11.0742 1.47656 11.0742C1.94141 11.0742 2.35156 10.6914 2.35156 10.1992V9.89844H7V10.1992C7 10.6641 7.41016 11.0742 7.875 11.0742C8.36719 11.0742 8.75 10.6914 8.75 10.1992V9.46094C9.10547 9.13281 9.35156 8.66797 9.35156 8.14844V2.32422C9.35156 0.273438 7.24609 0 4.67578 0C2.10547 0 0 0.273438 0 2.32422V8.14844ZM2.05078 8.75C1.55859 8.75 1.17578 8.33984 1.17578 7.875C1.17578 7.38281 1.55859 7 2.05078 7C2.54297 7 2.92578 7.38281 2.92578 7.875C2.92578 8.33984 2.54297 8.75 2.05078 8.75ZM7.30078 8.75C6.80859 8.75 6.42578 8.33984 6.42578 7.875C6.42578 7.38281 6.80859 7 7.30078 7C7.79297 7 8.17578 7.38281 8.17578 7.875C8.17578 8.33984 7.79297 8.75 7.30078 8.75ZM8.17578 5.25H1.17578V2.32422H8.17578V5.25Z" fill={c} />
      </svg>
    );
    // 机场
    return (
      <svg viewBox="0 0 11.0742 13.2936" fill="none" className="block w-[11px] h-[12px]" overflow="visible">
        <path d="M11.0742 7.73877C11.0742 7.52002 10.9648 7.32861 10.8008 7.21924L6.39844 4.48486V1.28564C6.39844 0.793457 6.01562 0.410645 5.52344 0.410645C5.05859 0.410645 4.64844 0.793457 4.64844 1.28564V4.48486L0.273438 7.21924C0.109375 7.32861 0 7.52002 0 7.73877C0 8.14893 0.382812 8.44971 0.792969 8.31299L4.64844 7.10986V10.3091L3.60938 11.1021C3.52734 11.1567 3.5 11.2388 3.5 11.3481V11.6763C3.5 11.8677 3.66406 12.0044 3.85547 11.9497L5.52344 11.4849L7.19141 11.9497C7.38281 12.0044 7.57422 11.8677 7.57422 11.6763V11.3481C7.57422 11.2388 7.54688 11.1567 7.46484 11.1021L6.39844 10.3091V7.10986L10.2812 8.31299C10.6641 8.44971 11.0742 8.14893 11.0742 7.73877Z" fill={c} />
        <Slash x={0.179199} />
      </svg>
    );
  };


  const pct = (ts: string) => {
    const [h, m] = ts.split(':').map(Number);
    return ((h * 60 + m) / (24 * 60)) * 100;
  };

  // Train strike: 07:00-10:00, Plane strike: always-on dim
  const trainStart = pct('07:00'), trainEnd = pct('10:00');
  const trainW = trainEnd - trainStart;

  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFilteredStrikes = (strikes: any[], dateStr: string) => {
    return strikes.filter(s => {
      if (s.date !== dateStr) return false;
      const cats = (s.categories || []) as string[];

      // If categories is empty, treat as 'other' and always show
      if (cats.length === 0) return true;

      const isTrain = cats.includes('FERROVIARIO');
      const isPlane = cats.includes('AEREO') || cats.includes('AIRPORT');
      const isPT = cats.includes('TRASPORTO PUBBLICO LOCALE');
      const isOther = !isTrain && !isPlane && !isPT;

      if (filters['火车'] && isTrain) return true;
      if (filters['机场'] && isPlane) return true;
      if ((filters['公交'] || filters['地铁']) && isPT) return true;
      if (isOther) return true; // Always show uncategorized

      return false;
    });
  };

  return (
    <>
      <style>{`
        @keyframes expandDown {
          from { max-height: 0; opacity: 0; }
          to { max-height: 600px; opacity: 1; }
        }
        @keyframes collapseUp {
          from { max-height: 600px; opacity: 1; }
          to { max-height: 60px; opacity: 0.4; }
        }
        .card-active {
          animation: expandDown 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .card-dim {
          animation: collapseUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <main className="min-h-screen bg-[#e8e8e8] flex items-start justify-center">
        <div className="w-[402px] flex flex-col items-center min-h-screen">
          {/* ── Gray top content area ───────────────────────── */}

          <div className="bg-[#f4f4f4] relative flex flex-col items-start pb-[12px] pt-[48px] w-full">
            <div className="flex flex-col gap-[70px] items-start w-full">

              {/* Section A: hero + radar + compact cards */}
              <div className="flex flex-col items-center pb-[33px] relative w-full">

                {/* Header */}
                <div className="flex items-start justify-between mb-[-33px] pb-[8px] pl-[20px] pr-[21px] pt-[24px] relative w-full">
                  <div className="flex flex-col font-black items-start uppercase">
                    <p className="text-[12px] font-black text-black tracking-[0.6px] leading-[16px]">罢工信息查询（米兰）</p>
                    <p className="text-[8px] font-bold text-[#999] tracking-[0.5px] leading-[13px]">Developed by 21&apos;C</p>
                  </div>
                  <div className="flex flex-col gap-[8px] items-end">
                    {/* 添加网站到桌面 */}
                    <div className="h-[30px] relative w-[107px]">
                      <div className="absolute backdrop-blur-[2px] bg-[rgba(255,255,255,0.8)] border border-black flex items-center justify-end left-[9px] p-[7px] shadow-[4px_4px_0px_0px_black] top-0">
                        <p className="text-[12px] font-bold text-black leading-[16px] whitespace-nowrap">添加网站到桌面</p>
                      </div>
                      <div className="absolute left-[4px] size-[13px] top-[-5px]">
                        <img alt="" className="absolute block max-w-none size-full" src={imgEllipse13} />
                      </div>
                    </div>
                    {/* 夜间模式 */}
                    <div className="bg-[#424242] border border-black flex h-[30px] items-center justify-center px-[13px] py-[7px]">
                      <div className="flex gap-[3px] items-center">
                        <div className="relative size-[14px]">
                          <img alt="" className="absolute block max-w-none size-full" src={imgVector} />
                        </div>
                        <p className="text-[12px] font-medium text-white leading-[16px]">夜间模式</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hero + radar */}
                <div className="flex flex-col gap-[27px] items-center mb-[-33px] relative w-[366px]">

                  {/* Heading 1 */}
                  <div className="h-[72px] relative w-full">
                    {/* 火车 box */}
                    <div className="absolute flex h-[46px] items-center justify-center left-[-2px] top-0 w-[95px]">
                      <div className="flex-none skew-x-[-5.51deg]">
                        <div className="bg-[#ff5a5f] border-[6px] border-[#ff5a5f] flex h-[46px] items-center px-[6px]">
                          <p className="text-[36px] font-black text-white uppercase tracking-[-0.9px] leading-[36px] skew-x-[5.51deg]">火车</p>
                        </div>
                      </div>
                    </div>
                    {/* 、separator */}
                    <div className="absolute flex flex-col font-black h-[36px] justify-center left-[97px] top-[18px] translate-y-[-50%] text-[36px] text-black tracking-[-0.9px] uppercase w-[35px]">
                      <p className="leading-[36px]">、</p>
                    </div>
                    {/* 机场 box */}
                    <div className="absolute flex h-[46px] items-center justify-center left-[132px] top-0 w-[95px]">
                      <div className="flex-none skew-x-[-5.51deg]">
                        <div className="bg-[#ff5a5f] border-[6px] border-[#ff5a5f] flex h-[46px] items-center px-[6px]">
                          <p className="text-[36px] font-black text-white uppercase tracking-[-0.9px] leading-[36px] skew-x-[5.51deg]">机场</p>
                        </div>
                      </div>
                    </div>
                    {/* 罢工发生中 */}
                    <div className="absolute flex flex-col font-black h-[36px] justify-center left-0 top-[63px] translate-y-[-50%] text-[36px] text-black tracking-[-0.9px] uppercase w-[176px]">
                      <p className="leading-[36px]">罢工发生中</p>
                    </div>
                  </div>

                  {/* Radar + compact cards column */}
                  <div className="flex flex-col gap-[18px] items-start w-full">

                    {/* Macro radar */}
                    <div className="h-[122px] relative w-full">
                      <div className="absolute flex flex-col gap-[2px] items-start left-0 top-[39px] w-full">
                        {/* Time labels */}
                        <div className="h-[15px] relative w-full">
                          <div className="absolute flex items-start justify-between left-[9px] pr-[0px] top-0 w-[368px]">
                            {['00:00', '06:00', '09:00', '18:00', '21:00', '24:00'].map(t => (
                              <div key={t} className="flex flex-col h-[15px] justify-center relative text-[#666] text-[10px] font-bold font-mono w-[30px]">
                                <p className="leading-[15px]">{t}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Track rows */}
                        <div className="flex flex-col items-center pb-[2px] relative w-full">
                          {(() => {
                            const dateStr = getLocalDateStr(selectedDate);
                            const dayStrikes = getFilteredStrikes(initialStrikes, dateStr);
                            const trainStrike = dayStrikes.find(s => s.categories?.includes('FERROVIARIO'));
                            const planeStrike = dayStrikes.find(s => s.categories?.includes('AEREO') || s.categories?.includes('AIRPORT'));

                            // Define visual parameters based on found strikes. Default to false/dimmed if none.
                            const hasTrain = !!trainStrike;
                            const hasPlane = !!planeStrike;
                            const trainActive = hasTrain && (activeStrikeId === trainStrike.id || (!activeStrikeId && hasTrain));
                            const planeActive = hasPlane && (activeStrikeId === planeStrike.id || (!hasTrain && activeStrikeId === null));

                            // If no external active strike, auto-select the first available
                            useEffect(() => {
                              if (activeStrikeId === null) {
                                if (hasTrain) setActiveStrikeId(trainStrike.id);
                                else if (hasPlane) setActiveStrikeId(planeStrike.id);
                              }
                            }, [dateStr, hasTrain, hasPlane, trainStrike, planeStrike, activeStrikeId]);

                            return (
                              <>
                                {/* Train track */}
                                <div
                                  className={`bg-white border-2 border-black flex h-[34px] items-stretch mb-[-2px] overflow-clip relative w-full ${hasTrain ? 'cursor-pointer' : ''} transition-opacity duration-300 ${trainActive ? 'opacity-100' : 'opacity-60'}`}
                                  onClick={() => { if (hasTrain) { setActiveStrikeId(trainStrike.id); setIsExpanded(false); } }}
                                >
                                  <div className="bg-[#f3f4f6] border-black border-r-2 relative w-[24px] shrink-0 flex items-center justify-center">
                                    <div className="h-[14px] relative w-[12px]">
                                      <div className="absolute inset-[-9.39%_0_-7.77%_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgContainer} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-1 relative">
                                    <div className="flex items-stretch h-full">
                                      {hasTrain ? (
                                        <>
                                          <div className="bg-[#f3f4f6] h-full" style={{ width: `${trainStart / 100 * 100}%` }} />
                                          <div className="bg-[#ff5a5f] border-l-2 border-r-2 border-black box-content h-full" style={{ width: `${trainW / 100 * 100}%` }} />
                                          <div className="bg-[#f3f4f6] flex-1 h-full" />
                                        </>
                                      ) : (
                                        <div className="bg-[#f3f4f6] flex-1 h-full" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {/* Plane track */}
                                <div
                                  className={`bg-white border-2 border-black flex h-[34px] items-stretch mb-[-2px] overflow-clip relative w-full ${hasPlane ? 'cursor-pointer' : ''} transition-opacity duration-300 ${planeActive ? 'opacity-100' : 'opacity-60'}`}
                                  onClick={() => { if (hasPlane) { setActiveStrikeId(planeStrike.id); setIsExpanded(false); } }}
                                >
                                  <div className="bg-[#f3f4f6] border-black border-r-2 relative w-[24px] shrink-0 flex items-center justify-center">
                                    <div className="h-[14px] relative w-[12px]">
                                      <div className="absolute inset-[-9.39%_0_-7.75%_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgContainer1} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-1 relative">
                                    <div className="flex items-stretch h-full">
                                      {hasPlane ? (
                                        <div className={`bg-[#ff5a5f] flex-1 h-full transition-opacity duration-300 ${planeActive ? 'opacity-100' : 'opacity-50'}`} />
                                      ) : (
                                        <div className="bg-[#f3f4f6] flex-1 h-full" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Time indicator */}
                      {currentTime && (() => {
                        const p = ((currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds()) / 86400) * 100;
                        return (
                          <div className="absolute flex flex-col items-center justify-end left-[142px] top-0 pointer-events-none z-10"
                            style={{ left: `calc(22px + (100% - 22px) * ${p / 100})`, transform: 'translateX(-50%)' }}>
                            <div className="flex flex-col items-start pb-[4px]">
                              <div className="bg-black flex flex-col items-start px-[4px] py-[2px]">
                                <p className="font-bold text-[10px] text-white tracking-[1px] uppercase leading-[15px] font-mono whitespace-nowrap">{formatT(currentTime)}</p>
                              </div>
                            </div>
                            <div className="border-black border-l-[7px] border-r-[7px] border-t-[9px] border-l-transparent border-r-transparent h-[12px] w-[16px]" />
                            <div className="bg-black h-[87px] w-[2px]" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Compact cards */}
                    <div className="flex flex-col gap-[12px] items-start w-full">

                      {/* Render cards from actual data */}
                      {(() => {
                        const dateStr = getLocalDateStr(selectedDate);
                        const dayStrikes = getFilteredStrikes(initialStrikes, dateStr);

                        if (dayStrikes.length === 0) {
                          return (
                            <div className="flex w-full items-center justify-center p-[20px] bg-white border-2 border-black opacity-60">
                              <p className="font-bold text-black uppercase">今日无罢工记录</p>
                            </div>
                          );
                        }

                        return dayStrikes.map((strike) => {
                          const isActive = strike.id === activeStrikeId;

                          // Map properties
                          const isPlane = strike.categories?.includes('AEREO') || strike.categories?.includes('AIRPORT');
                          const isTrain = strike.categories?.includes('FERROVIARIO');

                          // Find main category label
                          let mainCategoryStr = '其他罢工';
                          if (isTrain) mainCategoryStr = '火车罢工';
                          else if (isPlane) mainCategoryStr = '飞机罢工';
                          else if (strike.categories?.includes('TRASPORTO PUBBLICO LOCALE')) mainCategoryStr = '公交罢工';

                          // Basic info mapping 
                          const info = {
                            title: mainCategoryStr,
                            time: strike.strike_windows?.join(', ') || strike.duration || '全天',
                            duration: strike.duration || '全天',
                            routes: strike.affected_lines?.length ? strike.affected_lines : ['全部线路/未说明'],
                            timelineStart: strike.strike_windows?.join(', ') || strike.duration || '00:00 - 24:00',
                            // Specific visuals
                            activeIcon: isPlane ? imgContainer1 : (isTrain ? imgContainer2 : imgContainer),
                            dimIcon: isPlane ? imgContainer1 : (isTrain ? imgContainer : imgContainer),
                            badgeIcon: isPlane ? imgVector1 : (isTrain ? imgContainer3 : imgVector1),
                            dimBadgeIcon: imgVector1,
                            bgHoverIcon: ""
                          };

                          if (isActive) {
                            return (
                              <div key={`${strike.id}-active`} className="card-active overflow-hidden border-2 border-black flex items-start relative shadow-[4px_4px_0px_0px_black] w-full bg-white"
                                style={info.bgHoverIcon ? { backgroundImage: info.bgHoverIcon, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : {}}>
                                <div className="bg-[#ff5a5f] border-black border-r-2 relative self-stretch w-[48px] shrink-0">
                                  <div className="flex flex-col gap-[8px] items-center justify-center pr-[2px] py-[16px] size-full">
                                    <div className="h-[19px] relative w-[16px]">
                                      <div className="absolute inset-[-9.98%_0_-4.74%_0] flex items-center justify-center">
                                        {isTrain ? (
                                          <img alt="" className="block max-w-none size-full" src={info.activeIcon} />
                                        ) : (
                                          <svg preserveAspectRatio="none" width="100%" height="100%" overflow="visible" style={{ display: 'block' }} viewBox="0 0 12.02 16.6806" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <g>
                                              <path d="M3.005 15.5767V13.7967L4.808 12.3015V9.73835L0 12.0167V9.88075L4.808 5.89355V2.76075C4.808 2.36915 4.9257 2.03392 5.16109 1.75505C5.39648 1.47618 5.67945 1.33675 6.01 1.33675C6.34055 1.33675 6.62352 1.47618 6.85891 1.75505C7.0943 2.03392 7.212 2.36915 7.212 2.76075V5.89355L12.02 9.88075V12.0167L7.212 9.73835V12.3015L9.015 13.7967V15.5767L6.01 14.5087L3.005 15.5767V15.5767" fill="#FFF" />
                                              {/* Optional red stroke can go here if needed */}
                                            </g>
                                          </svg>
                                        )}
                                      </div>
                                    </div>
                                    <div className="bg-[rgba(0,0,0,0.2)] flex-[1_0_0] w-[2px]" />
                                  </div>
                                </div>
                                <div className="flex-[1_0_0] relative">
                                  <div className="flex flex-col gap-[4px] items-end pb-[6px] pt-[12px] px-[16px] w-full">
                                    {/* Title + badge */}
                                    <div className="flex items-start justify-between w-full">
                                      <p className="text-[24px] font-black text-black uppercase leading-[32px]">{info.title}</p>
                                      <div className="bg-black border-2 border-black flex gap-[4px] items-center px-[10px] py-[4px]">
                                        <div className="relative size-[13px] flex items-center justify-center">
                                          <img alt="" className="absolute block max-w-none size-full" src={info.badgeIcon} />
                                        </div>
                                        <div className="relative">
                                          <p className="text-[12px] font-bold text-white leading-[16px] font-mono">{info.duration}</p>
                                        </div>
                                      </div>
                                    </div>
                                    {/* Time */}
                                    <div className="border-b-2 border-black flex flex-col items-start pb-[2px] w-full">
                                      <p className="font-mono text-[24px] text-black tracking-[-1.5px] leading-[36px] overflow-hidden whitespace-nowrap text-ellipsis max-w-[200px]">{info.time}</p>
                                    </div>
                                    {/* Affected routes */}
                                    <div className="flex flex-col gap-[4px] items-start py-[7px] w-full">
                                      <p className="text-[12px] font-bold text-[#6b7280] uppercase leading-[16px]">受影响的线路</p>
                                      <div className="flex flex-wrap gap-[6px]">
                                        {info.routes.slice(0, 3).map((r: string) => (
                                          <div key={r} className="bg-[#f3f4f6] border-2 border-black flex items-start px-[10px] py-[6px] shadow-[2px_2px_0px_0px_black]">
                                            <p className="text-[12px] font-bold text-black leading-[16px]">{r}</p>
                                          </div>
                                        ))}
                                        {info.routes.length > 3 && (
                                          <div className="bg-[#f3f4f6] border-2 border-black flex items-start px-[10px] py-[6px] shadow-[2px_2px_0px_0px_black]">
                                            <p className="text-[12px] font-bold text-black leading-[16px]">+{info.routes.length - 3}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {/* Expand Button - only visible when collapsed */}
                                    {!isExpanded && (
                                      <div
                                        className="flex gap-[4px] h-[24px] items-center justify-end py-[4px] w-full cursor-pointer mt-1"
                                        onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
                                      >
                                        <p className="text-[15px] font-bold text-black uppercase leading-[16px] whitespace-nowrap">
                                          展开全部
                                        </p>
                                        <div className="relative size-[16px]">
                                          <img alt="" className="absolute block max-w-none size-full" src={imgGroup30} />
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Expandable Content Area */}
                                  <div
                                    className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                                  >
                                    <div className="flex flex-col px-[16px] pb-[16px] w-full">

                                      {/* Timeline Status */}
                                      <div className="flex flex-col w-full relative pt-[8px] pl-[4px]">
                                        <div className="flex items-center gap-[6px] h-[22px] w-full">
                                          <div className="size-[14px] rounded-full bg-[#7dd321] border-[2px] border-black shrink-0 relative z-10" />
                                          <p className="text-[12px] font-bold text-black uppercase leading-[16px]">保障车次时间段</p>
                                        </div>

                                        <div className="flex w-full">
                                          {/* Vertical line */}
                                          <div className="w-[14px] flex justify-center shrink-0">
                                            <div className="w-[4px] bg-black h-full -mt-1 ml-[2px]" />
                                          </div>
                                          {/* Times and status */}
                                          <div className="flex flex-col w-full pl-[8px] pb-[16px]">
                                            <div className="flex justify-between items-center w-full">
                                              <p className="text-[12px] font-bold text-[#6b7280] line-through leading-[16px]">{info.timelineStart}</p>
                                              <p className="text-[14px] text-[#9ca3af] leading-[20px]">已结束</p>
                                            </div>
                                            <div className="flex justify-between items-center w-full mt-1">
                                              <p className="text-[18px] font-black text-[#ff5a5f] leading-[28px]">现在</p>
                                              <p className="text-[18px] font-black text-[#ff5a5f] leading-[28px]">罢工进行中</p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex gap-[12px] items-start w-full mt-2">
                                        {/* 分享 (Share) */}
                                        <div className="bg-white border-2 border-black flex flex-[1_0_0] gap-[6px] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                          <div className="h-[19px] relative shrink-0 w-[15px]">
                                            <img alt="" className="absolute block max-w-none size-full" src={imgVector2} />
                                          </div>
                                          <div className="flex flex-col font-bold justify-center relative shrink-0 text-[14px] text-center text-black uppercase whitespace-nowrap">
                                            <p className="leading-[20px]">分享</p>
                                          </div>
                                        </div>
                                        {/* 涂鸦 (Doodle) */}
                                        <div className="bg-[#ff5a5f] border-2 border-black flex flex-[1_0_0] gap-[6px] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                          <div className="h-[16px] relative shrink-0 w-[29px]">
                                            <div className="absolute inset-[-0.39%_0_-28.13%_0]">
                                              <img alt="" className="block max-w-none size-full" src={imgFrame32} />
                                            </div>
                                          </div>
                                          <div className="flex flex-col font-bold justify-center relative shrink-0 text-[14px] text-center text-white uppercase whitespace-nowrap">
                                            <p className="leading-[20px]">涂鸦</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Source */}
                                      <div className="flex items-center justify-center pt-[16px] w-full">
                                        <p className="inline-block border-b border-[#767676] text-[10px] font-bold text-[#767676] text-center tracking-[0.5px] uppercase leading-[15px] whitespace-nowrap pb-[2px]">来源: Ministero delle Infrastrutture ➔</p>
                                      </div>

                                    </div>
                                  </div>

                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div key={`${strike.id}-dim`}
                                className="card-dim border-2 border-[#111] flex h-[60px] items-stretch overflow-clip relative w-full cursor-pointer opacity-60"
                                onClick={() => { setActiveStrikeId(strike.id); setIsExpanded(false); }}>
                                {/* Left icon area - near-black #111 */}
                                <div className="bg-[#111] border-r-2 border-[#111] h-full relative w-[48px] shrink-0 flex items-center justify-center pr-[2px]">
                                  {isPlane ? (
                                    /* Plane icon — viewBox 12.02×16.68, keep portrait aspect */
                                    <svg height="17" viewBox="0 0 12.02 16.6806" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
                                      <path d="M3.005 15.5767V13.7967L4.808 12.3015V9.73835L0 12.0167V9.88075L4.808 5.89355V2.76075C4.808 2.36915 4.9257 2.03392 5.16109 1.75505C5.39648 1.47618 5.67945 1.33675 6.01 1.33675C6.34055 1.33675 6.62352 1.47618 6.85891 1.75505C7.0943 2.03392 7.212 2.36915 7.212 2.76075V5.89355L12.02 9.88075V12.0167L7.212 9.73835V12.3015L9.015 13.7967V15.5767L6.01 14.5087L3.005 15.5767Z" fill="white" />
                                    </svg>
                                  ) : (
                                    /* Train icon (or generic) */
                                    <svg height="17" viewBox="0 0 12.0234 16.6806" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }}>
                                      <path d="M6.01172 1.33675C3.02344 1.33675 0 1.68831 0 4.32503V11.4617C0 12.9032 1.19531 14.0633 2.63672 14.0633L1.75781 14.9422C1.54688 15.1532 1.72266 15.575 2.03906 15.575H2.84766C2.95312 15.575 3.05859 15.5399 3.12891 15.4696L4.5 14.0633H7.52344L8.89453 15.4696C8.96484 15.5399 9.07031 15.575 9.17578 15.575H9.98438C10.3008 15.575 10.4766 15.1532 10.2305 14.9422L9.38672 14.0633C10.8281 14.0633 12.0234 12.9032 12.0234 11.4617V4.32503C12.0234 1.68831 9 1.33675 6.01172 1.33675ZM2.63672 12.5867C2.00391 12.5867 1.51172 12.0594 1.51172 11.4617C1.51172 10.8289 2.00391 10.3367 2.63672 10.3367C3.26953 10.3367 3.76172 10.8289 3.76172 11.4617C3.76172 12.0594 3.26953 12.5867 2.63672 12.5867ZM5.27344 7.31331H1.51172V4.32503H5.27344V7.31331ZM9.38672 12.5867C8.75391 12.5867 8.26172 12.0594 8.26172 11.4617C8.26172 10.8289 8.75391 10.3367 9.38672 10.3367C10.0195 10.3367 10.5117 10.8289 10.5117 11.4617C10.5117 12.0594 10.0195 12.5867 9.38672 12.5867ZM10.5117 7.31331H6.75V4.32503H10.5117V7.31331Z" fill="white" />
                                    </svg>
                                  )}
                                </div>
                                {/* Content - white bg */}
                                <div className="flex-[1_0_0] h-full bg-white relative">
                                  <div className="flex items-center justify-between px-[16px] size-full">
                                    <p className="font-bold text-[16px] text-[#111] leading-[24px]">{info.title}</p>
                                    <div className="bg-[#e5e7eb] flex gap-[4px] items-center justify-center px-[8px] py-[2px] rounded-[2px]">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 14 14"><path fill="#111" fillRule="evenodd" d="M7 14A7 7 0 1 0 7 0a7 7 0 0 0 0 14Zm.933-10.267H6.067V7.933h4.666v-1.866H7.933V3.733Z" clipRule="evenodd" /></svg>
                                      <p className="font-bold text-[14px] text-[#111] leading-[20px] font-mono">{info.duration}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        });
                      })()}

                    </div>
                  </div>
                </div>
              </div>

              {/* Section B: 2月罢工信息 */}
              <div className="flex flex-col gap-[28px] items-center w-full bg-[#f4f4f4]">

                {/* Header + calendar + filters */}
                <div className="flex flex-col gap-[7px] items-start w-full">
                  <div className="flex flex-col gap-[8px] items-start w-full pb-[20px]">
                    {/* Title row - month/year updates as user scrolls the date strip */}
                    <div className="border-b-2 border-black flex items-end justify-between pb-[10px] px-[20px] w-full">
                      <div className="relative pt-[6px]">
                        <p className="text-[20px] font-black text-black uppercase leading-[28px]">
                          {visibleMonth.year !== currentYear
                            ? `${visibleMonth.year}年 ${CN_MONTHS[visibleMonth.month]}罢工信息`
                            : `${CN_MONTHS[visibleMonth.month]}罢工信息`}
                        </p>
                      </div>
                      <div className="bg-black border border-black relative rounded-[29px]">
                        <div className="flex gap-[6px] items-center justify-center px-[13px] py-[4px]">
                          <div className="relative size-[12px]">
                            <img alt="" className="absolute block max-w-none size-full" src={imgVectorStroke} />
                          </div>
                          <p className="font-semibold text-[13px] text-center text-white uppercase leading-normal whitespace-nowrap">查询具体日期</p>
                        </div>
                      </div>
                    </div>


                    {/* Calendar - infinite left-scroll */}
                    <div
                      ref={dateListRef}
                      className="flex gap-[8px] items-start px-[20px] overflow-x-auto pb-[4px] w-full"
                      style={{ scrollbarWidth: 'none' }}
                      onScroll={handleDateScroll}
                    >
                      {/* Left sentinel for infinite load */}
                      <div ref={sentinelRef} className="shrink-0 w-[1px] h-[56px]" />

                      {days.map((d, i) => {
                        const sel = d.toDateString() === selectedDate.toDateString();
                        const tod = d.toDateString() === today.toDateString();
                        const past = d < today && !tod;
                        const dayLabel = CN_DAYS[d.getDay()];
                        const dateNum = d.getDate();
                        const dateStr = getLocalDateStr(d);
                        return (
                          <div
                            key={dateStr}
                            data-date={dateStr}
                            ref={tod ? todayRef : undefined}
                            className="flex flex-col gap-[4px] items-center shrink-0 cursor-pointer h-[80px] justify-start"
                            onClick={() => setSelectedDate(new Date(d))}
                          >
                            {sel ? (
                              <div className="bg-black border-2 border-black flex flex-col items-center justify-center p-[2px] relative w-[64px] h-[64px]">
                                <p className="text-[10px] font-bold text-white uppercase leading-[14px] tracking-[0.3px]">{dayLabel}</p>
                                <p className="font-['JetBrains_Mono',monospace] font-black text-[28px] text-white leading-[32px]">{dateNum}</p>
                              </div>
                            ) : past ? (
                              <div className="border border-[#d1d5db] flex flex-col items-center justify-center opacity-50 p-px relative w-[56px] h-[56px]">
                                <div aria-hidden className="absolute bg-white inset-0 mix-blend-saturation pointer-events-none" />
                                <p className="text-[10px] font-bold text-[#9ca3af] leading-[14px] uppercase tracking-[0.3px]">{dayLabel}</p>
                                <p className="font-['JetBrains_Mono',monospace] font-bold text-[20px] text-black leading-[24px]">{dateNum}</p>
                              </div>
                            ) : (
                              <div className="bg-[#f4f4f4] border border-[#d1d5db] flex flex-col items-center justify-center p-[2px] relative w-[56px] h-[56px]">
                                <p className="text-[10px] font-bold text-[#9ca3af] leading-[14px] uppercase tracking-[0.3px]">{dayLabel}</p>
                                <p className="font-['JetBrains_Mono',monospace] font-bold text-[20px] text-black leading-[24px]">{dateNum}</p>
                              </div>
                            )}
                            {tod && (
                              sel ? (
                                <div className="bg-[#FF5A5F] border-2 border-black flex items-center justify-center px-[9px] py-[3px]">
                                  <p className="text-[10px] font-bold text-white uppercase leading-[15px]">今天</p>
                                </div>
                              ) : (
                                <div className="bg-[#f1f1f1] border border-[#c8cbd1] flex items-center justify-center px-[9px] py-[3px]">
                                  <p className="text-[10px] font-bold text-[#8b8b93] uppercase leading-[15px]">今天</p>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Filter tabs */}
                    <div className="flex flex-col items-center w-full">
                      <div className="flex gap-[8px] items-center justify-center flex-wrap px-[20px] w-full">
                        {filterKeys.map((key) => {
                          const selected = filters[key];
                          return (
                            <button
                              key={key}
                              onClick={() => toggleFilter(key)}
                              className={[
                                'flex gap-[8px] items-center px-[14px] py-[10px] shrink-0 border-2 border-black',
                                'transition-all duration-200 ease-in-out',
                                'shadow-[2px_2px_0px_0px_black]',
                                selected ? 'bg-black rounded-[10px]' : 'bg-white rounded-[35px]',
                              ].join(' ')}
                            >
                              {renderFilterIcon(key, selected)}
                              <p className={`text-[14px] font-bold text-center leading-[20px] transition-colors duration-200 ${selected ? 'text-white' : 'text-black'}`}>{key}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Expanded detail cards */}
                  <div className="flex flex-col gap-[32px] items-center w-full px-[20px]">
                    {(() => {
                      const dateStr = getLocalDateStr(selectedDate);
                      const dayStrikes = getFilteredStrikes(initialStrikes, dateStr);

                      if (dayStrikes.length === 0) {
                        return (
                          <div className="flex w-full items-center justify-center p-[40px] opacity-50">
                            <p className="font-bold text-black uppercase">今日无详细罢工信息</p>
                          </div>
                        );
                      }

                      return dayStrikes.map(strike => {
                        const isPlane = strike.categories?.includes('AEREO') || strike.categories?.includes('AIRPORT');
                        const isTrain = strike.categories?.includes('FERROVIARIO');
                        const isPublicTransport = strike.categories?.includes('TRASPORTO PUBBLICO LOCALE');
                        const isCancelled = strike.status === 'CANCELLED' || strike.status === 'REVOKED' || strike.status === 'SUSPENDED';

                        let mainCategoryStr = '其他罢工';
                        if (isTrain) mainCategoryStr = '火车罢工';
                        else if (isPlane) mainCategoryStr = '飞机罢工';
                        else if (isPublicTransport) mainCategoryStr = '公交罢工';

                        const durationStr = strike.duration || '全天';
                        const timeStr = strike.strike_windows?.join(', ') || strike.duration || '00:00 - 24:00';
                        const routes = strike.affected_lines?.length ? strike.affected_lines : ['全部线路/未说明'];

                        let iconSrc = imgContainer; // default bus/other
                        if (isPlane) iconSrc = imgContainer9;
                        else if (isTrain) iconSrc = imgContainer2;

                        // Time line split logic wrapper (basic 2 point split)
                        const times = timeStr.includes('-') ? timeStr.split('-').map((t: string) => t.trim()) : ['00:00', '24:00'];
                        const tStart = times[0] || '00:00';
                        const tEnd = times[1] || '24:00';

                        if (!isCancelled) {
                          return (
                            <div key={strike.id} className="bg-white border-2 border-black flex flex-col gap-[4px] items-center justify-center p-[24px] relative shadow-[4px_4px_0px_0px_black] w-full">
                              {/* Badge */}
                              <div className="absolute flex h-[30px] items-center justify-center left-[-8px] top-[-13px] w-[61px]">
                                <div className="-rotate-2 flex-none">
                                  <div className="bg-[#ff5a5f] border-2 border-black relative">
                                    <div className="flex flex-col items-start px-[10px] py-[6px]">
                                      <p className="text-[12px] font-black text-white tracking-[1.2px] uppercase leading-[16px]">已确认</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Title row */}
                              <div className="relative w-full">
                                <div className="flex items-start justify-between w-full">
                                  <div className="flex gap-[12px] items-center">
                                    <div className="bg-black border border-black flex flex-col items-start p-[9px]">
                                      <div className="h-[19px] relative w-[16px]">
                                        <div className="absolute inset-[-9.98%_0_-4.74%_0]">
                                          <img alt="" className="block max-w-none size-full" src={iconSrc} />
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-[20px] font-black text-black uppercase leading-[28px] max-w-[120px] whitespace-normal line-clamp-2">{mainCategoryStr}</p>
                                  </div>
                                  <div className="border-black border-l-2 flex flex-col items-end pl-[14px]">
                                    <p className="text-[20px] font-black text-black text-right leading-[28px]">{durationStr}</p>
                                    <p className="text-[10px] font-bold text-black text-right tracking-[0.5px] uppercase leading-[15px]">持续时间</p>
                                  </div>
                                </div>
                              </div>
                              {/* Time line with imgLine1 */}
                              <div className="relative w-full mt-[10px] mb-[6px]">
                                <div className="flex flex-col items-start w-full">
                                  <div className="flex gap-[13px] h-[24px] items-center justify-center relative w-full">
                                    <p className="font-mono font-bold text-[16px] text-black tracking-[-0.8px] leading-[24px] whitespace-nowrap">{tStart}</p>
                                    <div className="flex-[1_0_0] h-0 relative">
                                      <div className="absolute inset-[-2px_0_0_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgLine1} />
                                      </div>
                                    </div>
                                    <p className="font-mono font-bold text-[16px] text-black tracking-[-0.8px] leading-[24px] whitespace-nowrap">{tEnd}</p>
                                  </div>
                                </div>
                              </div>
                              {/* Affected routes */}
                              <div className="relative w-full">
                                <div className="content-center flex flex-wrap gap-[6px] items-center w-full">
                                  <p className="text-[12px] font-black text-black uppercase leading-[16px] whitespace-nowrap pr-[4px]">受影响的线路</p>
                                  {routes.map((r: string) => (
                                    <div key={r} className="bg-[#f3f4f6] border-2 border-black flex items-start px-[6px] py-[4px]">
                                      <p className="text-[12px] font-bold text-black leading-[16px] max-w-[180px] break-all">{r}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* 保障车次 */}
                              {isTrain && (
                                <div className="relative w-full mt-[8px]">
                                  <div className="flex items-center w-full">
                                    <div className="bg-[#f1f1f1] flex h-[22px] items-center justify-between py-[2px] relative rounded-[5px] w-full">
                                      <div className="flex gap-[6px] items-center px-[6px]">
                                        <div className="relative size-[6px]">
                                          <div className="absolute inset-[-16.67%]">
                                            <img alt="" className="block max-w-none size-full" src={imgEllipse15} />
                                          </div>
                                        </div>
                                        <p className="text-[12px] font-bold text-black uppercase leading-[16px] whitespace-nowrap">保障车次</p>
                                      </div>
                                      <div className="flex flex-col items-end px-[4px]">
                                        <p className="text-[12px] font-bold text-black underline leading-[16px]">展示细节</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {/* Action buttons */}
                              <div className="relative w-full mt-[12px]">
                                <div className="flex gap-[12px] items-start w-full">
                                  <div className="bg-white border-2 border-black flex flex-[1_0_0] gap-[6px] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                    <div className="h-[19px] relative w-[15px] shrink-0">
                                      <img alt="" className="absolute block max-w-none size-full" src={imgVector2} />
                                    </div>
                                    <p className="text-[14px] font-bold text-black text-center uppercase leading-[20px] whitespace-nowrap">分享</p>
                                  </div>
                                  <div className="bg-[#ff5a5f] border-2 border-black flex flex-[1_0_0] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                    <div className="h-[16px] relative w-[29px] shrink-0">
                                      <div className="absolute inset-[-0.39%_0_-28.13%_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgFrame32} />
                                      </div>
                                    </div>
                                    <div className="flex gap-[4px] items-center ml-2">
                                      <p className="text-[14px] font-bold text-white text-center uppercase leading-[20px] whitespace-nowrap">涂鸦</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Source */}
                              <div className="flex items-center justify-center pt-[18px] w-full">
                                <p className="inline-block border-b border-[#767676] text-[10px] font-bold text-[#767676] text-center tracking-[0.5px] uppercase leading-[15px] whitespace-nowrap pb-[2px]">来源: Ministero delle Infrastrutture ➔</p>
                              </div>
                            </div>
                          );
                        } else {
                          // Cancelled card
                          return (
                            <div key={strike.id} className="bg-white border-2 border-[rgba(0,0,0,0.5)] border-dashed flex flex-col gap-[4px] items-start justify-center p-[24px] relative w-full">
                              {/* Badge */}
                              <div className="absolute flex h-[30px] items-center justify-center left-[-8px] top-[-13px] w-[61px]">
                                <div className="-rotate-2 flex-none">
                                  <div className="bg-[#313131] border-2 border-black relative">
                                    <div className="flex flex-col items-start px-[10px] py-[6px]">
                                      <p className="text-[12px] font-black text-white tracking-[1.2px] uppercase leading-[16px]">已取消</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Content (opacity-60) */}
                              <div className="opacity-60 relative w-full">
                                <div className="flex flex-col gap-[4px] items-start w-full">
                                  {/* Title */}
                                  <div className="flex items-start justify-between w-full">
                                    <div className="flex gap-[12px] items-center">
                                      <div className="bg-black border border-black flex flex-col items-start p-[9px]">
                                        <div className="relative size-[17px]">
                                          <div className="absolute inset-[-17.36%_0_-13.31%_0]">
                                            <img alt="" className="block max-w-none size-full" src={imgContainer9} />
                                          </div>
                                        </div>
                                      </div>
                                      <p className="text-[20px] font-black text-black uppercase leading-[28px] line-through max-w-[120px] whitespace-normal line-clamp-2">{mainCategoryStr}</p>
                                    </div>
                                    <div className="border-black border-l-2 flex flex-col items-end pl-[14px]">
                                      <p className="text-[20px] font-black text-black text-right leading-[28px]">{durationStr}</p>
                                      <p className="text-[10px] font-bold text-black text-right tracking-[0.5px] uppercase leading-[15px]">持续时间</p>
                                    </div>
                                  </div>
                                  {/* Time line */}
                                  <div className="flex gap-[13px] h-[24px] items-center justify-center relative w-full mt-[6px]">
                                    <p className="font-mono font-bold text-[16px] text-black tracking-[-0.8px] leading-[24px] whitespace-nowrap">{tStart}</p>
                                    <div className="flex-[1_0_0] h-0 relative">
                                      <div className="absolute inset-[-2px_0_0_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgLine1} />
                                      </div>
                                    </div>
                                    <p className="font-mono font-bold text-[16px] text-black tracking-[-0.8px] leading-[24px] whitespace-nowrap">{tEnd}</p>
                                  </div>
                                  {/* Routes */}
                                  <div className="content-center flex flex-wrap gap-[6px] items-center w-full mt-[6px]">
                                    <p className="text-[12px] font-black text-black uppercase leading-[16px] whitespace-nowrap pr-[4px]">受影响的线路</p>
                                    {routes.map((r: string) => (
                                      <div key={r} className="bg-[#f3f4f6] border-2 border-black flex items-start px-[6px] py-[4px]">
                                        <p className="text-[12px] font-bold text-black leading-[16px] max-w-[180px] break-all">{r}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {/* Buttons (outside opacity div) */}
                              <div className="relative w-full mt-[12px]">
                                <div className="flex gap-[12px] items-start w-full">
                                  <div className="bg-white border-2 border-black flex flex-[1_0_0] gap-[6px] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                    <div className="h-[19px] relative w-[15px] shrink-0">
                                      <img alt="" className="absolute block max-w-none size-full" src={imgVector2} />
                                    </div>
                                    <p className="text-[14px] font-bold text-black text-center uppercase leading-[20px] whitespace-nowrap">分享</p>
                                  </div>
                                  <div className="bg-[#ff5a5f] border-2 border-black flex flex-[1_0_0] gap-[4px] items-center justify-center py-[14px] relative rounded-[36px] shadow-[2px_2px_0px_0px_black] cursor-pointer active:translate-y-[2px] active:shadow-none transition-all">
                                    <div className="h-[16px] relative w-[29px] shrink-0">
                                      <div className="absolute inset-[-0.39%_0_-28.13%_0]">
                                        <img alt="" className="block max-w-none size-full" src={imgFrame32} />
                                      </div>
                                    </div>
                                    <p className="text-[14px] font-bold text-white text-center uppercase leading-[20px] whitespace-nowrap">涂鸦</p>
                                  </div>
                                </div>
                              </div>
                              {/* Source */}
                              <div className="flex items-center justify-center pt-[18px] w-full">
                                <p className="inline-block border-b border-[#767676] text-[10px] font-bold text-[#767676] text-center tracking-[0.5px] uppercase leading-[15px] whitespace-nowrap pb-[2px]">来源: Ministero delle Infrastrutture ➔</p>
                              </div>
                            </div>
                          );
                        }
                      });
                    })()}
                  </div>{/* /detail cards */}
                </div>{/* /Section B */}

              </div>
            </div>{/* /gray bg */}

            {/* ── Dark footer area ──────────────────────────────── */}
            <div className="flex-1 relative w-full flex flex-col items-center overflow-hidden"
              style={{
                background: 'radial-gradient(150% 100% at 50% 0%, #150300 0%, #290601 20%, #7e1f19 60%, #ff5a5f 100%)'
              }}>
              {/* ── Transition strip (jagged edge) ────────────────── */}
              <div className="h-[44px] relative w-full flex justify-center mt-[-1px]">
                <img alt="" className="block max-w-[402px] size-full object-cover" src={imgFrame34} />
              </div>

              <div className="flex flex-col gap-[13px] items-start relative w-[350px] pt-[26px] pb-[40px]">
                {/* 添加小组件 */}
                <div className="bg-[rgba(255,255,255,0.2)] flex gap-[8px] h-[56px] items-center justify-center py-[16px] relative rounded-[25px] w-full">
                  <div className="relative size-[19px]">
                    <img alt="" className="absolute block max-w-none size-full" src={imgContainer10} />
                  </div>
                  <p className="font-extrabold text-[16px] text-center text-white tracking-[0.4px] uppercase leading-[24px] whitespace-nowrap">添加小组件</p>
                </div>
                {/* 同步到本地日历 */}
                <div className="bg-[rgba(255,255,255,0.2)] flex gap-[8px] items-center justify-center py-[16px] relative rounded-[25px] w-full">
                  <div className="relative">
                    <div className="flex flex-col items-center">
                      <div className="relative size-[20px]">
                        <img alt="" className="absolute block max-w-none size-full" src={imgGroup} />
                      </div>
                    </div>
                  </div>
                  <p className="font-extrabold text-[16px] text-center text-white tracking-[0.4px] uppercase leading-[24px] whitespace-nowrap">同步到本地日历</p>
                </div>
                {/* 支持作者 card */}
                <div className="bg-[rgba(255,255,255,0.2)] flex flex-col gap-[8px] h-[199px] items-start overflow-clip p-[24px] relative rounded-[25px] w-full">
                  <p className="text-[20px] font-black text-white uppercase leading-[28px] relative w-full">支持作者</p>
                  <div className="relative w-full">
                    <div className="flex flex-col items-start pb-[8px] pr-[40px] w-full">
                      <p className="text-[12px] font-medium text-[#d1d5db] leading-[16px]">独立开发不易，如果对你有用请支持一杯奶茶。</p>
                    </div>
                  </div>
                  <div className="bg-white border-2 border-white relative rounded-[40px]">
                    <div className="flex items-center justify-center px-[11px] py-[10px]">
                      <p className="text-[14px] font-bold text-black text-center uppercase leading-[16px] whitespace-nowrap">支持一下</p>
                    </div>
                  </div>
                  <div className="relative w-full">
                    <div className="flex items-center justify-between pt-[12px] w-full">
                      <p className="text-[20px] font-black text-white uppercase leading-[28px] whitespace-nowrap">或者点个关注 </p>
                      <div className="h-[25px] relative w-[56px]">
                        <div className="absolute inset-[-35.6%_-15.93%]">
                          <img alt="" className="block max-w-none size-full" src={imgFrame100} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Decorative illustration */}
                  <div className="absolute flex h-[114px] items-center justify-center right-[-7px] top-[-7px] w-[99px]">
                    <div className="flex-none rotate-12">
                      <div className="h-[100px] relative w-[80px]">
                        <img alt="" className="absolute block max-w-none size-full" src={imgContainer11} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Data source */}
                <div className="flex flex-col font-normal h-[33px] justify-center relative text-[10px] text-center text-white w-full" style={{ lineHeight: '16.25px' }}>
                  <p>DATA SOURCE: MINISTERO DELLE INFRASTRUTTURE E DEI</p>
                  <p>TRASPORTI</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main >
    </>
  );
}
