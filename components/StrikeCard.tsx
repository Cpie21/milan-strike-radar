'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitDoodle, getDoodleCount } from '../app/actions';
import { normalizeDisplayLines } from './utils';
import { normalizeProviderList } from '../lib/strikeNormalization';
import DoodleCanvas, { DoodleCategory } from './DoodleOverlay';
import { capture, isWeChatBrowser } from '../utils/analytics';

// Helpers
function getTrainIcon(fillColor = "white") {
    return (
        <svg width="19" height="25" viewBox="0 0 19 25" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.49219 2.11029C4.76172 2.11029 0 2.66531 0 6.82823V18.1009C0 20.3789 1.88672 22.2116 4.16406 22.2116L2.78516 23.5905C2.45312 23.9225 2.73047 24.5866 3.22656 24.5866H4.49219C4.65625 24.5866 4.82031 24.5319 4.92969 24.4225L7.11719 22.2116H11.875L14.0625 24.4225C14.1719 24.5319 14.3359 24.5866 14.5 24.5866H15.7656C16.2617 24.5866 16.5391 23.9225 16.207 23.5905L14.8281 22.2116C17.1055 22.2116 18.9922 20.3789 18.9922 18.1009V6.82823C18.9922 2.66531 14.2266 2.11029 9.49219 2.11029ZM4.16406 19.8329C3.17578 19.8329 2.40625 19.0126 2.40625 18.1009C2.40625 17.1344 3.17578 16.3688 4.16406 16.3688C5.15234 16.3688 5.86719 17.1344 5.86719 18.1009C5.86719 19.0126 5.15234 19.8329 4.16406 19.8329ZM8.34375 11.5202H2.40625V6.82823H8.34375V11.5202ZM14.8281 19.8329C13.8398 19.8329 13.0703 19.0126 13.0703 18.1009C13.0703 17.1344 13.8398 16.3688 14.8281 16.3688C15.8164 16.3688 16.5859 17.1344 16.5859 18.1009C16.5859 19.0126 15.8164 19.8329 14.8281 19.8329ZM16.5859 11.5202H10.6484V6.82823H16.5859V11.5202Z" fill={fillColor} />
        </svg>
    )
}
function getPlaneIcon(fillColor = "white") {
    return (
        <svg width="22" height="22" viewBox="-3 -3.5 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.9844 11.6669C18.9844 11.2323 18.7656 10.85 18.4375 10.6312L10.7266 5.16201V-1.23683C10.7266 -2.2212 9.96094 -2.98683 8.97656 -2.98683C7.99219 -2.98683 7.22656 -2.2212 7.22656 -1.23683V5.16201L-1.47656 10.6312C-1.80469 10.85 -2 11.2323 -2 11.6669C-2 12.4849 -1.23438 13.0801 -0.414062 12.8091L7.22656 10.414L7.22656 16.784L5.14844 18.3698C4.98438 18.4792 4.92969 18.6432 4.92969 18.862V19.5168C4.92969 19.897 5.25781 20.1706 5.64062 20.0612L8.97656 19.1315L12.3125 20.0612C12.6953 20.1706 13.0781 19.897 13.0781 19.5168V18.862C13.0781 18.6432 13.0234 18.4792 12.8594 18.3698L10.7266 16.784V10.414L18.3672 12.8091C19.1328 13.0801 18.9844 12.4849 18.9844 11.6669Z" fill={fillColor} />
        </svg>
    )
}

interface StrikeRecord {
    id: string;
    date: string;
    region?: string;
    category: 'TRAIN' | 'SUBWAY' | 'BUS' | 'AIRPORT';
    provider: string;
    status: 'CONFIRMED' | 'REQUIRES_DETAIL' | 'CANCELLED' | 'CONFIRMED (STRIKE)';
    display_time: string;
    duration_hours: string;
    strike_windows: Array<{ start: string, end: string }>;
    guarantee_windows: Array<{ start: string, end: string }>;
    affected_lines?: string[];
}

