# Android Emulator & APK Test Studio - Silent Background Launcher
Set-Location -Path $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "node_modules")) {
    npm install
}

# Check if already running on port 4567
$running = Get-NetTCPConnection -LocalPort 4567 -State Listen -ErrorAction SilentlyContinue
if ($running) {
    Start-Process msedge -ArgumentList '--app="http://localhost:4567" --window-size=1280,860'
    exit 0
}

# Start node server hidden in the background
Start-Process -FilePath "wscript.exe" -ArgumentList "start-background.vbs" -WindowStyle Hidden
