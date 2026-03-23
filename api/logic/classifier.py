class MoveClassifier:
    """Production-grade move classification using WPL and CP metrics."""
    
    @staticmethod
    def get_win_prob(cp: int) -> float:
        return 1 / (1 + 10**(-cp / 400))

    def classify(
        self,
        wp_before: float,
        wp_after: float,
        wp_best: float,
        cp_before: int,
        cp_after: int,
        cp_best: int,
        is_best_move: bool,
        is_sacrifice: bool,
        is_only_move: bool,
        opponent_blundered: bool,
        phase: str,
    ) -> str:
        wpl = max(0.0, wp_best - wp_after)
        was_winning = wp_before >= 0.75
        was_losing  = wp_before <= 0.25

        # 1. Mate Blunder Detection
        if abs(cp_best) >= 9000 and abs(cp_after) < 9000:
            return "Blunder"

        # 2. Brilliant Move
        if (is_sacrifice and is_best_move and not was_winning and wp_after > wp_before and wpl < 0.02):
            return "Brilliant"

        # 3. Great Move
        if (was_losing and wp_after >= 0.45) or \
           (0.40 <= wp_before <= 0.60 and wp_after >= 0.70) or \
           (is_only_move and wp_before <= 0.80):
            return "Great"

        # 4. Missed Win
        if (was_winning and wp_after < 0.65) or (opponent_blundered and wpl > 0.10):
            return "Miss"

        # 5. Standard Buckets (Phase Aware)
        inacc, mistake = self._get_thresholds(phase)

        if wpl <= 0.002: return "Best"
        if wpl <= 0.015: return "Excellent"
        if wpl <= 0.04:  return "Good"
        if wpl <= inacc: return "Inaccuracy"
        if wpl <= mistake: return "Mistake"
        return "Blunder"

    def _get_thresholds(self, phase: str) -> tuple[float, float]:
        if phase == "opening": return 0.06, 0.15
        if phase == "middlegame": return 0.08, 0.22
        return 0.05, 0.12  # endgame
