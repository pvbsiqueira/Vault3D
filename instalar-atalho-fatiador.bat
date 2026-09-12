@echo off
title Configurar Atalho Direto para Fatiador - Vault3D
echo ========================================================
echo   Vault3D - Ativando Abertura Direta no Fatiador (1 Clique)
echo ========================================================
echo.
echo Registrando o protocolo nativo vault3d:// no seu Windows...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$reg = 'HKCU:\Software\Classes\vault3d'; New-Item -Path $reg -Force | Out-Null; Set-ItemProperty -Path $reg -Name '(default)' -Value 'URL:Vault3D Slicer Protocol'; Set-ItemProperty -Path $reg -Name 'URL Protocol' -Value ''; New-Item -Path \"$reg\shell\open\command\" -Force | Out-Null; Set-ItemProperty -Path \"$reg\shell\open\command\" -Name '(default)' -Value '\"%~dp0vault3d-bridge.bat\" \"%%1\"'; Write-Host 'Protocolo vault3d:// registrado com sucesso!' -ForegroundColor Green"

echo.
echo ========================================================
echo   Concluido com sucesso!
echo   Agora, ao clicar em 'Abrir no fatiador' na plataforma
echo   (mesmo em www.vault3d.com.br), o seu modelo 3D sera
echo   aberto automaticamente no fatiador instalado!
echo ========================================================
echo.
pause
