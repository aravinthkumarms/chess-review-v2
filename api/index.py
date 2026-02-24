from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import subprocess, os, shutil, stat, re, io, urllib.request, tarfile
import chess, chess.pgn, chess.engine
import glob, tempfile

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Opening Book ──────────────────────────────────────────────────────────────
OPENING_BOOKS: set[tuple[str, ...]] = set()

def load_openings():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    openings_dir = os.path.join(base_dir, "public", "openings")
    if not os.path.isdir(openings_dir):
        return

    for path in glob.glob(os.path.join(openings_dir, "*.tsv")):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.split('\t')
                if len(parts) >= 3:
                    pgn_str = parts[2].strip()
                    clean_str = re.sub(r'\d+\.+', '', pgn_str)
                    sans_raw = clean_str.split()
                    parsed_sans = tuple(m for m in sans_raw if m not in ("1-0", "0-1", "1/2-1/2", "*"))
                    for i in range(1, len(parsed_sans) + 1):
                        OPENING_BOOKS.add(parsed_sans[:i])

load_openings()

# Priority: 1. STOCKFISH_PATH env var  2. Downloaded SF18 in temp  3. System PATH

_SF18_URL = "https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-ubuntu-x86-64.tar"
_TMP_DIR = tempfile.gettempdir()
_TMP_BIN = os.path.join(_TMP_DIR, "stockfish_sf18")
_stockfish_path: str | None = None

def _download_and_extract_sf():
    """Download and extract Stockfish 18 if not present."""
    if os.path.isfile(_TMP_BIN):
        return _TMP_BIN

    print(f"Downloading Stockfish 18 to {_TMP_DIR}...")
    tar_path = os.path.join(_TMP_DIR, "sf18.tar")
    try:
        urllib.request.urlretrieve(_SF18_URL, tar_path)
        print("Download complete. Extracting...")
        
        with tarfile.open(tar_path) as tar:
            tar.extractall(path=_TMP_DIR)
            
        # Robust binary search: Find the 'stockfish' binary in the extracted contents
        extracted_binary = None
        for root, dirs, files in os.walk(_TMP_DIR):
            for f in files:
                # The binary is usually 'stockfish' or starts with 'stockfish-ubuntu'
                if (f == "stockfish" or f.startswith("stockfish-ubuntu-x86-64")) and not f.endswith(".tar"):
                    extracted_binary = os.path.join(root, f)
                    break
            if extracted_binary: break

        if extracted_binary:
            if os.path.exists(_TMP_BIN): os.remove(_TMP_BIN)
            shutil.move(extracted_binary, _TMP_BIN)
            os.chmod(_TMP_BIN, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP)
            print(f"Stockfish 18 setup successful: {_TMP_BIN}")
        
        if os.path.exists(tar_path): os.unlink(tar_path)
        return _TMP_BIN if os.path.isfile(_TMP_BIN) else None
    except Exception as e:
        print(f"Error setting up Stockfish: {e}")
        return None

def resolve_stockfish() -> str:
    global _stockfish_path
    if _stockfish_path and os.path.isfile(_stockfish_path):
        return _stockfish_path

    env_path = os.getenv("STOCKFISH_PATH")
    if env_path and os.path.isfile(env_path):
        _stockfish_path = env_path
        return _stockfish_path

    # Try runtime download (Vercel compliant)
    sf_path = _download_and_extract_sf()
    if sf_path:
        _stockfish_path = sf_path
        return _stockfish_path

    found = shutil.which("stockfish")
    if found:
        _stockfish_path = found
        return _stockfish_path

    raise RuntimeError(
        "Stockfish not found and runtime download failed. Set STOCKFISH_PATH."
    )


def evaluate_position(engine: chess.engine.SimpleEngine, board: chess.Board, depth: int) -> tuple[int, str | None]:
    """Run a single Stockfish evaluation using chess.engine. Returns (centipawns_from_white, best_move_uci)."""
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=depth))
        score = info.get("score")
        if score is None:
            return 0, None
        
        # Get score from White's perspective (mate is +/- 10000)
        cp = score.white().score(mate_score=10000)
        if cp is None:
            return 0, None
            
        pv = info.get("pv")
        best_move = pv[0].uci() if pv else None
        
        return cp, best_move
    except Exception:
        return 0, None


# ── Classification ────────────────────────────────────────────────────────────

PIECE_VALUES = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0}


