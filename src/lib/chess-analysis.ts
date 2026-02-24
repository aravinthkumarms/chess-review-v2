import { Chess } from 'chess.js';
import { evaluatePosition } from './api';
import { getOpeningBook, isBookPosition } from './opening-book';

export type MoveClassification =
    | 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good'
    | 'Inaccuracy' | 'Mistake' | 'Miss' | 'Blunder' | 'Book';

export interface MoveReview {
    san: string;         // e.g. "Nf3"
    uci: string;         // e.g. "g1f3"
    fen: string;         // board position AFTER the move
    fenBefore: string;   // board position BEFORE the move
    cpLoss: number;
    evaluation: number;  // centipawns after move, normalised for side to move
    classification: MoveClassification;
    bestMoveUci: string | null;
    clock: string | null;
    isWhite: boolean;
    moveNumber: number;
}

export interface AnalysisResponse {
    accuracy: number;
    whitePlayer: string;
    blackPlayer: string;
    whiteElo: string;
    blackElo: string;
    timeControl: string;
    moves: MoveReview[];
}

// ─── Move classification thresholds (mirrors ChessAnalysisService.java) ───
function classifyMove(
    cpLoss: number,
    isSacrifice: boolean,
    isPunishment: boolean,
): MoveClassification {
    if (isSacrifice) {
        if (cpLoss <= 15) return 'Brilliant';
        if (cpLoss <= 30) return 'Great';
    }
    if (isPunishment && cpLoss <= 15) return 'Great';
    if (cpLoss === 0) return 'Best';
    if (cpLoss <= 15) return 'Excellent';
    if (cpLoss <= 30) return 'Good';
    if (cpLoss <= 60) return 'Inaccuracy';
    if (cpLoss <= 120) return 'Mistake';
    if (cpLoss <= 250) return 'Miss';
    return 'Blunder';
}

// ─── Material helpers (mirrors Java piece values) ─────────────────────────
const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialBalance(chess: Chess, forWhite: boolean): number {
    let white = 0, black = 0;
    const board = chess.board();
    for (const row of board) {
        for (const sq of row) {
            if (!sq) continue;
            const v = PIECE_VALUES[sq.type] ?? 0;
            if (sq.color === 'w') white += v; else black += v;
        }
    }
    return forWhite ? white - black : black - white;
}

function maxMaterialLossAfterMove(chess: Chess, forWhite: boolean): number {
    const ourColor = forWhite ? 'w' : 'b';
    let maxLoss = 0;
    const moves = chess.moves({ verbose: true });
    for (const m of moves) {
        if (!m.captured) continue;
        const captured = chess.get(m.to);
        if (!captured || captured.color === ourColor) continue;
        const capturedVal = PIECE_VALUES[m.captured] ?? 0;
        maxLoss = Math.max(maxLoss, capturedVal);
    }
    return maxLoss;
}

// ─── Clock extraction ──────────────────────────────────────────────────────
function extractClocks(pgn: string): string[] {
    const clocks: string[] = [];
    const re = /\[%clk\s+([\d:.]+)\]/g;
    let m;
    while ((m = re.exec(pgn)) !== null) {
        let t = m[1];
        if (t.startsWith('0:')) t = t.slice(2);
        else if (t.startsWith('00:')) t = t.slice(3);
        clocks.push(t);
    }
    return clocks;
}

// ─── PGN header extraction ─────────────────────────────────────────────────
function extractHeader(pgn: string, tag: string): string {
    const m = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
    return m?.[1] ?? '?';
}

// ─── Main analysis function ─────────────────────────────────────────────────
export async function analyzeGame(
    pgn: string,
    depth = 10,
    onProgress?: (done: number, total: number) => void,
): Promise<AnalysisResponse> {
    const chess = new Chess();
    chess.loadPgn(pgn);

    const history = chess.history({ verbose: true });
    const clocks = extractClocks(pgn);

    // 1. Pre-compute all FENs
    const board = new Chess();
    const fens: string[] = [board.fen()]; // start position
    for (const move of history) {
        board.move(move);
        fens.push(board.fen());
    }

    // 2. Evaluate all positions in parallel (browser fires concurrent requests)
    let done = 0;
    const evalResults = await Promise.all(
        fens.map((fen) =>
            evaluatePosition(fen, depth).then((r) => {
                onProgress?.(++done, fens.length);
                return r;
            }),
        ),
    );

    const evaluations = evalResults.map((r) => r.evaluation);

    // 3. Load opening book (cached after first call)
    const book = await getOpeningBook();

    // 4. Classify each move
    const reviews: MoveReview[] = [];
    let totalCpLoss = 0;
    let inBook = true;

    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const isWhite = move.color === 'w';
        const evalBefore = evaluations[i];
        const evalAfter = evaluations[i + 1];
        const fenBefore = fens[i];
        const fenAfter = fens[i + 1];

        let cpLoss = isWhite
            ? Math.max(0, evalBefore - evalAfter)
            : Math.max(0, evalAfter - evalBefore);

        // Sacrifice detection
        const boardBefore = new Chess(fenBefore);
        const boardAfter = new Chess(fenAfter);
        const b1 = materialBalance(boardBefore, isWhite);
        const b2 = materialBalance(boardAfter, isWhite);
        const maxLoss = maxMaterialLossAfterMove(boardAfter, isWhite);
        const isSacrifice = (b2 - maxLoss - b1) <= -2;

        // Punishment detection
        let isPunishment = false;
        if (i > 0) {
            const prevIsWhite = history[i - 1].color === 'w';
            const prevLoss = prevIsWhite
                ? Math.max(0, evaluations[i - 1] - evaluations[i])
                : Math.max(0, evaluations[i] - evaluations[i - 1]);
            if (prevLoss >= 120 && cpLoss <= 15) isPunishment = true;
        }

        let classification: MoveClassification;
        if (inBook && isBookPosition(fenAfter, book)) {
            classification = 'Book';
            cpLoss = 0;
        } else {
            inBook = false;
            classification = classifyMove(cpLoss, isSacrifice, isPunishment);
        }

        // Best move for sub-optimal positions
        const needsBestMove = ['Inaccuracy', 'Mistake', 'Miss', 'Blunder', 'Excellent', 'Good'].includes(classification);
        const bestMoveUci = needsBestMove ? (evalResults[i].bestMove ?? null) : null;

        reviews.push({
            san: move.san,
            uci: move.from + move.to + (move.promotion ?? ''),
            fen: fenAfter,
            fenBefore,
            cpLoss,
            evaluation: evalAfter,
            classification,
            bestMoveUci,
            clock: clocks[i] ?? null,
            isWhite,
            moveNumber: Math.floor(i / 2) + 1,
        });

        totalCpLoss += cpLoss;
    }

    const avgCpLoss = reviews.length ? totalCpLoss / reviews.length : 0;
    const accuracy = Math.max(0, 100 - avgCpLoss / 10);

    return {
        accuracy,
        whitePlayer: extractHeader(pgn, 'White'),
        blackPlayer: extractHeader(pgn, 'Black'),
        whiteElo: extractHeader(pgn, 'WhiteElo'),
        blackElo: extractHeader(pgn, 'BlackElo'),
        timeControl: extractHeader(pgn, 'TimeControl'),
        moves: reviews,
    };
}
