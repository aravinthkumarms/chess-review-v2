'use client';

import React from 'react';
import { StockfishLine } from '@/hooks/useStockfish';

export interface StockfishLineWithSan extends StockfishLine {
    sanMoves?: string[];
}

interface EngineLinesProps {
    lines: StockfishLineWithSan[];
    isSearching: boolean;
    onPlaySequence?: (moves: string[]) => void;
    onHoverLine?: (index: number | null) => void;
    turn: 'w' | 'b';
    moveNumber: number;
}

const FIGURINE_MAP: Record<string, string> = {
    'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
};

export default function EngineLines({ lines, isSearching, onPlaySequence, onHoverLine, turn, moveNumber }: EngineLinesProps) {
    if (lines.length === 0 && !isSearching) return null;

    const formatEval = (score: number) => {
        if (Math.abs(score) > 900) {
            const mate = 1000 - Math.abs(score);
            return (score > 0 ? '+M' : '-M') + mate;
        }
        return (score > 0 ? '+' : '') + (score / 100).toFixed(2);
    };

    const renderMove = (move: string, index: number, lineIndex: number, pv: string[], sanMoves?: string[]) => {
        // Calculate move numbering
        const isBlackTurn = turn === 'b';
        const adjustedIdx = isBlackTurn ? index + 1 : index;
        const currentMoveNum = moveNumber + Math.floor(adjustedIdx / 2);
        const isWhiteMove = isBlackTurn ? index % 2 !== 0 : index % 2 === 0;

        let prefix = '';
        if (index === 0 && isBlackTurn) {
            prefix = `${currentMoveNum}...`;
        } else if (isWhiteMove) {
            prefix = `${currentMoveNum}.`;
        }

        // Use sanMove if available for figurines
        const displayMove = sanMoves?.[index] || move;
        let figurine = '';
        let sanText = displayMove;
        if (displayMove[0] >= 'A' && displayMove[0] <= 'Z' && displayMove[0] !== 'O') {
            figurine = FIGURINE_MAP[displayMove[0]] || '';
            sanText = displayMove.slice(1);
        }

        return (
            <span
                key={index}
                className="move-san-component engine-line-node engine-line-clickable"
                onClick={(e) => {
                    e.stopPropagation();
                    onPlaySequence?.(pv.slice(0, index + 1));
                }}
                style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    marginRight: 5,
                    height: 24,
                    lineHeight: '24px'
                }}
            >
                {prefix && (
                    <span className="move-san-premove" style={{
                        color: 'rgba(255, 255, 255, 0.72)',
                        fontSize: 13,
                        marginRight: 1,
                        lineHeight: '18px'
                    }}>
                        {prefix}
                    </span>
                )}
                <span className="move-san-highlight" style={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    color: '#d5a47d', // Scraped tan color
                    fontSize: 16,
                    lineHeight: '24px'
                }}>
                    {figurine && (
                        <span className="move-san-figurine" style={{ fontSize: 18, marginRight: 1, fontWeight: 400 }}>
                            {figurine}
                        </span>
                    )}
                    <span className="move-san-san" style={{ fontWeight: 700 }}>
                        {sanText}
                    </span>
                </span>
            </span>
        );
    };

    return (
        <div
            className="analysis-view-lines"
            onMouseLeave={() => onHoverLine?.(null)}
            style={{
                padding: '0 8px',
                background: 'rgba(0, 0, 0, 0.14)',
                borderBottom: '1px solid var(--review-border)',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif'
            }}
        >
            {lines.slice(0, 3).map((line, idx) => (
                <div
                    key={idx}
                    className="engine-line-component engine-line-withicon"
                    onMouseEnter={() => onHoverLine?.(idx)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '2px 10px 2px 0',
                        height: 26,
                        lineHeight: '18px',
                        color: 'rgba(255, 255, 255, 0.72)'
                    }}
                >
                    {/* Evaluation Badge */}
                    <a
                        className="score-text-score"
                        style={{
                            minWidth: 45,
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: 15,
                            color: 'var(--review-surface)',
                            backgroundColor: '#ffffff',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            textDecoration: 'none',
                            lineHeight: '21.45px',
                            flexShrink: 0
                        }}
                    >
                        {formatEval(line.evaluation)}
                    </a>

                    {/* Move Sequence */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'nowrap',
                        overflowX: 'hidden',
                        whiteSpace: 'nowrap'
                    }}>
                        {line.moves.slice(0, 10).map((move, mIdx) => renderMove(move, mIdx, idx, line.moves, line.sanMoves))}
                    </div>
                </div>
            ))}
            {isSearching && lines.length === 0 && (
                <div style={{ padding: '8px 16px', fontSize: 11, color: '#8b8987', fontStyle: 'italic' }}>
                    Engine calculating...
                </div>
            )}
        </div>
    );
}
