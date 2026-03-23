import chess, chess.engine
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Modular Imports
from api.models import (
    EvalRequest, EvalResponse, PVLine, 
    AnalyzeRequest, AnalyzeResponse
)
from api.utils import load_openings
from api.logic.engine import StockfishManager
from api.logic.classifier import MoveClassifier
from api.logic.analyzer import GameAnalyzer

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Global instances ─────────────────────────────────────────────────────────

load_openings()
_stockfish_manager = StockfishManager()
_move_classifier = MoveClassifier()
_analyzer = GameAnalyzer(_stockfish_manager, _move_classifier)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/py/eval", response_model=EvalResponse)
def evaluate_endpoint(req: EvalRequest):
    try:
        with _stockfish_manager.get_engine() as engine:
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
                return EvalResponse(evaluation=evaluation, bestMove=pv[0].uci() if pv else None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stockfish error: {e}")


@app.post("/api/py/analyze", response_model=AnalyzeResponse)
def analyze_endpoint(req: AnalyzeRequest):
    try:
        return _analyzer.analyze(req.pgn, req.depth)
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(error_msg)
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}\n{error_msg}")


@app.get("/api/py/health")
def health():
    try:
        return {"status": "ok", "stockfish": _stockfish_manager.resolve()}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
