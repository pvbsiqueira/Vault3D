@echo off
title 3D Print Library
echo ====================================================
echo   Iniciando 3D Print Library no seu navegador...
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
