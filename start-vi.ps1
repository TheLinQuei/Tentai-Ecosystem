# Start Vi Backend
# This script ensures Vi backend is always running on port 3000

Write-Host "🚀 Starting Vi Backend..." -ForegroundColor Cyan

# Kill any existing process on port 3000
Write-Host "Checking for existing backend..." -ForegroundColor Yellow
$existingProcess = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique

if ($existingProcess) {
    Write-Host "⚠️  Found existing process on port 3000 (PID: $existingProcess)" -ForegroundColor Yellow
    Write-Host "   Stopping it..." -ForegroundColor Yellow
    Stop-Process -Id $existingProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✅ Old process stopped" -ForegroundColor Green
}

# Navigate to Vi directory
Set-Location "e:\Tentai Ecosystem\core\vi"

# Start backend
Write-Host "🔧 Starting Vi backend server..." -ForegroundColor Cyan
Write-Host "   Port: 3000" -ForegroundColor Gray
Write-Host "   Database: localhost:5432" -ForegroundColor Gray
Write-Host "" 

# Run in current terminal (not background) so you can see logs
npm run dev
