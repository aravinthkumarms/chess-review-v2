'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

import { AnalyzeResponse, MoveResult, SVG_MAP, START_FEN } from '@/types/analysis';
import { useChessGame } from '@/hooks/useChessGame';
import { useSounds } from '@/hooks/useSounds';
import { useStockfish, EngineType } from '@/hooks/useStockfish';

import EvalBar from '@/components/EvalBar';
import ReviewMoveList from '@/components/ReviewMoveList';
import PlaybackControls from '@/components/PlaybackControls';
import CoachSection from '@/components/CoachSection';
import EvalChart from '@/components/EvalChart';
import EngineLines from '@/components/EngineLines';
import AnalysisSettings from '@/components/AnalysisSettings';
import HighlightsSummary from '@/components/HighlightsSummary';

// ── Board themes ───────────────────────────────────────────────────────────
const BOARD_THEMES = {
    classic: { light: '#ebecd0', dark: '#779556' },
    green: { light: '#eeeed2', dark: '#769656' },
} as const;
type ThemeName = keyof typeof BOARD_THEMES;

const CLASSIFICATION_COLORS: Record<string, string> = {
    brilliant: '#1baca6',
    great: '#5ba5f5',
    best: '#1baca6',
    excellent: '#96bc4b',
    good: '#81b64c',
    inaccuracy: '#f0c15c',
    mistake: '#ffa417',
    miss: '#ff7763',
    blunder: '#fa412d',
    book: '#a88865',
};

function badgeStyle(square: string, orientation: 'white' | 'black'): React.CSSProperties {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    const col = orientation === 'white' ? file : (7 - file);
    const row = orientation === 'white' ? (7 - rank) : rank;
    const leftPct = ((col + 1) * 12.5);
    const topPct = (row * 12.5);
    return {
        position: 'absolute',
        left: `calc(${leftPct}% - 32px)`,
        top: `calc(${topPct}%)`,
        width: 32, height: 32,
        zIndex: 100, pointerEvents: 'none',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
    };
}

function PlayerInfo({ name, elo, clock }: { name: string; elo: string; clock?: string | null }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', color: '#fff', width: '100%' }}>
            <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--review-surface-5)', flexShrink: 0, overflow: 'hidden' }}>
                <img src="https://www.chess.com/bundles/web/images/noavatar_l.84a92436.gif" alt={name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name || '?'}
                    </span>
                    {elo && elo !== '?' && (
                        <span style={{ color: '#9f9e9d', fontSize: 13 }}>({elo})</span>
                    )}
                </div>
            </div>
            {clock && (
                <div style={{
                    background: 'var(--review-bg-2)', padding: '4px 10px', borderRadius: 3,
                    fontFamily: 'Montserrat, monospace', fontWeight: 700, fontSize: 16,
                    color: '#bababa', minWidth: 60, textAlign: 'center', border: '1px solid var(--review-border-strong)'
                }}>
                    {clock}
                </div>
            )}
        </div>
    );
}

function lastClock(moves: MoveResult[], currentIdx: number, isWhite: boolean): string | null {
    for (let i = currentIdx - 1; i >= 0; i--) {
        if (moves[i].isWhite === isWhite && moves[i].clock) return moves[i].clock;
    }
    return null;
}

