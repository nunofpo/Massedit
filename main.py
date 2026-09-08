import os
import sys
import webbrowser
import threading
import time
import uvicorn
from backend.app import app

def open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    print("=" * 60)
    print(" MassEdit POS - Edicao em Massa Segura de Artigos v1.0 (Portatil)")
    print(" Servidor a arrancar em http://localhost:8000")
    print("=" * 60)
    
    # Arrancar navegador em thread separada
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Iniciar servidor FastAPI passando diretamente a instancia app
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
