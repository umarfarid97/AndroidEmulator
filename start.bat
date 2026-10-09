@echo off
title Android Emulator and APK Test Studio
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if node_modules exists, install if missing
if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install npm dependencies.
        pause
        exit /b 1
    )
)

:: Check if Studio is already running on port 4567
powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 4567 -State Listen -ErrorAction SilentlyContinue; if ($conn) { exit 42 }"
if %errorlevel% equ 42 (
    echo [INFO] Studio is already running in background.
    start msedge --app="http://localhost:4567" --window-size=1280,860 2>nul || start http://localhost:4567
    exit /b 0
)

:: Launch node server completely hidden in the background (no console window)
echo [INFO] Starting Android Emulator Studio in background...
wscript.exe "%~dp0start-background.vbs"

exit /b 0
