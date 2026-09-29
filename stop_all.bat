@echo off
title Kill All Sonar System Ports
color 0C
echo ========================================================================
echo   SHUTTING DOWN ALL SONAR SYSTEM SERVICES AND CLOSING ALL PORTS
echo ========================================================================
echo.
echo Scanning and terminating processes on ports 8000, 3000, 3001...
echo.

:: Use PowerShell to kill processes bound to ports 8000, 3000, 3001
powershell -Command "Get-NetTCPConnection -LocalPort 8000, 3000, 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Fallback using netstat / taskkill
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 :3000 :3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul

echo.
echo ========================================================================
echo   [SUCCESS] All ports (8000, 3000, 3001) closed successfully!
echo ========================================================================
echo.
ping -n 3 127.0.0.1 >nul
