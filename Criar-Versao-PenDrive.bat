@echo off
setlocal
title Criar Versao Pen Drive Portable - MassEdit POS
cd /d "%~dp0"
echo ============================================================
echo  A preparar versao Portatil para Windows (MassEdit POS)...
echo ============================================================

where npm >nul 2>nul
if errorlevel 1 (
    echo ERRO: Node.js/npm nao encontrado. Instale o Node.js LTS e volte a tentar.
    pause
    exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
    echo ERRO: Python nao encontrado. Instale o Python 3 e volte a tentar.
    pause
    exit /b 1
)

echo.
echo [1/3] A compilar o frontend React/Vite...
pushd frontend
call npm install
if errorlevel 1 goto :erro_frontend
call npm run build
if errorlevel 1 goto :erro_frontend
popd

echo.
echo [2/3] A preparar o ambiente Python (.venv-win)...
if not exist ".venv-win\Scripts\python.exe" (
    python -m venv .venv-win
    if errorlevel 1 goto :erro
)
".venv-win\Scripts\python.exe" -m pip install -q fastapi uvicorn pydantic pyodbc pyinstaller
if errorlevel 1 goto :erro

echo.
echo [3/3] A compilar a aplicacao standalone com PyInstaller...
".venv-win\Scripts\python.exe" -m PyInstaller --noconfirm MassEdit-Portable.spec
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo  SUCESSO! A pasta 'dist\MassEdit-Portable' contem a versao Windows.
echo  Copie toda a pasta 'MassEdit-Portable' para a Pen Drive e
echo  de duplo clique em 'MassEdit-Portable.exe'.
echo ============================================================
pause
exit /b 0

:erro_frontend
popd
:erro
echo.
echo ERRO durante a compilacao. Veja as mensagens acima.
pause
exit /b 1
