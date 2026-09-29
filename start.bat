@echo off
title Deep-Sea Rescue Sonar System Controller
color 0B
echo ========================================================================
echo   DEEP-SEA RESCUE SONAR & REALTIME HARDWARE DETECTION CONTROLLER
echo ========================================================================
echo.
echo Initializing all services and activating YOLOv8 model...
echo.

python launch_system.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] An issue occurred while running the controller.
    pause
)
