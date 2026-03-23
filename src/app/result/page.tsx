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
import { useStockfish, EngineType } from '@/hooks/useStockfish';
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
      <div style={{ width: 40, height: 40, borderRadius: 4, background: 'var(--review-surface-5)', flexShrink: 0, overflow: 'hidden' }}>
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
          background: 'var(--review-bg-2)', padding: '4px 10px', borderRadius: 3,
          fontFamily: 'Montserrat, monospace', fontWeight: 700, fontSize: 16,
          color: 'var(--review-text-dim)', minWidth: 60, textAlign: 'center', border: '1px solid var(--review-border-strong)'
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
  const [engineDepth, setEngineDepth] = useState(20);
  const [showReport, setShowReport] = useState(true);
  const [engineType, setEngineType] = useState<EngineType>('lite');
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [engineLinesExpanded, setEngineLinesExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const boardWrapperRef = useRef<HTMLDivElement>(null);

  const game = useChessGame(data);
  const sounds = useSounds();
  const wasmEngine = useStockfish(engineType);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => {
      if (game.currentMoveIndex >= game.mainFens.length - 1) {
        setIsPlaying(false);
        return;
      }
      const san = game.nextMove();
      if (san) sounds.playMove(san);
    }, 1500);
    return () => clearInterval(t);
  }, [isPlaying, game, sounds]);

  // Load data from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('chessAnalysis');
    if (!raw) { router.push('/'); return; }
    try { setData(JSON.parse(raw)); } catch { router.push('/'); }
  }, [router]);

  // Handle WASM Evaluation updates
  useEffect(() => {
    if (game.isVariation && wasmEngine.evaluation !== null) {
      game.updateVariationEval(game.variationIndex, wasmEngine.evaluation);
    }
  }, [wasmEngine.evaluation, game.isVariation, game.variationIndex, game.updateVariationEval]);

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
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        setIsPlaying(false);
      }
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

  // Close popups on outside click
  useEffect(() => {
    if (!showArrowMenu && !showEngineSettings) return;
    const close = () => {
      setShowArrowMenu(false);
      setShowEngineSettings(false);
    }
    setTimeout(() => document.addEventListener('click', close), 0);
    return () => document.removeEventListener('click', close);
  }, [showArrowMenu, showEngineSettings]);

  // Trigger local WASM Engine Evaluation when Fen or Depth changes
  useEffect(() => {
    if (!wasmEngine.isReady) return;
    const multipv = 3; // Always show 3 lines for better analysis
    wasmEngine.evaluate(game.currentFen, engineDepth, multipv);
  }, [game.currentFen, game.isVariation, engineDepth, wasmEngine.isReady, wasmEngine.evaluate]);

  // Parse WASM Engine lines and update UI
  useEffect(() => {
    if (!wasmEngine.isReady || !wasmEngine.lines || wasmEngine.lines.length === 0) return;

    // Stockfish score is relative to side to move
    const isWhiteTurn = new Chess(game.currentFen).turn() === 'w';

    const parsedLines = wasmEngine.lines.map(line => {
      if (!line || !line.moves || line.moves.length === 0) return null;
      const ch = new Chess(game.currentFen);
      const sequence = [];
      const evaluation = isWhiteTurn ? line.evaluation : -line.evaluation;

      for (const uci of line.moves) {
        try {
          const mv = ch.move({
            from: uci.slice(0, 2), to: uci.slice(2, 4),
            promotion: uci.length > 4 ? uci[4] : undefined
          });
          if (mv) sequence.push({ san: mv.san, fen: ch.fen(), eval: null });
        } catch { break; }
      }
      return { evaluation, sequence };
    }).filter(Boolean) as PVLine[];

    if (parsedLines.length > 0) {
      setEngineLines(parsedLines);
    }
  }, [wasmEngine.lines, game.currentFen, wasmEngine.isReady]);

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
    setIsPlaying(false);
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
      return true;
    } catch { return false; }
  }

  // ── Navigation helpers with sound ─────────────────────────────────────────
  function navGoTo(idx: number) {
    setIsPlaying(false);
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
        height: '100vh', background: 'var(--review-bg)', color: '#fff', fontFamily: 'Nunito, sans-serif', fontSize: 18
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
        body{background:radial-gradient(circle at center, var(--review-bg-3) 0%, var(--review-bg) 100%);
          font-family:'Nunito',-apple-system,sans-serif;color:#fff;display:flex;
          justify-content:center;padding:24px;box-sizing:border-box;}
        ::-webkit-scrollbar{width:8px;}
        ::-webkit-scrollbar-track{background:var(--review-bg);}
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
          width: 440, background: 'var(--review-bg)', border: 'none',
          margin: 'auto',
          borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          height: '100%', maxHeight: 'min(800px,calc(100vh - 140px))', flexShrink: 0
        }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--review-border-strong)', background: 'var(--review-bg-2)' }}>
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
                      background: 'var(--review-surface-6)', border: '1px solid var(--review-border-strong)', borderRadius: 10,
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
                <button onClick={() => game.setShowTimestamps((v: any) => !v)}
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

          </div>

          {/* Sidebar Content: Report Card or Engine Analysis */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {showReport ? (
              <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Accuracy Summary Header (Side by side) */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { name: data.whitePlayer || 'W', acc: data.whiteAccuracy, bg: 'var(--score-white)', color: 'var(--score-black)' },
                    { name: data.blackPlayer || 'B', acc: data.blackAccuracy, bg: 'var(--score-black)', color: 'var(--score-white)' }
                  ].map((p, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', marginBottom: 4 }}>
                        {p.name}
                      </div>
                      <div style={{ width: 44, height: 44, background: i === 0 ? 'var(--score-white)' : 'var(--review-surface-2)', borderRadius: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 6, color: i === 0 ? 'var(--score-black)' : '#fff', fontSize: 20, fontWeight: 800 }}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{
                        width: 64, height: 32, background: p.bg, color: p.color, borderRadius: 4,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        fontSize: 17, fontWeight: 700, fontFamily: 'system-ui, -apple-system, sans-serif'
                      }}>
                        {p.acc.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ width: '100%', height: 1, background: 'var(--review-surface-2)', margin: '4px 0' }} />

                {/* Classifications Table (4-Column Grid) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { key: 'brilliant', label: 'Brilliant', color: '#1BACA6' },
                    { key: 'great', label: 'Great', color: '#5BA5F5' },
                    { key: 'best', label: 'Best', color: '#1BACA6' },
                    { key: 'excellent', label: 'Excellent', color: '#96BC4B' },
                    { key: 'good', label: 'Good', color: '#81B64C' },
                    { key: 'book', label: 'Book', color: '#A88865' },
                    { key: 'inaccuracy', label: 'Inaccuracy', color: '#F0C15C' },
                    { key: 'mistake', label: 'Mistake', color: '#FFA417' },
                    { key: 'miss', label: 'Miss', color: '#FF7763' },
                    { key: 'blunder', label: 'Blunder', color: '#FA412D' },
                  ].map((cls) => {
                    const whiteCount = (data.whiteClassifications as any)[cls.key] || 0;
                    const blackCount = (data.blackClassifications as any)[cls.key] || 0;
                    const svg = SVG_MAP[cls.key];

                    // Don't show if zero for both (except for standard ones maybe? We'll show all to match the screenshot if they have counts, or just keep them)
                    // The screenshot shows Brilliant through Blunder even if 0.
                    // We'll hide excellent/good to strictly match screenshot's main 7 categories unless there are >0
                    if (['excellent', 'good', 'book'].includes(cls.key) && whiteCount === 0 && blackCount === 0) return null;

                    return (
                      <div key={cls.key} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px 40px', alignItems: 'center', fontSize: 13, height: 24 }}>
                        {/* Label */}
                        <div style={{ color: 'rgba(255, 255, 255, 0.72)', fontWeight: 600 }}>
                          {cls.label}
                        </div>
                        {/* White Count */}
                        <div style={{ textAlign: 'center', fontWeight: 600, color: whiteCount > 0 ? cls.color : '#555' }}>
                          {whiteCount}
                        </div>
                        {/* Icon */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          {svg ? <img src={svg} alt={cls.label} style={{ width: 18, height: 18 }} /> : <div style={{ width: 18, height: 18 }} />}
                        </div>
                        {/* Black Count */}
                        <div style={{ textAlign: 'center', fontWeight: 600, color: blackCount > 0 ? cls.color : '#555' }}>
                          {blackCount}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ width: '100%', height: 1, background: 'var(--review-surface-2)', margin: '8px 0' }} />

                {/* Game Rating & Phases */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
                  {/* Game Rating Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <div style={{ color: 'rgba(255, 255, 255, 0.72)', fontWeight: 600 }}>Game Rating</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, background: 'var(--score-white)', color: 'var(--score-black)', padding: '4px 0', borderRadius: 4 }}>
                      {data.whiteRating || '?'}
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 700, background: 'var(--score-black)', color: 'var(--score-white)', padding: '4px 0', borderRadius: 4 }}>
                      {data.blackRating || '?'}
                    </div>
                  </div>

                  {/* Phase Accuracy Rows */}
                  {[
                    { key: 'opening', label: 'Opening' },
                    { key: 'middlegame', label: 'Middlegame' },
                    { key: 'endgame', label: 'Endgame' },
                  ].map((phase) => {
                    const whiteAcc = (data?.whitePhaseAccuracy as any)?.[phase.key];
                    const blackAcc = (data?.blackPhaseAccuracy as any)?.[phase.key];

                    if (whiteAcc == null && blackAcc == null) return null;

                    return (
                      <div key={phase.key} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <div style={{ color: 'rgba(255, 255, 255, 0.72)', fontWeight: 600 }}>{phase.label}</div>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-green)', background: 'rgba(129, 182, 76, 0.15)', padding: '2px 6px', borderRadius: 12 }}>
                            {whiteAcc != null ? `${whiteAcc.toFixed(0)}%` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-green)', background: 'rgba(129, 182, 76, 0.15)', padding: '2px 6px', borderRadius: 12 }}>
                            {blackAcc != null ? `${blackAcc.toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            ) : (
              <>
                {/* Live Engine Panel */}
                <div style={{ background: 'var(--review-surface)', borderBottom: '1px solid var(--review-border-strong)', padding: '10px 16px', flexShrink: 0 }}>
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
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowEngineSettings(v => !v); }}
                        style={{ ...btnStyle, background: 'transparent', border: 'none', color: showEngineSettings ? '#fff' : '#888', padding: '4px' }}
                      >
                        <i className="fas fa-cog"></i>
                      </button>

                      {showEngineSettings && (
                        <div onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }} style={{
                          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                          background: 'var(--review-surface-6)', border: '1px solid var(--review-border-strong)', borderRadius: 10,
                          padding: '16px', minWidth: 220, zIndex: 200, boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                          display: 'flex', flexDirection: 'column', gap: 12
                        }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#888', marginBottom: 4 }}>
                            Engine Settings
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>Search Depth</label>
                            <select
                              value={engineDepth}
                              onChange={e => setEngineDepth(Number(e.target.value))}
                              style={{
                                background: 'var(--review-bg-3)', border: '1px solid var(--review-border-strong)', color: '#fff',
                                padding: '8px', borderRadius: 6, fontSize: 13, cursor: 'pointer', outline: 'none'
                              }}
                            >
                              <option value={10}>Depth 10 (Very Fast)</option>
                              <option value={12}>Depth 12 (Fast)</option>
                              <option value={14}>Depth 14</option>
                              <option value={16}>Depth 16</option>
                              <option value={18}>Depth 18 (Deep)</option>
                              <option value={20}>Depth 20</option>
                              <option value={22}>Depth 22</option>
                            </select>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>Engine Type</label>
                            <select
                              value={engineType}
                              onChange={e => { setEngineType(e.target.value as any); setShowEngineSettings(false); }}
                              style={{
                                background: 'var(--review-bg-3)', border: '1px solid var(--review-border-strong)', color: '#fff',
                                padding: '8px', borderRadius: 6, fontSize: 13, cursor: 'pointer', outline: 'none'
                              }}
                            >
                              <option value="lite">SF Lite (7MB) - Fast load</option>
                              <option value="original">SF Original (113MB) - Strong</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: wasmEngine.isSearching ? 0.6 : 1, transition: 'opacity 0.2s', paddingRight: 4 }}>

                    {/* Best move panel (Moved here) */}
                    {!game.isVariation && game.currentMoveData?.bestMoveUci && (() => {
                      let hintSan = game.currentMoveData.bestMoveUci;
                      try {
                        const uci = game.currentMoveData.bestMoveUci;
                        const tmp = new Chess(game.mainFens[game.currentMoveIndex - 1] ?? START_FEN);
                        const mv = tmp.move({
                          from: uci.slice(0, 2), to: uci.slice(2, 4),
                          promotion: uci.length > 4 ? uci[4] : undefined
                        });
                        if (mv) hintSan = mv.san;
                      } catch { /* ignore */ }

                      // Only show if the current move wasn't a good/best move
                      const cl = game.currentMoveData.classification?.toLowerCase() || '';
                      const isGood = ['best move', 'best', 'excellent', 'brilliant', 'great', 'good', 'book'].includes(cl);

                      if (isGood) return null;

                      return (
                        <div style={{
                          marginBottom: 12, padding: '10px 12px',
                          background: 'rgba(255,200,50,0.08)', border: '1px solid rgba(255,200,50,0.2)',
                          borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10
                        }}>
                          <span style={{ fontSize: 16 }}>💡</span>
                          <div>
                            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Best move was
                            </div>
                            <div style={{
                              fontSize: 15, fontWeight: 700, color: '#ffc832',
                              fontFamily: 'Courier New, monospace', letterSpacing: 0.5
                            }}>
                              {hintSan}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

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

                      const getClsDescription = (cls: string | undefined) => {
                        let description = cls?.toLowerCase() || 'a move';
                        if (description === 'best move' || description === 'best') return 'best';
                        if (['miss', 'blunder', 'mistake', 'inaccuracy', 'brilliant', 'great'].includes(description)) {
                          description = `a ${description}`;
                          if (description === 'a great') return 'a great move';
                        }
                        return description;
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

                      const clColor = getClsColor(playedMove.classification);
                      const playedClsStr = playedMove.classification?.toLowerCase() ?? '';
                      const svg = SVG_MAP[playedClsStr];

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {/* Row 1: Played Move */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px', height: 26, background: clColor ? `${clColor}22` : 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <div style={{
                              width: 45, height: 20, borderRadius: 3, display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
                              fontSize: 13, fontWeight: 700, flexShrink: 0,
                              background: 'var(--score-white)', color: 'var(--score-black)',
                            }}>
                              {formatEvalStr(playedMove.evaluation)}
                            </div>
                            <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                              {svg && <img src={svg} alt={playedMove.classification} style={{ width: 16, height: 16 }} />}
                            </div>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              <span style={{ fontSize: 14, fontWeight: 'bold', color: clColor || '#fff' }}>{playedMove.san}</span>
                              <span style={{ fontSize: 13, color: clColor || '#aaa' }}>is {getClsDescription(playedMove.classification)}</span>
                            </div>
                          </div>

                          {/* Row 2: Best Move (if played move was not best) */}
                          {!isBest && bestLine && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px', height: 26, background: 'rgba(0,0,0,0.14)', borderRadius: 3 }}>
                              <div style={{
                                width: 45, height: 20, borderRadius: 3, display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
                                fontSize: 13, fontWeight: 700, flexShrink: 0,
                                background: bestLine.evaluation > 0 ? '#fff' : '#312e2b',
                                color: bestLine.evaluation > 0 ? '#312e2b' : '#fff'
                              }}>
                                {formatEvalStr(bestLine.evaluation)}
                              </div>
                              <div style={{ width: 16, height: 16, flexShrink: 0 }}>
                                <img src={SVG_MAP['best']} alt="best" style={{ width: 16, height: 16 }} />
                              </div>
                              <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif', fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                <span style={{ fontWeight: 'bold', color: '#81b64c', marginRight: 6 }}>{bestSan}</span>
                                {bestLine.sequence.slice(1).map((s, i) => (
                                  <span
                                    key={i}
                                    style={{ cursor: 'pointer', marginRight: 4, transition: 'color 0.1s' }}
                                    onClick={() => {
                                      const subSeq = bestLine.sequence.slice(0, i + 2).map(x => ({ san: x.san, fen: x.fen, eval: null }));
                                      game.loadVariation(subSeq);
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
                                  >
                                    {s.san}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ width: '100%', height: 1, background: 'var(--review-surface-2)', margin: '4px 0' }} />

                    {engineLines.length === 0 && !wasmEngine.isSearching && (
                      <div style={{ fontSize: 13, color: '#777', textAlign: 'center', marginTop: 10 }}>No lines available.</div>
                    )}
                    {(() => {
                      const playedMoveCls = game.currentMoveData?.classification?.toLowerCase() || '';
                      const playedIsBest = !game.isVariation && ['best move', 'excellent', 'brilliant', 'great find'].includes(playedMoveCls);

                      return engineLines.slice(playedIsBest ? 1 : 0).map((line, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 8px', height: 26, background: 'rgba(0,0,0,0.14)', borderRadius: 3, marginBottom: 2 }}>
                          <div style={{
                            width: 45, height: 20, borderRadius: 3, display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                            background: line.evaluation > 0 ? '#fff' : '#312e2b',
                            color: line.evaluation > 0 ? '#312e2b' : '#fff'
                          }}>
                            {(() => {
                              if (Math.abs(line.evaluation) >= 9900) return (line.evaluation > 0 ? 'M' : '-M') + (10000 - Math.abs(line.evaluation));
                              return (line.evaluation > 0 ? '+' : '') + (line.evaluation / 100).toFixed(2);
                            })()}
                          </div>
                          <div style={{
                            flex: 1, color: 'rgba(255,255,255,0.85)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Helvetica, Arial, sans-serif', fontSize: 13,
                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
                          }}>
                            {line.sequence.map((step, k) => (
                              <span
                                key={k}
                                style={{ cursor: 'pointer', marginRight: 4, transition: 'color 0.1s' }}
                                onClick={() => {
                                  const subSeq = line.sequence.slice(0, k + 1).map(s => ({ san: s.san, fen: s.fen, eval: null }));
                                  game.loadVariation(subSeq);
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
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
            background: 'var(--review-bg)', padding: '16px 20px', borderTop: '1px solid var(--review-border-strong)',
            flexShrink: 0, boxSizing: 'border-box', width: '100%', zIndex: 10
          }}>
            {showReport ? (
              <button
                onClick={() => setShowReport(false)}
                style={{
                  width: '100%',
                  background: 'var(--color-green)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '16px', fontSize: 18, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  boxShadow: '0 4px 0 var(--color-green-shadow)', transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = '0 2px 0 var(--color-green-shadow)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 var(--color-green-shadow)'; }}
              >
                <i className="fas fa-search"></i>
                START REVIEW
              </button>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                {[
                  { icon: 'fa-fast-backward', title: 'First', action: () => navGoTo(0) },
                  { icon: 'fa-step-backward', title: 'Prev', action: () => { setIsPlaying(false); const r = game.prevMove(); if (r !== 'noop') sounds.playUndo(); } },
                  { icon: isPlaying ? 'fa-pause' : 'fa-play', title: isPlaying ? 'Pause' : 'Play', action: () => setIsPlaying(!isPlaying), isPlayButton: true },
                  { icon: 'fa-step-forward', title: 'Next', action: () => { setIsPlaying(false); const san = game.nextMove(); if (san) sounds.playMove(san); } },
                  { icon: 'fa-fast-forward', title: 'Last', action: () => navGoTo(game.mainFens.length - 1) },
                  { icon: 'fa-retweet', title: 'Flip', action: game.flipBoard, ml: 12 },
                ].map(({ icon, title, action, ml, isPlayButton }) => (
                  <button key={icon} onClick={action} title={title} style={{
                    background: isPlayButton ? 'var(--color-green)' : 'none',
                    border: 'none',
                    color: isPlayButton ? '#fff' : 'var(--review-text-dim)',
                    fontSize: isPlayButton ? 18 : 20,
                    cursor: 'pointer',
                    padding: isPlayButton ? '12px 18px' : '8px 12px',
                    borderRadius: isPlayButton ? 8 : 4,
                    transition: 'all 0.15s ease',
                    marginLeft: ml,
                    boxShadow: isPlayButton ? '0 4px 0 var(--color-green-shadow)' : 'none',
                    transform: 'translateY(0)',
                  }}
                    onMouseEnter={e => { if (isPlayButton) e.currentTarget.style.filter = 'brightness(1.1)'; else e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { if (isPlayButton) e.currentTarget.style.filter = 'none'; else e.currentTarget.style.color = 'var(--review-text-dim)'; }}
                    onMouseDown={e => { if (isPlayButton) { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = '0 2px 0 var(--color-green-shadow)'; } }}
                    onMouseUp={e => { if (isPlayButton) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 0 var(--color-green-shadow)'; } }}
                  >
                    <i className={`fas ${icon}`}></i>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div >

      {/* ── Board / Piece Customize Modal ──────────────────────────────────── */}
      {
        showCustomModal && (
          <div onClick={() => setShowCustomModal(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--review-bg-2)', border: '1px solid var(--review-border-strong)', borderRadius: 14,
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
        )
      }
    </>
  );
}

// ── Shared micro-styles ────────────────────────────────────────────────────
const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)', border: '1px solid var(--review-border-strong)',
  borderRadius: 6, color: '#ccc', padding: '4px 8px', cursor: 'pointer',
  fontSize: 12, transition: 'background 0.2s,color 0.2s',
};
const arrowToggleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  fontSize: 13, color: '#ddd', padding: '5px 0', userSelect: 'none',
};
