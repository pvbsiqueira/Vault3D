@echo off
title Vault3D Desktop
set "PATH=C:\Program Files\nodejs;C:\Users\eustudio\.nodejs\node-v22.14.0-win-x64;%PATH%"
cd /d "%~dp0"
echo Iniciando Vault3D Desktop...
call npm start
if %errorlevel% neq 0 (
  echo.
  echo Ocorreu um erro ao executar o aplicativo.
  pause
)
