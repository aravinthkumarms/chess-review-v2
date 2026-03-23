from pydantic import BaseModel
from typing import Optional, List

class EvalRequest(BaseModel):
    fen: str
    depth: int = 18
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
    depth: int = 18

class MoveResult(BaseModel):
    san: str
    uci: str
    fen: str
    fenBefore: str
    evaluation: int
    cpLoss: int
    wpl: float
    classification: str
    bestMoveUci: Optional[str] = None
    clock: Optional[str] = None
    isWhite: bool
    moveNumber: int
    isOnlyMove: bool = False
    isSacrifice: bool = False
    phase: str = "opening"

class PhaseAccuracy(BaseModel):
    opening: Optional[float] = None
    middlegame: Optional[float] = None
    endgame: Optional[float] = None

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
    whitePhaseAccuracy: PhaseAccuracy
    blackPhaseAccuracy: PhaseAccuracy
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
