export interface EvalResult {
    evaluation: number;
    bestMove: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * The base URL for the local backend (Express).
 * This service handles videos and Cassandra data.
 */
export const LOCAL_API_BASE = process.env.NEXT_PUBLIC_LOCAL_API_URL || 'https://akvideo.share.zrok.io';

export const getLocalApiBase = () => {
    // If we are in a browser and not on the zrok domain, 
    // we might want to default to localhost if the env var isn't set.
    // However, for Vercel deployment, the zrok URL is the primary target.
    return LOCAL_API_BASE;
};

export async function evaluatePosition(fen: string, depth = 10): Promise<EvalResult> {
    const res = await fetch(`${API_BASE}/api/py/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth, normalise: true }),
    });
    if (!res.ok) throw new Error(`Eval API error: ${res.status}`);
    return res.json();
}
