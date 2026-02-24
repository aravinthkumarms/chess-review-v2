'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

type Arrow = { startSquare: string; endSquare: string; color: string };
interface PVLine { evaluation: number; sequence: { san: string, fen: string, eval: number | null }[]; }

import { AnalyzeResponse, MoveResult, SVG_MAP, START_FEN } from '@/types/analysis';
import { useChessGame } from '@/hooks/useChessGame';
import { useSounds } from '@/hooks/useSounds';
import EvalBar from '@/components/EvalBar';
import EvalChart from '@/components/EvalChart';
import MoveList from '@/components/MoveList';

// ── Board themes ───────────────────────────────────────────────────────────
const BOARD_THEMES = {
  classic: { light: '#f0d9b5', dark: '#b58863' },
  green: { light: '#eeeed2', dark: '#769656' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  ice: { light: '#e8edf9', dark: '#7389b7' },
  walnut: { light: '#d5a86e', dark: '#7d4a1e' },
  coral: { light: '#b9ccde', dark: '#487ca3' },
  marble: { light: '#eceeed', dark: '#80918c' },
  glass: { light: '#e5e5e5', dark: '#9c9c9c' },
  neon: { light: '#3f3f3f', dark: '#2b2b2b' },
} as const;
type ThemeName = keyof typeof BOARD_THEMES;

const PIECE_SETS: Array<{ name: string; label: string; src: string; url: string }> = [
  { name: 'wikipedia', label: 'Classic (Web)', src: 'https://chessboardjs.com/img/chesspieces/wikipedia/wN.png', url: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png' },
  { name: 'cburnett', label: 'Lichess', src: 'https://lichess1.org/assets/piece/cburnett/wN.svg', url: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg' },
];

// ── Helper: badge position from square name ────────────────────────────────
function badgeStyle(square: string, orientation: 'white' | 'black'): React.CSSProperties {
  const file = square.charCodeAt(0) - 97;  // a=0 … h=7
  const rank = parseInt(square[1]) - 1;    // 1=0 … 8=7

  const col = orientation === 'white' ? file : (7 - file);
  const row = orientation === 'white' ? (7 - rank) : rank;

  // Place at top-right corner of the destination square
  const leftPct = ((col + 1) * 12.5);  // right edge of square
  const topPct = (row * 12.5);        // top edge of square

  return {
    position: 'absolute',
    left: `calc(${leftPct}% - 22px)`,
    top: `calc(${topPct}% - 8px)`,
    width: 24, height: 24,
    zIndex: 20, pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
  };
}

// ── Helper: get UCI best move → Arrow ─────────────────────────────────────
function uciBestArrow(uci: string): Arrow | null {
  if (!uci || uci.length < 4) return null;
  return { startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: 'rgba(79,195,247,0.85)' };
}

// ── PlayerInfo ─────────────────────────────────────────────────────────────
function PlayerInfo({ name, elo, clock }: { name: string; elo: string; clock?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '2px 0', color: '#fff', width: '100%' }}>
      <div style={{ width: 40, height: 40, borderRadius: 4, background: '#403d39', flexShrink: 0, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://www.chess.com/bundles/web/images/noavatar_l.84a92436.gif" alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name || '?'}
          </span>
          {elo && elo !== '?' && (
            <span style={{ color: '#9f9e9d', fontSize: 13 }}>({elo})</span>
          )}
        </div>
      </div>
      {clock && (
        <div style={{
          background: '#21201d', padding: '4px 10px', borderRadius: 3,
          fontFamily: 'Montserrat, monospace', fontWeight: 700, fontSize: 16,
          color: '#bababa', minWidth: 60, textAlign: 'center', border: '1px solid #403d39'
        }}>
          {clock}
        </div>
      )}
    </div>
  );
}

// ── Clock helper: find last clock for a player at currentMoveIndex ─────────
function lastClock(moves: MoveResult[], currentIdx: number, isWhite: boolean): string | null {
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (moves[i].isWhite === isWhite && moves[i].clock) return moves[i].clock;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main result page
// ═══════════════════════════════════════════════════════════════════════════
export default function ResultPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [boardTheme, setBoardTheme] = useState<ThemeName>('classic');
  const [pieceSetIdx, setPieceSetIdx] = useState(0);
  const [showArrowMenu, setShowArrowMenu] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showBestArrow, setShowBestArrow] = useState(false);
  const [showThreatArrows, setShowThreatArrows] = useState(false);
  const [boardSize, setBoardSize] = useState(0);
  const [engineLines, setEngineLines] = useState<PVLine[]>([]);
  const [engineDepth, setEngineDepth] = useState(14);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showReport, setShowReport] = useState(true);
  const boardWrapperRef = useRef<HTMLDivElement>(null);

  const game = useChessGame(data);
  const sounds = useSounds();

  // Load data from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('chessAnalysis');
    if (!raw) { router.push('/'); return; }
    try { setData(JSON.parse(raw)); } catch { router.push('/'); }
  }, [router]);

  // Restore preferences
  useEffect(() => {
    const t = localStorage.getItem('boardTheme') as ThemeName | null;
    const p = localStorage.getItem('pieceSet');
    if (t && BOARD_THEMES[t]) setBoardTheme(t);
    if (p) { const idx = PIECE_SETS.findIndex(s => s.name === p); if (idx >= 0) setPieceSetIdx(idx); }
  }, []);

  // Track board size for badge overlay
  useEffect(() => {
    const el = boardWrapperRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      setBoardSize(entries[0].contentRect.width);
    });
    obs.observe(el);
    setBoardSize(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        const san = game.nextMove();
        if (san) sounds.playMove(san);
      } else if (e.key === 'ArrowLeft') {
        const r = game.prevMove();
        if (r !== 'noop') sounds.playUndo();
      } else if (e.key === 'ArrowUp') {
        if (game.isVariation) game.exitVariation();
        else game.goToMove(0);
      } else if (e.key === 'ArrowDown') {
        if (!game.isVariation) game.goToMove(game.mainFens.length - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [game, sounds]);

  // Close arrow menu on outside click
  useEffect(() => {
    if (!showArrowMenu) return;
    const close = () => setShowArrowMenu(false);
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [showArrowMenu]);

  // Live Engine Analysis
  useEffect(() => {
    setIsCalculating(true);
    let active = true;
    fetch('/api/py/eval', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen: game.currentFen, depth: engineDepth, multipv: 3, normalise_flag: true }),
    }).then(r => r.json()).then(d => {
      if (!active || !d.pvLines) return;
      const parsedLines = d.pvLines.map((line: any) => {
        const ch = new Chess(game.currentFen);
        const sequence = [];
        for (const uci of line.moves) {
          try {
            const mv = ch.move({
              from: uci.slice(0, 2), to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci[4] : undefined
            });
            if (mv) sequence.push({ san: mv.san, fen: ch.fen() });
          } catch { break; }
        }
        return { evaluation: line.evaluation, sequence };
      });
      setEngineLines(parsedLines);
      setIsCalculating(false);
    }).catch(() => {
      if (active) setIsCalculating(false);
    });
    return () => { active = false; };
  }, [game.currentFen, engineDepth]);

  // ── Compute arrows ────────────────────────────────────────────────────────
  const arrows: Arrow[] = [];
  if (showBestArrow && !game.isVariation && game.currentMoveData?.bestMoveUci) {
    const a = uciBestArrow(game.currentMoveData.bestMoveUci);
    if (a) arrows.push({ ...a, color: 'rgba(79,195,247,0.82)' });
  }
  if (showThreatArrows) {
    try {
      const ch = new Chess(game.currentFen);
      ch.moves({ verbose: true })
        .filter(m => m.flags.includes('c') || m.flags.includes('e'))
        .forEach(m => arrows.push({ startSquare: m.from, endSquare: m.to, color: 'rgba(239,83,80,0.82)' }));
    } catch { /* ignore */ }
  }

  // ── Compute badge ─────────────────────────────────────────────────────────
  let badgeSq: string | null = null;
  if (!game.isVariation && game.currentMoveData) {
    const { uci, fenBefore } = game.currentMoveData;
    try {
      const tmp = new Chess(fenBefore);
      const mv = tmp.move({
        from: uci.slice(0, 2), to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined
      });
      if (mv) badgeSq = mv.to;
    } catch { /* ignore */ }
  }

  // ── Compute Custom Pieces ───────────────────────────────────────────────
  const pieceSrc = PIECE_SETS[pieceSetIdx] || PIECE_SETS[0];
  const customPieces = useMemo(() => {
    if (pieceSrc.name === 'wikipedia') return undefined; // Let react-chessboard use default
    const pieces = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
    const map: Record<string, any> = {};
    pieces.forEach(p => {
      // eslint-disable-next-line react/display-name
      map[p] = ({ squareWidth }: any) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pieceSrc.url.replace('{piece}', p)} alt={p} style={{ width: squareWidth, height: squareWidth }} />
      );
    });
    return map;
  }, [pieceSrc]);

  // ── Compute King Outcome Badges ───────────────────────────────────────────
  const kingBadges = useMemo(() => {
    if (game.isVariation || game.currentMoveIndex !== game.mainFens.length - 1) return null;

    const headerMatch = data?.pgn?.match(/\[Result "(.*?)"\]/)?.[1];
    let result = headerMatch && headerMatch !== '*' ? headerMatch : undefined;

    const ch = new Chess(game.currentFen);
    const isMated = ch.isCheckmate();
    const isDraw = ch.isDraw();

    if (!result) {
      if (isMated) result = ch.turn() === 'w' ? '0-1' : '1-0';
      else if (isDraw) result = '1/2-1/2';
    }

    if (!result || result === '*') return null;

    let wKingSquare = '';
    let bKingSquare = '';
    ch.board().forEach((row, r) => {
      row.forEach((p, c) => {
        if (p?.type === 'k') {
          const sq = String.fromCharCode(97 + c) + (8 - r);
          if (p.color === 'w') wKingSquare = sq;
          if (p.color === 'b') bKingSquare = sq;
        }
      });
    });

    let wBadge = '';
    let bBadge = '';

    if (result === '1-0') {
      wBadge = '/svg/winner.svg';
      bBadge = isMated ? '/svg/checkmate_black.svg' : '/svg/resign_black.svg';
    } else if (result === '0-1') {
      bBadge = '/svg/winner.svg';
      wBadge = isMated ? '/svg/checkmate_white.svg' : '/svg/resign_white.svg';
    } else if (result === '1/2-1/2') {
      wBadge = '/svg/draw_white.svg';
      bBadge = '/svg/draw_black.svg';
    }

    return (
      <>
        {wBadge && wKingSquare && <img src={wBadge} alt="White Result" style={badgeStyle(wKingSquare, game.orientation)} />}
        {bBadge && bKingSquare && <img src={bBadge} alt="Black Result" style={badgeStyle(bKingSquare, game.orientation)} />}
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.currentMoveIndex, game.mainFens.length, game.isVariation, game.currentFen, game.orientation, data?.pgn]);

  // ── Piece drop → variation ────────────────────────────────────────────────
  function onPieceDrop({ sourceSquare, targetSquare }: { sourceSquare: string, targetSquare: string | null }): boolean {
    if (!targetSquare) return false;
    try {
      const from = sourceSquare;
      const to = targetSquare;
      const ch = new Chess(game.currentFen);
      const mv = ch.move({ from, to, promotion: 'q' });
      if (!mv) return false;
      const newFen = ch.fen();
      if (!game.isVariation) game.startVariation(mv.san, newFen);
      else game.extendVariation(mv.san, newFen);
      sounds.playMove(mv.san);
      // Fetch eval for variation node
      fetch('/api/py/eval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: newFen, depth: 10, normalise_flag: true }),
      }).then(r => r.json()).then(d => {
        const idx = game.isVariation ? game.variationIndex : 0;
        game.updateVariationEval(idx, d.evaluation ?? 0);
      }).catch(() => { });
      return true;
    } catch { return false; }
  }

  // ── Navigation helpers with sound ─────────────────────────────────────────
  function navGoTo(idx: number) {
    const isForward = idx > game.currentMoveIndex;
    game.goToMove(idx);
    if (idx === 0) sounds.playUndo();
    else if (isForward) sounds.playMove(game.rawMoves[idx - 1]?.san);
    else sounds.playUndo();
  }

  const theme = BOARD_THEMES[boardTheme];

  // Player clocks
  const wClock = data ? lastClock(data.moves, game.currentMoveIndex, true) : null;
  const bClock = data ? lastClock(data.moves, game.currentMoveIndex, false) : null;

  if (!data) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#262421', color: '#fff', fontFamily: 'Nunito, sans-serif', fontSize: 18
      }}>
        Loading…
      </div>
    );
  }

  const isFlipped = game.orientation === 'black';

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />

      <style>{`
        html,body{height:100vh;overflow:hidden;margin:0;}
        body{background:radial-gradient(circle at center,#383531 0%,#262421 100%);
          font-family:'Nunito',-apple-system,sans-serif;color:#fff;display:flex;
          justify-content:center;padding:24px;box-sizing:border-box;}
        ::-webkit-scrollbar{width:8px;}
        ::-webkit-scrollbar-track{background:#262421;}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:4px;}
        ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.3);}
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'row', gap: 24,
        maxWidth: 1500, width: '100%', height: '100%'
      }}>

        {/* ── Left: Board column ───────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0,
          justifyContent: 'center', alignItems: 'center', height: '100%', gap: 4
        }}>

          {/* Top player (opponent) */}
          <div style={{
            width: '100%', maxWidth: 'min(844px,calc(100vh - 140px + 44px))',
            paddingLeft: 44, boxSizing: 'border-box'
          }}>
            <PlayerInfo
              name={isFlipped ? data.whitePlayer : data.blackPlayer}
              elo={isFlipped ? data.whiteElo : data.blackElo}
              clock={isFlipped ? wClock : bClock}
            />
          </div>

          {/* Board row: eval bar + board */}
          <div style={{
            display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'stretch',
            width: '100%', maxWidth: 'min(844px,calc(100vh - 140px + 44px))',
            flex: 1, maxHeight: 'min(800px,calc(100vh - 140px))'
          }}>
            <EvalBar
              evaluation={game.isVariation && engineLines.length > 0 ? engineLines[0].evaluation : game.currentEval}
              flipped={isFlipped}
            />
            {/* Board + badge overlay */}
            <div ref={boardWrapperRef} style={{
              flex: 1, position: 'relative', aspectRatio: '1/1',
              maxWidth: 'min(800px,calc(100vh - 140px))', borderRadius: 4,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
            }}>
              <Chessboard
                options={{
                  position: game.currentFen,
                  boardOrientation: game.orientation,
                  lightSquareStyle: { backgroundColor: theme.light },
                  darkSquareStyle: { backgroundColor: theme.dark },
                  arrows: arrows,
                  onPieceDrop,
                  canDragPiece: ({ piece }) => {
                    try { return piece.pieceType[0] === (new Chess(game.currentFen).turn()); } catch { return false; }
                  },
                  pieces: customPieces,
                }}
              />

              {/* Board badge overlay */}
              {badgeSq && game.currentMoveData && (() => {
                const cl = game.currentMoveData.classification?.toLowerCase() ?? '';
                const svg = SVG_MAP[cl];
                return svg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={svg} alt={cl} style={badgeStyle(badgeSq!, game.orientation)} />
                ) : null;
              })()}
              {/* Outcome badges */}
              {kingBadges}
            </div>
          </div>

          {/* Bottom player (us) */}
          <div style={{
            width: '100%', maxWidth: 'min(844px,calc(100vh - 140px + 44px))',
            paddingLeft: 44, boxSizing: 'border-box'
          }}>
            <PlayerInfo
              name={isFlipped ? data.blackPlayer : data.whitePlayer}
              elo={isFlipped ? data.blackElo : data.whiteElo}
              clock={isFlipped ? bClock : wClock}
            />
          </div>
        </div>

        {/* ── Right: Sidebar ───────────────────────────────────────────── */}
        <div style={{
          width: 380, background: '#262421', border: '1px solid #403d39',
          margin: 'auto',
          borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          height: '100%', maxHeight: 'min(800px,calc(100vh - 140px))', flexShrink: 0
        }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #403d39', background: '#302e2b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontFamily: 'Montserrat,sans-serif', fontSize: 18, fontWeight: 700 }}>Game Review</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Accuracy */}
                <div style={{
                  fontSize: 12, fontWeight: 800, color: '#81b64c',
                  background: 'rgba(112,176,109,0.15)', border: '1px solid rgba(112,176,109,0.3)',
                  borderRadius: 12, padding: '3px 10px'
                }}>
                  🎯 {data.accuracy.toFixed(1)}%
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Arrow settings */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowArrowMenu(v => !v); }}
                    style={btnStyle}>
                    <i className="fas fa-sliders-h"></i>
                  </button>
                  {showArrowMenu && (
                    <div onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }} style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                      background: '#2a2a2a', border: '1px solid #403d39', borderRadius: 10,
                      padding: '10px 14px', minWidth: 190, zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#888', marginBottom: 8 }}>
                        Board Arrows
                      </div>
                      <label style={arrowToggleStyle}>
                        <input type="checkbox" checked={showBestArrow}
                          onChange={e => setShowBestArrow(e.target.checked)}
                          style={{ accentColor: '#4fc3f7' }} />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4fc3f7', flexShrink: 0 }} />
                        Best move arrow
                      </label>
                      <label style={arrowToggleStyle}>
                        <input type="checkbox" checked={showThreatArrows}
                          onChange={e => setShowThreatArrows(e.target.checked)}
                          style={{ accentColor: '#ef5350' }} />
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef5350', flexShrink: 0 }} />
                        Threat arrows
                      </label>
                    </div>
                  )}
                </div>

                {/* Clock toggle */}
                <button onClick={() => game.setShowTimestamps(v => !v)}
                  style={{ ...btnStyle, color: game.showTimestamps ? '#81b64c' : undefined }}>
                  <i className="fas fa-clock"></i>
                </button>

                {/* Customize */}
                <button onClick={() => setShowCustomModal(true)} style={btnStyle}>
                  <i className="fas fa-palette"></i>
                </button>

                {/* New game */}
                <button onClick={() => router.push('/')}
                  style={{ ...btnStyle, fontSize: 12, padding: '4px 10px' }}>
                  New Game
                </button>
              </div>
            </div>

            {/* Best move panel */}
            {!game.isVariation && game.currentMoveData?.bestMoveUci && (() => {
              let bestSan = game.currentMoveData.bestMoveUci;
              try {
                const uci = game.currentMoveData.bestMoveUci;
                const tmp = new Chess(game.mainFens[game.currentMoveIndex - 1] ?? START_FEN);
                const mv = tmp.move({
                  from: uci.slice(0, 2), to: uci.slice(2, 4),
                  promotion: uci.length > 4 ? uci[4] : undefined
                });
                if (mv) bestSan = mv.san;
              } catch { /* ignore */ }
              return (
                <div style={{
                  marginTop: 10, padding: '10px 14px',
                  background: 'rgba(255,200,50,0.1)', border: '1px solid rgba(255,200,50,0.3)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <span style={{ fontSize: 20 }}>💡</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Best move was
                    </div>
                    <div style={{
                      fontSize: 18, fontWeight: 700, color: '#ffc832',
                      fontFamily: 'Courier New, monospace', letterSpacing: 1
                    }}>
                      {bestSan}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sidebar Content: Report Card or Engine Analysis */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {showReport ? (
              <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Accuracy Summary */}
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { name: data.whitePlayer, elo: data.whiteElo, acc: data.whiteAccuracy, rating: data.whiteRating, color: '#fff' },
                    { name: data.blackPlayer, elo: data.blackElo, acc: data.blackAccuracy, rating: data.blackRating, color: '#bababa' }
                  ].map((p, i) => (
                    <div key={i} style={{ flex: 1, background: '#302e2b', padding: 16, borderRadius: 12, textAlign: 'center', border: '1px solid #403d39' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ fontSize: 32, fontWeight: 900, color: '#81b64c', fontFamily: 'Montserrat, sans-serif' }}>
                          {p.acc.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>%</div>
                      </div>
                      <div style={{ background: '#21201d', padding: '6px', borderRadius: 8, border: '1px solid #403d39' }}>
                        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 2 }}>Game Rating</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#ffb33e' }}>{p.rating}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Classifications Table */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid #333', paddingBottom: 8, marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#888' }}>
                    <div style={{ flex: 1 }}>Classification</div>
                    <div style={{ width: 40, textAlign: 'center' }}>W</div>
                    <div style={{ width: 40, textAlign: 'center' }}>B</div>
                  </div>
                  {[
                    { key: 'brilliant', label: 'Brilliant', color: '#1baca6' },
                    { key: 'great', label: 'Great Move', color: '#5c8bb0' },
                    { key: 'best', label: 'Best', color: '#81b64c' },
                    { key: 'excellent', label: 'Excellent', color: '#96bc4b' },
                    { key: 'good', label: 'Good', color: '#aaa' },
                    { key: 'book', label: 'Book', color: '#a88865' },
                    { key: 'inaccuracy', label: 'Inaccuracy', color: '#f0c15c' },
                    { key: 'mistake', label: 'Mistake', color: '#ffa459' },
                    { key: 'miss', label: 'Miss', color: '#ff6b6b' },
                    { key: 'blunder', label: 'Blunder', color: '#fa412d' },
                  ].map((cls) => {
                    const whiteCount = (data.whiteClassifications as any)[cls.key] || 0;
                    const blackCount = (data.blackClassifications as any)[cls.key] || 0;
                    // Always show all categories as per user request

                    const svg = SVG_MAP[cls.key];

                    return (
                      <div key={cls.key} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', fontSize: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                          <div style={{ width: 18, height: 18 }}>
                            {svg && <img src={svg} alt={cls.label} style={{ width: 18, height: 18 }} />}
                          </div>
                          <span style={{ color: cls.color, fontWeight: 600 }}>{cls.label}</span>
                        </div>
                        <div style={{ width: 40, textAlign: 'center', fontWeight: 700, color: whiteCount > 0 ? '#fff' : '#444' }}>{whiteCount}</div>
                        <div style={{ width: 40, textAlign: 'center', fontWeight: 700, color: blackCount > 0 ? '#fff' : '#444' }}>{blackCount}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Start Review Button */}
                <button
                  onClick={() => setShowReport(false)}
                  style={{
                    background: '#81b64c', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '16px', fontSize: 18, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    boxShadow: '0 4px 0 #618a3a', transition: 'transform 0.1s, box-shadow 0.1s',
                  }}
                  onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = '0 2px 0 #618a3a'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 #618a3a'; }}
                >
                  <i className="fas fa-search"></i>
                  START REVIEW
                </button>
              </div>
            ) : (
              <>
                {/* Live Engine Panel */}
                <div style={{ background: '#2a2825', borderBottom: '1px solid #403d39', padding: '10px 16px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => setShowReport(true)}
                        style={{
                          background: '#383531', border: '1px solid #403d39', color: '#ccc',
                          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <i className="fas fa-arrow-left"></i> BACK
                      </button>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Engine Lines
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        value={engineDepth}
                        onChange={e => setEngineDepth(Number(e.target.value))}
                        style={{
                          background: '#1a1917', border: '1px solid #403d39', color: '#ccc',
                          padding: '2px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer', outline: 'none'
                        }}
                      >
                        <option value={10}>Depth 10</option>
                        <option value={12}>Depth 12 (Fast)</option>
                        <option value={14}>Depth 14</option>
                        <option value={16}>Depth 16 (Deep)</option>
                        <option value={18}>Depth 18</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: isCalculating ? 0.6 : 1, transition: 'opacity 0.2s', minHeight: 60, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>

                    {/* Played Move / Current Variation */}
                    {game.currentMoveData && !game.isVariation && (() => {
                      const playedMove = game.currentMoveData;
                      const bestLine = engineLines[0];

                      const getClsColor = (cls?: string) => {
                        switch (cls?.toLowerCase()) {
                          case 'blunder': return '#fa412d';
                          case 'mistake': return '#ffa459';
                          case 'inaccuracy': return '#f0c15c';
                          case 'excellent': return '#96bc4b';
                          case 'best move': return '#81b64c';
                          case 'best': return '#81b64c';
                          case 'brilliant': return '#1baca6';
                          case 'great': return '#5c8bb0';
                          case 'book': return '#a88865';
                          default: return '#888';
                        }
                      };

                      const formatEvalStr = (cp: number) => {
                        if (Math.abs(cp) >= 9900) return (cp > 0 ? '+M' : '-M') + (10000 - Math.abs(cp));
                        return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
                      };

                      const isBest = ['best move', 'best', 'excellent', 'brilliant', 'great'].includes(playedMove.classification?.toLowerCase() || '');

                      const renderAnalysisRow = (mv: { san: string, evaluation: number, classification?: string }, descPrefix: string, line?: PVLine) => {
                        const clColor = getClsColor(mv.classification);
                        const cl = mv.classification?.toLowerCase() ?? '';
                        const svg = SVG_MAP[cl];

                        let description = mv.classification?.toLowerCase() || 'a move';
                        if (description === 'best move' || description === 'best') description = 'best';
                        else if (['miss', 'blunder', 'mistake', 'inaccuracy', 'brilliant', 'great'].includes(description)) {
                          description = `a ${description}`;
                          if (description === 'a great') description = 'a great move';
                        }

                        return (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <div style={{
                                fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace', width: 45, textAlign: 'right',
                                color: mv.evaluation > 0 ? '#fff' : (mv.evaluation < 0 ? '#ffb9b9' : '#ccc')
                              }}>
                                {formatEvalStr(mv.evaluation)}
                              </div>
                              <div style={{ width: 18, height: 18, flexShrink: 0 }}>
                                {svg && <img src={svg} alt={cl} style={{ width: 18, height: 18 }} />}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 16, fontWeight: 'bold', color: clColor || '#fff' }}>{mv.san}</span>
                                <span style={{ fontSize: 13, color: clColor || '#aaa' }}>is {description}</span>
                              </div>
                            </div>

                            {line && (
                              <div style={{ paddingLeft: 73, color: '#bbb', fontFamily: 'monospace', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 6px' }}>
                                {line.sequence.map((s, i) => (
                                  <span
                                    key={i}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                      const subSeq = line.sequence.slice(0, i + 1).map(x => ({ san: x.san, fen: x.fen, eval: null }));
                                      game.loadVariation(subSeq);
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#bbb'}
                                  >
                                    {s.san}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      };

                      // Get best move SAN for current pos
                      let bestSan = playedMove.bestMoveUci || '';
                      if (playedMove.bestMoveUci) {
                        try {
                          const tmp = new Chess(playedMove.fenBefore);
                          const bm = tmp.move({
                            from: playedMove.bestMoveUci.slice(0, 2),
                            to: playedMove.bestMoveUci.slice(2, 4),
                            promotion: playedMove.bestMoveUci.length > 4 ? playedMove.bestMoveUci[4] : undefined
                          });
                          if (bm) bestSan = bm.san;
                        } catch { }
                      }

                      return (
                        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '12px 0 4px', marginBottom: 8 }}>
                          {/* Row 1: Played Move */}
                          {renderAnalysisRow(playedMove, '')}

                          {/* Row 2: Best Move (if played move was not best) */}
                          {!isBest && bestLine && (
                            renderAnalysisRow(
                              { san: bestSan, evaluation: bestLine.evaluation, classification: 'Best Move' },
                              '',
                              bestLine
                            )
                          )}

                          {/* If played move WAS best, show its line */}
                          {isBest && bestLine && (
                            <div style={{ paddingLeft: 73, color: '#bbb', fontFamily: 'monospace', fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 6px', marginTop: -10, marginBottom: 12 }}>
                              {bestLine.sequence.map((s, i) => (
                                <span
                                  key={i}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    const subSeq = bestLine.sequence.slice(0, i + 1).map(x => ({ san: x.san, fen: x.fen, eval: null }));
                                    game.loadVariation(subSeq);
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                  onMouseLeave={e => e.currentTarget.style.color = '#bbb'}
                                >
                                  {s.san}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ width: '100%', height: 1, background: '#353330', margin: '4px 0' }} />

                    {engineLines.length === 0 && !isCalculating && (
                      <div style={{ fontSize: 13, color: '#777', textAlign: 'center', marginTop: 10 }}>No lines available.</div>
                    )}
                    {(() => {
                      const playedMoveCls = game.currentMoveData?.classification?.toLowerCase() || '';
                      const playedIsBest = !game.isVariation && ['best move', 'excellent', 'brilliant', 'great find'].includes(playedMoveCls);

                      return engineLines.slice(playedIsBest ? 1 : 0).map((line, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 10, fontSize: 12, alignItems: 'flex-start', padding: '4px 0' }}>
                          <div style={{
                            width: 45, fontWeight: 700, textAlign: 'right', flexShrink: 0, marginTop: 2,
                            color: line.evaluation > 0 ? '#fff' : (line.evaluation < 0 ? '#ffb9b9' : '#ccc')
                          }}>
                            {(() => {
                              if (Math.abs(line.evaluation) >= 9900) return (line.evaluation > 0 ? '+M' : '-M') + (10000 - Math.abs(line.evaluation));
                              return (line.evaluation > 0 ? '+' : '') + (line.evaluation / 100).toFixed(2);
                            })()}
                          </div>
                          <div style={{
                            flex: 1, display: 'flex', flexWrap: 'wrap', gap: '4px 6px',
                            color: '#bbb', fontFamily: 'monospace', fontSize: 13
                          }}>
                            {line.sequence.map((step, k) => (
                              <span
                                key={k}
                                style={{ cursor: 'pointer', marginRight: 5, transition: 'color 0.1s' }}
                                onClick={() => {
                                  const subSeq = line.sequence.slice(0, k + 1).map(s => ({ san: s.san, fen: s.fen, eval: null }));
                                  game.loadVariation(subSeq);
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#bbb'; }}
                              >
                                {step.san}
                              </span>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Eval chart */}
                <EvalChart
                  evaluations={game.evaluations}
                  currentIndex={game.currentMoveIndex}
                  onSelectMove={navGoTo}
                />

                {/* Move list */}
                <MoveList
                  moves={game.rawMoves}
                  activeMoveIndex={game.currentMoveIndex}
                  showTimestamps={game.showTimestamps}
                  onSelectMove={navGoTo}
                  isVariation={game.isVariation}
                  variationBaseIndex={game.variationBaseIndex}
                  variationMoves={game.variationMoves}
                  variationIndex={game.variationIndex}
                  onSelectVariationMove={game.goToVariationMove}
                  onExitVariation={game.exitVariation}
                  gameResult={(() => {
                    const headerMatch = data?.pgn?.match(/\[Result "(.*?)"\]/)?.[1];
                    if (headerMatch && headerMatch !== '*') return headerMatch;

                    if (data && data.moves.length > 0) {
                      const lastMove = data.moves[data.moves.length - 1];
                      const ch = new Chess(lastMove.fen);
                      if (ch.isCheckmate()) return lastMove.isWhite ? '1-0' : '0-1';
                      if (ch.isDraw()) return '1/2-1/2';
                    }
                    return undefined;
                  })()}
                />
              </>
            )}
          </div>


          <div style={{
            display: 'flex', justifyContent: 'center', gap: 15,
            background: '#262421', padding: 12, borderTop: '1px solid #403d39',
            flexShrink: 0, boxSizing: 'border-box', width: '100%'
          }}>
            {[
              { icon: 'fa-fast-backward', title: 'First', action: () => navGoTo(0) },
              { icon: 'fa-step-backward', title: 'Prev', action: () => { const r = game.prevMove(); if (r !== 'noop') sounds.playUndo(); } },
              { icon: 'fa-step-forward', title: 'Next', action: () => { const san = game.nextMove(); if (san) sounds.playMove(san); } },
              { icon: 'fa-fast-forward', title: 'Last', action: () => navGoTo(game.mainFens.length - 1) },
              { icon: 'fa-retweet', title: 'Flip', action: game.flipBoard, ml: 10 },
            ].map(({ icon, title, action, ml }) => (
              <button key={icon} onClick={action} title={title} style={{
                background: 'none', border: 'none', color: '#cbcbca', fontSize: 20,
                cursor: 'pointer', padding: '8px 15px', transition: 'color 0.2s',
                marginLeft: ml,
              }}>
                <i className={`fas ${icon}`}></i>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Board / Piece Customize Modal ──────────────────────────────────── */}
      {showCustomModal && (
        <div onClick={() => setShowCustomModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 14,
              padding: '24px 28px', width: 'min(460px,92vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
            }}>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 17, fontWeight: 700, marginBottom: 18
            }}>
              🎨 Board &amp; Pieces
              <button onClick={() => setShowCustomModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#777', marginBottom: 10 }}>
              Board Theme
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
              {(Object.entries(BOARD_THEMES) as [ThemeName, typeof BOARD_THEMES.classic][]).map(([name, t]) => (
                <div key={name} onClick={() => { setBoardTheme(name); localStorage.setItem('boardTheme', name); }}
                  style={{
                    cursor: 'pointer', borderRadius: 8, overflow: 'hidden', width: 72,
                    border: `2px solid ${boardTheme === name ? '#4fc3f7' : 'transparent'}`,
                    transition: 'border-color 0.15s',
                  }}>
                  <div style={{ display: 'flex', height: 36 }}>
                    <div style={{ flex: 1, background: t.light }} />
                    <div style={{ flex: 1, background: t.dark }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 10, color: '#bbb', padding: '4px 0', background: '#2a2a2a' }}>
                    {name[0].toUpperCase() + name.slice(1)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#777', marginBottom: 10 }}>
              Piece Set
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {PIECE_SETS.map((ps, idx) => (
                <div key={ps.name} onClick={() => { setPieceSetIdx(idx); localStorage.setItem('pieceSet', ps.name); }}
                  style={{
                    cursor: 'pointer', borderRadius: 8, border: `2px solid ${pieceSetIdx === idx ? '#4fc3f7' : 'transparent'}`,
                    padding: '8px 10px', background: '#2a2a2a', textAlign: 'center', width: 64,
                    transition: 'border-color 0.15s',
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ps.src} alt={ps.label} style={{ width: 36, height: 36, display: 'block', margin: '0 auto 4px' }} />
                  <span style={{ fontSize: 10, color: '#bbb' }}>{ps.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Shared micro-styles ────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)', border: '1px solid #403d39',
  borderRadius: 6, color: '#ccc', padding: '4px 8px', cursor: 'pointer',
  fontSize: 12, transition: 'background 0.2s,color 0.2s',
};
const arrowToggleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  fontSize: 13, color: '#ddd', padding: '5px 0', userSelect: 'none',
};
