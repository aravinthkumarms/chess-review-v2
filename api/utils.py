import os, re, glob, chess
from typing import Set, Tuple

OPENING_BOOKS: Set[Tuple[str, ...]] = set()

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

class Utility:
    @staticmethod
    def material_balance(board: chess.Board, for_white: bool) -> int:
        PIECE_VALUES = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0}
        w = sum(PIECE_VALUES.get(p.symbol().lower(), 0) for p in board.piece_map().values() if p.color == chess.WHITE)
        b = sum(PIECE_VALUES.get(p.symbol().lower(), 0) for p in board.piece_map().values() if p.color == chess.BLACK)
        return (w - b) if for_white else (b - w)

    @staticmethod
    def extract_clocks(pgn_text: str) -> list[str]:
        return re.findall(r'\[%clk\s+([\d:.]+)\]', pgn_text)
