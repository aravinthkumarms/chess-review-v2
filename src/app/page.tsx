'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [pgn, setPgn] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pgn.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/py/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: pgn.trim(), depth: 18 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const result = await res.json();
      sessionStorage.setItem('chessAnalysis', JSON.stringify(result));
      router.push('/review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Check the PGN and try again.';
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at center, var(--review-bg-3) 0%, var(--review-bg) 100%)', padding: 24,
    }}>
      <div style={{
        background: 'var(--review-bg)', borderRadius: 10, padding: 40,
        width: '100%', maxWidth: 600, textAlign: 'center',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        border: '1px solid var(--review-border-strong)',
      }}>
        <h1 style={{
          fontFamily: 'Montserrat, sans-serif', fontSize: 28,
          color: '#fff', marginTop: 0, marginBottom: 8,
        }}>
          ♟ Game Review
        </h1>
        <p style={{ color: '#8b8987', fontSize: 13, marginTop: 0, marginBottom: 24 }}>
          Paste a PGN and get full Stockfish analysis with move classifications
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste your PGN here..."
            required
            disabled={loading}
            style={{
              width: '100%', height: 200, background: 'var(--review-surface)', color: 'var(--review-text-dim)',
              border: '1px solid var(--review-border-strong)', borderRadius: 4, padding: 15,
              boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 13,
              resize: 'vertical', outline: 'none',
            }}
          />

          {error && (
            <p style={{ color: '#fa412d', fontSize: 13, margin: '10px 0 0', textAlign: 'left' }}>⚠ {error}</p>
          )}

          {loading && (
            <div style={{ margin: '18px 0 0', textAlign: 'center' }}>
              <div style={{
                display: 'inline-block', width: 28, height: 28,
                border: '3px solid var(--review-border-strong)', borderTopColor: 'var(--color-green)',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: '#8b8987', fontSize: 13, marginTop: 10 }}>
                Analysing with Stockfish… this may take 30–60 seconds
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? 'var(--color-green-shadow)' : 'var(--color-green)', color: '#fff', border: 'none',
              padding: '15px 30px', margin: '20px 0', fontSize: 16, fontWeight: 700,
              borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer', width: '100%',
              transition: 'background 0.2s', fontFamily: 'Nunito, sans-serif',
              boxShadow: loading ? 'none' : '0 4px 0 var(--color-green-shadow)',
            }}
          >
            {loading ? 'Analysing…' : 'Review Game'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--review-border-strong)', margin: '24px 0', paddingTop: 24, textAlign: 'center' }}>
          <p style={{ color: '#8b8987', fontSize: 13, margin: '0 0 12px' }}>
            Or practice a downloaded interactive course lesson
          </p>
          <button
            type="button"
            onClick={() => router.push('/learn')}
            style={{
              background: 'var(--review-surface)', color: 'var(--review-text-dim)', border: '1px solid var(--review-border-strong)',
              padding: '12px 24px', fontSize: 14, fontWeight: 600,
              borderRadius: 4, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 auto',
              transition: 'all 0.2s', fontFamily: 'Nunito, sans-serif',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--review-surface-3)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'var(--review-surface)'; e.currentTarget.style.color = 'var(--review-text-dim)'; }}
          >
            <i className="fas fa-graduation-cap"></i> Practice Course Lesson
          </button>
        </div>
      </div>
    </div>
  );
}
