import math
from api.models import PhaseAccuracy, ClassificationCount

class PlayerMetrics:
    """Tracks and calculates metrics for a single player (White or Black)."""
    
    def __init__(self, elo: int):
        self.elo = elo
        self.total_wpl = 0.0
        self.total_cp = 0
        self.count = 0
        self.cls = ClassificationCount()
        self.phases = {
            "opening": {"wpl": 0.0, "c": 0},
            "middlegame": {"wpl": 0.0, "c": 0},
            "endgame": {"wpl": 0.0, "c": 0}
        }

    def add_move(self, wpl: float, cp_loss: int, classification: str, phase: str):
        cls_key = classification.lower().replace(" ", "")
        current = getattr(self.cls, cls_key, 0)
        setattr(self.cls, cls_key, current + 1)

        if classification == "Book":
            return
            
        self.total_wpl += wpl
        self.total_cp += cp_loss
        self.count += 1
        
        if phase in self.phases:
            self.phases[phase]["wpl"] += wpl
            self.phases[phase]["c"] += 1

    def calculate_accuracy(self, wpl: float = None, count: int = None) -> float:
        wpl = wpl if wpl is not None else self.total_wpl
        count = count if count is not None else self.count
        if count == 0: return 100.0
        
        avg_wpl = wpl / count
        # Calibrated k-factors
        if self.elo < 800: k = 7.5
        elif self.elo < 1600: k = 10.0
        else: k = 11.2
        
        acc = 100.0 * math.exp(-k * avg_wpl)
        return max(0.0, min(100.0, acc))

    def get_phase_accuracies(self) -> PhaseAccuracy:
        res = PhaseAccuracy()
        for p in ["opening", "middlegame", "endgame"]:
            stats = self.phases[p]
            if stats["c"] > 0:
                setattr(res, p, self.calculate_accuracy(stats["wpl"], stats["c"]))
        return res

    def estimate_rating(self) -> int:
        avg_cp = self.total_cp / self.count if self.count > 0 else 0
        if avg_cp <= 0: return 3000
        rating = 3200 * math.exp(-0.035 * avg_cp)
        return max(100, min(3000, int(round(rating, -2))))
