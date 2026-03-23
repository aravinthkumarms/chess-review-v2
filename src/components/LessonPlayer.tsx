import { useState, useEffect, useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import { LessonData, useLessonLogic } from '@/hooks/useLessonLogic';
import { useSounds } from '@/hooks/useSounds';
import { getLocalApiBase } from '@/lib/api';

interface Props {
    lesson: LessonData;
    onClose: () => void;
    onNext?: () => void;
    /**
     * Which variation index to lock into (0-based).
     * If undefined, the player shows all variations for free practice.
     */
    targetVariationIndex?: number;
    /**
     * If true, start in practice mode. The player only allows variations
     * 0..targetVariationIndex to be practiced.
     * If false (default), start in "learn" (review/auto-walk) mode for
     * only the targetVariationIndex variation.
     */
    isPracticeMode?: boolean;
}

export default function LessonPlayer({ lesson, onClose, onNext, targetVariationIndex, isPracticeMode = false }: Props) {
    // Both learn and practice tiles use interactive practice mode on the board.
    // The difference: learn tiles show arrows always; practice tiles only after hint requests.
    const [viewMode, setViewMode] = useState<'video' | 'practice'>(
        (lesson.type === 'VIDEO' && targetVariationIndex !== -1 && (lesson.videoVimeoId || lesson.videoPath)) ? 'video' : 'practice'
    );
    const [completedVariations, setCompletedVariations] = useState<string[]>([]);

    // For "learn" (review) tiles: only show the specific targeted variation.
    // For "practice" tiles: show all variations up to targetVariationIndex.
    // For free-play (no target): show all variations.
    const [activeVarIds, setActiveVarIds] = useState<string[] | undefined>(undefined);

    // For "practice" and "drill" tiles, we want sequential progression through the active variations.
    // This state tracks which of the activeVarIds we are currently practicing.
    const [currentVarIndex, setCurrentVarIndex] = useState(0);

    // Click-to-move state
    const [moveFrom, setMoveFrom] = useState<string | null>(null);
    const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

    const logic = useLessonLogic({
        rawData: lesson,
        isReviewMode: false,
        activeVariationIds: activeVarIds
    });

    // After logic loads, determine the allowed variations
    useEffect(() => {
        if (logic.allVariations.length === 0) return;

        let newActiveIds: string[] | undefined = undefined;

        if (targetVariationIndex === undefined || targetVariationIndex === -1 || (lesson.type === 'VIDEO' && viewMode === 'practice')) {
            // Free play / Drill / Video practice — all variations are active, played sequentially
            newActiveIds = logic.allVariations.map(v => v.id);
        } else if (!isPracticeMode) {
            // "Learn" mode: only the one targeted variation
            const v = logic.allVariations[targetVariationIndex];
            if (v) newActiveIds = [v.id];
        } else {
            // "Practice" mode: only the targeted variation
            const v = logic.allVariations[targetVariationIndex];
            if (v) newActiveIds = [v.id];
        }

        setActiveVarIds(newActiveIds);
        setCurrentVarIndex(0); // Reset progress when tile changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logic.allVariations.length, targetVariationIndex, isPracticeMode, lesson.type, viewMode]);

    // Force logic to select the variation dictated by our sequential currentVarIndex
    useEffect(() => {
        if (!activeVarIds || activeVarIds.length === 0) return;
        const targetId = activeVarIds[currentVarIndex];
        if (targetId && targetId !== logic.selectedVariationId) {
            logic.setSelectedVariationId(targetId);
        }
    }, [activeVarIds, currentVarIndex, logic]);

    const sounds = useSounds();

    const hasFinished = logic.selectedVariationId && viewMode === 'practice'
        ? logic.availableMoves.length === 0 && logic.moveHistory.length > 0
        : false;

    useEffect(() => {
        if (hasFinished && logic.selectedVariationId && !completedVariations.includes(logic.selectedVariationId)) {
            setCompletedVariations(prev => [...prev, logic.selectedVariationId!]);
        }
    }, [hasFinished, logic.selectedVariationId, completedVariations]);

    const handlePieceDrop = ({ sourceSquare, targetSquare, piece }: { sourceSquare: string; targetSquare: string | null; piece: { pieceType: string; isSparePiece: boolean; position: string } }) => {
        if (!targetSquare) return false;
        const res = logic.playMove(sourceSquare, targetSquare, piece.pieceType);
        if (res) sounds.playMove('K');
        else sounds.playError();
        setMoveFrom(null);
        setOptionSquares({});
        return res;
    };

    const handleSquareClick = (square: Square) => {
        if (logic.isComputerTurn || hasFinished) return;

        // Deselect if clicking the same square
        if (moveFrom === square) {
            setMoveFrom(null);
            setOptionSquares({});
            return;
        }

        // Try to move if a piece is already selected
        if (moveFrom) {
            const chess = new Chess(logic.currentFen);
            let moveObj;
            try {
                moveObj = chess.move({
                    from: moveFrom as Square,
                    to: square as Square,
                    promotion: 'q'
                });
            } catch { }

            if (moveObj) {
                const res = logic.playMove(moveFrom, square, moveObj.piece);
                if (res) sounds.playMove('K');
                else sounds.playError();

                setMoveFrom(null);
                setOptionSquares({});
                return;
            }
        }

        // Otherwise try to select a piece
        const chess = new Chess(logic.currentFen);
        const piece = chess.get(square as Square);
        if (piece && piece.color === logic.userColor) {
            const moves = chess.moves({ square: square as Square, verbose: true });
            if (moves.length === 0) {
                setMoveFrom(null);
                setOptionSquares({});
                return;
            }

            const opts: Record<string, any> = {};
            moves.forEach((m) => {
                const targetPiece = chess.get(m.to as Square);
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

    useEffect(() => {
        if (viewMode === 'practice' && logic.isComputerTurn && logic.availableMoves.length > 0 && logic.lastResult !== 'mistake') {
            const timer = setTimeout(() => {
                logic.playComputerMove();
                sounds.playMove('K');
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [logic.currentFen, logic.isComputerTurn, logic.availableMoves, logic.lastResult, logic, sounds, viewMode]);

    const customSquareStyles = useMemo(() => {
        const styles: Record<string, React.CSSProperties> = {};
        if (logic.hintLevel >= 1 && logic.hintMoveSquares) {
            styles[logic.hintMoveSquares.from] = { background: 'rgba(99, 102, 241, 0.5)' };
            if (logic.hintLevel >= 2) {
                styles[logic.hintMoveSquares.to] = { background: 'rgba(99, 102, 241, 0.5)' };
            }
        }
        return styles;
    }, [logic.hintLevel, logic.hintMoveSquares]);

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
                        width: '92%',
                        height: '92%',
                        margin: '4%',
                        objectFit: 'contain',
                        pointerEvents: 'none'
                    }}
                />
            );
        });

        return map;
    }, []);

    const API_BASE = getLocalApiBase();
    const videoUrl = lesson.videoPath
        ? `${API_BASE}/api/videos${lesson.videoPath}`
        : null;

    // ── Theme tokens: change colors in globals.css :root, not here ──
    const TEAL = 'var(--color-accent)';
    const BG_DARK = 'var(--learn-bg)';
    const BG_SIDEBAR = 'var(--learn-surface)';
    const BG_HEADER = 'var(--learn-header)';
    const BORDER = 'var(--learn-border)';
    const TEXT_DIM = 'var(--learn-text-dim)';

    // Determine if the entire tile/practice set is fully completed
    const isTileFullyCompleted = activeVarIds ? currentVarIndex >= activeVarIds.length - 1 && hasFinished : hasFinished;

    // Label for what the user is doing
    const modeLabel = !isPracticeMode && targetVariationIndex !== undefined
        ? `Learning: ${logic.allVariations[targetVariationIndex]?.name ?? 'Variation'}`
        : targetVariationIndex !== undefined && targetVariationIndex !== -1
            ? `Practicing: ${logic.allVariations[targetVariationIndex]?.name ?? 'Variation'}`
            : `Drill ${currentVarIndex + 1} of ${activeVarIds?.length || 1}`;

    return (
        <div style={{ display: 'flex', width: '100%', height: '100vh', background: BG_DARK }}>
            {/* Font Awesome (icons) */}
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            {/* Board / Video Column */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, minWidth: 0 }}>
                <div style={{
                    width: '100%',
                    maxWidth: viewMode === 'video' ? 900 : 'min(70vw, calc(100vh - 200px))',
                    aspectRatio: '1 / 1',
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
                    margin: '0 auto',
                    background: BG_HEADER
                }}>
                    {viewMode === 'video' && (lesson.videoVimeoId || videoUrl) ? (
                        lesson.videoVimeoId ? (
                            <iframe
                                src={`https://player.vimeo.com/video/${lesson.videoVimeoId}?badge=0&autopause=0&player_id=0&app_id=12345555&autoplay=1`}
                                frameBorder="0"
                                allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                                style={{ width: '100%', height: '100%' }}
                                title={lesson.name}
                            />
                        ) : (
                            <video src={videoUrl!} controls autoPlay style={{ width: '100%', height: '100%' }} />
                        )
                    ) : (
                        <Chessboard
                            options={{
                                id: 'LessonBoard',
                                boardOrientation: logic.userColor === 'w' ? 'white' : 'black',
                                position: logic.currentFen,
                                onPieceDrop: handlePieceDrop,
                                onSquareClick: (args: any) => handleSquareClick(args.square as Square),
                                boardStyle: { borderRadius: '4px' },
                                darkSquareStyle: { backgroundColor: '#779556' },
                                lightSquareStyle: { backgroundColor: '#ebecd0' },
                                animationDurationInMs: 300,
                                squareStyles: { ...customSquareStyles, ...optionSquares },
                                arrows: !isPracticeMode ? logic.learnableArrows : (logic.hintLevel > 0 ? logic.learnableArrows : []),
                                pieces: customPieces
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Sidebar */}
            <div style={{ width: 380, flexShrink: 0, background: BG_SIDEBAR, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '14px 18px', background: BG_HEADER, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: TEXT_DIM, cursor: 'pointer', fontSize: 15, padding: '4px 6px', borderRadius: 4 }}>
                        <i className="fas fa-arrow-left" />
                    </button>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lesson.name}
                        </div>
                        <div style={{ color: TEAL, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                            {modeLabel}
                        </div>
                    </div>
                </div>

                {/* Learn mode badge — shown when arrows are always visible */}
                {!isPracticeMode && targetVariationIndex !== undefined && (
                    <div style={{ background: '#0e2a28', borderBottom: `1px solid #6366f130`, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className="fas fa-book-open" style={{ color: TEAL, fontSize: 13 }} />
                        <div style={{ color: TEAL, fontSize: 13, fontWeight: 700 }}>Follow arrow & move the piece</div>
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {viewMode === 'video' ? (
                        <div style={{ color: TEXT_DIM, fontSize: 14, lineHeight: 1.7 }}>
                            <p>Watch the instructional video for this lesson.</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
                                <button
                                    onClick={() => setViewMode('practice')}
                                    className="lesson-btn"
                                    style={{
                                        background: '#252525', color: '#fff', border: `1px solid ${BORDER}`,
                                        padding: '12px 24px', borderRadius: 8, cursor: 'pointer',
                                        fontWeight: 700, fontSize: 15, display: 'flex',
                                        alignItems: 'center', gap: 10
                                    }}
                                >
                                    <i className="fas fa-chess-pawn" /> Practice Variation
                                </button>
                                {onNext && (
                                    <button
                                        onClick={onNext}
                                        className="lesson-btn-primary"
                                        style={{
                                            background: TEAL, color: '#fff', border: 'none',
                                            padding: '12px 32px', borderRadius: 8, cursor: 'pointer',
                                            fontWeight: 800, fontSize: 15, display: 'flex',
                                            alignItems: 'center', gap: 10,
                                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                                            transition: 'transform 0.2s'
                                        }}
                                    >
                                        Proceed to Next <i className="fas fa-chevron-right" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : hasFinished ? (
                        // Practice finished (current line)
                        <div style={{ textAlign: 'center', padding: '32px 0' }}>
                            <div style={{ fontSize: 44, marginBottom: 12 }}>🏆</div>
                            <h3 style={{ color: '#fff', margin: '0 0 8px', fontSize: 18 }}>Line Completed!</h3>
                            <div style={{ color: TEXT_DIM, marginBottom: 24, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14 }}>
                                {logic.completionComment || 'You successfully played through this variation.'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                                {isTileFullyCompleted ? (
                                    onNext && (
                                        <button
                                            onClick={onNext}
                                            className="lesson-btn-primary"
                                            style={{
                                                background: TEAL, color: '#fff', border: 'none',
                                                padding: '12px 32px', borderRadius: 8, cursor: 'pointer',
                                                fontWeight: 800, fontSize: 16, display: 'flex',
                                                alignItems: 'center', gap: 10,
                                                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                                                transition: 'transform 0.2s'
                                            }}
                                        >
                                            Proceed to Next Lesson <i className="fas fa-flag-checkered" />
                                        </button>
                                    )
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (activeVarIds && currentVarIndex < activeVarIds.length - 1) {
                                                setCurrentVarIndex(prev => prev + 1);
                                            }
                                        }}
                                        className="lesson-btn-primary"
                                        style={{
                                            background: '#f5a623', color: '#111', border: 'none',
                                            padding: '12px 32px', borderRadius: 8, cursor: 'pointer',
                                            fontWeight: 800, fontSize: 16, display: 'flex',
                                            alignItems: 'center', gap: 10,
                                            boxShadow: '0 4px 15px rgba(245, 166, 35, 0.4)',
                                            transition: 'transform 0.2s'
                                        }}
                                    >
                                        Next Practice Line <i className="fas fa-chevron-right" />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={logic.reset}
                                style={{
                                    background: 'none', border: 'none', color: TEXT_DIM,
                                    marginTop: 20, cursor: 'pointer', fontWeight: 600,
                                    fontSize: 13, textDecoration: 'underline'
                                }}
                            >
                                Practice this line again
                            </button>
                        </div>
                    ) : (
                        // Active practice
                        <>
                            {logic.lastResult === 'success' && (
                                <div style={{ background: '#0e2e1c', color: '#27ae60', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                    <i className="fas fa-check-circle" /> Correct Move!
                                </div>
                            )}
                            {logic.lastResult === 'mistake' && (
                                <div style={{ background: '#2e0e0e', color: '#e74c3c', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                    <i className="fas fa-times-circle" /> {logic.currentErrorMsg || 'Incorrect. Try again!'}
                                </div>
                            )}

                            <div style={{ color: '#ccc', fontSize: 14 }}>
                                <div style={{ marginBottom: 14, fontWeight: 700, color: '#fff', fontSize: 15 }}>
                                    {logic.isComputerTurn
                                        ? `Computer is playing ${logic.userColor === 'w' ? 'Black' : 'White'}...`
                                        : `Play the best move for ${logic.userColor === 'w' ? 'White' : 'Black'}`}
                                </div>

                                {logic.currentComment && (
                                    <div style={{ background: '#1e2e2a', padding: '14px', borderRadius: 8, borderLeft: `4px solid ${TEAL}`, color: '#d0f0ed', fontSize: 14, lineHeight: 1.65, marginBottom: 20, whiteSpace: 'pre-wrap' }}>
                                        {logic.currentComment}
                                    </div>
                                )}

                                {logic.availableMoves.length > 0 && !logic.isComputerTurn && logic.lessonType === 'SAN_QUIZ' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                        {logic.availableMoves.map((move: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => logic.playVariationMove(move)}
                                                className="lesson-btn"
                                                style={{ background: '#252525', color: '#fff', border: `1px solid ${BORDER}`, padding: '11px 14px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: 14 }}
                                            >
                                                {move.san}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {logic.availableMoves.length > 0 && !logic.isComputerTurn && logic.lessonType !== 'SAN_QUIZ' && (
                                    <div style={{ color: TEXT_DIM, fontSize: 13 }}>
                                        Follow the arrow on the board →
                                    </div>
                                )}

                                {/* Progress indicator replacing multi-line picker */}
                                {activeVarIds && activeVarIds.length > 1 && !hasFinished && (
                                    <div style={{ marginTop: 24 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: TEXT_DIM, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                                            <span>Progress</span>
                                            <span>{currentVarIndex + 1} of {activeVarIds.length}</span>
                                        </div>
                                        <div style={{ width: '100%', height: 6, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${((currentVarIndex) / activeVarIds.length) * 100}%`,
                                                height: '100%',
                                                background: targetVariationIndex === -1 ? '#f5a623' : TEAL,
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Controls */}
                <div style={{ padding: '12px 16px', background: BG_HEADER, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'center', gap: 10 }}>
                    {[
                        { label: 'Hint', icon: 'fa-lightbulb', action: logic.requestHint, disabled: hasFinished || logic.isComputerTurn || !isPracticeMode },
                        { label: 'Undo', icon: 'fa-step-backward', action: logic.undo, disabled: logic.moveHistory.length === 0 },
                        { label: 'Reset', icon: 'fa-sync', action: logic.reset, disabled: logic.moveHistory.length === 0 },
                    ].map(btn => (
                        <button
                            key={btn.label}
                            onClick={btn.action}
                            disabled={btn.disabled}
                            className="lesson-btn"
                            style={{ background: '#252525', color: btn.disabled ? '#444' : '#aaa', border: `1px solid ${BORDER}`, padding: '7px 14px', borderRadius: 6, cursor: btn.disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <i className={`fas ${btn.icon}`} /> {btn.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
