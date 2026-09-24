@echo off
title instagramMoney
cd /d "%~dp0"

echo.
echo   ==========================================
echo      instagramMoney - iniciando...
echo   ==========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] No se encontro Node.js/npm en este equipo.
  echo   Instalalo desde https://nodejs.org y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   Primera ejecucion: instalando dependencias, esto tarda unos minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

echo   Preparando marca instagramMoney...
call node scripts/set-brand.mjs instagramMoney
if errorlevel 1 (
  pause
  exit /b 1
)

echo   Compilando interfaz...
call npm run build
if errorlevel 1 (
  echo.
  echo   [ERROR] Fallo la compilacion.
  pause
  exit /b 1
)

echo   Abriendo la aplicacion...
echo.
call npx electron .

if errorlevel 1 (
  echo.
  echo   [ERROR] La aplicacion se cerro con un error.
  pause
)
