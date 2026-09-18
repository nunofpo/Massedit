import os
import sys
import io
import time
import socket
import webbrowser
import threading
import multiprocessing
import traceback

# Ensure root directory is on sys.path for PyInstaller bundle resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Se estiver empacotado (frozen), escrever os logs na pasta do executável .exe
EXE_DIR = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else BASE_DIR
LOG_FILE = os.path.join(EXE_DIR, "massedit_debug.log")

def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

# Garantir redirecionamento de stdio em modo Windowed/GUI do PyInstaller (sem consola)
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")
if sys.stdin is None:
    sys.stdin = io.StringIO()

import uvicorn
from backend.app import app

def find_available_port(start_port=8000):
    for port in range(start_port, start_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

def open_browser(port):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}"
    try:
        webbrowser.open(url)
    except Exception as e:
        log(f"Erro ao abrir o navegador automaticamente: {e}")

if __name__ == "__main__":
    multiprocessing.freeze_support()
    log("=== A iniciar MassEdit POS ===")
    try:
        port = find_available_port(8000)
        log(f"Porta selecionada: {port}")
        threading.Thread(target=open_browser, args=(port,), daemon=True).start()
        log("A iniciar servidor Uvicorn...")
        uvicorn.run(app, host="127.0.0.1", port=port, reload=False, log_level="info", use_colors=False, log_config=None)
        log("Servidor Uvicorn terminou normalmente.")
    except Exception as e:
        log(f"ERRO EXCEÇÃO: {e}\n{traceback.format_exc()}")
        if sys.stdin and hasattr(sys.stdin, "isatty") and sys.stdin.isatty():
            try:
                input("\nPressione ENTER para fechar esta janela...")
            except Exception:
                pass

