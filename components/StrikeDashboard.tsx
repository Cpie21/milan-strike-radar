"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, MotionConfig, useAnimation } from "framer-motion";
import { useRouter } from "next/navigation";
import StrikeCard from "./StrikeCard";
import WechatGuide from "./WechatGuide";
import CalendarSyncModal from "./CalendarSyncModal";
import WidgetGuideModal from "./WidgetGuideModal";
import { aggregateStrikes, filterStrikesForRegion } from "./utils";
import { submitFeedback } from "../app/actions";
import { captureOnce, capture, getDeviceType } from "../utils/analytics";

// Real-world card flip: two-phase rotateX — card tilts away, jumps to other side, tilts back.
// Only animates on actual isDark VALUE CHANGES (not on mount), using prevDarkRef comparison.
// This is bulletproof against React StrictMode double-effect invocation.
function CardFlipWrapper({
    isDark, delay = 0, className, style, onClick, children,
}: {
    isDark: boolean; delay?: number; className?: string;
    style?: React.CSSProperties; onClick?: () => void; children: React.ReactNode;
}) {
    const controls = useAnimation();
    const prevDarkRef = useRef(isDark); // tracks LAST rendered isDark value
    const delayRef = useRef(delay);
    delayRef.current = delay;

    useEffect(() => {
        // Only animate if isDark actually CHANGED (skip on mount and StrictMode double-invoke)
        if (prevDarkRef.current === isDark) return;
        prevDarkRef.current = isDark;
        const run = async () => {
            if (delayRef.current > 0) await new Promise(r => setTimeout(r, delayRef.current * 1000));
            // Phase 1: tilt away — text sweeps back in 3D perspective
            await controls.start({
                rotateX: 82, filter: 'blur(10px)',
                transition: { duration: 0.11, ease: [0.65, 0, 1, 0.45] },
            });
            // Jump to other side while invisible (card edge-on)
            controls.set({ rotateX: -82 });
            // Phase 2: sweep back into view with new theme
            await controls.start({
                rotateX: 0, filter: 'blur(0px)',
                transition: { duration: 0.15, ease: [0, 0.55, 0.45, 1] },
            });
        };
        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDark]);

    return (
        <motion.div animate={controls} initial={false}
            style={{ originY: 0.5, ...style }} className={className} onClick={onClick}
        >
            {children}
        </motion.div>
    );
}

