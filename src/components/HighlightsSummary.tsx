'use client';

import React from 'react';
import { AnalyzeResponse } from '@/types/analysis';

interface HighlightsSummaryProps {
    data: AnalyzeResponse;
    onStartReview: () => void;
}

export default function HighlightsSummary({ data, onStartReview }: HighlightsSummaryProps) {
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            background: 'var(--review-bg)', fontFamily: 'Nunito, sans-serif'
        }}>
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Game Review</h2>
                <div style={{ color: '#8b8987', fontSize: 14 }}>{data.whitePlayer} vs {data.blackPlayer}</div>
            </div>

            <div style={{ flex: 1, padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Accuracy Card */}
                <div style={{ background: 'var(--review-surface)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
                        <AccuracyCircle player={data.whitePlayer} accuracy={data.whiteAccuracy} isWhite />
                        <AccuracyCircle player={data.blackPlayer} accuracy={data.blackAccuracy} isWhite={false} />
                    </div>
                </div>

                {/* Move Breakdowns (Simplified) */}
                <div style={{ background: 'var(--review-surface)', borderRadius: 8, padding: 20 }}>
                    <div style={{ fontSize: 13, color: '#8b8987', fontWeight: 800, textTransform: 'uppercase', marginBottom: 16 }}>
                        Move Breakdown
                    </div>
                    {/* Just a summary view, we could add more details here later */}
                    <div style={{ color: '#bababa', fontSize: 14, lineHeight: 1.5 }}>
                        White played with {data.whiteAccuracy.toFixed(1)}% accuracy.
                        Black played with {data.blackAccuracy.toFixed(1)}% accuracy.
                    </div>
                </div>
            </div>

            <div style={{ padding: 24 }}>
                <button
                    onClick={onStartReview}
                    style={{
                        width: '100%', background: 'var(--color-green)', color: '#fff', border: 'none',
                        padding: '16px', borderRadius: 8, fontSize: 18, fontWeight: 800,
                        cursor: 'pointer', boxShadow: '0 4px 0 var(--color-green-shadow)', transition: 'all 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.05)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                    onMouseDown={e => {
                        e.currentTarget.style.transform = 'translateY(2px)';
                        e.currentTarget.style.boxShadow = '0 2px 0 var(--color-green-shadow)';
                    }}
                    onMouseUp={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 0 var(--color-green-shadow)';
                    }}
                >
                    Start Review
                </button>
            </div>
        </div>
    );
}

function AccuracyCircle({ player, accuracy, isWhite }: { player: string; accuracy: number; isWhite: boolean }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
                width: 80, height: 80, borderRadius: '50%', background: isWhite ? '#fff' : '#000',
                border: '4px solid var(--review-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative'
            }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: isWhite ? '#000' : '#fff' }}>
                    {Math.round(accuracy)}
                </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {player}
            </div>
        </div>
    );
}