def material_balance(board: chess.Board, for_white: bool) -> int:
    w = sum(PIECE_VALUES.get(p.symbol().lower(), 0)
            for p in board.piece_map().values() if p.color == chess.WHITE)
    b = sum(PIECE_VALUES.get(p.symbol().lower(), 0)
            for p in board.piece_map().values() if p.color == chess.BLACK)
    return (w - b) if for_white else (b - w)


import math

def win_prob(cp: int) -> float:
    """Map centipawns to win probability (0.0 to 1.0)."""
    return 1 / (1 + 10**(-cp / 400))


def classify(
    wp_before: float,   
    wp_after: float,    
    wp_start: float,    
    is_sacrifice: bool = False,
    is_only_move: bool = False,
    opponent_blundered: bool = False,
    is_best_uci: bool = False,
    cp_loss: int = 0,
    elo: int = 1500  # Default ELO for context-aware adjustments
) -> str:
    # WPL is difference between best possible WP and achieved WP
    wpl = max(0.0, wp_start - wp_after)
    
    # ── SPECIAL MOVE TYPES ────────────────────────────────────────────────────────

    # Brilliant Move
    if is_sacrifice and wpl <= 0.03:
        # Not losing after (WP >= 0.4)
        # Not already winning before (wp_before < 0.65)
        if wp_before < 0.65 and wp_after >= 0.4:
            return "Brilliant"

    # Great Move
    # Losing -> Equal: we use 0.4 and 0.5 as markers for ~500 rating
    losing_to_equal = (wp_before < 0.4 and wp_after >= 0.48)
    # Equal -> Winning: we use 0.5 and 0.7 as markers
    equal_to_winning = (wp_before < 0.6 and wp_after >= 0.7)
    # Finding only good move in difficult position
    only_good_move = is_only_move and wpl <= 0.02 and wp_before < 0.6

    if losing_to_equal or equal_to_winning or only_good_move:
        # Ensure it's the best move (wpl == 0) or nearly best
        if wpl <= 0.01:
            return "Great"

    # Miss: Failing to capitalize on opponent mistake or missing winning opportunity
    # If wp_start indicated a win was possible (>0.65) but move led to equal/worse (<0.5)
    if wp_start > 0.65 and wp_after < 0.5 and wpl > 0.1:
        return "Miss"

    # ── STANDARD CLASSIFICATIONS ──────────────────────────────────────────────────

    # Best: Absolute best or zero loss
    if wpl < 0.0001 or is_best_uci:
        return "Best"

    if wpl <= 0.02:
        return "Excellent"
    if wpl <= 0.05:
        return "Good"
    if wpl <= 0.10:
        return "Inaccuracy"
    if wpl <= 0.20:
        return "Mistake"
    
    return "Blunder"
    


def extract_clocks(pgn_text: str) -> list[str]:
    return re.findall(r'\[%clk\s+([\d:.]+)\]', pgn_text)


# ── Request / Response models ─────────────────────────────────────────────────

class EvalRequest(BaseModel):
    fen: str
    depth: int = 10
    normalise_flag: bool = True
    multipv: int = 1


class PVLine(BaseModel):
    evaluation: int
    moves: list[str]


class EvalResponse(BaseModel):
    evaluation: int
    bestMove: str | None = None
    pvLines: list[PVLine] | None = None


class AnalyzeRequest(BaseModel):
    pgn: str
    depth: int = 10


class MoveResult(BaseModel):
    san: str
    uci: str
    fen: str
    fenBefore: str
    evaluation: int
    cpLoss: int
    classification: str
    bestMoveUci: Optional[str] = None
    clock: Optional[str] = None
    isWhite: bool
    moveNumber: int


class ClassificationCount(BaseModel):
    brilliant: int = 0
    great: int = 0
    best: int = 0
    excellent: int = 0
    good: int = 0
    book: int = 0
    inaccuracy: int = 0
    mistake: int = 0
    miss: int = 0
    blunder: int = 0

class AnalyzeResponse(BaseModel):
    pgn: str
    accuracy: float
    whiteAccuracy: float
    blackAccuracy: float
    whiteRating: int = 0
    blackRating: int = 0
    whiteClassifications: ClassificationCount
    blackClassifications: ClassificationCount
    whitePlayer: str
    blackPlayer: str
    whiteElo: str
    blackElo: str
    timeControl: str
    moves: List[MoveResult]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/py/eval", response_model=EvalResponse)