function RegionCityIcon({
    tag,
    active,
}: {
    tag: string;
    active: boolean;
}) {
    const stroke = active ? "#FFEC20" : "rgba(255,255,255,0.72)";
    const fill = active ? "rgba(255,236,32,0.14)" : "rgba(255,255,255,0.08)";

    if (tag === "MILANO") {
        return (
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path d="M5.5 21H20.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
                <path d="M8 21V11.8L13 6.5L18 11.8V21" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 4.5V21" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
                <path d="M10.3 9.2H15.7" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
                <path d="M9.8 13.5H11.1M14.9 13.5H16.2M9.8 17H11.1M14.9 17H16.2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        );
    }

    if (tag === "ROMA") {
        return (
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path d="M5 20.5H21" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
                <path d="M7.2 20.5V10.5C7.2 8.5 8.8 7 10.8 7H18.8V20.5" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.2 11H18.8" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
                <path d="M9.6 20.5V14.3M13 20.5V14.3M16.4 20.5V14.3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
                <path d="M9.1 14.3H16.9" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <path d="M6 21H20" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9 21V12.2L13 5.5L17 12.2V21" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 5.5V21" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10.5 12.5H15.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M12 8.7L14 8.7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// Shared animation variants for modals
const contentVariants = {
    hidden: { y: 40, opacity: 0, filter: "blur(10px)", WebkitFilter: "blur(10px)" },
    visible: {
        y: 0, opacity: 1, filter: "blur(0px)", WebkitFilter: "blur(0px)",
        transition: { duration: 0.3, staggerChildren: 0.08 }
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

// Figma Icons extracted or replaced with Tailwind SVG paths
const IconCalendar = () => (
    <svg
        width="12"
        height="13"
        viewBox="0 0 12 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M9.33333 1.33333V0H8V1.33333H4V0H2.66667V1.33333H0.666667C0.293333 1.33333 0 1.63333 0 2V12C0 12.3667 0.293333 12.6667 0.666667 12.6667H11.3333C11.7067 12.6667 12 12.3667 12 12V2C12 1.63333 11.7067 1.33333 11.3333 1.33333H9.33333ZM10.6667 11.3333H1.33333V4.66667H10.6667V11.3333Z"
            fill="#1E293B"
        />
    </svg>
);

const TransportIcons = {
    火车: (selected: boolean) => (
        <svg
            width="10"
            height="12"
            viewBox="0 0 10 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 relative"
        >
            <path
                d="M5.00004 0C2.23862 0 0 2.23862 0 5.00004V8.33337C0 9.25381 0.746193 10 1.66667 10L1 11V11.6667H9V11L8.33333 10C9.25381 10 10 9.25381 10 8.33337V5.00004C10 2.23862 7.76146 0 5.00004 0ZM2.5 8.33333C1.85567 8.33333 1.33333 7.811 1.33333 7.16667C1.33333 6.52233 1.85567 6 2.5 6C3.14433 6 3.66667 6.52233 3.66667 7.16667C3.66667 7.811 3.14433 8.33333 2.5 8.33333ZM4.16667 5H1.66667V2.5H4.16667V5ZM7.5 8.33333C6.85567 8.33333 6.33333 7.811 6.33333 7.16667C6.33333 6.52233 6.85567 6 7.5 6C8.14433 6 8.66667 6.52233 8.66667 7.16667C8.66667 7.811 8.14433 8.33333 7.5 8.33333ZM8.33333 5H5.83333V2.5H8.33333V5Z"
                fill={selected ? "white" : "rgba(0,0,0,0.4)"}
            />
        </svg>
    ),
    地铁: (selected: boolean) => (
        <svg
            width="10"
            height="12"
            viewBox="0 0 10 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 relative"
        >
            <path
                d="M5.00004 0C2.23862 0 0 2.23862 0 5.00004V8.33337C0 9.25381 0.746193 10 1.66667 10L1 11V11.6667H9V11L8.33333 10C9.25381 10 10 9.25381 10 8.33337V5.00004C10 2.23862 7.76146 0 5.00004 0ZM2.5 8.33333C1.85567 8.33333 1.33333 7.811 1.33333 7.16667C1.33333 6.52233 1.85567 6 2.5 6C3.14433 6 3.66667 6.52233 3.66667 7.16667C3.66667 7.811 3.14433 8.33333 2.5 8.33333ZM4.16667 5H1.66667V2.5H4.16667V5ZM7.5 8.33333C6.85567 8.33333 6.33333 7.811 6.33333 7.16667C6.33333 6.52233 6.85567 6 7.5 6C8.14433 6 8.66667 6.52233 8.66667 7.16667C8.66667 7.811 8.14433 8.33333 7.5 8.33333ZM8.33333 5H5.83333V2.5H8.33333V5Z"
                fill={selected ? "white" : "rgba(0,0,0,0.4)"}
            />
        </svg>
    ),
    公交: (selected: boolean) => (
        <svg
            width="10"
            height="12"
            viewBox="0 0 10 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 relative"
        >
            <path
                d="M0 8.5C0 9 0.5 9.5 1 9.5V10.5C1 11 1.5 11.5 2 11.5C2.5 11.5 3 11 3 10.5V10H7V10.5C7 11 7.5 11.5 8 11.5C8.5 11.5 9 11 9 10.5V9.5C9.5 9.5 10 9 10 8.5V2.5C10 0.5 7.5 0 5 0C2.5 0 0 0.5 0 2.5V8.5ZM2.5 8.5C2 8.5 1.5 8 1.5 7.5C1.5 7 2 6.5 2.5 6.5C3 6.5 3.5 7 3.5 7.5C3.5 8 3 8.5 2.5 8.5ZM7.5 8.5C7 8.5 6.5 8 6.5 7.5C6.5 7 7 6.5 7.5 6.5C8 6.5 8.5 7 8.5 7.5C8.5 8 8 8.5 7.5 8.5ZM8.5 5H1.5V2.5H8.5V5Z"
                fill={selected ? "white" : "rgba(0,0,0,0.4)"}
            />
        </svg>
    ),
    机场: (selected: boolean) => (
        <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 relative scale-[1.3]"
        >
            <path
                d="M11.5 7V6.5L6.5 3V0.5C6.5 0.223858 6.27614 0 6 0C5.72386 0 5.5 0.223858 5.5 0.5V3L0.5 6.5V7L5.5 5.5V9.5L4 10.5V11L6 10.5L8 11V10.5L6.5 9.5V5.5L11.5 7Z"
                fill={selected ? "white" : "rgba(0,0,0,0.4)"}
            />
        </svg>
    ),
};

export default function StrikeDashboard({
    strikesData,
    regionTag = "MILANO",
}: {
    strikesData: any[];
    regionTag?: string;
}) {
    const router = useRouter();
    // Helper functions
    const getLocalDateStr = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        );
    };

    const CN_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const REGION_LABELS: Record<string, string> = {
        MILANO: "米兰",
        ROMA: "罗马",
        TORINO: "都灵",
    };
    const REGION_OPTIONS = [
        { tag: "MILANO", label: "米兰", path: "/" },
        { tag: "ROMA", label: "罗马", path: "/roma" },
        { tag: "TORINO", label: "都灵", path: "/torino" },
    ];
    const activeRegionLabel = REGION_LABELS[regionTag.toUpperCase()] || "米兰";
    const [showRegionSelector, setShowRegionSelector] = useState<boolean>(false);
    const [selectorFocusTag, setSelectorFocusTag] = useState<string>(regionTag.toUpperCase());
    const WHEEL_REPEAT_COUNT = 7;
    const WHEEL_BASE_OFFSET = Math.floor(WHEEL_REPEAT_COUNT / 2) * REGION_OPTIONS.length;
    const [selectorWheelIndex, setSelectorWheelIndex] = useState<number>(REGION_OPTIONS.findIndex((opt) => opt.tag === regionTag.toUpperCase()) + WHEEL_BASE_OFFSET);
    const [selectorBadgeDirection, setSelectorBadgeDirection] = useState<0 | 1 | -1>(0);
    const regionNavTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const regionBadgeResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const regionTouchStartYRef = useRef<number | null>(null);
    const WHEEL_ITEM_HEIGHT = 72;
    const WHEEL_GAP = 12;
    const WHEEL_STEP = WHEEL_ITEM_HEIGHT + WHEEL_GAP;
    const WHEEL_VIEWPORT_HEIGHT = WHEEL_ITEM_HEIGHT * 3 + WHEEL_GAP * 2;

    const selectorWheelOptions = useMemo(() => {
        return Array.from({ length: WHEEL_REPEAT_COUNT }, (_, repeatIndex) =>
            REGION_OPTIONS.map((opt, optionIndex) => ({
                ...opt,
                wheelIndex: repeatIndex * REGION_OPTIONS.length + optionIndex,
            }))
        ).flat();
    }, [WHEEL_REPEAT_COUNT]);

    useEffect(() => {
        REGION_OPTIONS.forEach((opt) => {
            router.prefetch(opt.path);
        });
    }, [router]);

    useEffect(() => {
        setSelectorFocusTag(regionTag.toUpperCase());
        const index = REGION_OPTIONS.findIndex((opt) => opt.tag === regionTag.toUpperCase());
        setSelectorWheelIndex((index >= 0 ? index : 0) + WHEEL_BASE_OFFSET);
    }, [regionTag]);

    useEffect(() => {
        return () => {
            if (regionNavTimeoutRef.current) clearTimeout(regionNavTimeoutRef.current);
            if (regionBadgeResetTimeoutRef.current) clearTimeout(regionBadgeResetTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!showRegionSelector) return;

        const previousOverflow = document.body.style.overflow;
        const previousOverscroll = document.body.style.overscrollBehavior;
        document.body.style.overflow = "hidden";
        document.body.style.overscrollBehavior = "none";

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.overscrollBehavior = previousOverscroll;
        };
    }, [showRegionSelector]);

    const syncWheelIndex = useCallback((nextWheelIndex: number) => {
        const normalizedIndex = ((nextWheelIndex % REGION_OPTIONS.length) + REGION_OPTIONS.length) % REGION_OPTIONS.length;
        setSelectorWheelIndex(nextWheelIndex);
        setSelectorFocusTag(REGION_OPTIONS[normalizedIndex].tag);
    }, []);

    const triggerRegionChange = useCallback((targetTag: string) => {
        const target = REGION_OPTIONS.find((opt) => opt.tag === targetTag);
        if (!target) return;

        setSelectorFocusTag(target.tag);
        if (regionNavTimeoutRef.current) clearTimeout(regionNavTimeoutRef.current);

        regionNavTimeoutRef.current = setTimeout(() => {
            setShowRegionSelector(false);
            if (target.tag !== regionTag.toUpperCase()) {
                router.push(target.path);
            }
        }, 950);
    }, [router, regionTag]);

    const shiftRegionWheel = useCallback((direction: 1 | -1) => {
        const nextWheelIndex = selectorWheelIndex + direction;
        setSelectorBadgeDirection(direction);
        if (regionBadgeResetTimeoutRef.current) clearTimeout(regionBadgeResetTimeoutRef.current);
        regionBadgeResetTimeoutRef.current = setTimeout(() => {
            setSelectorBadgeDirection(0);
        }, 720);
        syncWheelIndex(nextWheelIndex);
        triggerRegionChange(selectorWheelOptions[nextWheelIndex]?.tag || REGION_OPTIONS[((nextWheelIndex % REGION_OPTIONS.length) + REGION_OPTIONS.length) % REGION_OPTIONS.length].tag);
    }, [selectorWheelIndex, selectorWheelOptions, syncWheelIndex, triggerRegionChange]);
    // States
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedCategories, setSelectedCategories] = useState<
        Record<string, boolean>
    >({
        火车: true,
        地铁: true,
        公交: true,
        机场: true,
    });

    // Theme Persistence State
    const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
    const [isThemeLoaded, setIsThemeLoaded] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDarkMode(mediaQuery.matches);
        setIsThemeLoaded(true);

        const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        } else {
            // Fallback for older Safari
            mediaQuery.addListener(handler);
            return () => mediaQuery.removeListener(handler);
        }
    }, []);

    const [showTutorial, setShowTutorial] = useState<boolean>(false);
    const [visibleMonth, setVisibleMonth] = useState<number>(
        new Date().getMonth() + 1,
    );
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const centerOffset = container.scrollLeft + container.clientWidth / 2;
        const itemOffset = centerOffset - 24; // subtract px-6 padding
        const approxIndex = Math.floor(itemOffset / 68); // ~68px width per item

        if (approxIndex >= 0 && daysStrip[approxIndex]) {
            const m = daysStrip[approxIndex].getMonth() + 1;
            if (m !== visibleMonth) {
                setVisibleMonth(m);
            }
        }
    };

    // Drag to scroll for desktop
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDragged, setIsDragged] = useState(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        setIsMouseDown(true);
        setIsDragged(false);
        setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
    };

    const handleMouseLeave = () => {
        setIsMouseDown(false);
    };

    const handleMouseUp = () => {
        setIsMouseDown(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isMouseDown || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 1.5; // Scroll speed

        // Threshold to distinguish between click and drag
        if (Math.abs(x - startX) > 5) {
            setIsDragged(true);
        }

        scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    };

    // Tutorial & Safari states
    const [isSafari, setIsSafari] = useState<boolean>(true);
    const [showDonatePopup, setShowDonatePopup] = useState<boolean>(false);
    const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
    const [showWidgetModal, setShowWidgetModal] = useState<boolean>(false);
    const [showDesktopWarning, setShowDesktopWarning] = useState<boolean>(false);
    const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
    const [highlightedStrikeId, setHighlightedStrikeId] = useState<string | null>(null);
    const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null);

    // Feedback States
    const [nickname, setNickname] = useState("");
    const [feedbackContent, setFeedbackContent] = useState("");
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            // Limit to ~3 lines. Assuming ~24px per line based on font size/padding.
            const maxHeight = 72;

            if (scrollHeight > maxHeight) {
                textarea.style.height = `${maxHeight}px`;
                textarea.style.overflowY = 'auto';
            } else {
                textarea.style.height = `${scrollHeight}px`;
                textarea.style.overflowY = 'hidden';
            }
        }
    }, [feedbackContent]);

    const handleFeedbackSubmit = async () => {
        if (!feedbackContent.trim()) return;
        setIsSubmittingFeedback(true);
        const res = await submitFeedback(feedbackContent, nickname);
        setIsSubmittingFeedback(false);
        if (res.success) {
            alert("感谢您的反馈！");
            setFeedbackContent("");
            // Optionally clear nickname or keep it
        } else {
            alert("提交失败，请稍后重试");
        }
    };

    // Deep Linking: Auto-scroll and highlight
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const dateParam = params.get('date');
            if (dateParam) {
                // Ensure the date is selected
                const targetDate = new Date(dateParam);
                if (!isNaN(targetDate.getTime())) {
                    setSelectedDate(targetDate);
                    setHighlightedDate(dateParam);

                    setTimeout(() => {
                        const el = document.getElementById(`cards-list-top`);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                        // Remove highlight after 3 seconds
                        setTimeout(() => setHighlightedDate(null), 3000);
                    }, 500); // Give it time to render
                }
            }
        }
    }, []);
    const [donateAmount, setDonateAmount] = useState<number | string>(1);
    const [isCustomAmount, setIsCustomAmount] = useState(false);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setDonateAmount('');
            return;
        }
        const num = parseInt(val);
        if (!isNaN(num) && num >= 0 && num <= 999) {
            setDonateAmount(num);
        }
    };

    useEffect(() => {
        if (typeof window !== "undefined") {
            const ua = window.navigator.userAgent;
            const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            // True Safari has both "Safari/" and "Version/" 
            const isWebkit = /WebKit/i.test(ua);
            const hasSafari = /Safari/i.test(ua);
            const hasVersion = /Version/i.test(ua);

            // Block any known non-Safari iOS browsers
            const isThirdPartyIOS = /CriOS|FxiOS|EdgiOS|OPiOS|mercury|DuckDuckGo|Brave|Arc/i.test(ua);

            // WKWebView heuristic: many third-party browsers perfectly spoof Safari UA.
            // But they inject custom messageHandlers to communicate with the native Swift container.
            let isWKWebViewCustom = false;
            try {
                if ((window as any).webkit?.messageHandlers) {
                    const handlers = Object.keys((window as any).webkit.messageHandlers);
                    if (handlers.length > 0) isWKWebViewCustom = true;
                }
            } catch (e) { }

            let isRealSafariIOS = false;
            if (isIOS) {
                // If it passes the basic UA checks and has no known third-party signatures/messageHandlers,
                // we assume it's true Safari. We specifically DO NOT require 'PushManager' in window,
                // because PushManager is disabled in Safari's Private Browsing mode and other configurations.
                if (!isThirdPartyIOS && !isWKWebViewCustom && isWebkit && hasSafari && hasVersion) {
                    isRealSafariIOS = true;
                }
            }

            // On desktop Mac, check for true Safari
            // (Exclude Chrome, Arc, Edge, etc.)
            const isMacSafari = /Macintosh/.test(ua) && /Version\/[\d.]+.*Safari/.test(ua) && !/Chrome|Arc|Edg|Chromium/i.test(ua);

            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

            // Treat as Safari if it's real iOS Safari, real Mac Safari, or already installed as a PWA
            setIsSafari(isRealSafariIOS || isMacSafari || isStandalone);
        }
    }, [showTutorial]);

    // Track AppToDesktop_tutorial_success once per device if tutorial is open for 3+ seconds
    const tutorialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tutorialOpenedAtRef = useRef<number>(0);
    useEffect(() => {
        if (showTutorial) {
            tutorialOpenedAtRef.current = Date.now();
            tutorialTimerRef.current = setTimeout(() => {
                const timeSpent = Math.round((Date.now() - tutorialOpenedAtRef.current) / 1000);
                captureOnce('AppToDesktop_tutorial_success', {
                    AppToDesktop_time_spent_on_mask: timeSpent,
                });
            }, 3000);
        } else {
            if (tutorialTimerRef.current) clearTimeout(tutorialTimerRef.current);
        }
        return () => {
            if (tutorialTimerRef.current) clearTimeout(tutorialTimerRef.current);
        };
    }, [showTutorial]);

    // Initial scroll to today
    useEffect(() => {
        const dateStr = getLocalDateStr(new Date());
        const el = document.getElementById(`date-btn-${dateStr}`);
        if (el) {
            el.scrollIntoView({
                behavior: "auto",
                inline: "center",
                block: "nearest",
            });
        }
    }, []);

    const dateInputRef = useRef<HTMLInputElement>(null);

    const scrollToDate = (d: Date) => {
        setSelectedDate(d);
        setTimeout(() => {
            const el = document.getElementById(`date-btn-${getLocalDateStr(d)}`);
            if (el)
                el.scrollIntoView({
                    behavior: "smooth",
                    inline: "center",
                    block: "nearest",
                });
        }, 50);
    };

    // Days strip generated from March 1st of current year to 30 days in the future
    const generateDays = () => {
        const today = new Date();
        const start = new Date(today); // Start from today
        const end = new Date(today);
        end.setDate(today.getDate() + 30);

        const days = [];
        let curr = new Date(start);
        curr.setHours(0, 0, 0, 0);
        const endDay = new Date(end);
        endDay.setHours(0, 0, 0, 0);

        while (curr <= endDay) {
            days.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }
        return days;
    };
    const daysStrip = generateDays();

    // Toggle category selection
    const toggleCategory = (cat: string) => {
        setSelectedCategories((prev) => ({
            ...prev,
            [cat]: !prev[cat],
        }));
    };

    const aggregatedData = useMemo(() => {
        const regionScoped = filterStrikesForRegion(strikesData, regionTag);
        const aggregated = aggregateStrikes(regionScoped);
        return filterStrikesForRegion(aggregated, regionTag);
    }, [strikesData, regionTag]);

    // Filter logic
    const filteredStrikes = useMemo(() => {
        const dateStr = getLocalDateStr(selectedDate);

        return aggregatedData.filter((strike: any) => {
            // 1. Date Exact Match
            if (strike.date !== dateStr) return false;

            // 2. Only allow known categories
            const cat = strike.category;
            const isTrain = cat === "TRAIN";
            const isPlane = cat === "AIRPORT";
            const isMetro = cat === "SUBWAY";
            const isBus = cat === "BUS";

            if (!isTrain && !isPlane && !isMetro && !isBus) return false;

            return true;
        });
    }, [aggregatedData, selectedDate]);
    const selectedDateStr = getLocalDateStr(selectedDate);
    const hasStrikesToday = aggregatedData.some(
        (s: any) => s.date === selectedDateStr,
    );
    const blurInitial = { opacity: 0, filter: "blur(10px)", WebkitFilter: "blur(10px)" };
    const blurAnimate = { opacity: 1, filter: "blur(0px)", WebkitFilter: "blur(0px)" };
    const blurExit = { opacity: 0, filter: "blur(10px)", WebkitFilter: "blur(10px)" };
    const noStrikesInitial = { scale: 0.95, y: 10 };
    const noStrikesAnimate = { scale: 1, y: 0 };
    const noStrikesExit = { scale: 0.95 };
    const strikeInitial = { scale: 0.95, y: -50 };
    const strikeAnimate = { scale: 1, y: 0 };
    const strikeExit = { scale: 0.95, y: 20 };

    // Background gradient with higher diffusion (spread out color stops)
    const pageGradient = isDarkMode
        ? "linear-gradient(180deg, #000000 0%, #1a2732 30%, #3A566C 50%, #1a2732 70%, #000000 100%)"
        : "linear-gradient(180deg, #3A566C 0%, #68859d 25%, #EBF4FF 50%, #f4f8fc 80%, #ffffff 100%)";

    // Shared card-flip animation: vertical (rotateX), fast spring, directional blur
    const flipEnter = { rotateX: -70, scaleY: 0.6, filter: 'blur(10px)', opacity: 0 };
    const flipVisible = { rotateX: 0, scaleY: 1, filter: 'blur(0px)', opacity: 1 };
    const flipExit = { rotateX: 70, scaleY: 0.6, filter: 'blur(10px)', opacity: 0 };
    const flipTransitionBase = { type: 'spring' as const, stiffness: 700, damping: 38, mass: 0.8 };


    return (
        <MotionConfig reducedMotion="never">
            <main className="min-h-[100dvh] w-full flex items-start justify-center overflow-x-hidden relative">
                <WechatGuide />

                {/* Dynamic Wave Background */}
                <motion.div
                    className="fixed inset-0 pointer-events-none -z-10"
                    initial={{ backgroundImage: pageGradient, x: "0%" }}
                    animate={{
                        backgroundImage: pageGradient,
                        x: ["-5%", "0%", "-5%"] // Slow horizontal wave oscillation
                    }}
                    transition={{
                        backgroundImage: { duration: 1.2, ease: "easeInOut" },
                        x: { duration: 15, ease: "easeInOut", repeat: Infinity }
                    }}
                    style={{
                        width: "110vw", // Wider than viewport to allow panning
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "100% 100dvh",
                        backgroundPosition: "top center",
                        opacity: isThemeLoaded ? 1 : 0 // Prevent flash on mount
                    }}
                />
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
                    html {
                        min-height: 100%;
                        height: 100%;
                    }
                    body {
                        background-image: none;
                        background-attachment: scroll;
                        background-color: ${isDarkMode ? "#000000" : "#E5ECF3"};
                        margin: 0;
                        padding: 0;
                        min-height: 100dvh;
                    }
                `,
                    }}
                />
                <div className="w-full min-h-[100dvh] relative flex flex-col sm:max-w-[480px] sm:mx-auto">
                    {/* 1. Header (Sticky) */}
                    <div className="flex flex-col gap-2 pt-12 pb-4 px-6 relative w-full shrink-0 z-20">
                        <div className="flex items-start justify-between w-full">
                            <div className="flex flex-col">
                                <h1 className="text-white text-[12px] font-bold tracking-[0.3px]">
                                    意大利罢工查询
                                </h1>
                                <span className="text-white text-[8px] tracking-[0.5px] uppercase font-bold">
                                    Developed by 21'C
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {process.env.NODE_ENV === 'development' && (
                                    <button
                                        onClick={() => {
                                            Object.keys(localStorage).forEach(key => {
                                                if (key.startsWith('doodled_')) localStorage.removeItem(key);
                                            });
                                            window.location.reload();
                                        }}
                                        className="px-2 py-1.5 text-[10px] bg-red-500/80 text-white rounded-full font-bold transition-all hover:bg-red-600 border border-red-400"
                                    >
                                        清除涂鸦缓存
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        const device = getDeviceType();
                                        if (device === 'desktop') {
                                            setShowDesktopWarning(true);
                                            setTimeout(() => setShowDesktopWarning(false), 3000);
                                        } else {
                                            setShowTutorial(true);
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isDarkMode ? "bg-white/10 border-white/20 hover:bg-white/20" : "bg-white/20 border-white/10 hover:bg-[#E2E8F0]"}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full relative ${isDarkMode ? "bg-[#FFEC20] shadow-[0_0_8px_2px_rgba(255,236,32,0.6)]" : "bg-white"}`}></div>
                                    <span className="text-white text-[13px] font-bold leading-tight">
                                        添加到桌面
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectorFocusTag(regionTag.toUpperCase());
                                        setShowRegionSelector(true);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${isDarkMode ? "bg-white/10 border-white/20 hover:bg-white/20" : "bg-white/20 border-white/10 hover:bg-[#E2E8F0]"}`}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                        <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    <span className="text-white text-[13px] font-bold leading-tight">
                                        {activeRegionLabel}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-end justify-between mt-4">
                            <h2 className="text-white text-[34px] font-black tracking-[-0.85px] leading-tight">
                                {visibleMonth}月罢工信息
                            </h2>
                            <div className="relative flex items-center justify-center">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full border border-white/20 shadow-lg pointer-events-none relative z-10 cursor-pointer">
                                    <IconCalendar />
                                    <span className="text-[#1E293B] text-[13px] font-bold">
                                        选择日期
                                    </span>
                                </div>
                                {daysStrip.length > 0 && (
                                    <input
                                        type="date"
                                        className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-30"
                                        min={getLocalDateStr(new Date()) > getLocalDateStr(daysStrip[0]) ? getLocalDateStr(new Date()) : getLocalDateStr(daysStrip[0])}
                                        max={getLocalDateStr(daysStrip[daysStrip.length - 1])}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                const [y, m, d] = e.target.value.split('-');
                                                const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
                                                scrollToDate(dt);
                                            }
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 2. Controls & Strip */}
                    <div className="flex flex-col gap-2 w-full shrink-0 z-30 relative pt-0 pb-0">
                        {/* Date Strip */}
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                            className={`relative w-full overflow-x-auto overflow-y-visible flex items-center px-6 pt-6 pb-8 -mt-2 -mb-6 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMouseDown ? 'cursor-grabbing active:snap-none' : 'cursor-grab'}`}
                            style={{ scrollSnapType: isMouseDown ? 'none' : 'x mandatory' }}
                        >
                            <AnimatePresence mode="popLayout" initial={false}>
                                <motion.div
                                    className="flex items-center gap-3"
                                    layout
                                >
                                    {daysStrip.map((d, i) => {
                                        const dateStr = getLocalDateStr(d);
                                        const dayHasStrike = aggregatedData.some(
                                            (s: any) => s.date === dateStr,
                                        );
                                        const selected = dateStr === getLocalDateStr(selectedDate);
                                        return (
                                            <motion.button
                                                layout
                                                key={dateStr}
                                                id={`date-btn-${dateStr}`}
                                                onClick={() => {
                                                    // Only select if we haven't dragged
                                                    if (!isDragged) {
                                                        setSelectedDate(d);
                                                    }
                                                }}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                className={`flex flex-col items-center justify-center min-w-[56px] h-[72px] rounded-3xl snap-center transition-all duration-300 backdrop-blur-sm relative overflow-visible ${selected
                                                    ? "bg-white border-white scale-105 shadow-xl h-[78px] min-w-[62px]"
                                                    : "bg-white/10 border-white/10 hover:bg-white/20"
                                                    } border`}
                                            >
                                                <span
                                                    className={`text-xs z-20 ${selected ? "text-[#64748B]" : "text-white/80"}`}
                                                >
                                                    {CN_DAYS[d.getDay()]}
                                                </span>
                                                <span
                                                    className={`text-lg font-bold z-20 ${selected ? "text-[#0F172A] text-2xl" : "text-white/80"}`}
                                                >
                                                    {d.getDate()}
                                                </span>
                                                {isToday(d) && selected && (
                                                    <span className="text-[#0EA5E9] text-[8px] font-medium leading-tight z-20">
                                                        今天
                                                    </span>
                                                )}
                                                {dayHasStrike && (
                                                    <div className="absolute bottom-0 left-0 w-full h-[40%] bg-gradient-to-t from-red-500/40 to-transparent pointer-events-none z-0 rounded-b-3xl"></div>
                                                )}
                                            </motion.button>
                                        );
                                    })}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Transport Filter Toggles */}
                    <div
                        className={`w-full relative z-20 flex items-center justify-center overflow-visible transition-[height,margin] duration-200 ${hasStrikesToday ? "mt-2 h-[56px]" : "mt-0 h-0"
                            }`}
                    >
                        <AnimatePresence initial={false} mode="wait">
                            {hasStrikesToday && (
                                <motion.div
                                    key={`filters-${selectedDateStr}`}
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1.0] }}
                                    className="flex justify-center gap-2 px-6 w-full overflow-visible"
                                >
                                    {["火车", "地铁", "公交", "机场"].map((cat) => {
                                        const isSelected = selectedCategories[cat];

                                        // Check if this category has a strike on the selected day
                                        const categoryHasStrike = aggregatedData.some((strike: any) => {
                                            if (strike.date !== selectedDateStr) return false;
                                            if (cat === "火车" && strike.category === "TRAIN")
                                                return true;
                                            if (cat === "机场" && strike.category === "AIRPORT")
                                                return true;
                                            if (cat === "公交" && strike.category === "BUS") return true;
                                            if (cat === "地铁" && strike.category === "SUBWAY")
                                                return true;
                                            return false;
                                        });

                                        // Only render the filter if this category has a strike today
                                        if (!categoryHasStrike) return null;

                                        return (
                                            <button
                                                key={cat}
                                                onClick={() => {
                                                    const mapCat: Record<string, string> = { '火车': 'TRAIN', '地铁': 'SUBWAY', '公交': 'BUS', '机场': 'AIRPORT' };
                                                    const targetCategory = mapCat[cat];

                                                    // Highlight all cards of this category
                                                    setHighlightedCategory(targetCategory);
                                                    setTimeout(() => setHighlightedCategory(null), 1500);

                                                    const targetStrike = aggregatedData.find((s: any) => s.date === selectedDateStr && s.category === targetCategory);
                                                    if (targetStrike) {
                                                        const el = document.getElementById(`strike-card-${targetStrike.id}`);
                                                        if (el) {
                                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        }
                                                    }
                                                }}
                                                className="relative flex items-center justify-center gap-[8px] px-[16px] py-[8px] rounded-[10px] border-2 transition-all bg-black/40 border-black/20 text-white shadow-sm active:scale-95 overflow-visible"
                                            >
                                                {TransportIcons[cat as keyof typeof TransportIcons](
                                                    true,
                                                )}
                                                <span className="text-[14px] font-bold">{cat}</span>
                                                {categoryHasStrike && (
                                                    <div className="absolute flex h-[34px] items-center justify-center -left-[20px] -top-[20px] w-[34px] pointer-events-none z-10 origin-center scale-[1.15] -rotate-[16deg]">
                                                        <div className="flex-none drop-shadow-[0_0_12px_rgba(255,236,32,0.9)]" style={{ filter: 'drop-shadow(0 0 8px rgba(255,236,32,0.9)) drop-shadow(0 0 14px rgba(255,236,32,0.5))' }}>
                                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M11.1325 3.49896C11.5177 2.83368 12.4782 2.83368 12.8633 3.49896L22.1289 19.5031C22.5149 20.1698 22.0337 21.0041 21.2635 21.0041H2.73236C1.96202 21.0041 1.48096 20.1698 1.86693 19.5031L11.1325 3.49896Z" fill="#FFEC20" stroke="#0F172A" strokeLinejoin="round" strokeOpacity="0.8" strokeWidth="1.5" />
                                                                <rect x="11.2" y="8" width="1.8" height="6" rx="0.9" fill="#0F172A" fillOpacity="0.9" />
                                                                <circle cx="12.1" cy="16.5" r="1.1" fill="#0F172A" fillOpacity="0.9" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* 3. Strike Cards Single Track Info List */}
                    <div id="cards-list-top" className="flex flex-col gap-6 px-4 pt-2 pb-[120px] w-full z-10 relative" style={{ minHeight: 'calc(100dvh - 280px)' }}>
                        <AnimatePresence mode="wait" initial={false}>
                            {filteredStrikes.length === 0 ? (
                                <motion.div
                                    key="no-strikes"
                                    layout
                                    initial={noStrikesInitial}
                                    animate={noStrikesAnimate}
                                    exit={noStrikesExit}
                                    transition={{
                                        layout: { type: "spring", stiffness: 360, damping: 34, duration: 0.35 },
                                        scale: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] },
                                        y: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] }
                                    }}
                                    style={{ willChange: "transform" }}
                                    className="relative"
                                >
                                    <motion.div
                                        initial={blurInitial}
                                        animate={blurAnimate}
                                        exit={blurExit}
                                        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] }}
                                        style={{ willChange: "opacity, filter", transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                                    >
                                        <CardFlipWrapper isDark={isDarkMode} delay={0}
                                            className={`flex flex-col items-center justify-center py-20 backdrop-blur-md rounded-3xl border border-white/20 ${isDarkMode ? "bg-black/40" : "bg-white/90 shadow-sm"}`}
                                        >
                                            <span className={`text-xl font-bold ${isDarkMode ? "text-white/80" : "text-slate-800"}`}>
                                                {aggregatedData.some((s: any) => s.date === getLocalDateStr(selectedDate)) ? "当前筛选条件无罢工" : "当日无罢工"}
                                            </span>
                                            <span className={`text-sm mt-2 ${isDarkMode ? "text-white/50" : "text-slate-500"}`}>
                                                {aggregatedData.some((s: any) => s.date === getLocalDateStr(selectedDate)) ? "请尝试选择上方筛选项" : "安心出行"}
                                            </span>
                                        </CardFlipWrapper>
                                    </motion.div>
                                </motion.div>
                            ) : (
                                filteredStrikes.map((strike: any) => {
                                    const isHighlighted = highlightedStrikeId === strike.id || highlightedCategory === strike.category;
                                    return (
                                        <motion.div
                                            layout
                                            key={strike.id}
                                            id={`strike-card-${strike.id}`}
                                            initial={strikeInitial}
                                            animate={strikeAnimate}
                                            exit={strikeExit}
                                            transition={{
                                                layout: { type: "spring", bounce: 0.18, duration: 0.35 },
                                                scale: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] },
                                                y: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] }
                                            }}
                                            style={{ willChange: "transform" }}
                                            className="relative rounded-[32px] overflow-visible"
                                        >
                                            {/* Dedicated Highlight Wrapper */}
                                            <div
                                                className={`absolute inset-[-4px] pointer-events-none transition-opacity duration-[1500ms] ease-in-out z-0 ${isHighlighted ? "opacity-100" : "opacity-0"}`}
                                            >
                                                <div className="w-full h-full rounded-[36px] border-[3px] border-[#FFEC20] shadow-[0_0_20px_rgba(255,236,32,0.8)] animate-[pulse_1.5s_ease-in-out_infinite]" />
                                            </div>
                                            <motion.div
                                                initial={blurInitial}
                                                animate={blurAnimate}
                                                exit={blurExit}
                                                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] }}
                                                style={{ willChange: "opacity, filter", transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                                                className="relative z-10 w-full h-full"
                                            >
                                                <StrikeCard key={strike.id} strike={{ ...strike, region: regionTag }} isDark={isDarkMode} />
                                            </motion.div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </AnimatePresence>

                        {/* BOTTOM ELEMENTS FROM FIGMA */}
                        <div className="flex flex-col gap-4 w-full mt-[-8px] pb-8 shrink-0">
                            <div className="flex gap-4 items-stretch justify-center w-full">
                                {/* 添加小组件 */}
                                <CardFlipWrapper isDark={isDarkMode} delay={0}
                                    style={{ flex: '1 0 0' }}
                                    onClick={() => setShowWidgetModal(true)}
                                    className={`flex flex-col items-center justify-center p-[20px] rounded-[24px] transition-colors cursor-pointer hover:scale-[1.02] active:scale-95 ${isDarkMode
                                        ? "bg-black/70 ring-[3px] ring-black/20 hover:bg-black/80"
                                        : "bg-white border-[3px] border-white/20 hover:bg-slate-50"
                                        }`}
                                >
                                    <div
                                        className={`w-[48px] h-[48px] rounded-full flex items-center justify-center mb-[12px] transition-colors ${isDarkMode
                                            ? "bg-white/10 text-white"
                                            : "bg-slate-50 text-slate-800"
                                            }`}
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                                            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                                            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                                            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                                        </svg>
                                    </div>
                                    <span
                                        className={`text-[14px] font-medium leading-[20px] ${isDarkMode ? "text-white" : "text-slate-800"}`}
                                    >
                                        添加小组件
                                    </span>
                                    <span
                                        className={`text-[10px] mt-[4px] text-center font-normal leading-[15px] ${isDarkMode ? "text-white/50" : "text-slate-400"}`}
                                    >
                                        在主屏幕追踪罢工信息
                                    </span>
                                </CardFlipWrapper>
                                <CardFlipWrapper isDark={isDarkMode} delay={0.05}
                                    style={{ flex: '1 0 0' }}
                                    onClick={() => setShowSyncModal(true)}
                                    className={`flex flex-col items-center justify-center p-[20px] rounded-[24px] transition-colors cursor-pointer hover:scale-[1.02] active:scale-95 ${isDarkMode
                                        ? "bg-black/70 ring-[3px] ring-black/20 hover:bg-black/80"
                                        : "bg-white border-[3px] border-white/20 hover:bg-slate-50"
                                        }`}
                                >
                                    <div
                                        className={`w-[48px] h-[48px] rounded-full flex items-center justify-center mb-[12px] transition-colors ${isDarkMode
                                            ? "bg-white/10 text-white"
                                            : "bg-slate-50 text-slate-800"
                                            }`}
                                    >
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <polyline points="23 4 23 10 17 10"></polyline>
                                            <polyline points="1 20 1 14 7 14"></polyline>
                                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                        </svg>
                                    </div>
                                    <span
                                        className={`text-[14px] font-medium leading-[20px] ${isDarkMode ? "text-white" : "text-slate-800"}`}
                                    >
                                        同步日历
                                    </span>
                                    <span
                                        className={`text-[10px] mt-[4px] text-center font-normal leading-[15px] ${isDarkMode ? "text-white/50" : "text-slate-400"}`}
                                    >
                                        在本地日历中查看罢工事件
                                    </span>
                                </CardFlipWrapper>
                            </div>

                            <CardFlipWrapper isDark={isDarkMode} delay={0.10}
                                style={{ width: '100%' }}
                                className={`relative overflow-clip flex flex-col p-[25px] rounded-[25px] ${isDarkMode
                                    ? "bg-black/70 ring-[3px] ring-black/20"
                                    : "bg-white border-[3px] border-white/20"
                                    }`}
                            >
                                <div className="w-full relative shrink-0">
                                    <h3
                                        className={`text-[20px] leading-[28px] font-black uppercase m-0 z-10 ${isDarkMode ? "text-white" : "text-slate-800"}`}
                                    >
                                        支持作者
                                    </h3>
                                </div>
                                <div className="w-full relative shrink-0 pb-[8px] pr-[40px]">
                                    <p
                                        className={`text-[12px] leading-[16px] m-0 font-medium z-10 ${isDarkMode ? "text-[#d1d5db]" : "text-slate-400"}`}
                                    >
                                        独立开发不易，如果对你有用请支持一杯奶茶。
                                    </p>
                                </div>
                                <div
                                    onClick={() => setShowDonatePopup(true)}
                                    className="bg-[#1777ff] relative self-start rounded-[40px] shrink-0 z-10 px-[20px] py-[10px] cursor-pointer shadow-sm active:scale-95 transition-all flex items-center justify-center mt-2 group overflow-hidden"
                                >
                                    <span className="text-[14px] leading-[16px] font-bold text-center text-white whitespace-nowrap tracking-wide relative z-10">
                                        支持一下 / 反馈问题
                                    </span>
                                    <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:left-[100%] transition-all duration-[750ms] ease-in-out z-0" />
                                </div>
                                <div className="w-full relative shrink-0 z-10 pt-[24px] mt-[12px] border-t border-[transparent]">
                                    <div className="flex items-center justify-between w-full">
                                        <span
                                            className={`text-[20px] leading-[28px] font-black uppercase whitespace-nowrap ${isDarkMode ? "text-white" : "text-slate-600"}`}
                                        >
                                            或者点个关注{" "}
                                        </span>
                                        <button
                                            onClick={() => window.open('https://xhslink.com/m/6T4mEqx0B1s', '_blank')}
                                            className="cursor-pointer hover:scale-105 active:scale-95 transition-transform w-[56px] h-[25px] border-none p-0 bg-transparent flex items-center justify-center shadow-[0px_0px_15px_0px_rgba(255,0,51,0.6)] rounded-[12.5px]"
                                        >
                                            <img src="/xhs.svg" alt="小红书" className="w-full h-full object-contain" />
                                        </button>
                                    </div>
                                </div>
                                {/* Decorative element (Boba tea) */}
                                <div
                                    className={`absolute flex h-[114px] items-center justify-center right-[-7.56px] top-[-7.56px] w-[98.5px] pointer-events-none z-0`}
                                >
                                    <div className="flex-none rotate-12">
                                        <img
                                            src="/support-icon.png"
                                            alt="Support Icon"
                                            className={`w-[80px] h-[80px] object-contain ${isDarkMode ? "opacity-20 grayscale-0" : "opacity-[0.05] grayscale"}`}
                                        />
                                    </div>
                                </div>
                            </CardFlipWrapper>
                            
                            {/* MIT License Disclaimer */}
                            <div className="w-full flex justify-center text-center mt-[24px] mb-[12px] px-[20px]">
                                <p className={`text-[10px] leading-[14px] font-['Noto_Sans_SC'] ${isDarkMode ? "text-white/40" : "text-slate-400/80"}`}>
                                    本服务基于 MIT License 开源协议，使用本服务即代表您同意自行承担一切风险，重要出行请与官方信息核对。
                                </p>
                            </div>
                        </div>{/* end BOTTOM ELEMENTS flex-col */}
                    </div>{/* end cards-list-top */}
                </div>{/* end w-full min-h-100dvh */}
                <AnimatePresence>
                    {
                        showTutorial && (
                            <motion.div
                                initial="hidden" animate="visible" exit="hidden"
                                className="fixed inset-0 h-[100dvh] z-50 flex flex-col justify-center items-center px-[21px] overflow-hidden touch-none overscroll-none pointer-events-auto"
                                onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            >
                                {/* 1. Pure dark color background (No mask, covers everything) */}
                                <motion.div
                                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} transition={{ duration: 0.3 }}
                                    className="absolute inset-0 pointer-events-none"
                                    style={{ backgroundColor: 'rgba(15, 15, 15, 0.75)' }}
                                />

                                {/* 2. Pure blur effect layer with gradient mask (You can adjust the mask values here) */}
                                <motion.div
                                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} transition={{ duration: 0.3 }}
                                    className="absolute inset-0 backdrop-blur-[24px] pointer-events-none"
                                    style={{
                                        maskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                                        WebkitMaskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                                        transform: 'translateZ(0)',
                                        WebkitBackdropFilter: 'blur(24px)'
                                    }}
                                />

                                {/* Safari Redirection Prompt */}
                                {!isSafari && (
                                    <motion.div
                                        variants={itemVariants}
                                        className="absolute top-[80px] z-50"
                                    >
                                        <button
                                            onClick={() => {
                                                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                                    navigator.clipboard.writeText(window.location.href);
                                                    alert("链接已复制，请打开 Safari 浏览器粘贴并访问");
                                                } else {
                                                    const tempInput = document.createElement("input");
                                                    tempInput.value = window.location.href;
                                                    document.body.appendChild(tempInput);
                                                    tempInput.select();
                                                    document.execCommand("copy");
                                                    document.body.removeChild(tempInput);
                                                    alert("链接已复制，请打开 Safari 浏览器粘贴并访问");
                                                }
                                            }}
                                            className="bg-[#de4141] border-[3px] border-[rgba(0,0,0,0.4)] flex items-center justify-center px-[18px] py-[10px] rounded-[38px] shadow-[0_8px_32px_rgba(222,65,65,0.4)] transition-transform active:scale-95"
                                        >
                                            <div className="flex flex-col font-['Noto_Sans_SC'] font-bold justify-center leading-[21px] text-[15px] text-center text-white whitespace-nowrap">
                                                <p className="font-['Noto_Sans_SC'] font-[350] mb-0">需要在 Safari 浏览器上进行</p>
                                                <p className="underline decoration-solid underline-offset-2">一键复制链接</p>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}

                                {/* Close Trigger Area */}
                                <div className="absolute inset-0 z-0 cursor-pointer" onClick={() => setShowTutorial(false)} />

                                {/* Tutorial Modal Content */}
                                <motion.div
                                    variants={contentVariants}
                                    initial="hidden" animate="visible" exit="hidden"
                                    className="relative z-10 w-full sm:max-w-[440px] flex flex-col items-start mt-0"
                                >

                                    {/* Header */}
                                    <motion.div
                                        variants={itemVariants}
                                        className="flex items-center justify-between w-full mb-[21px]"
                                    >
                                        <div className="flex items-center gap-[8px]">
                                            <div className="bg-[#FFEC20] border border-black/20 flex items-center justify-center rounded-[8px] w-[42px] h-[32px]">
                                                <svg width="24" height="20" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <g id="Container">
                                                        <path id="Vector" d="M5.84946 12.137C5.18292 11.7665 4.36364 12.2484 4.36364 13.011V15.1673C4.36364 15.5304 4.56045 15.8649 4.87782 16.0413L11.5142 19.73C11.8163 19.8979 12.1837 19.8979 12.4858 19.73L19.1222 16.0413C19.4396 15.8649 19.6364 15.5304 19.6364 15.1673V13.011C19.6364 12.2484 18.8171 11.7665 18.1505 12.137L12.4858 15.2855C12.1837 15.4534 11.8163 15.4534 11.5142 15.2855L5.84946 12.137ZM12.4856 0.269802C12.1836 0.102011 11.8164 0.102011 11.5144 0.269802L1.57348 5.79251C0.887674 6.17351 0.887674 7.15982 1.57348 7.54082L11.5144 13.0635C11.8164 13.2313 12.1836 13.2313 12.4856 13.0635L22.4265 7.54082C23.1123 7.15982 23.1123 6.17351 22.4265 5.79251L12.4856 0.269802Z" fill="black" />
                                                    </g>
                                                </svg>
                                            </div>
                                            <span className="text-[#FFEC20] text-[20px] font-bold leading-tight font-['Noto_Sans_SC']">添加网站到桌面</span>
                                        </div>
                                        <button
                                            onClick={() => setShowTutorial(false)}
                                            className="w-[32px] h-[32px] flex items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md border border-white/20"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                        </button>
                                    </motion.div>

                                    {/* Cards Sequence - plain div so staggerChildren propagates through to grandchildren */}
                                    <div className="w-full flex flex-col gap-[15px]">
                                        {/* Step 1 */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-white/10 border-[3px] border-black/20 rounded-[32px] p-[5px] flex shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full overflow-hidden backdrop-blur-md relative h-[127px]"
                                        >
                                            <div className="flex flex-col items-center justify-center text-white text-center shrink-0 flex-1 z-10 gap-1">
                                                <span className="text-[18px] font-medium leading-none">①</span>
                                                <span className="text-[14px] tracking-tight font-bold leading-tight">点击底部容器右侧<br />三个点</span>
                                            </div>
                                            <div className="border border-white/20 rounded-[28px] w-[195px] h-[117px] shrink-0 relative overflow-hidden bg-white/5 z-0">
                                                <img src="/assets/tutorial-step-1.png" alt="Step 1" className="w-full h-full object-cover" />
                                            </div>
                                        </motion.div>

                                        {/* Step 2 */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-white/10 border-[3px] border-black/20 rounded-[32px] p-[5px] flex shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full overflow-hidden backdrop-blur-md relative h-[127px]"
                                        >
                                            <div className="flex flex-col items-center justify-center text-white text-center shrink-0 flex-1 z-10 gap-1">
                                                <span className="text-[18px] font-medium leading-none">②</span>
                                                <span className="text-[15px] font-bold leading-tight">点击共享</span>
                                            </div>
                                            <div className="border border-white/20 rounded-[28px] w-[195px] h-[117px] shrink-0 relative overflow-hidden bg-white/5 z-0">
                                                <img src="/assets/tutorial-step-2.png" alt="Step 2" className="w-full h-full object-cover" />
                                            </div>
                                        </motion.div>

                                        {/* Step 3 */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-white/10 border-[3px] border-black/20 rounded-[32px] p-[5px] flex shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full overflow-hidden backdrop-blur-md relative h-[127px]"
                                        >
                                            <div className="flex flex-col items-center justify-center text-white text-center shrink-0 flex-1 z-10 gap-1">
                                                <span className="text-[18px] font-medium leading-none">③</span>
                                                <span className="text-[15px] font-bold leading-tight">展开更多</span>
                                            </div>
                                            <div className="border border-white/20 rounded-[28px] w-[195px] h-[117px] shrink-0 relative overflow-hidden bg-white/5 z-0">
                                                <img src="/assets/tutorial-step-3.png" alt="Step 3" className="w-full h-full object-cover" />
                                            </div>
                                        </motion.div>

                                        {/* Step 4 */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-white/10 border-[3px] border-black/20 rounded-[32px] p-[5px] flex shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full overflow-hidden backdrop-blur-md relative h-[127px]"
                                        >
                                            <div className="flex flex-col items-center justify-center text-white text-center shrink-0 flex-1 z-10 gap-1">
                                                <span className="text-[18px] font-medium leading-none">④</span>
                                                <span className="text-[15px] font-bold leading-tight">添加到主屏幕</span>
                                            </div>
                                            <div className="border border-white/20 rounded-[28px] w-[195px] h-[117px] shrink-0 relative overflow-hidden bg-white/5 z-0">
                                                <img src="/assets/tutorial-step-4.png" alt="Step 4" className="w-full h-full object-cover" />
                                            </div>
                                        </motion.div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )
                    }
                </AnimatePresence >

                {/* Calendar Sync Popup */}
                < WidgetGuideModal
                    isOpen={showWidgetModal}
                    onClose={() => setShowWidgetModal(false)
                    }
                    isDark={isDarkMode}
                    regionTag={regionTag}
                />
                <CalendarSyncModal
                    isOpen={showSyncModal}
                    onClose={() => setShowSyncModal(false)}
                    strikes={aggregatedData}
                    isDark={isDarkMode}
                    regionTag={regionTag}
                    onScrollToCategory={(categoryId) => {
                        const todayStr = getLocalDateStr(selectedDate);
                        // Map categoryId to uppercase for matching backend
                        const mapCat: Record<string, string> = { train: 'TRAIN', subway: 'SUBWAY', bus: 'BUS', plane: 'AIRPORT' };
                        const targetCategory = mapCat[categoryId];
                        if (!targetCategory) return;

                        const targetStrike = aggregatedData.find((s: any) => s.date === todayStr && s.category === targetCategory);
                        if (targetStrike) {
                            const el = document.getElementById(`strike-card-${targetStrike.id}`);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // Highlight it briefly
                                setHighlightedStrikeId(targetStrike.id);
                                setTimeout(() => setHighlightedStrikeId(null), 2000);
                            }
                        }
                    }}
                />

                {/* Donate Popup Overlay */}
                <AnimatePresence>
                    {showDonatePopup && (
                        <motion.div
                            initial="hidden" animate="visible" exit="hidden"
                            className="fixed inset-0 h-[100dvh] z-50 flex flex-col justify-center items-center px-[32px] overflow-hidden touch-none overscroll-none pointer-events-auto"
                        >
                            {/* 1. Pure dark color background (No mask, covers everything) */}
                            <motion.div
                                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} transition={{ duration: 0.3 }}
                                className="absolute inset-0 pointer-events-none"
                                style={{ backgroundColor: 'rgba(15, 15, 15, 0.75)' }}
                            />

                            {/* 2. Pure blur effect layer with gradient mask (You can adjust the mask values here) */}
                            <motion.div
                                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} transition={{ duration: 0.3 }}
                                className="absolute inset-0 backdrop-blur-[24px] pointer-events-none"
                                style={{
                                    maskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                                    transform: 'translateZ(0)',
                                    WebkitBackdropFilter: 'blur(24px)'
                                }}
                            />

                            {/* Invisible full screen layer to click close */}
                            <div className="absolute inset-0 z-0" onClick={() => setShowDonatePopup(false)} />

                            <motion.div
                                variants={contentVariants}
                                initial="hidden" animate="visible" exit="hidden"
                                className="flex flex-col gap-[13px] items-center relative w-full max-w-[400px] z-10"
                            >
                                {/* Children use plain div wrappers so staggerChildren propagates through */}
                                <div className="flex flex-col gap-[21px] items-start relative shrink-0 w-full">
                                    <motion.div
                                        variants={itemVariants}
                                        className="flex items-center justify-between relative shrink-0 w-full"
                                    >
                                        <div className="flex gap-[8px] items-center relative shrink-0">
                                            <div className="bg-[#1878ff] border border-[rgba(0,0,0,0.2)] flex px-[6.5px] py-[5px] items-center justify-center relative rounded-[8px]">
                                                <svg width="22" height="22" viewBox="0 0 21.5093 21.5079" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12.8787 0.363657C13.855 -0.0401462 14.9378 -0.109813 15.9578 0.165414C16.9778 0.440644 17.8777 1.04603 18.5183 1.88612C19.0727 2.61312 19.4046 3.48093 19.4812 4.38612C20.0461 4.78209 20.5241 5.29927 20.8748 5.90858C21.5044 7.00258 21.6738 8.3021 21.3455 9.52088C21.0182 10.7354 20.2227 11.7695 19.1346 12.3998L19.1355 12.4008L17.1355 13.601L17.1248 13.6068C15.5734 14.5019 13.7297 14.7447 11.9998 14.2806C10.5051 13.8796 9.202 12.9786 8.29764 11.7406C6.69227 12.6956 5.41096 13.9834 4.40995 15.3041C4.77395 15.2264 5.17237 15.1637 5.59745 15.1342C7.60668 14.9946 10.1605 15.5705 12.3357 18.2894C12.4707 18.4583 12.5263 18.6772 12.4881 18.89C12.4498 19.103 12.3211 19.2894 12.1355 19.4008L11.7498 18.7572C12.1034 19.3466 12.1324 19.3964 12.1346 19.4008L12.1336 19.4017L12.1316 19.4027C12.1301 19.4036 12.1288 19.4054 12.1267 19.4066C12.1225 19.4091 12.1167 19.4116 12.1101 19.4154C12.0966 19.4232 12.0775 19.4339 12.0545 19.4467C12.0084 19.4721 11.9433 19.5072 11.8611 19.5482C11.6969 19.6301 11.4625 19.7377 11.1697 19.849C10.5852 20.0712 9.75522 20.3114 8.77713 20.3803C6.99735 20.5055 4.77582 20.055 2.70194 18.0238C2.32916 18.743 2.04908 19.3888 1.85038 19.892C1.71691 20.23 1.62052 20.503 1.55838 20.6889C1.52734 20.7817 1.50444 20.8531 1.49002 20.8998C1.48291 20.9228 1.47759 20.9398 1.4744 20.9506C1.4728 20.956 1.47209 20.9602 1.47147 20.9623C1.47117 20.9633 1.47056 20.964 1.47049 20.9642C1.3564 21.362 0.941746 21.5926 0.543735 21.4789C0.145458 21.3651 -0.0847071 20.9494 0.0290862 20.5512V20.5482C0.0295086 20.5468 0.0303671 20.5447 0.0310393 20.5424C0.032378 20.5378 0.0345865 20.5316 0.0368987 20.5238C0.0416114 20.5079 0.0485748 20.485 0.0574065 20.4564C0.0750777 20.3992 0.100781 20.3172 0.135531 20.2133C0.205308 20.0046 0.310675 19.7063 0.454867 19.3412C0.742926 18.6118 1.18881 17.6094 1.82108 16.5092C2.99274 14.4704 4.83474 12.0472 7.55252 10.4379C6.95082 9.04677 6.83068 7.48563 7.22733 6.00721C7.68958 4.28464 8.81386 2.81441 10.3553 1.91834L11.8553 0.943735C12.0215 0.820396 12.1961 0.708063 12.3777 0.606821C12.3903 0.599606 12.403 0.592721 12.4158 0.586313C12.5657 0.504543 12.7198 0.429399 12.8787 0.363657ZM10.5056 18.4916C8.85934 16.8529 7.104 16.5329 5.70194 16.6303C4.9623 16.6816 4.31251 16.8529 3.82303 17.0228C5.54047 18.6659 7.29825 18.9808 8.67166 18.8842C9.39989 18.8329 10.0324 18.6608 10.5056 18.4916ZM15.5672 1.61366C14.8666 1.42462 14.1225 1.47302 13.4519 1.75038C12.7816 2.02776 12.2214 2.51927 11.8592 3.14784C11.497 3.77637 11.353 4.50695 11.449 5.22596C11.5451 5.94521 11.8766 6.61295 12.3914 7.1244C12.6507 7.38202 12.9497 7.59195 13.2742 7.7494C13.1002 7.38862 12.9999 6.98536 12.9998 6.55799C12.9998 5.59737 13.4927 4.75191 14.239 4.26014C14.2801 4.22193 14.3251 4.18676 14.3758 4.1576C15.4102 3.56227 16.628 3.37878 17.7879 3.63807C17.6756 3.33828 17.5227 3.05324 17.326 2.7953C16.886 2.21836 16.2677 1.80271 15.5672 1.61366ZM14.4998 6.55799C14.5 7.24813 15.0596 7.80799 15.7498 7.80799C15.9047 7.80799 16.0523 7.77748 16.1892 7.72596C16.2502 7.69522 16.3116 7.66491 16.3709 7.63026C16.3989 7.61389 16.4278 7.59967 16.4568 7.58729C16.7843 7.36201 16.9996 6.98549 16.9998 6.55799C16.9998 5.86764 16.4401 5.30799 15.7498 5.30799C15.0594 5.30799 14.4998 5.86764 14.4998 6.55799ZM18.4998 6.55799C18.4996 7.70157 17.8008 8.6806 16.8074 9.0951C15.9718 9.5023 15.0336 9.66016 14.1062 9.54237C13.0582 9.40915 12.0832 8.93251 11.3338 8.18788C10.5845 7.4433 10.1017 6.47221 9.9617 5.42518C9.90304 4.9863 9.90661 4.54433 9.96854 4.1117C9.35689 4.74611 8.90805 5.52954 8.67557 6.39588C8.31453 7.74156 8.50276 9.17636 9.19901 10.3832C9.89526 11.5899 11.0429 12.4704 12.3885 12.8314C13.6501 13.1699 14.9893 13.0252 16.1463 12.432L16.3748 12.308L18.364 11.1146L18.3758 11.1078C19.125 10.6766 19.6724 9.96496 19.8973 9.13026C20.122 8.29565 20.0061 7.40578 19.575 6.65663C19.2581 6.10598 18.7895 5.66491 18.2322 5.38026C18.4019 5.73748 18.4998 6.1362 18.4998 6.55799Z" fill="white" />
                                                </svg>
                                            </div>
                                            <span className="font-bold text-[19px] text-white tracking-widest pl-1">感谢您愿意点进这个界面！</span>
                                        </div>
                                        <button onClick={() => setShowDonatePopup(false)} className="relative shrink-0 w-[32px] h-[32px] active:scale-90 transition-transform cursor-pointer opacity-70 hover:opacity-100">
                                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <rect width="32" height="32" rx="16" fill="white" fillOpacity="0.2" />
                                                <rect x="0.551724" y="0.551724" width="30.8966" height="30.8966" rx="15.4483" stroke="white" strokeOpacity="0.2" strokeWidth="1.10345" />
                                                <path d="M19.1201 15.2201C18.6892 15.651 18.6892 16.3497 19.1201 16.7806L23.802 21.4625C24.233 21.8934 24.233 22.5921 23.802 23.023L23.0216 23.8034C22.5907 24.2343 21.8921 24.2343 21.4611 23.8034L16.7792 19.1215C16.3483 18.6906 15.6496 18.6906 15.2187 19.1215L10.9283 23.4119C10.4974 23.8428 9.79874 23.8428 9.36781 23.4119L8.58742 22.6315C8.15649 22.2006 8.15649 21.5019 8.58742 21.071L12.8778 16.7806C13.3087 16.3497 13.3087 15.651 12.8778 15.2201L8.19657 10.5389C7.76565 10.1079 7.76565 9.40928 8.19657 8.97835L8.97697 8.19795C9.40789 7.76703 10.1066 7.76703 10.5375 8.19795L15.2187 12.8792C15.6496 13.3101 16.3483 13.3101 16.7792 12.8792L21.071 8.58742C21.5019 8.15649 22.2006 8.15649 22.6315 8.58742L23.4119 9.36781C23.8428 9.79874 23.8428 10.4974 23.4119 10.9283L19.1201 15.2201Z" fill="white" />
                                            </svg>
                                        </button>
                                    </motion.div>

                                    <div className="flex flex-col gap-[15px] items-start relative shrink-0 w-full">
                                        {/* Buy me a boba container */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-[#1A150F] border-2 border-[rgba(206,159,107,0.3)] flex items-center justify-center overflow-clip px-[15px] py-[16px] relative rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full"
                                        >
                                            <div className="flex gap-[0px] items-center justify-center relative shrink-0 text-white w-full">
                                                <div className="flex items-center justify-center gap-[10px] w-full">
                                                    <div className="flex items-center gap-[10px]">
                                                        <span className="font-bold text-[45px] leading-none drop-shadow-[0_0_16.8px_rgba(247,170,85,0.5)] z-10 w-[50px] text-center">🧋</span>
                                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-50">
                                                            <path d="M1 1L13 13M13 1L1 13" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                                        </svg>
                                                    </div>

                                                    <div className="flex items-center justify-center gap-[10px] relative">
                                                        <button
                                                            onClick={() => { setDonateAmount(0.5); setIsCustomAmount(false); }}
                                                            className={`w-[55px] h-[33px] flex items-center justify-center overflow-clip relative rounded-[15px] transition-all transform active:scale-95 ${!isCustomAmount && donateAmount === 0.5
                                                                ? "bg-[#e7a356] shadow-[0px_0px_8px_1px_rgba(230,163,87,0.5)] border border-transparent"
                                                                : "bg-[#261E14] border border-[#CE9F6B]/30"
                                                                }`}
                                                        >
                                                            <span className={`font-bold text-[21px] leading-none text-center ${!isCustomAmount && donateAmount === 0.5
                                                                ? "text-[#624525] drop-shadow-[0_0_17px_rgba(247,170,85,0.5)]"
                                                                : "text-[#e9bb85] drop-shadow-[0_0_12px_rgba(247,170,85,0.4)]"
                                                                }`} style={{ letterSpacing: '-1px' }}>
                                                                1/2
                                                            </span>
                                                        </button>

                                                        {[1, 2].map((amt) => (
                                                            <button
                                                                key={amt}
                                                                onClick={() => { setDonateAmount(amt); setIsCustomAmount(false); }}
                                                                className={`w-[40px] h-[40px] flex items-center justify-center overflow-clip relative rounded-full transition-all transform active:scale-95 ${!isCustomAmount && donateAmount === amt
                                                                    ? "bg-[#e7a356] shadow-[0px_0px_16px_4px_rgba(230,163,87,0.4)] border border-transparent"
                                                                    : "bg-[#261E14] border border-[#CE9F6B]/30"
                                                                    }`}
                                                            >
                                                                <span className={`font-black text-[22px] leading-none text-center ${!isCustomAmount && donateAmount === amt
                                                                    ? "text-[#624525]"
                                                                    : "text-[#e9bb85] drop-shadow-[0_0_12px_rgba(247,170,85,0.4)]"
                                                                    }`}>
                                                                    {amt}
                                                                </span>
                                                            </button>
                                                        ))}

                                                        <div
                                                            className={`w-[58px] h-[33px] flex items-center justify-center overflow-clip relative rounded-[15px] transition-all transform active:scale-95 ${isCustomAmount
                                                                ? "bg-[#e7a356] shadow-[0px_0px_8px_1px_rgba(230,163,87,0.5)] border border-transparent"
                                                                : "bg-[#cfcfcf1a] border border-[#cfcfcf4d]"
                                                                }`}
                                                            onClick={() => {
                                                                if (!isCustomAmount) {
                                                                    setIsCustomAmount(true);
                                                                    setDonateAmount(5);
                                                                }
                                                            }}
                                                        >
                                                            <style jsx>{`
                                                        input[type=number]::-webkit-inner-spin-button, 
                                                        input[type=number]::-webkit-outer-spin-button { 
                                                            -webkit-appearance: none; 
                                                            margin: 0; 
                                                        }
                                                        input[type=number] {
                                                            -moz-appearance: textfield;
                                                        }
                                                    `}</style>
                                                            <input
                                                                type="number"
                                                                value={isCustomAmount ? donateAmount : 5}
                                                                min={5}
                                                                onChange={handleAmountChange}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!isCustomAmount) {
                                                                        setIsCustomAmount(true);
                                                                        setDonateAmount(5);
                                                                    }
                                                                }}
                                                                className={`w-full h-full bg-transparent border-none outline-none text-center font-bold text-[21px] leading-none p-0 ${isCustomAmount
                                                                    ? "text-[#624525] drop-shadow-[0_0_17px_rgba(247,170,85,0.5)]"
                                                                    : "text-[#cfcfcf33] drop-shadow-[0_0_10px_rgba(247,170,85,0.1)]"
                                                                    }`}
                                                                style={{ letterSpacing: '-1px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Inputs - Nickname */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-[rgba(255,255,255,0.1)] border border-[rgba(0,0,0,0.2)] flex items-center overflow-clip pb-[10px] pt-[17px] px-[11px] relative rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full backdrop-blur-md"
                                        >
                                            <div className="flex flex-[1_0_0] flex-col gap-[12px] items-center justify-center min-h-px min-w-px relative w-full">
                                                <span className="font-bold text-[15px] text-center text-white w-full">您的昵称是</span>
                                                <div className="bg-[rgba(0,0,0,0.2)] flex items-center justify-center py-[13px] relative rounded-[36px] w-full">
                                                    <input
                                                        type="text"
                                                        placeholder="@"
                                                        value={nickname}
                                                        onChange={(e) => setNickname(e.target.value)}
                                                        className="bg-transparent border-none outline-none font-bold text-[15px] text-[rgba(255,255,255,0.3)] text-center w-full focus:text-white placeholder:text-[rgba(255,255,255,0.3)]"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Inputs - Feedback */}
                                        <motion.div
                                            variants={itemVariants}
                                            className="bg-[rgba(255,255,255,0.1)] border border-[rgba(0,0,0,0.2)] flex items-center overflow-clip pb-[10px] pt-[17px] px-[11px] relative rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] w-full backdrop-blur-md"
                                        >
                                            <div className="flex flex-[1_0_0] flex-col gap-[12px] items-center justify-center min-h-px min-w-px relative w-full">
                                                <span className="font-bold text-[15px] text-center text-white w-full">说点什么吗</span>
                                                <div className="bg-[rgba(0,0,0,0.2)] flex items-center justify-center py-[13px] px-[10px] relative rounded-[20px] w-full">
                                                    <textarea
                                                        ref={textareaRef}
                                                        placeholder="可以来点建议"
                                                        rows={1}
                                                        value={feedbackContent}
                                                        onChange={(e) => setFeedbackContent(e.target.value)}
                                                        className="bg-transparent border-none outline-none font-bold text-[15px] text-[rgba(255,255,255,0.3)] text-center w-full focus:text-white placeholder:text-[rgba(255,255,255,0.3)] resize-none overflow-hidden min-h-[24px]"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>

                                        {feedbackContent.length > 0 && (
                                            <motion.div variants={itemVariants} className="w-full">
                                                <button
                                                    onClick={handleFeedbackSubmit}
                                                    disabled={isSubmittingFeedback}
                                                    className="flex items-center justify-center gap-[10px] border-2 border-[rgba(0,0,0,0.2)] rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)] bg-[#1878ff] py-[15px] w-full h-[56px] overflow-hidden cursor-pointer active:scale-95 transition-all"
                                                >
                                                    <span className="text-white text-[18px] font-bold leading-[22px] tracking-normal">
                                                        {isSubmittingFeedback ? "发送中..." : "发给开发者"}
                                                    </span>
                                                </button>
                                            </motion.div>
                                        )}

                                        <motion.div
                                            variants={itemVariants}
                                            className="w-full"
                                        >
                                        <a
                                            href="https://revolut.me/cpie21"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => {
                                                capture('donate_coffee_clicked', { payment_method: 'Revolut' });
                                            }}
                                            className="bg-[#de4141] hover:bg-[#DC2626] active:scale-95 transition-all border-2 border-[rgba(0,0,0,0.2)] flex items-center justify-center overflow-clip w-full py-[27px] relative rounded-[32px] shadow-[0px_10px_40px_-10px_rgba(0,0,0,0.08)]"
                                        >
                                            <span className="font-bold text-[18px] text-center text-white w-full">
                                                {Number(donateAmount || 0) * 2 >= 5
                                                    ? `居然要支持 ${Number(donateAmount || 0) * 2}€ 嘛 !! 点我进行支持🙏`
                                                    : `点击支持开发者 ${Number(donateAmount || 0) * 2}€`
                                                }
                                            </span>
                                        </a>
                                        </motion.div>
                                    </div>
                                </div>

                                <motion.div
                                    variants={itemVariants}
                                    className="flex flex-col gap-[10px] items-center shrink-0 min-w-full relative w-fit mx-auto"
                                >
                                    <div className="relative w-[118px] h-[118px] shrink-0 pointer-events-none">
                                        <img alt="WeChat QR" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src="/assets/wechat-qr-round.png" />
                                    </div>
                                    <span className="font-light text-[18px] text-[rgba(255,255,255,0.5)] text-center relative pointer-events-none select-none min-w-full w-fit">
                                        或者扫描微信赞赏码
                                    </span>
                                </motion.div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Desktop Warning Toast */}
                <AnimatePresence>
                    {showDesktopWarning && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-[#de4141] text-white px-6 py-3 rounded-full font-bold text-[14px] flex items-center justify-center gap-2 shadow-[0px_4px_16px_rgba(222,65,65,0.4)] whitespace-nowrap border border-white/20 backdrop-blur-md w-max max-w-[90vw]"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            请在手机 Safari 中操作
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Region Selector */}
                <AnimatePresence>
                    {showRegionSelector && (
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            variants={{
                                hidden: {
                                    opacity: 0,
                                    filter: "blur(14px)",
                                    WebkitFilter: "blur(14px)",
                                    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                                },
                                visible: {
                                    opacity: 1,
                                    filter: "blur(0px)",
                                    WebkitFilter: "blur(0px)",
                                    transition: { duration: 0.3, staggerChildren: 0.08 },
                                },
                            }}
                            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center px-6"
                            onClick={() => setShowRegionSelector(false)}
                        >
                            <motion.div
                                variants={{
                                    hidden: { opacity: 0, y: 20, scale: 0.98, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } },
                                    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } },
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full max-w-[360px] relative"
                            >
                                <div
                                    className="relative mx-auto w-full max-w-[320px] overflow-hidden touch-none"
                                    style={{ height: `${WHEEL_VIEWPORT_HEIGHT}px` }}
                                    onWheel={(event) => {
                                        event.preventDefault();
                                        if (Math.abs(event.deltaY) < 8) return;
                                        shiftRegionWheel(event.deltaY > 0 ? 1 : -1);
                                    }}
                                    onTouchStart={(event) => {
                                        regionTouchStartYRef.current = event.touches[0]?.clientY ?? null;
                                    }}
                                    onTouchEnd={(event) => {
                                        const startY = regionTouchStartYRef.current;
                                        const endY = event.changedTouches[0]?.clientY ?? null;
                                        regionTouchStartYRef.current = null;
                                        if (startY === null || endY === null) return;
                                        const deltaY = endY - startY;
                                        if (Math.abs(deltaY) < 22) return;
                                        shiftRegionWheel(deltaY < 0 ? 1 : -1);
                                    }}
                                >
                                    <motion.div
                                        animate={{
                                            y: WHEEL_VIEWPORT_HEIGHT / 2 - WHEEL_ITEM_HEIGHT / 2 - selectorWheelIndex * WHEEL_STEP,
                                        }}
                                        transition={{ duration: 0.55, ease: [0.22, 0.8, 0.2, 1] }}
                                        className="absolute left-0 top-0 w-full"
                                    >
                                        {selectorWheelOptions.map((opt) => {
                                            const distance = Math.abs(opt.wheelIndex - selectorWheelIndex);
                                            const isActive = distance === 0;
                                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.24 : 0;
                                            return (
                                                <button
                                                    key={opt.tag}
                                                    onClick={() => {
                                                        syncWheelIndex(opt.wheelIndex);
                                                        triggerRegionChange(opt.tag);
                                                    }}
                                                    className="flex w-full items-center justify-between px-3 text-left"
                                                    style={{
                                                        height: `${WHEEL_ITEM_HEIGHT}px`,
                                                        marginBottom: `${WHEEL_GAP}px`,
                                                        opacity,
                                                        pointerEvents: distance > 1 ? "none" : "auto",
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <RegionCityIcon tag={opt.tag} active={isActive} />
                                                        <span className={`leading-none tracking-[-0.03em] ${isActive ? "text-[36px] font-bold text-white" : "text-[30px] font-semibold text-white/92"}`}>
                                                            {opt.label}
                                                        </span>
                                                    </div>
                                                    <div className="w-[58px] shrink-0" />
                                                </button>
                                            );
                                        })}
                                    </motion.div>
                                    <div className="pointer-events-none absolute right-0 top-1/2 z-20 -translate-y-1/2">
                                        <motion.div
                                            key={selectorFocusTag}
                                            initial={{ x: 0, scale: 1, opacity: 0.8 }}
                                            animate={{
                                                x: selectorBadgeDirection === 0 ? 0 : selectorBadgeDirection * 10,
                                                scale: selectorBadgeDirection === 0 ? 1 : 1.02,
                                                opacity: 1,
                                            }}
                                            transition={{
                                                x: { duration: 0.68, ease: [0.22, 0.7, 0.2, 1] },
                                                scale: { duration: 0.68, ease: [0.22, 0.7, 0.2, 1] },
                                                opacity: { duration: 0.2, ease: "linear" },
                                            }}
                                            className={`mr-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${isDarkMode ? "bg-black text-white" : "bg-white text-black"}`}
                                        >
                                            当前
                                        </motion.div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </MotionConfig >
    );
}
