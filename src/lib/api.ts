export interface EvalResult {
    evaluation: number;
    bestMove: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export async function evaluatePosition(fen: string, depth = 10): Promise<EvalResult> {
    const res = await fetch(`${API_BASE}/api/py/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth, normalise: true }),
    });
    if (!res.ok) throw new Error(`Eval API error: ${res.status}`);
    return res.json();
}
