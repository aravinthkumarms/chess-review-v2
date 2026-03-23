import { useState, useEffect, useRef, useCallback } from 'react';

export type EngineType = 'lite' | 'original';

/**
 * Custom hook to manage Stockfish WASM in a Web Worker.
 * Offloads evaluation from the main thread and allows real-time variation analysis.
 */
export interface StockfishLine {
    evaluation: number;
    moves: string[];
}

export function useStockfish(engineType: EngineType = 'lite') {
    const workerRef = useRef<Worker | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [evaluation, setEvaluation] = useState<number | null>(null);
    const [bestMove, setBestMove] = useState<string | null>(null);
    const [lines, setLines] = useState<StockfishLine[]>([]);

    // Initialize Worker
    useEffect(() => {
        // Use the selected engine file
        const workerPath = engineType === 'lite' ? '/stockfish-lite.js' : '/stockfish-original.js';
        const worker = new Worker(workerPath);
        workerRef.current = worker;
        setIsReady(false);

        worker.onerror = (err) => {
            console.error('[Stockfish Worker Error]', err);
        };

        worker.onmessageerror = (err) => {
            console.error('[Stockfish Worker Message Error]', err);
        };

        worker.onmessage = (e) => {
            const msg = e.data;
            // console.log('[Stockfish WASM]', msg); // Debug log

            // Parse UCI output
            if (msg === 'uciok') {
                console.log('[Stockfish WASM] Engine Ready');
                setIsReady(true);
            } else if (typeof msg === 'string' && msg.startsWith('info depth')) {
                // Parse multipv
                const multiPvMatch = msg.match(/multipv (\d+)/);
                const multipv = multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1;

                // Parse evaluation
                let evalScore = 0;
                const scoreMatch = msg.match(/score cp (-?\d+)/);
                if (scoreMatch) evalScore = parseInt(scoreMatch[1], 10);

                const mateMatch = msg.match(/score mate (-?\d+)/);
                if (mateMatch) {
                    const mateIn = parseInt(mateMatch[1], 10);
                    evalScore = mateIn > 0 ? (10000 - mateIn) : (-10000 - Math.abs(mateIn));
                }

                // Parse PV (uci sequence)
                const pvMatch = msg.match(/ pv (.*)/);
                const moves = pvMatch ? pvMatch[1].split(' ').filter(Boolean) : [];

                setLines(prev => {
                    const newLines = [...prev];
                    while (newLines.length < multipv) newLines.push({ evaluation: 0, moves: [] });
                    newLines[multipv - 1] = { evaluation: evalScore, moves };
                    return newLines;
                });

                if (multipv === 1) {
                    setEvaluation(evalScore);
                }
            } else if (typeof msg === 'string' && msg.startsWith('bestmove')) {
                const parts = msg.split(' ');
                if (parts.length >= 2) {
                    setBestMove(parts[1]);
                }
                setIsSearching(false);
            }
        };

        // Initialize UCI mode
        worker.postMessage('uci');
        worker.postMessage('isready');

        return () => {
            worker.terminate();
        };
    }, [engineType]);

    /**
     * Evaluates a FEN position.
     * @param fen The position to evaluate.
     * @param depth The search depth.
     */
    const evaluate = useCallback((fen: string, depth: number = 12, multipv: number = 3) => {
        if (!workerRef.current || !isReady) return;

        setEvaluation(null);
        setBestMove(null);
        setIsSearching(true);
        // We do *not* clear lines immediately so the UI doesn't flicker empty lines

        workerRef.current.postMessage('stop');
        workerRef.current.postMessage(`setoption name MultiPV value ${multipv}`);
        workerRef.current.postMessage(`position fen ${fen}`);
        workerRef.current.postMessage(`go depth ${depth}`);
    }, [isReady]);

    const stop = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.postMessage('stop');
            setIsSearching(false);
        }
    }, []);

    return {
        isReady,
        isSearching,
        evaluation,
        bestMove,
        lines,
        evaluate,
        stop
    };
}

