'use client';

import { useEffect, useRef, useCallback } from 'react';
import { SVG_MAP, MoveResult } from '@/types/analysis';

interface Props {
    moves: MoveResult[];
    activeMoveIndex: number;   // 1-based (0 = start position = no active cell)
    showTimestamps: boolean;
    onSelectMove: (index: number) => void;
    gameResult?: string;

    // Variation props
    isVariation?: boolean;
    variationBaseIndex?: number;
    variationMoves?: Array<{ san: string }>;
    variationIndex?: number;
    onSelectVariationMove?: (index: number) => void;
    onExitVariation?: () => void;
}

export default function MoveList({
    moves, activeMoveIndex, showTimestamps, onSelectMove, gameResult,
    isVariation, variationBaseIndex, variationMoves, variationIndex, onSelectVariationMove, onExitVariation
}: Props) {
    const activeCellRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll active cell into view
    useEffect(() => {
        activeCellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [activeMoveIndex]);

    const pairs: Array<[MoveResult, MoveResult | null]> = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push([moves[i], moves[i + 1] ?? null]);
    }

    const divergePairIdx = variationBaseIndex !== undefined ? Math.max(0, Math.ceil(variationBaseIndex / 2) - 1) : -1;

    const renderVariationThread = () => {
        if (!isVariation || !variationMoves || variationBaseIndex === undefined) return null;
        return (
            <div style={{
                margin: '4px 10px 8px 10px', padding: '8px 12px', background: '#353330',
                borderLeft: '3px solid #f0c15c', borderRadius: 4, fontSize: 13,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, color: '#f0c15c', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
                    <span><i className="fas fa-code-branch"></i> Analysis Thread</span>
                    <button onClick={(e) => { e.stopPropagation(); onExitVariation?.(); }} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div style={{ lineHeight: '1.8' }}>
                    {variationMoves.map((node, i) => {
                        const globalIdx = variationBaseIndex + i;
                        const isW = globalIdx % 2 === 0;
                        const mn = Math.floor(globalIdx / 2) + 1;
                        const prefix = isW ? `${mn}. ` : (i === 0 ? `${mn}... ` : '');
                        return (
                            <span key={i}
                                onClick={(e) => { e.stopPropagation(); onSelectVariationMove?.(i); }}
                                style={{
                                    cursor: 'pointer', padding: '2px 5px', borderRadius: 3, marginRight: 5,
                                    display: 'inline-block', transition: 'background 0.1s',
                                    background: i === variationIndex ? '#fff' : 'rgba(255,255,255,0.05)',
                                    color: i === variationIndex ? '#302e2b' : '#cbcbca',
                                    fontWeight: i === variationIndex ? 700 : 600,
                                }}>
                                {prefix}{node.san}
                            </span>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{
            flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
            paddingBottom: 10,
        }}>
            {pairs.map(([white, black], pairIdx) => {
                const whiteIdx = pairIdx * 2 + 1;
                const blackIdx = pairIdx * 2 + 2;
                const isEvenRow = pairIdx % 2 === 0;
                const rowBg = isEvenRow ? '#262421' : '#2b2927';

                return (
                    <div key={pairIdx} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                            display: 'flex', fontFamily: 'Nunito, sans-serif', fontSize: 13, fontWeight: 600,
                            background: rowBg
                        }}>
                            {/* Move number */}
                            <div style={{
                                width: 38, padding: '6px 0', textAlign: 'center',
                                color: '#8b8987', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {pairIdx + 1}.
                            </div>

                            {/* White move */}
                            <MoveCell
                                move={white}
                                isActive={whiteIdx === activeMoveIndex}
                                onClick={() => onSelectMove(whiteIdx)}
                                showClock={showTimestamps}
                                ref={whiteIdx === activeMoveIndex ? activeCellRef : null}
                            />

                            {/* Black move */}
                            {black ? (
                                <MoveCell
                                    move={black}
                                    isActive={blackIdx === activeMoveIndex}
                                    onClick={() => onSelectMove(blackIdx)}
                                    showClock={showTimestamps}
                                    ref={blackIdx === activeMoveIndex ? activeCellRef : null}
                                />
                            ) : (
                                <div style={{ flex: '1 1 0%', minWidth: 0, margin: '2px 4px', padding: '6px 10px' }} />
                            )}
                        </div>
                        {/* Render variation thread directly under the pair where it diverged */}
                        {pairIdx === divergePairIdx && renderVariationThread()}
                    </div>
                );
            })}

            {/* Game Result Footer */}
            {gameResult && gameResult !== '*' && (
                <div style={{
                    marginTop: 10, padding: '8px 0', textAlign: 'center', fontSize: 13,
                    fontWeight: 700, color: '#aaa', borderTop: '1px solid #403d39',
                    fontFamily: 'Nunito, sans-serif', letterSpacing: 1
                }}>
                    <i className="fas fa-flag-checkered" style={{ marginRight: 6 }}></i>
                    {gameResult === '1-0' ? 'White Won' : gameResult === '0-1' ? 'Black Won' : gameResult === '1/2-1/2' ? 'Draw' : gameResult}
                </div>
            )}
        </div>
    );
}

import { forwardRef } from 'react';

const MoveCell = forwardRef<HTMLDivElement, {
    move: MoveResult;
    isActive: boolean;
    onClick: () => void;
    showClock: boolean;
}>(function MoveCell({ move, isActive, onClick, showClock }, ref) {
    const cl = move.classification?.toLowerCase() ?? '';
    const svg = SVG_MAP[cl];

    return (
        <div
            ref={ref}
            onClick={onClick}
            style={{
                flex: '1 1 0%', minWidth: 0, padding: '6px 10px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                color: isActive ? '#fff' : '#cbcbca',
                background: isActive ? '#484542' : 'transparent',
                borderRadius: 4, margin: '2px 4px',
                userSelect: 'none', transition: 'background 0.1s',
            }}
        >
            <span>{move.san}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {showClock && move.clock && (
                    <span style={{
                        fontFamily: "'Courier New', monospace", fontSize: 11, color: '#888',
                        background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3,
                    }}>
                        ⏱ {move.clock}
                    </span>
                )}
                {svg && (
                    <img
                        src={svg}
                        alt={cl}
                        title={move.classification ?? cl}
                        style={{ width: 16, height: 16, marginLeft: 2, verticalAlign: 'text-bottom', display: 'inline-block' }}
                    />
                )}
            </span>
        </div>
    );
});
