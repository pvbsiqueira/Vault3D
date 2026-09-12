@echo off
title Vault3D
echo ====================================================
echo   Iniciando Vault3D no seu navegador...
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
