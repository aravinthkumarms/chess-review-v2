// Shapes returned by POST /api/py/analyze

export interface MoveResult {
    san: string;
    uci: string;
    fen: string;
    fenBefore: string;
    evaluation: number;   // centipawns, always from White's perspective
    cpLoss: number;
    classification: string; // "Brilliant" | "Best" | "Excellent" | "Good" | "Inaccuracy" | "Mistake" | "Miss" | "Blunder" | "Book"
    bestMoveUci: string | null;
    clock: string | null;
    isWhite: boolean;
    moveNumber: number;
}

export interface ClassificationCount {
    brilliant: number;
    great: number;
    best: number;
    excellent: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    miss: number;
    blunder: number;
    book: number;
}

export interface AnalyzeResponse {
    pgn: string;
    accuracy: number;
    whiteAccuracy: number;
    blackAccuracy: number;
    whiteRating: number;
    blackRating: number;
    whiteClassifications: ClassificationCount;
    blackClassifications: ClassificationCount;
    whitePlayer: string;
    blackPlayer: string;
    whiteElo: string;
    blackElo: string;
    timeControl: string;
    moves: MoveResult[];
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const SVG_MAP: Record<string, string> = {
    brilliant: '/svg/brilliant.svg',
    great: '/svg/great_find.svg',
    best: '/svg/best.svg',
    excellent: '/svg/excellent.svg',
    good: '/svg/good.svg',
    inaccuracy: '/svg/inaccuracy.svg',
    mistake: '/svg/mistake.svg',
    miss: '/svg/incorrect.svg',
    blunder: '/svg/blunder.svg',
    book: '/svg/book.svg',
};
