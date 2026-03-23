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

/**
 * Tries to fetch from the local backend (zrok tunnel).
 * If it fails (tunnel down), falls back to the static files in the public/lessons folder.
 */
export async function fetchWithFallback(apiPath: string, options?: RequestInit): Promise<Response> {
    const localApi = getLocalApiBase();
    
    // 1. Try the local backend (Cassandra)
    try {
        const res = await fetch(`${localApi}${apiPath}`, options);
        if (res.ok) return res;
        // If it's a 404 or other error on the backend, try the fallback
    } catch (e) {
        // Network error (tunnel down)
    }

    // 2. Fallback to static files in /public/lessons
    // Example: /api/lessons/index -> /lessons/index.json
    // Example: /api/lessons/path/lesson.json -> /lessons/path/lesson.json
    if (apiPath.startsWith('/api/lessons')) {
        let fallbackPath = apiPath.replace('/api/lessons', '/lessons');
        if (fallbackPath === '/lessons/index') fallbackPath = '/lessons/index.json';
        
        console.warn(`[Fallback] Fetching static lesson data from ${fallbackPath}`);
        return fetch(fallbackPath, options);
    }

    // If no fallback is possible (e.g. for /api/progress), throw error
    throw new Error(`Failed to fetch ${apiPath} and no static fallback available.`);
}

export async function evaluatePosition(fen: string, depth = 10): Promise<EvalResult> {
    const res = await fetch(`${API_BASE}/api/py/eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, depth, normalise: true }),
    });
    if (!res.ok) throw new Error(`Eval API error: ${res.status}`);
    return res.json();
}
