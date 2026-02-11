# Start Vi Runtime
# This script starts Vi in a new PowerShell window that stays open

param(
    [int]$Port = 3100
)

$env:VI_PORT = $Port
Write-Host "Starting Vi on port $Port..." -ForegroundColor Cyan

# Start in new window that won't close
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$env:VI_PORT='$Port'; node dist/main.js" -WorkingDirectory $PSScriptRoot

Start-Sleep -Seconds 3

# Check if it's running
$connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connection) {
    Write-Host "✓ Vi is running on port $Port" -ForegroundColor Green
    Write-Host "Health endpoint: http://localhost:$Port/v1/health" -ForegroundColor Gray
} else {
    Write-Host "✗ Vi failed to start on port $Port" -ForegroundColor Red
}
