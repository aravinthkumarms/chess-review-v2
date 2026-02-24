import sys, os
sys.path.append(os.path.join(os.getcwd(), 'api'))
from index import resolve_stockfish

try:
    path = resolve_stockfish()
    print(f"Stockfish resolved to: {path}")
    if os.path.exists(path):
        print("Binary exists and is ready.")
    else:
        print("Binary path returned but file missing!")
except Exception as e:
    import traceback
    print(f"Resolution failed: {e}")
    traceback.print_exc()
