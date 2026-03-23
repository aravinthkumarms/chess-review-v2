'use client';

import React from 'react';
import { MoveResult, SVG_MAP } from '@/types/analysis';

interface CoachSectionProps {
    move: MoveResult | null;
    evaluation: number | null;
    onNext: () => void;
    onBestMove?: () => void;
}

export default function CoachSection({ move, evaluation, onNext, onBestMove }: CoachSectionProps) {
    const getClsColor = (cls?: string) => {
        switch (cls?.toLowerCase()) {
            case 'brilliant': return '#1baca6';
            case 'great': return '#5c8bb0';
            case 'best':
            case 'best move': return '#81b64c';
            case 'excellent': return '#96bc4b';
            case 'good': return '#96bc4b';
            case 'book': return '#a88865';
            case 'inaccuracy': return '#f0c15c';
            case 'mistake': return '#ffa459';
            case 'miss': return '#ff3b17';
            case 'blunder': return '#b33430';
            default: return '#fff';
        }
    };

    const getCoachFeedback = (move: MoveResult) => {
        const cls = move.classification?.toLowerCase() || '';
        switch (cls) {
            case 'brilliant': return `Great job! You found a brilliant move that wins material.`;
            case 'great': return `This move was great. You found the only move that maintains a large advantage.`;
            case 'best':
            case 'best move': return `You found the best move. Keep it up!`;
            case 'excellent': return `This move was excellent. You have a solid advantage here.`;
            case 'good': return `This move was good. You're maintaining pressure.`;
            case 'book': return `A standard book move. You're following opening theory.`;
            case 'inaccuracy': return `An inaccuracy. You could have maintained a stronger position.`;
            case 'mistake': return `This move was a mistake. Your advantage is slipping.`;
            case 'miss': return `You missed a better opportunity here.`;
            case 'blunder': return `A blunder. This move drastically changes the evaluation.`;
            default: return `A solid move. Let's see how the game continues.`;
        }
    };

    const formatEval = (val: number | null) => {
        if (val === null) return '0.0';
        if (Math.abs(val) > 900) return (val > 0 ? '+M' : '-M') + (1000 - Math.abs(val));
        return (val > 0 ? '+' : '') + (val / 100).toFixed(1);
    };

    const showBestButton = move && ['blunder', 'mistake', 'miss', 'inaccuracy', 'good', 'excellent'].includes(move.classification?.toLowerCase() || '');

    return (
        <div style={{
            padding: '16px 20px',
            background: 'var(--review-bg-3)',
            borderBottom: '1px solid var(--review-border)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif'
        }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {/* Coach Avatar */}
                <div style={{ width: 56, height: 56, flexShrink: 0, border: '2px solid var(--review-border)', borderRadius: '50%', overflow: 'hidden' }}>
                    <img
                        src="https://www.chess.com/bundles/web/images/vishy-anand.d3c5b5a8.png"
                        alt="Coach"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>

                {/* Speech Bubble */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{
                        background: 'var(--review-surface)',
                        borderRadius: '0 8px 8px 8px',
                        padding: '12px 16px',
                        position: 'relative',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}>
                        {/* Eval Badge */}
                        <div style={{
                            position: 'absolute',
                            top: -8,
                            right: 8,
                            background: 'var(--review-bg-2)',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--review-border)',
                            zIndex: 10
                        }}>
                            {formatEval(evaluation)}
                        </div>

                        {move ? (
                            <>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                    <div style={{ width: 22, height: 22, flexShrink: 0 }}>
                                        {SVG_MAP[move.classification?.toLowerCase() || ''] && (
                                            <img
                                                src={SVG_MAP[move.classification!.toLowerCase()]}
                                                style={{ width: '100%' }}
                                                alt="cls"
                                            />
                                        )}
                                    </div>
                                    <div style={{
                                        fontSize: 17,
                                        fontWeight: 800,
                                        color: getClsColor(move.classification),
                                        letterSpacing: -0.4
                                    }}>
                                        {move.san} is {move.classification || 'Good'}
                                    </div>
                                </div>
                                <div style={{ fontSize: 13, color: '#bababa', lineHeight: 1.4, fontWeight: 500 }}>
                                    {getCoachFeedback(move)}
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 13, color: '#8b8987' }}>
                                Start the review to see my feedback on your moves.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Buttons Below */}
            {move && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingLeft: 72 }}>
                    {showBestButton && (
                        <button
                            onClick={onBestMove}
                            style={{
                                padding: '6px 16px',
                                background: 'var(--review-surface-3)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 4,
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Best
                        </button>
                    )}
                    <button
                        onClick={onNext}
                        style={{
                            flex: 1,
                            padding: '6px 12px',
                            background: 'var(--color-green)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 13,
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 2px 0 #618a3a'
                        }}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