def evaluate(req: EvalRequest):
    try:
        binary = resolve_stockfish()
        with chess.engine.SimpleEngine.popen_uci(binary) as engine:
            board = chess.Board(req.fen)
            
            info = engine.analyse(board, chess.engine.Limit(depth=req.depth), multipv=req.multipv)
            
            if isinstance(info, list):
                pv_lines = []
                for line in info:
                    score = line.get("score")
                    cp = score.white().score(mate_score=10000) if score else 0
                    evaluation = cp if req.normalise_flag or board.turn == chess.WHITE else -cp
                    pv_moves = [m.uci() for m in line.get("pv", [])]
                    pv_lines.append(PVLine(evaluation=evaluation, moves=pv_moves))
                
                return EvalResponse(
                    evaluation=pv_lines[0].evaluation if pv_lines else 0,
                    bestMove=pv_lines[0].moves[0] if pv_lines and pv_lines[0].moves else None,
                    pvLines=pv_lines
                )
            else:
                score = info.get("score")
                cp = score.white().score(mate_score=10000) if score else 0
                evaluation = cp if req.normalise_flag or board.turn == chess.WHITE else -cp
                pv = info.get("pv")
                best_move = pv[0].uci() if pv else None
                return EvalResponse(evaluation=evaluation, bestMove=best_move)
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stockfish error: {e}")


