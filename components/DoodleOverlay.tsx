'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

export type DoodleCategory = 'subway' | 'bus' | 'train' | 'plane';

interface DoodleCanvasProps {
    category: DoodleCategory;
    count: number;
    isAnimating: boolean;
    isDark: boolean;
    seed: string;
}

const MAIN_COLOR = '#DE4141';

interface StyleState {
    mainPath: string;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const SHAPE_STATES: Record<DoodleCategory, StyleState> = {
    subway: { mainPath: "M 120 80 L 150 100 M 180 100 L 210 80 M 140 120 Q 165 100 190 120", bounds: { minX: 60, maxX: 360, minY: 60, maxY: 140 } },
    bus: { mainPath: "M 140 120 L 180 60 L 170 100 L 220 70 L 190 140 L 200 110 Z", bounds: { minX: 60, maxX: 340, minY: 50, maxY: 130 } },
    train: { mainPath: "M 100 90 L 100 150 M 100 165 L 100 175 M 150 90 L 150 150 M 150 165 L 150 175 M 200 90 L 200 150 M 200 165 L 200 175", bounds: { minX: 60, maxX: 340, minY: 90, maxY: 160 } },
    plane: { mainPath: "M 200 70 A 30 30 0 1 0 200 130 A 30 30 0 1 0 200 70 M 175 80 L 225 120", bounds: { minX: 40, maxX: 300, minY: 90, maxY: 140 } }
};

const r = (min: number, max: number) => gsap.utils.random(min, max);

// High-entropy PRNG based on FNV-1a hash + Mulberry32
const randomFromSeed = (seedStr: string, index: number) => {
    let h = 0x811c9dc5;
    const str = `${seedStr}-${index}`;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    let t = (h += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export default function DoodleCanvas({ category, count, isAnimating, isDark, seed }: DoodleCanvasProps) {
    const layerRef = useRef<SVGGElement>(null);
    const canRef = useRef<SVGGElement>(null);
    const mistRef = useRef<SVGPathElement>(null);

    const splatterLogic = (
        idxInSequence: number,
        targetX: number,
        targetY: number,
        state: StyleState,
        mixColors: string[]
    ) => {
        const r1 = randomFromSeed(seed, idxInSequence * 10 + 2);
        const r2 = randomFromSeed(seed, idxInSequence * 10 + 3);
        const r3 = randomFromSeed(seed, idxInSequence * 10 + 4);
        const r4 = randomFromSeed(seed, idxInSequence * 10 + 5);

        const shapeType = Math.floor(r1 * 4);
        let d = "";

        if (shapeType === 0) {
            d = `M ${targetX} ${targetY} Q ${targetX + (r2 * 30 - 15)} ${targetY - (r3 * 20 + 20)} ${targetX + (r4 * 30 + 10)} ${targetY + (r1 * 40 - 10)} T ${targetX + (r2 * 30 + 20)} ${targetY + (r3 * 40 - 20)}`;
        } else if (shapeType === 1) {
            const s = 12 + Math.floor(r2 * 8);
            d = `M ${targetX - s} ${targetY - s} L ${targetX + s} ${targetY + s} M ${targetX + s} ${targetY - s} L ${targetX - s} ${targetY + s}`;
        } else if (shapeType === 2) {
            d = `M ${targetX - 5} ${targetY} Q ${targetX} ${targetY + 15} ${targetX + 5} ${targetY} L ${targetX + 2} ${targetY + (r2 * 30 + 20)} Z`;
        } else {
            d = `M ${targetX - 25} ${targetY} L ${targetX - 10} ${targetY + (r2 * 50 - 25)} L ${targetX + 5} ${targetY + (r3 * 50 - 25)} L ${targetX + 20} ${targetY + (r4 * 50 - 25)} L ${targetX + 35} ${targetY}`;
        }

        const dropletsCount = 2 + Math.floor(r1 * 4);
        for (let j = 0; j < dropletsCount; j++) {
            const dx = targetX + (randomFromSeed(seed, idxInSequence * 100 + j) * 60 - 30);
            const dy = targetY + (randomFromSeed(seed, idxInSequence * 100 + j + 50) * 60 - 30);
            d += ` M ${dx} ${dy} l 0.1 0.1`;
        }

        const colorIndex = Math.floor(randomFromSeed(seed, idxInSequence * 10 + 6) * mixColors.length);

        return {
            d,
            stroke: mixColors[colorIndex],
            strokeWidth: 6 + Math.floor(r3 * 6),
            opacity: 0.8 + (r4 * 0.15)
        };
    };

    // Background Splatters computed on every render
    const bgPaths = [];
    const state = SHAPE_STATES[category];
    const mixColors = isDark
        ? [MAIN_COLOR, MAIN_COLOR, '#B03030', '#FACC15', '#22D3EE', '#FFFFFF', '#A3E635', '#F472B6']
        : [MAIN_COLOR, MAIN_COLOR, '#B03030', '#EAB308', '#06B6D4', '#1E293B', '#65A30D', '#DB2777'];

    const bgCount = Math.min(Math.max(0, count), 50);

    if (bgCount >= 1) {
        // Path 0 is always the main angry face
        bgPaths.push(
            <path key="bg-main" data-index="0" className="paint-stroke bg-splatter opacity-0" style={{ display: 'none', filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.5))", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }} d={state.mainPath} stroke={MAIN_COLOR} strokeWidth={category === 'plane' ? "5" : "7"} data-opacity="1" />
        );
        for (let i = 1; i < bgCount; i++) {
            const randX = randomFromSeed(seed, i * 10);
            const randY = randomFromSeed(seed, i * 10 + 1);

            const targetX = state.bounds.minX + randX * (state.bounds.maxX - state.bounds.minX);
            const targetY = state.bounds.minY + randY * (state.bounds.maxY - state.bounds.minY);

            const { d, stroke, strokeWidth, opacity } = splatterLogic(i, targetX, targetY, state, mixColors);

            // Note: we start opacity-0 to let GSAP animate them in
            bgPaths.push(
                <path key={`bg-blob-${i}`} data-index={i} className="paint-stroke bg-splatter opacity-0" data-opacity={opacity} d={d} stroke={stroke} strokeWidth={strokeWidth} style={{ display: 'none', filter: "drop-shadow(0px 2px 2px rgba(0,0,0,0.4))", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }} />
            );
        }
    }

    // Animate on interaction
    useEffect(() => {
        if (!layerRef.current || !canRef.current || !mistRef.current) return;

        const layer = layerRef.current;
        const can = canRef.current;
        const mist = mistRef.current;

        if (isAnimating) {
            const tl = gsap.timeline();

            // 1. Instantly 'explode' past doodles onto the screen
            if (bgCount >= 2) {
                const prevSplatters = Array.from(layer.querySelectorAll('.bg-splatter')).filter((el: any) => parseInt(el.getAttribute('data-index')) < bgCount - 1);
                // Remove hidden class and stagger their appearance
                gsap.set(prevSplatters, { display: "block" });
                tl.fromTo(prevSplatters,
                    { scale: 0.5, opacity: 0 },
                    {
                        scale: 1,
                        opacity: (index: number, target: Element) => parseFloat(target.getAttribute('data-opacity') || '1'),
                        duration: 0.3,
                        stagger: 0.02,
                        ease: "back.out(1.5)"
                    }
                );
            }

            // 2. Animate the user's specific stroke (latest item)
            const newBlob = layer.querySelector(`[data-index="${bgCount - 1}"]`) as SVGPathElement;

            if (newBlob) {
                if (bgCount === 1) { // It's the main face
                    const targetX = 150;
                    const targetY = category === 'train' || category === 'plane' ? 110 : 100;

                    tl.to(can, { x: targetX, y: targetY, duration: 0.3, ease: "back.out(1.2)" }, "-=0.2")
                        .to(can, { rotation: 15, yoyo: true, repeat: 3, duration: 0.05 })
                        .to(mist, { opacity: 0.9, duration: 0.1 });

                    gsap.set(newBlob, { display: "block", opacity: 1 });
                    const length = newBlob.getTotalLength() || 500;
                    gsap.set(newBlob, { strokeDasharray: length, strokeDashoffset: length });

                    tl.to(can, { x: 220, duration: 0.4, ease: "power1.inOut" }, "+=0.1");
                    tl.to(newBlob, { strokeDashoffset: 0, duration: 0.4, ease: "power1.inOut" }, "<");
                    tl.to(mist, { opacity: 0, duration: 0.1 });
                } else { // It's a splatter
                    const randX = randomFromSeed(seed, (bgCount - 1) * 10);
                    const randY = randomFromSeed(seed, (bgCount - 1) * 10 + 1);
                    const targetX = state.bounds.minX + randX * (state.bounds.maxX - state.bounds.minX);
                    const targetY = state.bounds.minY + randY * (state.bounds.maxY - state.bounds.minY);

                    tl.to(can, { x: targetX, y: targetY + 20, rotation: r(-15, 15), duration: 0.15, ease: "power1.out" }, "-=0.2")
                        .to(mist, { opacity: 0.9, fill: newBlob.getAttribute('stroke') || MAIN_COLOR, duration: 0.05 });

                    gsap.set(newBlob, { display: "block", opacity: newBlob.getAttribute('data-opacity') || '1' });
                    const length = newBlob.getTotalLength() || 200;
                    gsap.set(newBlob, { strokeDasharray: length, strokeDashoffset: length });

                    tl.to(newBlob, { strokeDashoffset: 0, duration: 0.15, ease: "power2.out" }, "<");
                    tl.to(mist, { opacity: 0, duration: 0.1 });
                }
            }

            // Common cleanup after sequence
            tl.to(mist, { opacity: 0, duration: 0.1 });
            tl.to(can, { y: 250, x: 200, rotation: 0, duration: 0.6, ease: "power2.in" });
        } else {
            // Not animating, but component is mounted and likely open. Ensure all rendered splatters are fully visible.
            const allSplatters = layer.querySelectorAll('.bg-splatter');
            allSplatters.forEach((el: any) => {
                el.style.display = "block";
                el.style.opacity = el.getAttribute('data-opacity') || '1';
                el.style.strokeDashoffset = "0";
            });
            // Hide spray can
            gsap.set(can, { y: 250, x: 200, rotation: 0 });
            gsap.set(mist, { opacity: 0 });
        }
    }, [isAnimating, category, bgCount, seed, state]);

    function renderVehicle() {
        const cBg = isDark ? "#0A0A0A" : "#E2E8F0";
        const cDarkest = isDark ? "#111112" : "#94A3B8";
        const cDarker = isDark ? "#1C1C1E" : "#CBD5E1";
        const cDark = isDark ? "#2C2C2E" : "#E2E8F0";
        const cOutline = isDark ? "#5C5C5E" : "#94A3B8";

        switch (category) {
            case 'subway':
                return (
                    <>
                        <rect x="0" y="180" width="400" height="40" fill={cBg} />
                        <path d="M 0 185 L 400 185" stroke={cDarker} strokeWidth="2" />
                        <g>
                            <rect x="-20" y="50" width="440" height="130" rx="16" fill="url(#metal-body)" stroke={cOutline} strokeWidth="1" />
                            <rect x="-20" y="165" width="440" height="15" fill={cDarker} />
                            <rect x="-20" y="150" width="440" height="4" fill="#DE4141" />
                            <rect x="60" y="60" width="44" height="110" rx="4" fill={cDark} stroke={cDarker} strokeWidth="2" />
                            <rect x="64" y="65" width="16" height="55" rx="2" fill="url(#dark-glass)" />
                            <rect x="84" y="65" width="16" height="55" rx="2" fill="url(#dark-glass)" />
                            <rect x="200" y="60" width="44" height="110" rx="4" fill={cDark} stroke={cDarker} strokeWidth="2" />
                            <rect x="204" y="65" width="16" height="55" rx="2" fill="url(#dark-glass)" />
                            <rect x="224" y="65" width="16" height="55" rx="2" fill="url(#dark-glass)" />
                            <rect x="114" y="65" width="76" height="45" rx="6" fill="url(#dark-glass)" stroke={cDarker} strokeWidth="2" />
                            <rect x="254" y="65" width="76" height="45" rx="6" fill="url(#dark-glass)" stroke={cDarker} strokeWidth="2" />
                            <circle cx="152" cy="55" r="2" fill="#DE4141" filter="url(#glow-red)" />
                            <circle cx="292" cy="55" r="2" fill="#DE4141" filter="url(#glow-red)" />
                        </g>
                    </>
                );
            case 'bus':
                return (
                    <>
                        <rect x="0" y="190" width="400" height="30" fill={cBg} />
                        <g>
                            <rect x="30" y="40" width="340" height="140" rx="24" fill="url(#metal-body)" stroke={cOutline} strokeWidth="1" />
                            <rect x="100" y="32" width="120" height="10" rx="4" fill={cDark} />
                            <rect x="40" y="50" width="320" height="75" rx="12" fill="url(#dark-glass)" stroke={cDarker} strokeWidth="2" />
                            <rect x="180" y="50" width="4" height="75" fill={cDarker} />
                            <rect x="280" y="50" width="4" height="75" fill={cDarker} />
                            <rect x="80" y="50" width="4" height="75" fill={cDarker} />
                            <rect x="30" y="145" width="340" height="8" fill="#DE4141" />
                            <circle cx="90" cy="180" r="24" fill={cDarkest} />
                            <circle cx="90" cy="180" r="14" fill={cDark} stroke={cOutline} strokeWidth="2" />
                            <circle cx="310" cy="180" r="24" fill={cDarkest} />
                            <circle cx="310" cy="180" r="14" fill={cDark} stroke={cOutline} strokeWidth="2" />
                        </g>
                    </>
                );
            case 'train':
                return (
                    <>
                        <rect x="0" y="185" width="400" height="35" fill={cBg} />
                        <path d="M 0 195 L 400 195" stroke={cDarker} strokeWidth="3" strokeDasharray="20 10" />
                        <g>
                            <path d="M 380 180 L -20 180 L -20 80 L 300 80 Q 380 80 380 180 Z" fill="url(#metal-body)" stroke={cOutline} strokeWidth="1" />
                            <path d="M 300 80 Q 365 80 375 130 L 340 130 L 290 80 Z" fill="url(#dark-glass)" />
                            <path d="M -20 145 L 340 145 Q 360 145 375 165 L -20 165 Z" fill="#DE4141" />
                            <rect x="-20" y="90" width="300" height="35" rx="8" fill="url(#dark-glass)" stroke={cDarker} strokeWidth="2" />
                            <rect x="80" y="90" width="3" height="35" fill={cDarker} />
                            <rect x="180" y="90" width="3" height="35" fill={cDarker} />
                            <rect x="250" y="90" width="3" height="35" fill={cDarker} />
                        </g>
                    </>
                );
            case 'plane':
                return (
                    <>
                        <rect x="0" y="190" width="400" height="30" fill={cBg} />
                        <g>
                            <path d="M -50 90 L 280 90 Q 380 90 380 120 Q 380 150 280 150 L -50 150 Z" fill="url(#metal-body)" stroke={cOutline} strokeWidth="1" />
                            <path d="M -20 90 L -60 20 L 10 20 L 50 90 Z" fill="#DE4141" />
                            <path d="M 0 20 L 50 90 L 60 90 L 10 20 Z" fill="#B03030" />
                            <path d="M 120 150 L 50 210 L 100 210 L 180 150 Z" fill={isDark ? "#3A3A3C" : "#94A3B8"} stroke={cDark} />
                            <rect x="110" y="155" width="40" height="20" rx="10" fill="url(#metal-body)" />
                            <path d="M 150 155 A 10 10 0 1 1 150 175" fill={cDarkest} />
                            <path d="M -50 135 L 360 135" stroke="#DE4141" strokeWidth="3" />
                            <g fill={cDarker} stroke={cOutline} strokeWidth="1">
                                <circle cx="100" cy="115" r="4" />
                                <circle cx="120" cy="115" r="4" />
                                <circle cx="140" cy="115" r="4" />
                                <circle cx="160" cy="115" r="4" />
                                <circle cx="180" cy="115" r="4" />
                                <circle cx="200" cy="115" r="4" />
                                <circle cx="220" cy="115" r="4" />
                            </g>
                            <path d="M 330 115 L 350 115 Q 360 115 365 110 L 330 105 Z" fill={isDark ? "#09090A" : "#0F172A"} />
                        </g>
                    </>
                );
        }
    }

    return (
        <div className={`w-full relative border rounded-2xl overflow-hidden mt-3 shadow-inset h-[200px] ${isDark ? "bg-[#1c1c1e] border-white/5" : "bg-white/60 border-slate-100"}`}>
            {/* SVG Definitions */}
            <svg width="0" height="0" className="absolute hidden">
                <defs>
                    <linearGradient id="metal-body" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={isDark ? "#8E8E93" : "#F8FAFC"} />
                        <stop offset="50%" stopColor={isDark ? "#636366" : "#E2E8F0"} />
                        <stop offset="100%" stopColor={isDark ? "#48484A" : "#CBD5E1"} />
                    </linearGradient>
                    <linearGradient id="dark-glass" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={isDark ? "#1C1C1E" : "#334155"} />
                        <stop offset="100%" stopColor={isDark ? "#09090A" : "#0F172A"} />
                    </linearGradient>
                    <filter id="blur-mist"><feGaussianBlur stdDeviation="4" /></filter>
                    <filter id="glow-red"><feGaussianBlur stdDeviation="2" result="coloredBlur" /><feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
            </svg>

            {/* Render Canvas */}
            <svg viewBox="0 0 400 220" className="w-full h-full drop-shadow-lg" preserveAspectRatio="xMidYMid slice">
                {/* 1. Underlying Vehicle */}
                {renderVehicle()}

                {/* 2. dynamic Splatter Layer */}
                <g ref={layerRef}>
                    {bgPaths}
                </g>

                {/* 3. Spray Can */}
                <g ref={canRef} transform="translate(180, 250)">
                    <path ref={mistRef} d="M -5 -5 L -35 -45 Q -5 -55 25 -45 Z" fill={MAIN_COLOR} opacity="0" filter="url(#blur-mist)" />
                    <rect x="-15" y="0" width="30" height="60" rx="6" fill="#3A3A3C" stroke="#48484A" strokeWidth="1" />
                    <rect x="-15" y="20" width="30" height="25" fill={MAIN_COLOR} />
                    <path d="M -15 0 Q 0 -10 15 0 Z" fill="#5C5C5E" />
                    <rect x="-4" y="-8" width="8" height="6" fill="#1C1C1E" rx="1" />
                </g>
            </svg>
        </div>
    );
}
