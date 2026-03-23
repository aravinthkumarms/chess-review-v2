import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess } from 'chess.js';

export interface LessonMove {
    fen: string;
    san: string;
    nextFen: string;
    variationId: string;
    variationIndex: number;
    comment?: string;
    errorMessage?: string;
}

export interface LessonData {
    id: string;
    name: string;
    type?: string;        // 'VIDEO', 'STUDY', 'QUIZ', etc.
    videoPath?: string | null;
    videoVimeoId?: string | null;
    moves?: Record<string, any>;
    comments?: Record<string, string>;
    orientation?: 'w' | 'b';
    drill?: any;
    quiz?: any;
}

export interface PlayedMove {
    san: string;
    fenAfter: string;
    comment?: string;
}

export interface UseLessonLogicProps {
    rawData: LessonData | null;
    activeVariationIds?: string[];
    isReviewMode?: boolean;
}

export function useLessonLogic({ rawData, activeVariationIds, isReviewMode }: UseLessonLogicProps) {
    const parsedData = useMemo(() => {
        if (!rawData) return null;

        const drillKey = rawData.drill ? 'drill' : null;
        const quizKey = rawData.quiz ? 'quiz' : null;

        if (drillKey && rawData.drill) {
            const drillObj = rawData.drill as any;
            const graph = drillObj.movesGraph;
            const movesMap: Record<string, LessonMove[]> = {};

            for (const [nodeId, node] of Object.entries<any>(graph)) {
                const fen = node.afterMoveFen;
                if (!movesMap[fen]) movesMap[fen] = [];

                if (node.adjacentNodeIds && node.adjacentNodeIds.length > 0) {
                    for (const adjId of node.adjacentNodeIds) {
                        const childNode = graph[adjId];
                        if (!childNode) continue;

                        movesMap[fen].push({
                            fen: fen,
                            san: childNode.san,
                            nextFen: childNode.afterMoveFen,
                            variationId: "main",
                            variationIndex: 0,
                            comment: childNode.comments?.[0]?.text,
                            errorMessage: childNode.errorMessages?.[0]?.text,
                        });
                    }
                }
            }

            return {
                ...rawData,
                moves: movesMap,
                studentColor: drillObj.studentColor,
                startComment: graph[drillObj.rootNodeId]?.comments?.[0]?.text,
                completionComment: drillObj.completionComments?.[0]?.text || drillObj.successMessage
            };
        } else if (quizKey && rawData.quiz) {
            const quizObj = rawData.quiz as any;
            const movesMap: Record<string, LessonMove[]> = {};

            // The starting position of the quiz is after the contextMove if it exists
            const startFen = quizObj.contextMove ? quizObj.contextMove.afterMoveFen : quizObj.positionFen;
            movesMap[startFen] = [];

            // Add correct answers
            if (quizObj.answers) {
                for (const ans of quizObj.answers) {
                    movesMap[startFen].push({
                        fen: startFen,
                        san: ans.text, // In quizzes, the SAN is stored in 'text'
                        nextFen: ans.afterMoveFen,
                        variationId: "main",
                        variationIndex: 0,
                        comment: ans.feedback?.text
                    });
                }
            }

            // Add distractors (wrong answers)
            if (quizObj.distractors) {
                for (const dist of quizObj.distractors) {
                    movesMap[startFen].push({
                        fen: startFen,
                        san: dist.text,
                        nextFen: dist.afterMoveFen,
                        variationId: "main",
                        variationIndex: 0,
                        errorMessage: dist.feedback?.text
                    });
                }
            }

            // Determine if black or white is playing based on the FEN turn
            let turnColor = 'w';
            try {
                const chess = new Chess(startFen);
                turnColor = chess.turn();
            } catch (e) {
                console.warn("Could not determine turn color from FEN:", startFen);
            }

            return {
                ...rawData,
                type: 'SAN_QUIZ', // Explicitly force type for the UI
                moves: movesMap,
                studentColor: turnColor,
                startComment: quizObj.question,
                completionComment: "Quiz Completed!",
                orientation: turnColor as 'w' | 'b' // Force board orientation to match the player's turn
            };
        }
        return rawData as any;
    }, [rawData]);

    const data = parsedData;

    // Determine the starting FEN
    const startFen = useMemo(() => {
        if (!data) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        // If it's a quiz, use the calculated root FEN
        if (data.quiz && data.moves) {
            const keys = Object.keys(data.moves);
            return keys[0] || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        }

        if (!data.moves) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        const keys = Object.keys(data.moves);
        if (keys.length === 0) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        const allNextFens = new Set<string>();
        for (const k of keys) {
            data.moves[k].forEach((m: LessonMove) => allNextFens.add(m.nextFen));
        }

        const root = keys.find(k => !allNextFens.has(k)) || keys[0];
        return root;
    }, [data]);

    // Variation State
    const allVariations = useMemo(() => {
        if (!data || !data.moves) return [];
        const varMap = new Map<string, { id: string; name: string; index: number }>();

        Object.values(data.moves).flat().forEach((m: unknown) => {
            const typedM = m as LessonMove;
            const vIdx = typedM.variationIndex ?? 999;
            if (!varMap.has(typedM.variationId)) {
                varMap.set(typedM.variationId, {
                    id: typedM.variationId,
                    name: `Variation`,
                    index: vIdx
                });
            } else {
                const existing = varMap.get(typedM.variationId)!;
                if (vIdx < existing.index) {
                    existing.index = vIdx;
                }
            }
        });

        // Sort by chronological variationIndex
        const sorted = Array.from(varMap.values()).sort((a, b) => a.index - b.index);
        return sorted.map((v, i) => ({ id: v.id, name: `Variation ${i + 1}` }));
    }, [data]);

    const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

    // Default to the first variation found
    useEffect(() => {
        if (allVariations.length > 0 && !selectedVariationId) {
            setSelectedVariationId(allVariations[0].id);
        }
    }, [allVariations, selectedVariationId]);

    const [currentFen, setCurrentFen] = useState(startFen);
    const [moveHistory, setMoveHistory] = useState<PlayedMove[]>([]);

    // Determine user color from course metadata or fallback to study name
    const userColor = useMemo(() => {
        if (data?.studentColor) return data.studentColor;
        if (data?.orientation) return data.orientation;
        if (!data || !data.name) return 'w';
        return data.name.toLowerCase().includes('black') ? 'b' : 'w';
    }, [data]);

    const isComputerTurn = useMemo(() => {
        const turn = new Chess(currentFen).turn();
        return turn !== userColor;
    }, [currentFen, userColor]);

    const [lastResult, setLastResult] = useState<'success' | 'mistake' | null>(null);
    const [currentErrorMsg, setCurrentErrorMsg] = useState<string | null>(null);
    const [hintLevel, setHintLevel] = useState<number>(0);

    // Reset when data or variation changes
    useEffect(() => {
        setCurrentFen(startFen);
        setMoveHistory([]);
        setLastResult(null);
        setCurrentErrorMsg(null);
        setHintLevel(0);
    }, [startFen, selectedVariationId]);

    // Available moves from current position, filtered by selected variations
    const availableMoves = useMemo(() => {
        if (!data || !data.moves) return [];
        const movesAtPos = data.moves[currentFen] || [];

        // In practice/drill, the exact variation we are playing is determined by `selectedVariationId` 
        // which progresses sequentially. We MUST only allow moves for the active variation loop.
        if (selectedVariationId) {
            return movesAtPos.filter((m: LessonMove) => m.variationId === selectedVariationId);
        }

        // Fallback for purely generic review components where active variation overrides selected
        if (activeVariationIds && activeVariationIds.length > 0) {
            return movesAtPos.filter((m: LessonMove) => activeVariationIds.includes(m.variationId));
        }

        // If activeVariationIds is explicitly undefined (Drill mode? no it's set to all), return all moves
        return movesAtPos;
    }, [data, currentFen, selectedVariationId, activeVariationIds]);

    const hintMoveSquares = useMemo(() => {
        if (availableMoves.length === 0) return null;

        // Find a valid move (one without an error message)
        const validMove = availableMoves.find((m: LessonMove) => !m.errorMessage) || availableMoves[0];

        const chess = new Chess(currentFen);
        try {
            const m = chess.move(validMove.san);
            if (m) return { from: m.from, to: m.to };
        } catch { }
        return null;
    }, [availableMoves, currentFen]);

    const learnableArrows = useMemo(() => {
        if (isComputerTurn) return [];

        // In Review Mode, hide arrows unless a hint is requested
        if (isReviewMode) {
            if (hintLevel === 0) return [];

            // If hint is requested, show the hint square (could be an arrow instead of highlighting)
            if (hintMoveSquares && hintLevel > 0) {
                return [{
                    id: `hint-arrow-${currentFen}`,
                    startSquare: hintMoveSquares.from,
                    endSquare: hintMoveSquares.to,
                    color: 'rgba(255, 170, 0, 0.8)' // Orange for hint
                }];
            }
            return [];
        }

        const arrowsMap = new Map<string, any>();

        for (const move of availableMoves) {
            if (move.errorMessage) continue; // Don't show explicitly bad moves as learnable
            const chess = new Chess(currentFen);
            try {
                const m = chess.move(move.san);
                if (m) {
                    const key = `${m.from}-${m.to}`;
                    if (!arrowsMap.has(key)) {
                        arrowsMap.set(key, {
                            id: `arrow-${key}`,
                            startSquare: m.from,
                            endSquare: m.to,
                            color: 'rgba(129, 182, 76, 0.8)'
                        });
                    }
                }
            } catch { }
        }
        return Array.from(arrowsMap.values());
    }, [availableMoves, currentFen, isComputerTurn]);

    const playMove = useCallback((sourceSquare: string, targetSquare: string, piece: string) => {
        setLastResult(null);
        setCurrentErrorMsg(null);
        setHintLevel(0);
        if (!data || !data.moves) return false;

        const chess = new Chess(currentFen);
        let moveObj;
        try {
            moveObj = chess.move({
                from: sourceSquare,
                to: targetSquare,
                promotion: piece.length > 1 ? piece[1].toLowerCase() : 'q'
            });
        } catch { return false; }

        if (!moveObj) return false;

        // Check if this move is allowed in THIS variation
        const matchedMove = availableMoves.find((m: LessonMove) => m.san === moveObj.san);

        if (matchedMove) {
            if (matchedMove.errorMessage) {
                setCurrentErrorMsg(matchedMove.errorMessage);
                setLastResult('mistake');
                return false; // Reject the move so UI snaps back, but show the error message
            }
            setCurrentFen(matchedMove.nextFen);
            setMoveHistory(prev => [...prev, { san: matchedMove.san, fenAfter: matchedMove.nextFen, comment: matchedMove.comment }]);
            setLastResult('success');
            return true;
        } else {
            setCurrentErrorMsg("Inaccurate move.");
            setLastResult('mistake');
            return false;
        }
    }, [currentFen, data, availableMoves]);

    const playVariationMove = useCallback((moveEntry: LessonMove) => {
        setCurrentFen(moveEntry.nextFen);
        setMoveHistory(prev => [...prev, { san: moveEntry.san, fenAfter: moveEntry.nextFen, comment: moveEntry.comment }]);
        setLastResult('success');
        setCurrentErrorMsg(null);
        setHintLevel(0);
    }, []);

    const playComputerMove = useCallback(() => {
        if (availableMoves.length > 0) {
            playVariationMove(availableMoves[0]);
            setLastResult(null);
        }
    }, [availableMoves, playVariationMove]);

    const requestHint = useCallback(() => {
        setHintLevel(l => (l >= 2 ? 2 : l + 1));
    }, []);

    const undo = useCallback(() => {
        if (moveHistory.length === 0) return;
        const newHistory = [...moveHistory];
        newHistory.pop();
        setMoveHistory(newHistory);
        setCurrentFen(newHistory.length > 0 ? newHistory[newHistory.length - 1].fenAfter : startFen);
        setLastResult(null);
        setCurrentErrorMsg(null);
        setHintLevel(0);
    }, [moveHistory, startFen]);

    const reset = useCallback(() => {
        setCurrentFen(startFen);
        setMoveHistory([]);
        setLastResult(null);
        setCurrentErrorMsg(null);
        setHintLevel(0);
    }, [startFen]);

    const currentComment = useMemo(() => {
        if (moveHistory.length > 0) {
            return moveHistory[moveHistory.length - 1].comment;
        }
        return data?.startComment;
    }, [moveHistory, data]);

    const completionComment = data?.completionComment;

    return {
        currentFen,
        moveHistory,
        availableMoves,
        lastResult,
        userColor,
        isComputerTurn,
        hintLevel,
        hintMoveSquares,
        learnableArrows,
        allVariations,
        selectedVariationId,
        setSelectedVariationId,
        playMove,
        playVariationMove,
        playComputerMove,
        requestHint,
        undo,
        reset,
        currentComment,
        currentErrorMsg,
        completionComment,
        lessonType: data?.type
    };
}
