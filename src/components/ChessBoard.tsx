'use client';

import { Chessboard } from 'react-chessboard';

// Arrow shape from react-chessboard ChessboardOptions
type Arrow = { startSquare: string; endSquare: string; color: string };

interface Props {
    fen: string;
    flipped: boolean;
    bestMoveUci: string | null;
    classification: string;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
    Brilliant: '#1baca6', Great: '#5ba5f5', Best: '#1baca6',
    Excellent: '#96bc4b', Good: '#81b64c', Inaccuracy: '#f0c15c',
    Mistake: '#ffa417', Miss: '#ff7763', Blunder: '#fa412d', Book: '#a88865',
};

export default function ChessBoardWrapper({ fen, flipped, bestMoveUci, classification }: Props) {
    const arrows: Arrow[] = [];
    if (bestMoveUci && bestMoveUci.length >= 4) {
        arrows.push({
            startSquare: bestMoveUci.slice(0, 2),
            endSquare: bestMoveUci.slice(2, 4),
            color: CLASSIFICATION_COLORS[classification] ?? '#ffffff',
        });
    }

    return (
        <Chessboard
            options={{
                position: fen,
                boardOrientation: flipped ? 'black' : 'white',
                arrows,
                allowDragging: false,
                boardStyle: { borderRadius: '4px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' },
                darkSquareStyle: { backgroundColor: '#769656' },
                lightSquareStyle: { backgroundColor: '#eeeed2' },
            }}
        />
    );
}
