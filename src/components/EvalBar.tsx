'use client';

import { useMemo } from 'react';

interface Props {
    evaluation: number;  // centipawns, positive = white better
    flipped?: boolean;
}

/** Sigmoid from centipawns to 5–95% height of the white fill */
function evalToHeightPct(cp: number): number {
    if (cp >= 9900) return 100;
    if (cp <= -9900) return 0;
    const val = cp / 100;
    const h = 50 + 50 * (2 / (1 + Math.exp(-0.4 * val)) - 1);
    return Math.max(5, Math.min(95, h));
}

function formatEval(cp: number): string {
    if (Math.abs(cp) >= 9900) {
        const mate = 10000 - Math.abs(cp);
        return `M${mate}`;
    }
    const val = Math.abs(cp / 100).toFixed(1);
    return val;
}

export default function EvalBar({ evaluation, flipped = false }: Props) {
    const { heightPct, display, whiteOnTop } = useMemo(() => ({
        heightPct: evalToHeightPct(evaluation),
        display: formatEval(evaluation),
        whiteOnTop: flipped,    // when flipped, white is at top
    }), [evaluation, flipped]);

    // White fill: from bottom normally, from top when flipped
    const whiteHeight = `${heightPct}%`;
    const blackHeight = `${100 - heightPct}%`;

    return (
        <div style={{
            width: 32, backgroundColor: '#262421', borderRadius: 4,
            overflow: 'hidden', position: 'relative', flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignSelf: 'stretch',
        }}>
            {/* Top section */}
            <div style={{
                height: whiteOnTop ? whiteHeight : blackHeight,
                background: whiteOnTop
                    ? 'linear-gradient(to bottom, #ffffff, #e0e0e0)'
                    : '#302e2b',
                transition: 'height 0.3s ease-in-out',
                flexShrink: 0,
            }} />

            {/* Bottom section */}
            <div style={{
                height: whiteOnTop ? blackHeight : whiteHeight,
                background: whiteOnTop
                    ? '#302e2b'
                    : 'linear-gradient(to bottom, #ffffff, #e0e0e0)',
                transition: 'height 0.3s ease-in-out',
                flexShrink: 0,
            }} />

            {/* Advantage number — shown on the advantaged side */}
            {evaluation >= 0 && !whiteOnTop && (
                <span style={{
                    position: 'absolute', bottom: 5, left: 0, width: '100%',
                    textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#000', zIndex: 2
                }}>
                    {display}
                </span>
            )}
            {evaluation >= 0 && whiteOnTop && (
                <span style={{
                    position: 'absolute', top: 5, left: 0, width: '100%',
                    textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#000', zIndex: 2
                }}>
                    {display}
                </span>
            )}
            {evaluation < 0 && !whiteOnTop && (
                <span style={{
                    position: 'absolute', top: 5, left: 0, width: '100%',
                    textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#fff', zIndex: 2
                }}>
                    {display}
                </span>
            )}
            {evaluation < 0 && whiteOnTop && (
                <span style={{
                    position: 'absolute', bottom: 5, left: 0, width: '100%',
                    textAlign: 'center', fontSize: 11, fontWeight: 'bold', color: '#fff', zIndex: 2
                }}>
                    {display}
                </span>
            )}
        </div>
    );
}