@app.post("/api/py/analyze", response_model=AnalyzeResponse)
def analyze_game(req: AnalyzeRequest):
    """
    Full game analysis: parses PGN, evaluates every position with Stockfish,
    classifies each move (Brilliant / Best / Good / Inaccuracy / Blunder …),
    returns complete move list ready for the result page.
    """
    try:
        game = chess.pgn.read_game(io.StringIO(req.pgn))
        if not game:
            raise HTTPException(status_code=400, detail="Could not parse PGN")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PGN parse error: {e}")

    headers     = game.headers
    white_player = headers.get("White", "White")
    black_player = headers.get("Black", "Black")
    white_elo   = headers.get("WhiteElo", "?")
    black_elo   = headers.get("BlackElo", "?")
    time_control = headers.get("TimeControl", "—")
    clocks      = extract_clocks(req.pgn)

    # Collect moves + FENs
    board = chess.Board()
    moves_list: list[chess.Move] = list(game.mainline_moves())
    fens: list[str] = [board.fen()]
    sans: list[str] = []
    ucis: list[str] = []
    is_whites: list[bool] = []

    for mv in moves_list:
        is_whites.append(board.turn == chess.WHITE)
        sans.append(board.san(mv))
        ucis.append(mv.uci())
        board.push(mv)
        fens.append(board.fen())

    # Evaluate every position using a single engine instance
    evals: list[tuple[int, str | None, list[int]]] = []
    try:
        binary = resolve_stockfish()
        with chess.engine.SimpleEngine.popen_uci(binary) as engine:
            for fen in fens:
                try:
                    board = chess.Board(fen)
                    # Use MultiPV to detect "Only Moves"
                    info = engine.analyse(board, chess.engine.Limit(depth=req.depth), multipv=3)
                    if isinstance(info, list):
                        top_cp = info[0].get("score").white().score(mate_score=10000) or 0
                        bm = info[0].get("pv")[0].uci() if info[0].get("pv") else None
                        others = []
                        for i in range(1, len(info)):
                            others.append(info[i].get("score").white().score(mate_score=10000) or 0)
                        evals.append((top_cp, bm, others))
                    else:
                        cp = info.get("score").white().score(mate_score=10000) or 0
                        pv = info.get("pv")
                        evals.append((cp, pv[0].uci() if pv else None, []))
                except Exception:
                    evals.append((0, None, []))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine init failed: {e}")

    # Classify moves
    results: list[MoveResult] = []
    
    white_metrics = {"total_wpl": 0, "count": 0, "cls": ClassificationCount()}
    black_metrics = {"total_wpl": 0, "count": 0, "cls": ClassificationCount()}

    for i in range(len(moves_list)):
        is_white = is_whites[i]
        best_cp_before, bm_before, alt_evals = evals[i]
        actual_cp_after,  _, _               = evals[i + 1]
        
        # Win Probabilities relative to the current mover
        wp_start = win_prob(best_cp_before if is_white else -best_cp_before)
        wp_after = win_prob(actual_cp_after if is_white else -actual_cp_after)
        
        # Opponent blundered on turn i-1?
        opponent_blundered = False
        if i > 0:
            prev_is_white = not is_white
            prev_best_cp, _, _ = evals[i-1]
            prev_actual_cp = best_cp_before
            prev_cp_loss = max(0, prev_best_cp - prev_actual_cp if prev_is_white else prev_actual_cp - prev_best_cp)
            if prev_cp_loss > 160: # Opponent lost > 1.6 pawns
                opponent_blundered = True

        # Only Move detection (Best move is significantly better than any alternative)
        is_only_move = False
        if alt_evals:
            best_alt_wp = win_prob(alt_evals[0] if is_white else -alt_evals[0])
            if (wp_start - best_alt_wp) > 0.25: # Best move is >25% better than 2nd best
                is_only_move = True

        # Sacrifice detection
        is_sacrifice = False
        mat_before = material_balance(chess.Board(fens[i]), is_white)
        mat_after = material_balance(chess.Board(fens[i+1]), is_white)
        if mat_after < mat_before:
            is_sacrifice = True

        # Centipawn loss (for legacy accuracy calculation)
        cp_loss = max(0, best_cp_before - actual_cp_after if is_white else actual_cp_after - best_cp_before)

        classification = classify(
            wp_before=wp_start,
            wp_after=wp_after,
            wp_start=wp_start,
            is_sacrifice=is_sacrifice,
            is_only_move=is_only_move,
            opponent_blundered=opponent_blundered,
            is_best_uci=(ucis[i] == bm_before),
            cp_loss=cp_loss,
            elo=int(white_elo if is_white else black_elo) if (white_elo.isdigit() and black_elo.isdigit()) else 1500
        )
        
        # --- Book move detection ---
        current_line = tuple(sans[:i + 1])
        if current_line in OPENING_BOOKS:
            classification = "Book"

        m = white_metrics if is_white else black_metrics
        
        # Only count non-book moves for accuracy
        if classification != "Book":
            # Recalculate WPL for accuracy tracking
            wpl = max(0, wp_start - wp_after)
            m["total_wpl"] += wpl
            m["count"] += 1
        
        cls_key = classification.lower().replace(" ", "")
        current_val = getattr(m["cls"], cls_key)
        setattr(m["cls"], cls_key, current_val + 1)

        show_best = classification in ("Inaccuracy", "Mistake", "Miss", "Blunder", "Great", "Excellent")
        best_move_uci = bm_before if show_best else None

        results.append(MoveResult(
            san=sans[i],
            uci=ucis[i],
            fen=fens[i + 1],
            fenBefore=fens[i],
            evaluation=actual_cp_after,
            cpLoss=cp_loss,
            classification=classification,
            bestMoveUci=best_move_uci,
            clock=clocks[i] if i < len(clocks) else None,
            isWhite=is_white,
            moveNumber=i // 2 + 1,
        ))

    def calc_acc(total_wpl, count):
        if count == 0: return 100.0
        avg_wpl = total_wpl / count
        # Chess.com-like exponential decay accuracy
        # k=8.5 tuned for ~72% accuracy at ~500 rating
        acc = 100.0 * math.exp(-8.5 * avg_wpl)
        return max(0.0, min(100.0, acc))

    def estimate_rating(acc: float) -> int:
        if acc >= 95: return int(2200 + (acc - 95) * 120)
        if acc >= 85: return int(1500 + (acc - 85) * 70)
        if acc >= 70: return int(850 + (acc - 70) * 44)
        if acc >= 50: return int(400 + (acc - 50) * 22.5)
        return int(acc * 8)

    white_acc = calc_acc(white_metrics["total_wpl"], white_metrics["count"])
    black_acc = calc_acc(black_metrics["total_wpl"], black_metrics["count"])
    overall_acc = (white_acc + black_acc) / 2

    return AnalyzeResponse(
        pgn=req.pgn,
        accuracy=overall_acc,
        whiteAccuracy=white_acc,
        blackAccuracy=black_acc,
        whiteRating=estimate_rating(white_acc),
        blackRating=estimate_rating(black_acc),
        whiteClassifications=white_metrics["cls"],
        blackClassifications=black_metrics["cls"],
        whitePlayer=white_player,
        blackPlayer=black_player,
        whiteElo=white_elo,
        blackElo=black_elo,
        timeControl=time_control,
        moves=results,
    )


@app.get("/api/py/health")
def health():
    try:
        path = resolve_stockfish()
        return {"status": "ok", "stockfish": path}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
