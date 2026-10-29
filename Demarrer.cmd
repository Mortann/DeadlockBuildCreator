@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
title Deadlock Atelier
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node.exe -e "if(Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 goto missing_node
node.exe --use-env-proxy --env-file-if-exists=.env "%~dp0scripts\local-launch.mjs"
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Installez Node.js 24 ou plus recent, puis relancez ce fichier.
start "" "https://nodejs.org/fr/download"
pause
exit /b 1
:failed
echo.
echo Le lancement a echoue. Le detail est affiche au-dessus.
pause
exit /b 1
