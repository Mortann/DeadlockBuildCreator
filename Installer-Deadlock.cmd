@echo off
setlocal DisableDelayedExpansion
title Installation Deadlock Atelier
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node.exe -e "if(Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if errorlevel 1 goto missing_node
set "DEADLOCK_BOOTSTRAP_DIR=%TEMP%\DeadlockAtelierBootstrap"
if not exist "%DEADLOCK_BOOTSTRAP_DIR%" mkdir "%DEADLOCK_BOOTSTRAP_DIR%"
if errorlevel 1 goto failed
echo Recuperation de l'installateur depuis GitHub...
node.exe --use-env-proxy --input-type=module -e "import {writeFile,rename} from 'node:fs/promises';import{join}from'node:path';try{const r=await fetch('https://raw.githubusercontent.com/Mortann/DeadlockBuildCreator/codex/deadlock-build-lab/scripts/windows-install.mjs',{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('GitHub : '+r.status);const p=join(process.env.DEADLOCK_BOOTSTRAP_DIR,'windows-install.mjs');await writeFile(p+'.tmp',await r.text());await rename(p+'.tmp',p)}catch(e){console.error(e.message);process.exitCode=1}"
if errorlevel 1 goto failed
node.exe --use-env-proxy "%DEADLOCK_BOOTSTRAP_DIR%\windows-install.mjs"
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Installez Node.js 24 ou plus recent, puis relancez ce fichier.
start "" "https://nodejs.org/fr/download"
pause
exit /b 1
:failed
echo.
echo L'installation a echoue. Vos fichiers et donnees sont conserves.
echo Verifiez votre connexion et le message affiche au-dessus, puis relancez.
pause
exit /b 1