export default function ReviewPage() {
    const router = useRouter();
    const [data, setData] = useState<AnalyzeResponse | null>(null);
    const [boardTheme, setBoardTheme] = useState<ThemeName>('classic');
    const [isPlaying, setIsPlaying] = useState(false);

    // Click-to-move state
    const [moveFrom, setMoveFrom] = useState<string | null>(null);
    const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

    const [view, setView] = useState<'summary' | 'review'>('summary');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Engine settings
    const [engineDepth, setEngineDepth] = useState(18);
    const [engineType, setEngineType] = useState<EngineType>('lite');
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [showThreats, setShowThreats] = useState(false);
    const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);

    const boardWrapperRef = useRef<HTMLDivElement>(null);
    const game = useChessGame(data);
    const sounds = useSounds();
    const engine = useStockfish(engineType);

    // Load data
    useEffect(() => {
        const raw = sessionStorage.getItem('chessAnalysis');
        if (!raw) { router.push('/'); return; }
        try { setData(JSON.parse(raw)); } catch { router.push('/'); }
    }, [router]);

    // Trigger engine analysis
    useEffect(() => {
        if (view === 'review' && engine.isReady) {
            engine.evaluate(game.currentFen, engineDepth, 3);
        }
    }, [game.currentFen, view, engine.isReady, engineDepth]);

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                const san = game.nextMove();
                if (san) sounds.playMove(san);
            } else if (e.key === 'ArrowLeft') {
                const r = game.prevMove();
                if (r !== 'noop') sounds.playUndo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [game, sounds]);

    // Process engine lines for figurines (UCI to SAN)
    const processedLines = useMemo(() => {
        return engine.lines.map(line => {
            const chess = new Chess(game.currentFen);
            const sanMoves: string[] = [];
            for (const uci of line.moves) {
                try {
                    const m = chess.move({
                        from: uci.slice(0, 2),
                        to: uci.slice(2, 4),
                        promotion: (uci.slice(4) || 'q') as any
                    });
                    if (m) sanMoves.push(m.san);
                    else break;
                } catch { break; }
            }
            return { ...line, sanMoves };
        });
    }, [engine.lines, game.currentFen]);

    const customPieces = useMemo(() => {
        const pieceKeys = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
        const map: Record<string, any> = {};

        pieceKeys.forEach(p => {
            map[p] = ({ svgStyle }: any) => (
                <img
                    src={`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${p.toLowerCase()}.png`}
                    alt={p}
                    style={{
                        ...svgStyle,
                        width: '90%',
                        height: '90%',
                        objectFit: 'contain',
                        pointerEvents: 'none',

                        // 🔥 center the scaled piece
                        transform: 'translate(5%, 5%)',
                    }}
                />
            );
        });

        return map;
    }, []);

    // Auto-play
    useEffect(() => {
        if (!isPlaying) return;
        const t = setInterval(() => {
            if (game.currentMoveIndex >= game.mainFens.length - 1) {
                setIsPlaying(false);
                return;
            }
            const san = game.nextMove();
            if (san) sounds.playMove(san);
        }, 1500);
        return () => clearInterval(t);
    }, [isPlaying, game, sounds]);

    const navGoTo = (idx: number) => {
        setIsPlaying(false);
        const isForward = idx > game.currentMoveIndex;
        game.goToMove(idx);
        if (idx === 0) sounds.playUndo();
        else if (isForward) sounds.playMove(game.rawMoves[idx - 1]?.san);
        else sounds.playUndo();
    };

    const handleBestMove = () => {
        if (engine.bestMove) {
            const moveUci = engine.bestMove;
            const from = moveUci.slice(0, 2);
            const to = moveUci.slice(2, 4);
            const promotion = moveUci.slice(4) || 'q';

            const chess = new Chess(game.currentFen);
            const move = chess.move({ from, to, promotion: promotion as any });
            if (move) {
                game.loadVariation([{ san: move.san, fen: move.after, eval: null }]);
                sounds.playMove(move.san);
            }
        }
    };

    const handleSquareClick = (square: string) => {
        // Deselect if clicking the same square
        if (moveFrom === square) {
            setMoveFrom(null);
            setOptionSquares({});
            return;
        }

        // Try to move if a piece is already selected
        if (moveFrom) {
            const chess = new Chess(game.currentFen);
            let moveObj;
            try {
                moveObj = chess.move({
                    from: moveFrom as any,
                    to: square as any,
                    promotion: 'q'
                });
            } catch { }

            if (moveObj) {
                if (!game.isVariation && game.currentMoveIndex < game.mainFens.length - 1) {
                    game.startVariation(moveObj.san, moveObj.after);
                } else {
                    game.extendVariation(moveObj.san, moveObj.after);
                }
                sounds.playMove(moveObj.san);
                setMoveFrom(null);
                setOptionSquares({});
                return;
            }
        }

        // Otherwise try to select a piece
        const chess = new Chess(game.currentFen);
        const piece = chess.get(square as any);
        const turn = chess.turn();

        if (piece && piece.color === turn) {
            const moves = chess.moves({ square: square as any, verbose: true });
            if (moves.length === 0) {
                setMoveFrom(null);
                setOptionSquares({});
                return;
            }

            const opts: Record<string, any> = {};
            moves.forEach((m) => {
                const targetPiece = chess.get(m.to as any);
                opts[m.to] = {
                    background: targetPiece && targetPiece.color !== piece.color
                        ? 'radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)'
                        : 'radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)',
                    borderRadius: '50%'
                };
            });
            opts[square] = { background: 'rgba(255, 255, 0, 0.4)' };

            setOptionSquares(opts);
            setMoveFrom(square);
        } else {
            setMoveFrom(null);
            setOptionSquares({});
        }
    };


    const handlePlaySequence = (pvs: string[]) => {
        const chess = new Chess(game.currentFen);
        const sequence: any[] = [];
        for (const moveStr of pvs) {
            try {
                // Try UCI format first (e2e4)
                if (moveStr.length >= 4) {
                    const from = moveStr.slice(0, 2);
                    const to = moveStr.slice(2, 4);
                    const prom = moveStr.slice(4) || 'q';
                    const m = chess.move({ from, to, promotion: prom as any });
                    if (m) {
                        sequence.push({ san: m.san, fen: m.after, eval: null });
                        continue;
                    }
                }

                // Fallback to SAN format (e.g., Nf3)
                const m2 = chess.move(moveStr);
                if (m2) {
                    sequence.push({ san: m2.san, fen: m2.after, eval: null });
                } else {
                    break;
                }
            } catch { break; }
        }
        if (sequence.length > 0) {
            game.loadVariation(sequence);
            const lastMove = sequence[sequence.length - 1];
            sounds.playMove(lastMove.san);
        }
    };

    const badgeSq = !game.isVariation && game.currentMoveData ?
        game.currentMoveData.uci.slice(2, 4) : null;

    // Square highlights for classifications
    const classificationStyles = useMemo(() => {
        const styles: Record<string, any> = {};
        if (!game.isVariation && game.currentMoveData) {
            const cl = game.currentMoveData.classification?.toLowerCase() || '';
            const color = CLASSIFICATION_COLORS[cl];
            if (color && badgeSq) {
                styles[badgeSq] = {
                    backgroundColor: `${color}40`, // 40 is hex for ~25% opacity
                };
            }
        }
        return styles;
    }, [game.currentMoveData, game.isVariation, badgeSq]);

    if (!data) return <div style={{ color: '#fff', padding: 20 }}>Loading...</div>;

    const isFlipped = game.orientation === 'black';
    const theme = BOARD_THEMES[boardTheme] || BOARD_THEMES.classic;
    const wClock = lastClock(data.moves, game.currentMoveIndex, true);
    const bClock = lastClock(data.moves, game.currentMoveIndex, false);

    // Arrows
    const customArrows: any[] = [];
    if (showSuggestions && !isPlaying) {
        if (hoveredLineIndex !== null && engine.lines[hoveredLineIndex]) {
            const pvs = engine.lines[hoveredLineIndex].moves;
            // Show first 2 moves as sequence
            pvs.slice(0, 2).forEach((mv, i) => {
                if (mv.length >= 4) {
                    customArrows.push({
                        startSquare: mv.slice(0, 2),
                        endSquare: mv.slice(2, 4),
                        color: i === 0 ? 'rgba(255, 255, 0, 0.8)' : 'rgba(255, 255, 0, 0.35)'
                    });
                }
            });
        } else if (engine.bestMove) {
            customArrows.push({
                startSquare: engine.bestMove.slice(0, 2),
                endSquare: engine.bestMove.slice(2, 4),
                color: 'rgba(0, 255, 0, 0.5)'
            });
        }
    }

    return (
        <div style={{
            display: 'flex', gap: 20, maxWidth: 1400, width: '100%', height: 'calc(100vh - 48px)',
            margin: '0 auto', fontFamily: 'Nunito, sans-serif'
        }}>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            <style>{`
                body { background: var(--review-bg-3); margin: 0; padding: 24px; overflow: hidden; }
                ::-webkit-scrollbar { width: 8px; }
                ::-webkit-scrollbar-track { background: var(--review-bg-2); }
                ::-webkit-scrollbar-thumb { background: var(--review-surface-3); border-radius: 4px; }
            `}</style>

            {/* Board Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', minWidth: 0 }}>
                <div style={{ width: '100%', maxWidth: 'min(70vw, calc(100vh - 160px))', margin: '0 auto' }}>
                    <PlayerInfo
                        name={isFlipped ? data.whitePlayer : data.blackPlayer}
                        elo={isFlipped ? data.whiteElo : data.blackElo}
                        clock={isFlipped ? wClock : bClock}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    gap: 0,
                    margin: '0 auto',
                    width: '100%',
                    maxWidth: 'min(70vw, calc(100vh - 220px))',
                    aspectRatio: '1 / 1',
                    background: 'var(--review-bg-2)',
                    padding: 4,
                    borderRadius: 4,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ width: 34, height: 'auto', alignSelf: 'stretch' }}>
                        <EvalBar evaluation={game.currentEval} flipped={isFlipped} />
                    </div>
                    <div ref={boardWrapperRef} style={{ flex: 1, position: 'relative', aspectRatio: '1/1' }}>
                        <Chessboard
                            options={{
                                position: game.currentFen,
                                boardOrientation: game.orientation,
                                lightSquareStyle: { backgroundColor: theme.light },
                                darkSquareStyle: { backgroundColor: theme.dark },
                                arrows: customArrows,
                                squareStyles: { ...classificationStyles, ...optionSquares },
                                onSquareClick: (args: any) => handleSquareClick(args.square),
                                animationDurationInMs: 300,
                                boardStyle: { borderRadius: '4px' },
                                pieces: customPieces
                            }}
                        />
                        {badgeSq && !game.isVariation && game.currentMoveData && (() => {
                            const cl = game.currentMoveData.classification?.toLowerCase() || '';
                            const svg = SVG_MAP[cl];
                            return svg ? <img src={svg} alt={cl} style={badgeStyle(badgeSq, game.orientation)} /> : null;
                        })()}
                    </div>
                </div>

                <div style={{ width: '100%', maxWidth: 'min(70vw, calc(100vh - 160px))', margin: '0 auto' }}>
                    <PlayerInfo
                        name={isFlipped ? data.blackPlayer : data.whitePlayer}
                        elo={isFlipped ? data.blackElo : data.whiteElo}
                        clock={isFlipped ? bClock : wClock}
                    />
                </div>
            </div>

            {/* Sidebar Column */}
            <div style={{
                width: 440, background: 'var(--review-bg-2)', borderRadius: 8, display: 'flex',
                flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                position: 'relative'
            }}>
                {/* Header */}
                <div style={{
                    padding: '12px 20px',
                    background: 'var(--review-bg)',
                    borderBottom: '1px solid var(--review-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                            onClick={() => view === 'summary' ? router.push('/') : setView('summary')}
                            style={{ background: 'none', border: 'none', color: '#8b8987', cursor: 'pointer', fontSize: 18 }}
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Game Review</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, color: '#8b8987' }}>
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            style={{ background: 'none', border: 'none', color: isSettingsOpen ? '#fff' : 'inherit', cursor: 'pointer', fontSize: 18 }}
                        >
                            <i className="fas fa-cog"></i>
                        </button>
                    </div>
                </div>

                {/* Settings Popup */}
                <AnalysisSettings
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    depth={engineDepth}
                    setDepth={setEngineDepth}
                    engineType={engineType}
                    setEngineType={setEngineType}
                    showSuggestions={showSuggestions}
                    setShowSuggestions={setShowSuggestions}
                    showThreats={showThreats}
                    setShowThreats={setShowThreats}
                />

                {view === 'summary' ? (
                    <HighlightsSummary
                        data={data}
                        onStartReview={() => setView('review')}
                    />
                ) : (
                    <>
                        <CoachSection
                            move={game.currentMoveData}
                            evaluation={game.currentEval}
                            onNext={() => game.nextMove()}
                            onBestMove={handleBestMove}
                        />

                        {/* Engine Lines */}
                        <EngineLines
                            lines={processedLines}
                            isSearching={engine.isSearching}
                            turn={new Chess(game.currentFen).turn()}
                            moveNumber={new Chess(game.currentFen).moveNumber()}
                            onPlaySequence={handlePlaySequence}
                            onHoverLine={setHoveredLineIndex}
                        />

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            <ReviewMoveList
                                moves={game.rawMoves}
                                activeMoveIndex={game.currentMoveIndex}
                                onSelectMove={navGoTo}
                            />
                        </div>

                        <EvalChart
                            evaluations={game.evaluations}
                            currentIndex={game.currentMoveIndex}
                            onSelectMove={navGoTo}
                        />

                        <div style={{ padding: '16px 20px', background: 'var(--review-bg)', borderTop: '1px solid var(--review-border)' }}>
                            <PlaybackControls
                                isPlaying={isPlaying}
                                onTogglePlay={() => setIsPlaying(!isPlaying)}
                                onFirst={() => navGoTo(0)}
                                onPrev={() => { setIsPlaying(false); const r = game.prevMove(); if (r !== 'noop') sounds.playUndo(); }}
                                onNext={() => { setIsPlaying(false); const san = game.nextMove(); if (san) sounds.playMove(san); }}
                                onLast={() => navGoTo(game.mainFens.length - 1)}
                                onFlip={game.flipBoard}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
