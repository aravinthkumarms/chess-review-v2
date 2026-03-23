import io, chess, chess.pgn, chess.engine
from fastapi import HTTPException
from api.models import AnalyzeResponse, MoveResult
from api.utils import Utility, OPENING_BOOKS
from api.logic.engine import StockfishManager
from api.logic.classifier import MoveClassifier
from api.logic.metrics import PlayerMetrics

class GameAnalyzer:
    """Coordinates the full game analysis pipeline."""
    
    def __init__(self, stockfish: StockfishManager, classifier: MoveClassifier):
        self.stockfish = stockfish
        self.classifier = classifier

    def analyze(self, pgn_text: str, depth: int) -> AnalyzeResponse:
        game = self._parse_pgn(pgn_text)
        headers = game.headers
        clocks = Utility.extract_clocks(pgn_text)
        
        moves_list = list(game.mainline_moves())
        board = chess.Board()
        fens = [board.fen()]
        sans, ucis, is_whites = [], [], []
        
        for mv in moves_list:
            is_whites.append(board.turn == chess.WHITE)
            sans.append(board.san(mv))
            ucis.append(mv.uci())
            board.push(mv)
            fens.append(board.fen())

        evals = self._run_engine_batch(fens, depth)
        
        white_elo = headers.get("WhiteElo", "1500")
        black_elo = headers.get("BlackElo", "1500")
        white_metrics = PlayerMetrics(int(white_elo) if white_elo.isdigit() else 1500)
        black_metrics = PlayerMetrics(int(black_elo) if black_elo.isdigit() else 1500)
        
        results = []
        for i in range(len(moves_list)):
            is_white = is_whites[i]
            best_cp_before, bm_before, alt_evals = evals[i]
            actual_cp_after, _, _ = evals[i+1]
            
            wp_start = self.classifier.get_win_prob(best_cp_before if is_white else -best_cp_before)
            wp_after = self.classifier.get_win_prob(actual_cp_after if is_white else -actual_cp_after)
            
            opp_blundered = self._was_opponent_blunder(i, is_white, evals)
            is_only = self._is_only_move(wp_start, is_white, alt_evals)
            is_sac = self._is_sacrifice(i, is_white, fens)
            
            phase = self._get_phase(fens[i], i // 2 + 1)
            cp_best = best_cp_before if is_white else -best_cp_before
            cp_after_mover = actual_cp_after if is_white else -actual_cp_after
            
            cls = self.classifier.classify(
                wp_start, wp_after, wp_start, cp_best, cp_after_mover, cp_best,
                (ucis[i] == bm_before), is_sac, is_only, opp_blundered, phase
            )

            # Book detection
            if tuple(sans[:i+1]) in OPENING_BOOKS:
                cls = "Book"

            m = white_metrics if is_white else black_metrics
            cp_loss = max(0, cp_best - cp_after_mover)
            wpl = max(0.0, wp_start - wp_after) if cls != "Book" else 0.0
            
            m.add_move(wpl, cp_loss, cls, phase)
            
            show_best = cls in ("Inaccuracy", "Mistake", "Miss", "Blunder", "Great", "Excellent")
            results.append(MoveResult(
                san=sans[i], uci=ucis[i], fen=fens[i+1], fenBefore=fens[i],
                evaluation=actual_cp_after, cpLoss=cp_loss, wpl=wpl,
                classification=cls, bestMoveUci=bm_before if show_best else None,
                clock=clocks[i] if i < len(clocks) else None,
                isWhite=is_white, moveNumber=i // 2 + 1,
                isOnlyMove=is_only, isSacrifice=is_sac, phase=phase
            ))

        w_acc = white_metrics.calculate_accuracy()
        b_acc = black_metrics.calculate_accuracy()

        return AnalyzeResponse(
            pgn=pgn_text, accuracy=(w_acc + b_acc) / 2,
            whiteAccuracy=w_acc, blackAccuracy=b_acc,
            whitePhaseAccuracy=white_metrics.get_phase_accuracies(),
            blackPhaseAccuracy=black_metrics.get_phase_accuracies(),
            whiteRating=white_metrics.estimate_rating(),
            blackRating=black_metrics.estimate_rating(),
            whiteClassifications=white_metrics.cls,
            blackClassifications=black_metrics.cls,
            whitePlayer=headers.get("White", "White"), blackPlayer=headers.get("Black", "Black"),
            whiteElo=white_elo, blackElo=black_elo,
            timeControl=headers.get("TimeControl", "—"), moves=results
        )

    def _parse_pgn(self, pgn: str) -> chess.pgn.Game:
        game = chess.pgn.read_game(io.StringIO(pgn))
        if not game: raise HTTPException(status_code=400, detail="Could not parse PGN")
        return game

    def _run_engine_batch(self, fens: list[str], depth: int) -> list[tuple[int, str | None, list[int]]]:
        evals = []
        try:
            with self.stockfish.get_engine() as engine:
                for fen in fens:
                    board = chess.Board(fen)
                    info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=3)
                    if isinstance(info, list):
                        top_cp = info[0].get("score").white().score(mate_score=10000) or 0
                        bm = info[0].get("pv")[0].uci() if info[0].get("pv") else None
                        others = [it.get("score").white().score(mate_score=10000) or 0 for it in info[1:]]
                        evals.append((top_cp, bm, others))
                    else:
                        cp = info.get("score").white().score(mate_score=10000) or 0
                        pv = info.get("pv")
                        evals.append((cp, pv[0].uci() if pv else None, []))
            return evals
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Engine analysis failed: {e}")

    def _was_opponent_blunder(self, i: int, is_white: bool, evals: list) -> bool:
        if i == 0: return False
        prev_is_white = not is_white
        prev_best_cp, _, _ = evals[i-1]
        prev_actual_cp, _, _ = evals[i]
        prev_wp_start = self.classifier.get_win_prob(prev_best_cp if prev_is_white else -prev_best_cp)
        prev_wp_after = self.classifier.get_win_prob(prev_actual_cp if prev_is_white else -prev_actual_cp)
        return (prev_wp_start - prev_wp_after) >= 0.07

    def _is_only_move(self, wp_start: float, is_white: bool, alt_evals: list[int]) -> bool:
        if not alt_evals: return False
        best_alt_wp = self.classifier.get_win_prob(alt_evals[0] if is_white else -alt_evals[0])
        return (wp_start - best_alt_wp) > 0.25

    def _is_sacrifice(self, i: int, is_white: bool, fens: list[str]) -> bool:
        mat_before = Utility.material_balance(chess.Board(fens[i]), is_white)
        if i + 2 < len(fens):
            mat_after = Utility.material_balance(chess.Board(fens[i+2]), is_white)
            return mat_after <= mat_before - 2
        return False

    def _get_phase(self, fen: str, move_num: int) -> str:
        b = chess.Board(fen)
        w_mat = sum({chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}.get(p.piece_type, 0) for p in b.piece_map().values() if p.color == chess.WHITE)
        b_mat = sum({chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}.get(p.piece_type, 0) for p in b.piece_map().values() if p.color == chess.BLACK)
        if w_mat <= 13 and b_mat <= 13: return "endgame"
        return "opening" if move_num <= 12 else "middlegame"
