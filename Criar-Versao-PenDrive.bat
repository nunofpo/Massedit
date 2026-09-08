@echo off
title Criar Versao Pen Drive Portable - MassEdit POS
echo ============================================================
echo  A preparar versao Portatil para Pen Drive...
echo ============================================================

cd /d "%~dp0"

if not exist "dist\MassEdit-Portable" (
    echo A compilar a versao standalone com PyInstaller...
    python -m PyInstaller --noconfirm --onedir --name "MassEdit-Portable" --add-data "frontend/dist;frontend/dist" main.py
)

echo.
echo ============================================================
echo  SUCESSO! A pasta 'dist\MassEdit-Portable' contem a versao portatil.
echo  Pode copiar toda a pasta 'MassEdit-Portable' para a sua Pen Drive.
echo  Na Pen Drive, basta dar duplo clique em 'MassEdit-Portable.exe'!
echo ============================================================
pause
