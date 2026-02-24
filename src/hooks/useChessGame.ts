'use client';

import { useState, useCallback, useMemo } from 'react';
import { AnalyzeResponse, MoveResult, START_FEN } from '@/types/analysis';

export interface VariationNode {
    san: string;
    fen: string;
    eval: number | null;
}

export function useChessGame(data: AnalyzeResponse | null) {
    // ── Main line ────────────────────────────────────────────────────────────
    const mainFens: string[] = useMemo(
        () => (data ? [START_FEN, ...data.moves.map(m => m.fen)] : [START_FEN]),
        [data],
    );
    const rawMoves: MoveResult[] = data?.moves ?? [];
    const evaluations: number[] = useMemo(
        () => (data ? [0, ...data.moves.map(m => m.evaluation)] : [0]),
        [data],
    );

    const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
    const [orientation, setOrientation] = useState<'white' | 'black'>('white');
    const [showTimestamps, setShowTimestamps] = useState(false);

    // ── Variation state ──────────────────────────────────────────────────────
    const [isVariation, setIsVariation] = useState(false);
    const [variationMoves, setVariationMoves] = useState<VariationNode[]>([]);
    const [variationIndex, setVariationIndex] = useState(-1);
    const [variationBaseIndex, setVariationBaseIndex] = useState(0);

    // ── Derived current state ────────────────────────────────────────────────
    const currentFen: string = isVariation
        ? (variationMoves[variationIndex]?.fen ?? mainFens[currentMoveIndex])
        : mainFens[currentMoveIndex];

    const currentEval: number = isVariation
        ? (variationMoves[variationIndex]?.eval ?? 0)
        : (evaluations[currentMoveIndex] ?? 0);

    const currentMoveData: MoveResult | null =
        !isVariation && currentMoveIndex > 0
            ? (rawMoves[currentMoveIndex - 1] ?? null)
            : null;

    // ── Navigation ───────────────────────────────────────────────────────────
    const goToMove = useCallback((index: number, opts?: { sound?: () => void }) => {
        setIsVariation(false);
        setCurrentMoveIndex(Math.max(0, Math.min(index, mainFens.length - 1)));
        opts?.sound?.();
    }, [mainFens.length]);

    const nextMove = useCallback((): string | undefined => {
        if (!isVariation) {
            const next = Math.min(currentMoveIndex + 1, mainFens.length - 1);
            if (next === currentMoveIndex) return undefined;
            setCurrentMoveIndex(next);
            return rawMoves[next - 1]?.san;
        } else {
            const next = Math.min(variationIndex + 1, variationMoves.length - 1);
            if (next === variationIndex) return undefined;
            setVariationIndex(next);
            return variationMoves[next]?.san;
        }
    }, [currentMoveIndex, isVariation, mainFens.length, rawMoves, variationIndex, variationMoves]);

    const prevMove = useCallback((): 'undo' | 'exit-variation' | 'noop' => {
        if (isVariation) {
            if (variationIndex > 0) { setVariationIndex(v => v - 1); return 'undo'; }
            setIsVariation(false); return 'exit-variation';
        }
        if (currentMoveIndex > 0) { setCurrentMoveIndex(i => i - 1); return 'undo'; }
        return 'noop';
    }, [currentMoveIndex, isVariation, variationIndex]);

    const exitVariation = useCallback(() => {
        setIsVariation(false);
    }, []);

    const flipBoard = useCallback(() => {
        setOrientation(o => o === 'white' ? 'black' : 'white');
    }, []);

    // ── Variation branching ──────────────────────────────────────────────────
    const startVariation = useCallback((san: string, fen: string) => {
        setIsVariation(true);
        setVariationBaseIndex(currentMoveIndex);
        const node: VariationNode = { san, fen, eval: null };
        setVariationMoves([node]);
        setVariationIndex(0);
    }, [currentMoveIndex]);

    const extendVariation = useCallback((san: string, fen: string) => {
        setVariationMoves(prev => {
            const trimmed = prev.slice(0, variationIndex + 1);
            return [...trimmed, { san, fen, eval: null }];
        });
        setVariationIndex(prev => prev + 1);
    }, [variationIndex]);

    const updateVariationEval = useCallback((idx: number, evalVal: number) => {
        setVariationMoves(prev => {
            const copy = [...prev];
            if (copy[idx]) copy[idx] = { ...copy[idx], eval: evalVal };
            return copy;
        });
    }, []);

    const loadVariation = useCallback((sequence: VariationNode[]) => {
        if (!isVariation) {
            setIsVariation(true);
            setVariationBaseIndex(currentMoveIndex);
            setVariationMoves(sequence);
            setVariationIndex(sequence.length - 1);
        } else {
            setVariationMoves(prev => {
                const trimmed = prev.slice(0, variationIndex + 1);
                return [...trimmed, ...sequence];
            });
            setVariationIndex(variationIndex + sequence.length);
        }
    }, [currentMoveIndex, isVariation, variationIndex]);

    const goToVariationMove = useCallback((idx: number) => {
        setVariationIndex(Math.max(0, Math.min(idx, variationMoves.length - 1)));
    }, [variationMoves.length]);

    return {
        // State
        currentMoveIndex, currentFen, currentEval, currentMoveData,
        mainFens, rawMoves, evaluations,
        orientation, showTimestamps, setShowTimestamps,
        isVariation, variationMoves, variationIndex, variationBaseIndex,
        // Actions
        goToMove, nextMove, prevMove, exitVariation, flipBoard,
        startVariation, extendVariation, updateVariationEval, goToVariationMove, loadVariation,
    };
}
