'use client';

import React from 'react';
import { MoveResult, SVG_MAP } from '@/types/analysis';

interface ReviewMoveListProps {
    moves: MoveResult[];
    activeMoveIndex: number;
    onSelectMove: (index: number) => void;
}

export default function ReviewMoveList({ moves, activeMoveIndex, onSelectMove }: ReviewMoveListProps) {
    // Pair moves into [white, black] rows
    const rows: { number: number; white: MoveResult; whiteIdx: number; black?: MoveResult; blackIdx?: number }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
        rows.push({
            number: Math.floor(i / 2) + 1,
            white: moves[i],
            whiteIdx: i + 1,
            black: moves[i + 1],
            blackIdx: i + 2,
        });
    }

    return (
        <div style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--review-bg)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif'
        }}>
            {rows.map((row, rowIdx) => (
                <div
                    key={rowIdx}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        minHeight: 30,
                        background: rowIdx % 2 === 0 ? 'var(--review-bg)' : 'var(--review-bg-2)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--review-text-faint)'
                    }}
                >
                    {/* Move Number */}
                    <div style={{ width: 34, flexShrink: 0, paddingLeft: 4 }}>
                        {row.number}.
                    </div>

                    {/* White Move */}
                    <MoveNode
                        move={row.white}
                        isActive={row.whiteIdx === activeMoveIndex}
                        onClick={() => onSelectMove(row.whiteIdx)}
                    />

                    {/* Black Move */}
                    {row.black ? (
                        <MoveNode
                            move={row.black}
                            isActive={row.blackIdx === activeMoveIndex}
                            onClick={() => onSelectMove(row.blackIdx!)}
                        />
                    ) : (
                        <div style={{ flex: 1 }} />
                    )}
                </div>
            ))}
        </div>
    );
}

function MoveNode({ move, isActive, onClick }: { move: MoveResult; isActive: boolean; onClick: () => void }) {
    const cl = move.classification?.toLowerCase() || '';
    const svg = SVG_MAP[cl];

    return (
        <div
            onClick={onClick}
            style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '0 4px',
                borderRadius: 3,
                backgroundColor: isActive ? '#ffffff' : 'transparent',
                // When active, use black text. Otherwise, use classification color or default.
                color: isActive ? '#000000' : (cl === 'book' ? '#d5a47d' : 'rgba(255, 255, 255, 0.65)'),
                height: 24,
                margin: '0 2px',
                transition: 'background-color 0.1s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                {/* Icon to the left of text */}
                {svg && (
                    <img src={svg} alt={cl} style={{ width: 14, height: 14, flexShrink: 0 }} />
                )}
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {move.san}
                </span>
            </div>
        </div>
    );
}
