import os
import sys

# 1. Fix para PyInstaller --windowed / --noconsole onde sys.stdin, sys.stdout, sys.stderr são None
class DummyStream:
    def write(self, data):
        pass
    def flush(self):
        pass
    def isatty(self):
        return False
    def readline(self):
        return ""

if sys.stdin is None:
    sys.stdin = DummyStream()
if sys.stdout is None:
    sys.stdout = DummyStream()
if sys.stderr is None:
    sys.stderr = DummyStream()

# Ensure root directory is on sys.path for PyInstaller bundle resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import socket
import webbrowser
import threading
import time
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
        print(f"Erro ao abrir o navegador automaticamente: {e}")
        print(f"Por favor abra manualmente no seu navegador: {url}")

if __name__ == "__main__":
    port = find_available_port(8000)
    
    print("=" * 65)
    print(" MassEdit POS - Edição em Massa Segura de Artigos v1.0 (Portátil)")
    print(f" Servidor a arrancar em http://127.0.0.1:{port}")
    print("=" * 65)
    
    # Arrancar navegador em thread separada
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    
    # Configurar uvicorn logging sem cores para evitar erros de isatty/NoneType em modo windowed
    uvicorn_log_config = uvicorn.config.LOGGING_CONFIG.copy()
    if "formatters" in uvicorn_log_config:
        if "default" in uvicorn_log_config["formatters"]:
            uvicorn_log_config["formatters"]["default"]["use_colors"] = False
        if "access" in uvicorn_log_config["formatters"]:
            uvicorn_log_config["formatters"]["access"]["use_colors"] = False

    # Iniciar servidor FastAPI
    try:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            reload=False,
            log_level="info",
            log_config=uvicorn_log_config
        )
    except Exception as e:
        print("\n" + "!" * 65)
        print(f" ERRO AO INICIAR SERVIDOR: {e}")
        print("!" * 65)
        if sys.stdin and not isinstance(sys.stdin, DummyStream):
            try:
                input("\nPressione ENTER para fechar esta janela...")
            except Exception:
                pass
        else:
            time.sleep(5)

