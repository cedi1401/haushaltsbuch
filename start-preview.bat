@echo off
title Haushaltsbuch - Start
cd /d "%~dp0"
echo ===========================================
echo Ordner: %CD%
echo ===========================================
echo.

where npm
echo.

echo Starte Build...
call npm run build
echo.
echo Build fertig (oder Fehler oben). Druecke eine Taste...
pause

echo Starte Preview...
call npm run preview -- --host localhost --port 4173 --strictPort
echo.
pause