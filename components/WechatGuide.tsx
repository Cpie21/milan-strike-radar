'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { captureOnce } from '../utils/analytics';

export default function WechatGuide() {
    const [isWeChat, setIsWeChat] = useState(false);

    useEffect(() => {
        // Detect if the user agent is WeChat
        const ua = navigator.userAgent.toLowerCase();
        if (ua.match(/MicroMessenger/i)) {
            setIsWeChat(true);
        }
    }, []);

    // Track wechat_jump_success immediately when overlay is visible
    useEffect(() => {
        if (isWeChat) {
            captureOnce('wechat_jump_success');
        }
    }, [isWeChat]);

    const containerVariants: any = {
        hidden: { opacity: 0, filter: "blur(10px)", WebkitFilter: "blur(10px)" },
        visible: {
            opacity: 1, filter: "blur(0px)", WebkitFilter: "blur(0px)",
            transition: { duration: 0.3, staggerChildren: 0.1 }
        }
    };

    const itemVariants: any = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
    };

    return (
        <AnimatePresence>
            {isWeChat && (
                <motion.div
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    variants={containerVariants}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-start pt-10 px-6 touch-none overscroll-none"
                    onClick={() => setIsWeChat(false)} // Optional: allow clicking to dismiss if desired, or keep it strict
                >
                    <motion.div variants={itemVariants} className="flex w-full justify-end pr-4 mb-4">
                        {/* Arrow pointing to top right corner */}
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" className="text-white animate-pulse" style={{ transform: 'rotate(-45deg)' }}>
                            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </motion.div>
                    <motion.div variants={itemVariants} className="text-white text-center text-lg font-bold leading-relaxed px-4 break-words">
                        请点击右上角在 Safari/浏览器中打开<br />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
