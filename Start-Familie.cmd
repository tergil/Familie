@echo off
rem Starter familiebudsjettet lokalt og åpner nettleseren.
cd /d "%~dp0"
if not exist node_modules (
  echo Henter avhengigheter ...
  call npm install
)
start "" http://localhost:5173
call npm run dev
