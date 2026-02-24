import { Chess } from 'chess.js';

/** Normalized FEN: only position + active color + castling + en passant (ignores clocks) */
function normalizeFen(fen: string): string {
    const parts = fen.split(' ');
    return parts.slice(0, 4).join(' ');
}

let bookPositions: Set<string> | null = null;
let loadingPromise: Promise<Set<string>> | null = null;

async function loadBook(): Promise<Set<string>> {
    const files = ['a', 'b', 'c', 'd', 'e'];
    const positions = new Set<string>();

    await Promise.all(
        files.map(async (f) => {
            const res = await fetch(`/openings/${f}.tsv`);
            const text = await res.text();
            const lines = text.split('\n').slice(1); // skip header

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length < 3) continue;
                const pgnSequence = parts[2].trim();
                if (!pgnSequence) continue;

                try {
                    const chess = new Chess();
                    // parse space-separated UCI or SAN moves
                    const tokens = pgnSequence.replace(/\d+\.\s*/g, '').split(/\s+/).filter(Boolean);
                    positions.add(normalizeFen(chess.fen()));
                    for (const token of tokens) {
                        if (token === '*' || token.match(/^(1-0|0-1|1\/2)$/)) break;
                        try { chess.move(token); } catch { break; }
                        positions.add(normalizeFen(chess.fen()));
                    }
                } catch {
                    // skip malformed entries
                }
            }
        })
    );

    return positions;
}

/** Returns the cached book set, loading it on first call */
export async function getOpeningBook(): Promise<Set<string>> {
    if (bookPositions) return bookPositions;
    if (!loadingPromise) loadingPromise = loadBook().then((p) => { bookPositions = p; return p; });
    return loadingPromise;
}

export function isBookPosition(fen: string, book: Set<string>): boolean {
    return book.has(normalizeFen(fen));
}
