import os
import sys
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
    
    # Iniciar servidor FastAPI
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, reload=False, log_level="info")
    except Exception as e:
        print("\n" + "!" * 65)
        print(f" ERRO AO INICIAR SERVIDOR: {e}")
        print("!" * 65)
        input("\nPressione ENTER para fechar esta janela...")

