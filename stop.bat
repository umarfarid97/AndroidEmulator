@echo off
title Stop Android Emulator Studio
cd /d "%~dp0"

echo ========================================================
echo   Stopping Android Emulator Studio Background Server...
echo ========================================================
echo.

powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 4567 -State Listen -ErrorAction SilentlyContinue; if ($conn) { $pids = $conn.OwningProcess | Select-Object -Unique; foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }; Write-Host '[SUCCESS] Stopped Studio background server.' -ForegroundColor Green } else { Write-Host '[INFO] No running Studio server found on port 4567.' -ForegroundColor Yellow }"

exit /b 0
