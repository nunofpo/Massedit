#!/bin/bash
set -e

echo "============================================================"
echo " A preparar versão Portátil para macOS (MassEdit POS)..."
echo "============================================================"

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. Compilar Frontend
echo "A compilar o frontend React/Vite..."
cd frontend
npm install
npm run build
cd "$DIR"

# 2. Criar/ativar ambiente Python e instalar dependências
if [ ! -d ".venv" ]; then
    echo "A criar ambiente virtual Python..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q fastapi uvicorn pydantic pyodbc pyinstaller

# 3. Compilar Backend com PyInstaller
echo "A compilar a aplicação standalone com PyInstaller..."
PYINSTALLER_CONFIG_DIR="$DIR/build/pyinstaller_config" pyinstaller --noconfirm MassEdit-Portable.spec

echo ""
echo "============================================================"
echo " SUCESSO! A pasta 'dist/MassEdit-Portable' contém a versão macOS."
echo " Para executar: ./dist/MassEdit-Portable/MassEdit-Portable"
echo "============================================================"
