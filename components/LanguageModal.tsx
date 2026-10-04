'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AppLanguage, pickText } from './i18n';

interface LanguageModalProps {
    isOpen: boolean;
    language: AppLanguage;
    onClose: () => void;
    onSelect: (language: AppLanguage) => void;
}

const options: Array<{ value: AppLanguage; nativeLabel: string; helperZh: string; helperEn: string }> = [
    { value: 'zh', nativeLabel: '中文', helperZh: '保留当前中文界面', helperEn: 'Keep the Chinese interface' },
    { value: 'en', nativeLabel: 'English', helperZh: '切换为英文界面', helperEn: 'Use the English interface' },
];

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const contentVariants = {
    hidden: { y: 40, opacity: 0, filter: 'blur(10px)', WebkitFilter: 'blur(10px)' },
    visible: {
        y: 0,
        opacity: 1,
        filter: 'blur(0px)',
        WebkitFilter: 'blur(0px)',
        transition: { duration: 0.3, staggerChildren: 0.08 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function LanguageModal({ isOpen, language, onClose, onSelect }: LanguageModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="fixed inset-0 h-[100dvh] z-50 flex flex-col justify-center items-center px-[32px] overflow-hidden touch-none overscroll-none pointer-events-auto"
                >
                    <motion.div
                        variants={backdropVariants}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 pointer-events-none"
                        style={{ backgroundColor: 'rgba(15, 15, 15, 0.75)' }}
                    />
                    <motion.div
                        variants={backdropVariants}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 backdrop-blur-[24px] pointer-events-none"
                        style={{
                            maskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 0%, black 80%, transparent 100%)',
                            transform: 'translateZ(0)',
                            WebkitBackdropFilter: 'blur(24px)',
                        }}
                    />
                    <div className="absolute inset-0 z-0" onClick={onClose} />

                    <motion.div
                        variants={contentVariants}
                        className="relative w-full max-w-sm sm:max-w-[440px] z-10 flex flex-col gap-[18px] items-start mt-0 font-['Noto_Sans_SC',sans-serif]"
                    >
                        <motion.div variants={itemVariants} className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-[8px]">
                                <div className="bg-[#FFEC20] border border-black/20 flex items-center justify-center rounded-[8px] w-[42px] h-[32px]">
                                    <span className="text-black text-[15px] font-black">Aa</span>
                                </div>
                                <span className="text-[#FFEC20] text-[20px] font-bold leading-tight">
                                    {pickText(language, '语言设置', 'Language')}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-[32px] h-[32px] flex items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md border border-white/20"
                                aria-label={pickText(language, '关闭', 'Close')}
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                            </button>
                        </motion.div>

                        <motion.div variants={itemVariants} className="w-full bg-white/10 border-[3px] border-black/20 rounded-[32px] p-[10px] backdrop-blur-md">
                            <div className="flex flex-col gap-[10px]">
                                {options.map((option) => {
                                    const selected = language === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => onSelect(option.value)}
                                            className={`w-full flex items-center justify-between rounded-[24px] border-2 px-[16px] py-[14px] transition-all active:scale-[0.98] ${selected
                                                ? 'bg-[#1878ff] border-[#1878ff] text-white shadow-[0_8px_24px_rgba(24,120,255,0.35)]'
                                                : 'bg-black/20 border-white/15 text-white hover:bg-white/10'
                                                }`}
                                        >
                                            <div className="flex flex-col items-start">
                                                <span className="text-[18px] font-black leading-tight">{option.nativeLabel}</span>
                                                <span className="text-[12px] opacity-70 mt-[3px]">{pickText(language, option.helperZh, option.helperEn)}</span>
                                            </div>
                                            <span className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${selected ? 'border-white bg-white text-[#1878ff]' : 'border-white/40'}`}>
                                                {selected && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>

                        <motion.p variants={itemVariants} className="w-full px-[8px] text-[12px] leading-[18px] text-white/55 text-center">
                            {pickText(
                                language,
                                '默认会跟随浏览器语言；手动选择后会保存在本机浏览器中。',
                                'By default this follows your browser language. Manual selection is saved in this browser.'
                            )}
                        </motion.p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
