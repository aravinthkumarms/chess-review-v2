import os, shutil, stat, urllib.request, tarfile, tempfile, chess.engine
from typing import Optional

class StockfishManager:
    """Manages Stockfish engine lifecycle, including downloading and resolution."""
    
    URL = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-ubuntu-x86-64-avx2.tar"
    TMP_DIR = tempfile.gettempdir()
    TMP_BIN = os.path.join(TMP_DIR, "stockfish_sf16")

    def __init__(self):
        self._path: Optional[str] = None

    def resolve(self) -> str:
        """Finds or downloads Stockfish binary."""
        if self._path and os.path.isfile(self._path):
            return self._path
            
        local_windows_exe = os.path.join(os.path.dirname(os.path.dirname(__file__)), "stockfish16.exe")
        if os.path.isfile(local_windows_exe):
            self._path = local_windows_exe
            return self._path

        env_path = os.getenv("STOCKFISH_PATH")
        if env_path and os.path.isfile(env_path):
            self._path = env_path
            return self._path

        sf_path = self._download_and_extract()
        if sf_path:
            self._path = sf_path
            return self._path

        found = shutil.which("stockfish")
        if found:
            self._path = found
            return self._path

        raise RuntimeError("Stockfish not found and runtime download failed. Set STOCKFISH_PATH.")

    def _download_and_extract(self) -> Optional[str]:
        """Download and extract Stockfish 16.1 if not present (Linux Vercel)."""
        if os.path.isfile(self.TMP_BIN):
            return self.TMP_BIN

        print(f"Downloading Stockfish 16.1 to {self.TMP_DIR}...")
        tar_path = os.path.join(self.TMP_DIR, "sf16.tar")
        try:
            urllib.request.urlretrieve(self.URL, tar_path)
            with tarfile.open(tar_path) as tar:
                tar.extractall(path=self.TMP_DIR)
                
            extracted_binary = None
            for root, _, files in os.walk(self.TMP_DIR):
                for f in files:
                    if (f == "stockfish" or f.startswith("stockfish-ubuntu-x86-64")) and not f.endswith(".tar"):
                        extracted_binary = os.path.join(root, f)
                        break
                if extracted_binary: break

            if extracted_binary:
                if os.path.exists(self.TMP_BIN): os.remove(self.TMP_BIN)
                shutil.move(extracted_binary, self.TMP_BIN)
                os.chmod(self.TMP_BIN, stat.S_IRWXU | stat.S_IRGRP | stat.S_IXGRP)
                print(f"Stockfish 16.1 setup successful: {self.TMP_BIN}")
            
            if os.path.exists(tar_path): os.unlink(tar_path)
            return self.TMP_BIN if os.path.isfile(self.TMP_BIN) else None
        except Exception as e:
            print(f"Error setting up Stockfish: {e}")
            return None

    def get_engine(self) -> chess.engine.SimpleEngine:
        return chess.engine.SimpleEngine.popen_uci(self.resolve())
