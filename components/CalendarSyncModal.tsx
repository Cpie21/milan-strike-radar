import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { captureOnce, getDeviceType } from '../utils/analytics';

type StrikeRecord = any;

interface CalendarSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    strikes: StrikeRecord[];
    isDark: boolean;
    onScrollToCategory: (categoryId: string) => void;
}

export default function CalendarSyncModal({ isOpen, onClose, strikes, isDark, onScrollToCategory }: CalendarSyncModalProps) {
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['train', 'subway', 'bus', 'airport']));

    const openedAtRef = useRef<number>(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track CalendarSync_tutorial_success once per device if open for 3+ seconds
    useEffect(() => {
        if (isOpen) {
            openedAtRef.current = Date.now();
            timerRef.current = setTimeout(() => {
                const timeSpent = Math.round((Date.now() - openedAtRef.current) / 1000);
                captureOnce('CalendarSync_tutorial_success', {
                    CalendarSync_time_spent_on_mask: timeSpent,
                });
            }, 3000);
        } else {
            if (timerRef.current) clearTimeout(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isOpen]);

    const toggleType = (type: string) => {
        const newTypes = new Set(selectedTypes);
        if (newTypes.has(type)) {
            newTypes.delete(type);
        } else {
            newTypes.add(type);
        }
        setSelectedTypes(newTypes);
    };

    const handleDownload = () => {
        const typesStr = Array.from(selectedTypes).join(',');
        if (!typesStr) {
            alert('请至少选择一个类别的罢工事件进行同步。');
            return;
        }

        // Use the native webcal protocol so iOS / macOS prompts to subscribe to the calendar
        const host = window.location.host;

        // Apple Calendar strictly blocks webcal:// links pointing to localhost or local network IPs.
        // If testing locally, we point to the production domain so it doesn't fail.
        let targetHost = host;
        if (host.includes('localhost') || host.match(/^[0-9.]+(:[0-9]+)?$/)) {
            targetHost = 'milan-strike-vibe.vercel.app';
        }

        // Always try webcal first for subscriptions instead of hardcoded blobs
        const subscribeUrl = `webcal://${targetHost}/api/calendar?types=${typesStr}`;

        // Track the event once per device
        captureOnce('calendar_sync_clicked', {
            strike_date: new Date().toISOString().split('T')[0],
            device: getDeviceType(),
        });

        window.location.assign(subscribeUrl);

        // Close modal after a short delay
        setTimeout(() => {
            onClose();
        }, 500);
    };

    const typesConfig = [
        { id: 'train', label: '火车', icon: <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5.00004 0C2.23862 0 0 2.23862 0 5.00004V8.33337C0 9.25381 0.746193 10 1.66667 10L1 11V11.6667H9V11L8.33333 10C9.25381 10 10 9.25381 10 8.33337V5.00004C10 2.23862 7.76146 0 5.00004 0ZM2.5 8.33333C1.85567 8.33333 1.33333 7.811 1.33333 7.16667C1.33333 6.52233 1.85567 6 2.5 6C3.14433 6 3.66667 6.52233 3.66667 7.16667C3.66667 7.811 3.14433 8.33333 2.5 8.33333ZM4.16667 5H1.66667V2.5H4.16667V5ZM7.5 8.33333C6.85567 8.33333 6.33333 7.811 6.33333 7.16667C6.33333 6.52233 6.85567 6 7.5 6C8.14433 6 8.66667 6.52233 8.66667 7.16667C8.66667 7.811 8.14433 8.33333 7.5 8.33333ZM8.33333 5H5.83333V2.5H8.33333V5Z" /></svg> },
        { id: 'subway', label: '地铁', icon: <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5.00004 0C2.23862 0 0 2.23862 0 5.00004V8.33337C0 9.25381 0.746193 10 1.66667 10L1 11V11.6667H9V11L8.33333 10C9.25381 10 10 9.25381 10 8.33337V5.00004C10 2.23862 7.76146 0 5.00004 0ZM2.5 8.33333C1.85567 8.33333 1.33333 7.811 1.33333 7.16667C1.33333 6.52233 1.85567 6 2.5 6C3.14433 6 3.66667 6.52233 3.66667 7.16667C3.66667 7.811 3.14433 8.33333 2.5 8.33333ZM4.16667 5H1.66667V2.5H4.16667V5ZM7.5 8.33333C6.85567 8.33333 6.33333 7.811 6.33333 7.16667C6.33333 6.52233 6.85567 6 7.5 6C8.14433 6 8.66667 6.52233 8.66667 7.16667C8.66667 7.811 8.14433 8.33333 7.5 8.33333ZM8.33333 5H5.83333V2.5H8.33333V5Z" /></svg> },
        { id: 'bus', label: '公交', icon: <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5C10 0.843146 8.65685 -0.5 7 -0.5H3C1.34315 -0.5 0 0.843146 0 2.5V8.5C0 9.88071 1.11929 11 2.5 11H3.5C3.5 11.5523 3.94772 12 4.5 12H5.5C6.05228 12 6.5 11.5523 6.5 11H7.5C8.88071 11 10 9.88071 10 8.5V2.5ZM2 8.5C2 8.22386 2.22386 8 2.5 8C2.77614 8 3 8.22386 3 8.5C3 8.77614 2.77614 9 2.5 9C2.22386 9 2 8.77614 2 8.5ZM8 8.5C8 8.77614 7.77614 9 7.5 9C7.22386 9 7 8.77614 7 8.5C7 8.22386 7.22386 8 7.5 8C7.77614 8 8 8.22386 8 8.5ZM8.5 2.5V6H1.5V2.5C1.5 1.67157 2.17157 1 3 1H7C7.82843 1 8.5 1.67157 8.5 2.5Z" /></svg> },
        { id: 'airport', label: '机场', icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M11.6667 4.52042C11.6667 4.18042 11.3933 3.90708 11.0533 3.90708C10.82 3.90708 10.6067 4.04042 10.5133 4.25375L8.98 7.73375H4.29333L6.96 1.48708C7.11333 1.13375 6.96 0.720417 6.61333 0.55375C6.46 0.480417 6.29333 0.460417 6.13333 0.500417L4.72 0.85375C4.46667 0.91375 4.28 1.12708 4.23333 1.39375L3.6 5.86708L1.6 7.22708C1.53333 7.27375 1.48 7.33375 1.43333 7.40042L0.393333 8.92708C0.293333 9.07375 0.32 9.27375 0.453333 9.38708L2.48667 11.0738C2.56667 11.1404 2.66667 11.1738 2.76667 11.1738C2.98667 11.1738 3.16667 10.9938 3.16667 10.7738V8.95375L7.22 8.84708L7.84667 11.6938C7.9 11.9471 8.12 12.1338 8.38 12.1538H8.5H9.79333C10.0533 12.1538 10.2733 11.9671 10.32 11.7138L10.7467 9.87375C11.3133 9.32042 11.6667 8.56042 11.6667 7.73375V4.52042Z" /></svg> },
    ];

    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
    };

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

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial="hidden" animate="visible" exit="hidden"
                    className="fixed inset-0 h-[100dvh] z-50 flex flex-col justify-center items-center px-[32px] overflow-hidden touch-none overscroll-none pointer-events-auto"
                >
                    {/* 1. Pure dark color background (No mask, covers everything) */}
                    <motion.div
                        initial="hidden" animate="visible" exit="hidden" variants={backdropVariants} transition={{ duration: 0.3 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: 'rgba(15, 15, 15, 0.75)' }}
                    />

                    {/* 2. Pure blur effect layer with gradient mask (You can adjust the mask values here) */}
                    <motion.div
                        initial="hidden" animate="visible" exit="hidden" variants={backdropVariants} transition={{ duration: 0.3 }}
                        className="absolute inset-0 backdrop-blur-[24px] pointer-events-none"
                        style={{
                            maskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                            transform: 'translateZ(0)',
                            WebkitBackdropFilter: 'blur(24px)'
                        }}
                    />

                    {/* Backdrop click to close */}
                    <div className="absolute inset-0 z-0" onClick={onClose} />

                    <motion.div
                        initial="hidden" animate="visible" exit="hidden" variants={contentVariants}
                        className={`relative w-full max-w-sm sm:max-w-[440px] z-10 flex flex-col gap-[21px] items-start mt-0 font-['Noto_Sans_SC',sans-serif]`}
                    >

                        {/* Header */}
                        <motion.div variants={itemVariants} className="flex items-center justify-between w-full mb-[21px]">
                            <div className="flex items-center gap-[8px]">
                                <div className="bg-[#FFEC20] border border-black/20 flex items-center justify-center rounded-[8px] w-[42px] h-[32px]">
                                    <svg width="24" height="20" viewBox="0 0 24 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <g id="Container">
                                            <path id="Vector" d="M5.84946 12.137C5.18292 11.7665 4.36364 12.2484 4.36364 13.011V15.1673C4.36364 15.5304 4.56045 15.8649 4.87782 16.0413L11.5142 19.73C11.8163 19.8979 12.1837 19.8979 12.4858 19.73L19.1222 16.0413C19.4396 15.8649 19.6364 15.5304 19.6364 15.1673V13.011C19.6364 12.2484 18.8171 11.7665 18.1505 12.137L12.4858 15.2855C12.1837 15.4534 11.8163 15.4534 11.5142 15.2855L5.84946 12.137ZM12.4856 0.269802C12.1836 0.102011 11.8164 0.102011 11.5144 0.269802L1.57348 5.79251C0.887674 6.17351 0.887674 7.15982 1.57348 7.54082L11.5144 13.0635C11.8164 13.2313 12.1836 13.2313 12.4856 13.0635L22.4265 7.54082C23.1123 7.15982 23.1123 6.17351 22.4265 5.79251L12.4856 0.269802Z" fill="black" />
                                        </g>
                                    </svg>
                                </div>
                                <span className="text-[#FFEC20] text-[20px] font-bold leading-tight font-['Noto_Sans_SC']">同步到本地日历</span>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-[32px] h-[32px] flex items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md border border-white/20"
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </button>
                        </motion.div>

                        <div className="content-stretch flex flex-col gap-[15px] items-start pb-[5px] px-[5px] relative shrink-0 w-full" data-node-id="328:1281">

                            {/* Step 1 */}
                            <motion.div variants={itemVariants} className="content-stretch flex flex-col gap-[10px] items-center py-[5px] relative shrink-0 w-full" data-name="Background+Shadow" data-node-id="328:1282">
                                <div className="content-stretch flex flex-col items-center relative shrink-0 w-full" data-node-id="328:1283">
                                    <div className="flex flex-col font-['Noto_Sans_SC'] justify-center leading-[0] relative shrink-0 text-[18px] text-white w-full" data-node-id="328:1284">
                                        <p className="leading-[normal] whitespace-pre-wrap tracking-wide">① 选取希望导入的罢工类型</p>
                                    </div>
                                </div>
                                <div className="content-stretch flex flex-wrap gap-[8px] items-start w-full relative shrink-0" data-name="Container" data-node-id="329:1341">
                                    {typesConfig.map(t => {
                                        const isSelected = selectedTypes.has(t.id);
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => toggleType(t.id)}
                                                className={`transition-all border-[2px] border-solid flex shrink-0 gap-[6px] items-center justify-center px-[16px] py-[8px] relative rounded-[30px] font-bold ${isSelected
                                                    ? 'bg-[#0A84FF] border-[#0A84FF] text-white shadow-[0px_4px_12px_rgba(10,132,255,0.4)] scale-[1.03]'
                                                    : 'bg-transparent border-[#0A84FF] text-[#0A84FF] hover:bg-[#0A84FF]/10'
                                                    }`}
                                            >
                                                <div className="flex flex-col font-['Noto_Sans_SC'] font-bold justify-center leading-[0] relative shrink-0 text-[14px] text-center whitespace-nowrap">
                                                    <p className="leading-[20px]">{t.label}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>

                            {/* Step 2 */}
                            <motion.div variants={itemVariants} className="content-stretch flex flex-col gap-[10px] items-start py-[4px] relative shrink-0 w-full" data-name="Background+Shadow" data-node-id="329:2169">
                                <div className="content-stretch flex flex-col items-center relative shrink-0 w-full" data-node-id="329:2170">
                                    <div className="flex flex-col font-['Noto_Sans_SC'] justify-center leading-[0] relative shrink-0 text-[18px] text-white w-full" data-node-id="329:2171">
                                        <p className="leading-[normal] whitespace-pre-wrap tracking-wide">② 点击订阅日历文件</p>
                                    </div>
                                </div>
                                <button onClick={handleDownload} className="bg-[#2177fe] active:scale-95 transition-transform border-2 border-[rgba(255,255,255,0.1)] border-solid content-stretch flex gap-[8px] items-center px-[22px] py-[15px] relative rounded-[35px] shrink-0 shadow-xl shadow-blue-500/20" data-name="Button" data-node-id="329:2190">
                                    <div className="relative shrink-0 flex items-center justify-center text-white" data-name="Container" data-node-id="329:2191">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 16L16 12H13V4H11V12H8L12 16ZM4 18H20V20H4V18Z" fill="currentColor" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col font-['Noto_Sans_SC'] font-bold justify-center leading-[0] relative shrink-0 text-[14px] text-center text-white whitespace-nowrap tracking-wide" data-node-id="329:2193">
                                        <p className="leading-[20px]">意大利罢工订阅文件</p>
                                    </div>
                                </button>
                            </motion.div>
                        </div>

                    </motion.div>
                </motion.div >
            )
            }
        </AnimatePresence >
    );
}
