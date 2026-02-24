'use client';

import { useRef, useCallback } from 'react';

/** Load Audio elements once, play on demand. */
export function useSounds() {
    const move = useRef<HTMLAudioElement | null>(null);
    const capture = useRef<HTMLAudioElement | null>(null);
    const check = useRef<HTMLAudioElement | null>(null);
    const castle = useRef<HTMLAudioElement | null>(null);
    const promote = useRef<HTMLAudioElement | null>(null);
    const gameEnd = useRef<HTMLAudioElement | null>(null);

    const init = useCallback(() => {
        if (move.current) return;
        move.current = new Audio('/sounds/move.mp3');
        capture.current = new Audio('/sounds/capture.mp3');
        check.current = new Audio('/sounds/check.mp3');
        castle.current = new Audio('/sounds/castle.mp3');
        promote.current = new Audio('/sounds/promote.mp3');
        gameEnd.current = new Audio('/sounds/game-end.mp3');
    }, []);

    const playMove = useCallback((san?: string) => {
        init();
        const play = (el: HTMLAudioElement | null) => {
            if (!el) return;
            el.currentTime = 0;
            el.play().catch(() => { });
        };
        if (!san) { play(move.current); return; }
        if (san.includes('#')) play(gameEnd.current);
        else if (san.includes('+')) play(check.current);
        else if (san.includes('O-O')) play(castle.current);
        else if (san.includes('x')) play(capture.current);
        else if (san.includes('=')) play(promote.current);
        else play(move.current);
    }, [init]);

    const playUndo = useCallback(() => {
        init();
        if (!move.current) return;
        move.current.currentTime = 0;
        move.current.play().catch(() => { });
    }, [init]);

    return { playMove, playUndo };
}