export default function StrikeCard({ strike, isDark }: { strike: StrikeRecord, isDark: boolean }) {
    const viewRegion = strike.region || 'MILANO';
    const buildFallbackGuarantees = () => {
        const currentSlots = strike.strike_windows || [];
        const isFullDay = currentSlots.some((slot) => slot.start === '00:00' && slot.end === '24:00') || strike.duration_hours === '24小时';
        const date = new Date(strike.date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        if (strike.category === 'AIRPORT' && isFullDay) {
            return [
                { start: '07:00', end: '10:00' },
                { start: '18:00', end: '21:00' },
            ];
        }
        if (strike.category === 'TRAIN' && !isWeekend) {
            return [
                { start: '06:00', end: '09:00' },
                { start: '18:00', end: '21:00' },
            ];
        }
        if (strike.category === 'SUBWAY' || strike.category === 'BUS') {
            return [
                { start: '00:00', end: '08:45' },
                { start: '15:00', end: '18:00' },
            ];
        }
        return [];
    };
    // Expandable state for guarantee info
    const [isExpanded, setIsExpanded] = useState(false);
    // UI state for share button feedback
    const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');

    // Doodle Feature State
    const [doodleCount, setDoodleCount] = useState(0);
    const doodleStorageKey = useMemo(
        () => `doodled_${viewRegion}|${strike.date}|${strike.category}|${strike.category === 'AIRPORT' ? (strike.display_time || '') : ''}`,
        [viewRegion, strike.date, strike.category, strike.display_time]
    );

    // Initialize synchronously to avoid flicker
    const [hasDoodled, setHasDoodled] = useState(() => {
        if (typeof window !== 'undefined') {
            return !!localStorage.getItem(doodleStorageKey);
        }
        return false;
    });

    const [isDoodleCountLoaded, setIsDoodleCountLoaded] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    // Must have its own lazy initializer — cannot derive from hasDoodled state
    // because useState(hasDoodled) only captures the initial snapshot, not future state
    const [isCanvasVisible, setIsCanvasVisible] = useState(() => {
        if (typeof window !== 'undefined') {
            return !!localStorage.getItem(`doodled_${strike.date}|${strike.category}|${strike.category === 'AIRPORT' ? (strike.display_time || '') : ''}`);
        }
        return false;
    });

    // Definitive fix: sync doodle state from localStorage ANY time the key changes.
    // Lazy initializers only run on mount, so re-renders don't re-sync automatically.
    // This catches cases where React reconciles the component instead of remounting it.
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hasLocal = !!localStorage.getItem(doodleStorageKey);
            setHasDoodled(hasLocal);
            setIsCanvasVisible(hasLocal);
        }
    }, [doodleStorageKey]);

    useEffect(() => {
        let mounted = true;

        const syncCount = async () => {
            const effectiveDisplayTime = strike.category === 'AIRPORT' ? strike.display_time : undefined;

            const count = await getDoodleCount(strike.id, strike.date, strike.category, effectiveDisplayTime, viewRegion);
            if (!mounted) return;

            setDoodleCount(prev => {
                const localMarked = !!localStorage.getItem(doodleStorageKey);
                if (localMarked) return Math.max(prev, count, 1);
                return Math.max(prev, count);
            });
            setIsDoodleCountLoaded(true);
        };

        syncCount();
        const timer = setInterval(syncCount, 5000);

        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [strike.id, doodleStorageKey, strike.date, strike.category, strike.display_time, viewRegion]);

    const handleDoodle = async () => {
        if (hasDoodled) {
            // Already doodled, just replay the animation and show canvas
            setIsCanvasVisible(true);
            setIsAnimating(true);
            setTimeout(() => setIsAnimating(false), 2000);
            return;
        }

        // 1. Optimistic UI update & interaction state
        setHasDoodled(true);
        setDoodleCount(prev => prev + 1);
        setIsCanvasVisible(true);
        setIsAnimating(true);

        // Reset animation trigger after 2 seconds
        setTimeout(() => setIsAnimating(false), 2000);

        // 2. Persist device UUID in LocalStorage
        let clientUuid = localStorage.getItem(doodleStorageKey);
        if (!clientUuid) {
            clientUuid = crypto.randomUUID();
            localStorage.setItem(doodleStorageKey, clientUuid);
        }

        const effectiveDisplayTime = strike.category === 'AIRPORT' ? strike.display_time : undefined;
        const result = await submitDoodle(strike.id as unknown as string, clientUuid, strike.date, strike.category, effectiveDisplayTime, viewRegion);
        const latest = await getDoodleCount(strike.id, strike.date, strike.category, effectiveDisplayTime, viewRegion);
        setDoodleCount(latest);

        // Track graffiti event (always, even if already doodled)
        capture('graffiti_spray_triggered', {
            transport_type: strike.category.toLowerCase(),
            total_rage_count: latest,
        });

        if (!result.success && result.error !== 'Already doodled') {
            setIsAnimating(false);
        }
    };

    // Map Category
    const isTrain = strike.category === 'TRAIN';
    const isPlane = strike.category === 'AIRPORT';
    const isSubway = strike.category === 'SUBWAY';
    const isBus = strike.category === 'BUS';

    let doodleCat: DoodleCategory = 'train';
    if (isPlane) doodleCat = 'plane';
    if (isSubway) doodleCat = 'subway';
    if (isBus) doodleCat = 'bus';

    const doodleTransportLabel: Record<DoodleCategory, string> = {
        train: '火车',
        plane: '飞机',
        subway: '地铁',
        bus: '公交',
    };

    // Calculate current time indicator for today
    const { isToday, timePct } = useMemo(() => {
        // Try getting local timezone date (Italy/Milan) for better accuracy, or use system local
        const now = new Date();
        // Since we are formatting in local time:
        const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const isToday = strike.date === todayStr;
        const timePct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
        return { isToday, timePct };
    }, [strike.date]);

    // ── Generate Segments ─────────────────────────────────────────────────────────
    const isMetro = isSubway;

    let title = "其他罢工";
    let subTitle = "相关人员";
    let icon = getTrainIcon(isDark ? '#0F172A' : 'white'); // Fallback
    const normalizedProvider = normalizeProviderList(strike.provider || '').join(' / ') || '相关人员';

    // Exact mapping requested from Figma, using actual provider if available
    if (isTrain) { title = "火车罢工"; subTitle = normalizedProvider || "国家铁路局"; icon = getTrainIcon(isDark ? '#0F172A' : 'white'); }
    else if (isPlane) {
        title = "机场罢工";
        subTitle = normalizedProvider || "航司与机场人员";
        icon = getPlaneIcon(isDark ? '#0F172A' : 'white');
    }
    else if (isMetro) { title = "地铁罢工"; subTitle = normalizedProvider || "ATM"; icon = getTrainIcon(isDark ? '#0F172A' : 'white'); }
    else if (isBus) { title = "公交罢工"; subTitle = normalizedProvider || "ATM"; icon = getTrainIcon(isDark ? '#0F172A' : 'white'); }

    // Strip Airport Title from tags if we used it as the main title
    let displayLines = strike.affected_lines && strike.affected_lines.length > 0 && strike.affected_lines[0] !== '全部线路' && strike.affected_lines[0] !== '全部车次'
        ? strike.affected_lines
        : (isPlane ? ['全部机场'] : ['全部线路']);
    displayLines = normalizeDisplayLines(displayLines, strike.category);

    // Status Tag Logic
    const isConfirmed = strike.status === 'CONFIRMED' || strike.status === 'CONFIRMED (STRIKE)';

    // Default bright theme tags
    let tagBg = isConfirmed ? 'bg-[#D1FAE5]' : 'bg-[#FEF9C3]';
    let tagBorder = isConfirmed ? 'border-[#059669]/20' : 'border-[#CA8A04]/20';
    let tagTextCol = isConfirmed ? 'text-[#059669]' : 'text-[#CA8A04]';
    let tagString = isConfirmed ? '已确认' : '待确认';

    if (strike.status === 'CANCELLED') {
        tagBg = isDark ? 'bg-white/10' : 'bg-[#F1F5F9]';
        tagTextCol = isDark ? 'text-white/60' : 'text-[#64748B]';
        tagBorder = isDark ? 'border-white/20' : 'border-[#E2E8F0]';
        tagString = '已取消';
    } else if (isDark) {
        tagBg = isConfirmed ? 'bg-[#5ab91b]' : 'bg-[#CA8A04]';
        tagBorder = 'border-black/20';
        tagTextCol = 'text-white';
    }

    // Time ranges parsing directly from server schema
    let timeSlots: { start: string, end: string }[] = strike.strike_windows || [{ start: "00:00", end: "24:00" }];
    if (timeSlots.length === 0) timeSlots.push({ start: "00:00", end: "24:00" });

    let isUnknownTime = false;
    if (timeSlots.length === 1 && timeSlots[0].start === '00:00' && timeSlots[0].end === '24:00' && (strike.duration_hours === '多时段' || strike.duration_hours === '待定' || strike.duration_hours === '部分时段')) {
        isUnknownTime = true;
    }

    const durationString = strike.duration_hours || "24小时";
    const timeLabelLines = durationString === "24小时"
        ? ["00:00 - 24:00"]
        : timeSlots.map((slot) => `${slot.start} - ${slot.end}`);

    // Track Calculation Limits
    let axisStartMin = 0;
    let axisEndMin = 24 * 60; // 1440
    let labelStart = "00:00";
    let labelEnd = "24:00";

    if (isMetro) {
        axisStartMin = 5 * 60 + 30; // 05:30
        axisEndMin = 24 * 60 + 30; // 24:30 (00:30 next day)
        labelStart = "05:30";
        labelEnd = "00:30 (次日)";
    } else if (isTrain) {
        axisStartMin = 5 * 60; // 05:00
        axisEndMin = 25 * 60; // 25:00 (01:00 next day)
        labelStart = "05:00";
        labelEnd = "01:00 (次日)";
    }

    // Fix for missing guarantee windows (like Plane strikes)
    // The background should be transparent grey like others (26% opacity of slate-200 or similar)
    // We handle this in the render logic below by checking if segment is 'grey'

    const guaranteeWindows = strike.guarantee_windows && strike.guarantee_windows.length > 0
        ? strike.guarantee_windows
        : buildFallbackGuarantees();

    let guarantees: { s: number, e: number }[] = [];
    if (guaranteeWindows && Array.isArray(guaranteeWindows)) {
        guarantees = guaranteeWindows.map((w: any) => {
            const [sh, sm] = w.start.split(':').map(Number);
            const [eh, em] = w.end.split(':').map(Number);
            let endMin = eh * 60 + em;
            if (endMin === 0) endMin = 24 * 60; // 24:00 is 1440
            return { s: sh * 60 + sm, e: endMin };
        });
    }

    const strikeIntervals = timeSlots.map((slot: any) => {
        let startMin = 0;
        let endMin = 24 * 60;

        // Match the full visual track width if it's strictly a 24h event
        if ((slot.start === '00:00' && slot.end === '24:00') || durationString.includes('24小时') || durationString.includes('24H')) {
            const effectiveStartMin = (isMetro || isBus) || isTrain ? axisStartMin : 0;
            const effectiveEndMin = (isMetro || isBus) || isTrain ? axisEndMin : 24 * 60;
            return { s: effectiveStartMin, e: effectiveEndMin };
        }

        const [sh, sm] = slot.start.split(':').map(Number);
        const [eh, em] = slot.end.split(':').map(Number);
        startMin = sh * 60 + sm;
        endMin = eh * 60 + em;
        if (endMin <= startMin && endMin === 0) endMin = 24 * 60;
        if (endMin < startMin) endMin += 24 * 60;
        return { s: startMin, e: endMin };
    });

    const getSegmentColor = (min: number) => {
        const isStriking = strikeIntervals.some(inv => min >= inv.s && min < inv.e);
        if (!isStriking) return 'grey';
        const isGuaranteed = guarantees.some(inv => min >= inv.s && min < inv.e);
        if (isGuaranteed) return 'green';
        return 'red';
    };

    let points = new Set([axisStartMin, axisEndMin]);
    strikeIntervals.forEach((inv: any) => { points.add(inv.s); points.add(inv.e); });
    guarantees.forEach((inv: any) => { points.add(inv.s); points.add(inv.e); });

    let sortedPoints = Array.from(points).filter(p => p >= axisStartMin && p <= axisEndMin).sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const segStart = sortedPoints[i];
        const segEnd = sortedPoints[i + 1];
        if (segStart === segEnd) continue;
        const mid = (segStart + segEnd) / 2;
        const colorType = getSegmentColor(mid);
        const widthPct = ((segEnd - segStart) / (axisEndMin - axisStartMin)) * 100;
        segments.push({ colorType, widthPct });
    }

    // Calculate intersected guarantees text for display
    let intersectedGuarantees: { s: number, e: number }[] = [];
    guarantees.forEach((g: any) => {
        strikeIntervals.forEach((s: any) => {
            const overlapS = Math.max(g.s, s.s);
            const overlapE = Math.min(g.e, s.e);
            if (overlapS < overlapE) {
                intersectedGuarantees.push({ s: overlapS, e: overlapE });
            }
        });
    });

    intersectedGuarantees.sort((a, b) => a.s - b.s);
    const formatMin = (m: number) => {
        const h = Math.floor(m / 60) % 24;
        const mm = m % 60;
        return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    };

    // De-duplicate any identical guarantees
    const uniqueIntersected = Array.from(new Set(intersectedGuarantees.map(g => `${formatMin(g.s)} - ${formatMin(g.e)}`)));


    return (
        <div className={`w-full transition-all duration-300 ${isDark
            ? 'bg-black/70 ring-[3px] ring-black/20 rounded-[32px] overflow-hidden shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)]'
            : 'bg-white border-[3px] border-white/20 rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] overflow-hidden'
            }`}>
            {/* Header portion */}
            <div className="flex justify-between items-start pt-[20px] pb-[16px] px-6 gap-3 w-full">
                <div className="flex gap-4 items-start flex-1 min-w-0">
                    <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${isDark ? 'bg-[#FFEC20]' : 'bg-[#475569]'}`}>
                            <div className="origin-center">{icon}</div>
                        </div>
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 mt-0.5">
                        <h3 className={`font-black text-[20px] leading-7 ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>{title}</h3>
                        <p className={`text-[11px] uppercase tracking-[0.3px] leading-snug break-words ${isDark ? 'text-[#AEBACA]' : 'text-[#677486]'}`}>{subTitle}</p>
                    </div>
                </div>
                <div className={`${tagBg} border ${tagBorder} rounded-full px-[12px] py-[7px] shrink-0`}>
                    <p className={`${tagTextCol} text-[14px] font-medium leading-none`}>{tagString}</p>
                </div>
            </div>

            {/* Time / Duration Center */}
            <div className="flex flex-col items-center pt-4 pb-4 w-full px-6 gap-2">
                <div className="flex flex-col items-center justify-center gap-1 text-center w-full">
                    {timeLabelLines.map((line, index) => (
                        <span
                            key={`${line}-${index}`}
                            className={`text-[36px] font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#1E293B]'} leading-tight`}
                        >
                            {line}
                        </span>
                    ))}
                </div>

                <div className={`mt-2 rounded-lg px-3 py-1 flex items-center border ${isDark ? 'bg-white/20 border-white/10' : 'bg-[#F1F5F9] border-transparent'}`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-2 ${isDark ? 'text-white/70' : 'text-[#475569]'}`}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span className={`text-[12px] font-medium ${isDark ? 'text-white/70' : 'text-[#475569]'}`}>{durationString}</span>
                </div>
            </div>

            {/* Strict Single Track Visualization */}
            <div className="mt-8 px-6 w-full">
                <div className={`relative h-[8px] w-full rounded-full overflow-hidden flex ${isDark ? 'bg-[#E2E8F0]/25' : 'bg-gray-200'}`}>
                    {/* Current Time Indicator */}
                    {isToday && (
                        <div
                            className={`absolute top-0 bottom-0 w-[3px] z-20 ${isDark ? 'bg-white' : 'bg-black'}`}
                            style={{ left: `${timePct}%` }}
                        />
                    )}
                    {isUnknownTime ? (
                        <div className="h-full w-full" style={{
                            background: isDark
                                ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.5) 0, rgba(0,0,0,0.5) 10px, #ca8a04 10px, #ca8a04 20px)'
                                : 'repeating-linear-gradient(45deg, rgba(0,0,0,0.5) 0, rgba(0,0,0,0.5) 10px, #facc15 10px, #facc15 20px)'
                        }} />
                    ) : (
                        segments.map((seg, idx) => {
                            let bgColor = 'bg-transparent';
                            let glowStyle = '';
                            let zIndex = 'z-0';

                            if (seg.colorType === 'red') bgColor = isDark ? 'bg-[#de4141]' : 'bg-[#EF4444]';
                            if (seg.colorType === 'green') {
                                bgColor = isDark ? 'bg-[#5ab91b]' : 'bg-[#10B981]';
                                // Apply glow if expanded
                                if (isExpanded) {
                                    glowStyle = isDark ? 'drop-shadow-[0_0_12px_rgba(90,185,27,1)] brightness-[1.3]' : 'drop-shadow-[0_0_12px_rgba(16,185,129,0.8)] brightness-110';
                                    zIndex = 'z-10 relative'; // lift above overflow hidden if possible, but keeping inline glow
                                }
                            }
                            return (
                                <div key={idx} className={`${bgColor} h-full ${glowStyle} ${zIndex} transition-all duration-300 first:rounded-l-full last:rounded-r-full`} style={{ width: `${seg.widthPct}%` }} />
                            )
                        })
                    )}
                </div>
            </div>

            {/* Labels under track */}
            <div className="flex justify-between px-6 pt-2 w-full text-[10px] font-medium text-[#94A3B8]">
                <span>{labelStart}</span>
                <span>{labelEnd}</span>
            </div>

            {/* Collapsible content block */}
            <div className={`mx-6 mt-8 mb-4 rounded-2xl ${isDark ? 'bg-white/5 p-[16px]' : 'bg-[#F8FAFC] p-4'}`}>
                {/* Guarantee Header */}
                <div
                    className="flex justify-between items-center w-full cursor-pointer"
                    onClick={() => { if (uniqueIntersected.length > 0) setIsExpanded(!isExpanded); }}
                >
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full border ${uniqueIntersected.length > 0 ? (isDark ? 'bg-[#5ab91b] border-black/20' : 'bg-[#10B981] border-black/20') : (isDark ? 'bg-[#de4141] border-black/20' : 'bg-[#EF4444] border-black/20')}`} />
                        <span className={`text-[14px] font-normal leading-[20px] ${isDark ? 'text-white' : 'text-[#334155]'}`}>
                            {uniqueIntersected.length > 0 ? "保障时间段" : "无保障计划"}
                        </span>
                    </div>
                    {uniqueIntersected.length > 0 && (
                        <div className="flex items-center">
                            <span className={`text-[12px] font-medium ${isDark ? 'text-[#5dcdff]' : 'text-[#0EA5E9]'}`}>{isExpanded ? '收起' : '展开'}</span>
                            <svg className={`w-3 h-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''} ${isDark ? 'text-[#5dcdff]' : 'text-[#0EA5E9]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    )}
                </div>

                {/* Guarantee Expandable Windows */}
                <div className={`transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[100px] mt-3 opacity-100' : 'max-h-0 opacity-0'}`}>
                    {uniqueIntersected.length > 0 && (
                        <div className="flex gap-[8px] flex-wrap items-start">
                            {uniqueIntersected.map((timeStr, i) => (
                                <div key={i} className={`flex items-center justify-center px-[13px] py-[2px] rounded-[20px] shrink-0 border border-solid ${isDark ? 'bg-[#87ff38]/10 border-white/10' : 'bg-[#10B981]/10 border-[#10B981]/20'
                                    }`}>
                                    <span className={`text-[12px] font-medium leading-[20px] whitespace-nowrap ${isDark ? 'text-[#9ffa63]' : 'text-[#10B981]'
                                        }`}>
                                        {timeStr}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Persistent Separator */}
                <div className={`mt-3 pt-3 border-t ${isDark ? 'border-[#e2e8f0]/20' : 'border-[#E2E8F0]'}`}>
                    <span className={`text-[12px] mb-2 block font-normal ${isDark ? 'text-white' : 'text-[#64748B]'}`}>{isPlane ? '受影响机场' : '受影响线路'}</span>
                    <div className="flex gap-2 flex-wrap">
                        {displayLines.map((line: string, i: number) => (
                            <div key={i} className={`flex items-center justify-center text-center px-[13px] py-[6px] rounded-[6px] shadow-sm border ${isDark ? 'bg-white/10 border-white/20 text-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]' : 'bg-white border-[#F1F5F9] text-[#334155]'}`}>
                                <span className="text-[12px] font-normal leading-none pt-[1px]">{line}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mx-6 mb-4 flex gap-3">
                <button
                    onClick={async () => {
                        const shareUrl = window.location.origin + '?date=' + strike.date;
                        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                        const platform = isWeChatBrowser() ? '微信' : (isMobile ? '系统原生' : 'desktop');

                        // Track share intent (always)
                        capture('share_intent_clicked', {
                            platform,
                            shared_date: strike.date,
                        });

                        // If mobile and secure context, prioritize native share sheet
                        if (isMobile && navigator.share && window.isSecureContext) {
                            try {
                                await navigator.share({
                                    title: '意大利罢工信息',
                                    text: '我想和你分享一个关于意大利的罢工信息，点击查看！',
                                    url: shareUrl
                                });
                                // User completed share
                                setShareState('copied');
                                setTimeout(() => setShareState('idle'), 2000);
                                return;
                            } catch (err) {
                                console.error('Error sharing:', err);
                                if (err instanceof Error && err.name === 'AbortError') return;
                            }
                        }

                        // Desktop or non-secure HTTP fallback: Copy to clipboard
                        try {
                            if (navigator.clipboard && window.isSecureContext) {
                                await navigator.clipboard.writeText(shareUrl);
                            } else {
                                // Fallback for LAN HTTP testing (like testing on iOS via local IP)
                                const textArea = document.createElement("textarea");
                                textArea.value = shareUrl;
                                textArea.style.position = "absolute";
                                textArea.style.left = "-999999px";
                                document.body.prepend(textArea);
                                textArea.select();
                                try {
                                    document.execCommand('copy');
                                } catch (err) {
                                    console.error("execCommand fallback failed", err);
                                } finally {
                                    textArea.remove();
                                }
                            }
                            setShareState('copied');
                            setTimeout(() => setShareState('idle'), 2000);
                        } catch (err) {
                            console.error('Error copying link:', err);
                        }
                    }}
                    className={`flex-1 flex justify-center items-center py-3.5 rounded-[30px] border transition-all ${isDark ? 'bg-white/10 border-white/20' : 'bg-[#F1F5F9] border-black/10 hover:bg-white/20'} ${shareState === 'copied' ? '!bg-green-500/80 !border-green-500 !text-white' : ''}`}
                >
                    {shareState === 'copied' ? (
                        <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-white">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span className="text-[14px] font-bold text-white">已复制链接</span>
                        </>
                    ) : (
                        <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-2 ${isDark ? 'text-white' : 'text-[#4C6982]'}`}>
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                <polyline points="16 6 12 2 8 6"></polyline>
                                <line x1="12" y1="2" x2="12" y2="15"></line>
                            </svg>
                            <span className={`text-[14px] font-bold ${isDark ? 'text-white' : 'text-[#4C6982]'}`}>分享</span>
                        </>
                    )}
                </button>
                <button
                    onClick={() => {
                        if (hasDoodled) return; // Disable replay logic as requested
                        handleDoodle();
                    }}
                    disabled={hasDoodled}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[30px] border-2 transition-all shadow-sm ${hasDoodled
                        ? (isDark ? 'bg-[#DE4141]/50 cursor-not-allowed border-black/40' : 'bg-[#DE4141]/50 cursor-not-allowed border-[rgba(0,0,0,0.2)]')
                        : (isDark ? 'bg-[#DE4141] hover:bg-red-600 active:scale-95 border-black/40' : 'bg-[#DE4141] hover:bg-red-600 active:scale-95 border-black/20')
                        }`}
                >
                    {/* Spray Can Icon */}
                    <svg width="24" height="20" viewBox="0 0 30 21" fill="none" xmlns="http://www.w3.org/2000/svg" className={'text-white'}>
                        <g id="Frame 32">
                            <path id="Vector" d="M20.4846 0.000108506C20.4567 -0.000497914 20.4287 0.00143849 20.4011 0.00589398L19.0046 2.47437C19.02 2.51517 19.0618 2.59627 19.1409 2.69482C19.3125 2.90835 19.6313 3.18221 20.0252 3.41424C20.419 3.64626 20.8107 3.79109 21.0778 3.83593C21.2009 3.85659 21.2906 3.85297 21.333 3.8461L21.6868 3.22085C21.6707 3.21295 21.6547 3.2051 21.639 3.19585C21.2968 2.99425 21.1796 2.54761 21.3771 2.19844C21.5746 1.84927 22.0122 1.72975 22.3543 1.9314C22.37 1.94059 22.3847 1.95092 22.3995 1.9612L22.7295 1.37784C22.7142 1.33703 22.6723 1.25583 22.5932 1.15728C22.4216 0.943801 22.1028 0.669938 21.7089 0.437915C21.3151 0.205789 20.9233 0.0610067 20.6564 0.0161723C20.5996 0.00650674 20.5422 0.00110311 20.4846 0.000108506ZM17.4122 2.50712C17.3604 2.50638 17.3087 2.5069 17.2569 2.50866C16.4405 2.53552 15.8544 2.83082 15.5257 3.41171C15.5117 3.4364 15.4889 3.50897 15.5595 3.70235C15.6302 3.89574 15.7944 4.16774 16.0433 4.46268C16.5412 5.05255 17.3678 5.73886 18.3744 6.33188C19.381 6.92495 20.3767 7.31224 21.1263 7.45739C21.501 7.53006 21.814 7.539 22.0134 7.50475C22.2128 7.47051 22.263 7.4141 22.2769 7.38946C22.5784 6.85662 22.5414 6.18002 22.159 5.43276C22.0408 5.20167 21.889 4.96825 21.7069 4.73907C21.6535 4.76077 21.5998 4.77729 21.5477 4.78866C21.3412 4.83411 21.1375 4.8243 20.9241 4.78845C20.4976 4.71676 20.0275 4.53034 19.5522 4.25033C19.0768 3.97027 18.6836 3.64807 18.4095 3.30685C18.2724 3.13624 18.1621 2.96114 18.0974 2.75593C18.0786 2.69541 18.0654 2.63322 18.058 2.57018C17.8341 2.53108 17.6176 2.5098 17.4122 2.50712ZM22.3336 2.75598L24.7078 8.94684L25.279 5.46191L28.1349 6.0331L25.8502 3.19585L28.7061 1.15728L25.0333 0.437915L22.3336 2.75598ZM14.9035 4.51134L9.2198 14.5574C9.19399 14.6035 9.17389 14.6874 9.24141 14.8841C9.30924 15.0817 9.46979 15.3557 9.71645 15.6523C10.2096 16.2454 11.0353 16.9315 12.0419 17.5246C13.0485 18.1176 14.0438 18.5043 14.7936 18.6436C15.1687 18.7133 15.4815 18.7181 15.683 18.6793C15.8844 18.6405 15.945 18.5811 15.971 18.5351L21.6549 8.48899C21.4324 8.48269 21.1978 8.45387 20.9498 8.40583C20.0531 8.23228 18.9853 7.80651 17.9014 7.16793C16.8174 6.52935 15.9223 5.79852 15.3266 5.09284C15.1618 4.8977 15.02 4.70483 14.9035 4.51134ZM16.5981 7.85718C16.8516 7.86183 17.0872 7.92329 17.296 8.04633C18.0385 8.48383 18.2886 9.60944 18.038 10.9634C17.9133 10.1051 17.4848 9.35815 16.7863 8.94684C16.0878 8.53569 15.2398 8.53031 14.4491 8.84922C15.185 8.2034 15.9502 7.84509 16.5981 7.85718ZM8.57784 15.6919L8.16785 16.4166C8.14188 16.4624 8.12179 16.5456 8.18961 16.7431C8.25744 16.9406 8.41789 17.2147 8.66449 17.5112C9.15749 18.1041 9.98274 18.79 10.9888 19.3829C11.9954 19.9759 12.9919 20.3632 13.7418 20.5025C14.1168 20.5723 14.4297 20.577 14.6312 20.5382C14.8326 20.4994 14.8932 20.44 14.9192 20.3942L15.3292 19.6695C15.106 19.6658 14.8713 19.6392 14.6241 19.5933C13.7211 19.4256 12.6527 18.9991 11.5688 18.3605C10.4849 17.7219 9.58889 16.991 8.99507 16.2768C8.83244 16.0813 8.69253 15.8873 8.57784 15.6919Z" fill="currentColor" />
                            <g id="Group 31">
                                <path id="Subtract" d="M8.10059 0.21875C10.6051 0.218813 12.8441 1.35581 14.3299 3.14159C14.5 3.34604 14.5074 3.63728 14.3625 3.86031C14.1102 4.24867 13.5359 4.24716 13.2336 3.89636C11.9911 2.45465 10.1531 1.54108 8.10059 1.54102C4.35741 1.54102 1.32227 4.57616 1.32227 8.31934C1.32236 11.5776 3.62221 14.2968 6.68689 14.9467C7.13439 15.0416 7.41228 15.5325 7.20444 15.94C7.08141 16.1812 6.81858 16.3208 6.55274 16.2693C2.8196 15.547 9.86645e-05 12.2634 0 8.31934C0 3.84576 3.62701 0.21875 8.10059 0.21875Z" fill="currentColor" />
                                <path id="Vector (Stroke)" d="M10.5969 9.17286C10.9558 9.24034 11.1921 9.58596 11.1247 9.94483C11.0572 10.3037 10.7116 10.5401 10.3527 10.4726C9.6567 10.3418 8.93786 10.408 8.27738 10.6636C7.61693 10.9193 7.04082 11.3542 6.61434 11.9196C6.39442 12.2112 5.98007 12.2692 5.68852 12.0493C5.39697 11.8294 5.33895 11.415 5.55887 11.1235C6.1337 10.3614 6.90994 9.77468 7.80014 9.43007C8.69023 9.08554 9.65889 8.99652 10.5969 9.17286Z" fill="currentColor" />
                                <path id="Ellipse 16" d="M5.83631 6.83563C5.83631 7.38344 5.39222 7.82752 4.84442 7.82752C4.29662 7.82752 3.85254 7.38344 3.85254 6.83563C3.85254 6.28783 4.29662 5.84375 4.84442 5.84375C5.39222 5.84375 5.83631 6.28783 5.83631 6.83563Z" fill="currentColor" />
                                <path id="Ellipse 17" d="M10.7455 6.0036C10.7455 6.5514 10.3014 6.99549 9.7536 6.99549C9.2058 6.99549 8.76172 6.5514 8.76172 6.0036C8.76172 5.4558 9.2058 5.01172 9.7536 5.01172C10.3014 5.01172 10.7455 5.4558 10.7455 6.0036Z" fill="currentColor" />
                            </g>
                        </g>
                    </svg>
                    <span className={`text-[15px] font-bold tracking-wide transition-colors text-white`}>
                        {!isDoodleCountLoaded && hasDoodled
                            ? '获取中...'
                            : hasDoodled
                                ? (doodleCount > 0 ? `${doodleCount} 人已表达不满` : '1 人被影响了')
                                : '我受影响了'
                        }
                    </span>
                </button>
            </div>

            {/* Doodle Canvas Container - Accordion open/close */}
            <div className={`transition-all duration-500 ease-in-out px-3 overflow-hidden ${isCanvasVisible ? 'h-[220px] opacity-100' : 'h-0 opacity-0'}`}>
                <DoodleCanvas
                    category={doodleCat}
                    count={doodleCount}
                    isAnimating={isAnimating}
                    isDark={isDark}
                    seed={String(strike.id)}
                />
            </div>

            {/* Doodle solidarity text */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden text-center px-4 ${isCanvasVisible ? 'max-h-[60px] opacity-100 py-2' : 'max-h-0 opacity-0 py-0'}`}>
                <span
                    className={`text-[14px] font-semibold block relative`}
                    style={isAnimating ? {
                        background: isDark
                            ? 'linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 40%, rgba(255,255,255,0.9) 55%, rgba(255,255,255,0.4) 100%)'
                            : 'linear-gradient(90deg, rgba(71,85,105,0.5) 0%, rgba(15,23,42,1) 40%, rgba(15,23,42,0.9) 55%, rgba(71,85,105,0.5) 100%)',
                        backgroundSize: '200% auto',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                        animation: 'shimmerSweep 1.5s ease-in-out',
                    } : { color: isDark ? 'rgba(255,255,255,0.65)' : '#64748b' }}
                >
                    还有 <strong style={isAnimating ? {} : { color: isDark ? 'rgba(255,255,255,0.92)' : '#334155', fontWeight: 700 }}>{doodleCount > 0 ? doodleCount : 1} 人</strong> 也被影响了，和你一起在{doodleTransportLabel[doodleCat]}上猛猛涂鸦                </span>
            </div>

            {/* Outgoing Source Link */}
            <div className={`w-full text-center py-4 border-t ${isDark ? 'border-white/20' : 'border-[#94A3B8]'}`}>
                <a href="http://scioperi.mit.gov.it/mit2/public/scioperi" target="_blank" rel="noopener noreferrer" className={`text-[10px] font-bold tracking-[0.5px] uppercase transition-colors underline underline-offset-2 ${isDark ? 'text-white/35 hover:text-white' : 'text-[#94A3B8] hover:text-[#0F172A]'}`}>
                    来源: 意大利交通部官网 (MIT) ➔
                </a>
            </div>

        </div>
    );
}
