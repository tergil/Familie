@echo off
rem Starter familiebudsjettet lokalt på http://localhost:5180 og åpner nettleseren.
cd /d "%~dp0"
if not exist node_modules (
  echo Henter avhengigheter ...
  call npm install
)
rem Kjører den allerede? Da åpner vi bare nettleseren.
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5180).Content -match 'Familiebudsjett') { exit 0 } } catch { }; exit 1"
if %errorlevel%==0 (
  start "" http://localhost:5180
  exit /b
)
call npm run dev
