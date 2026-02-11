# Quick Health Check - Tests all Tentai services

Write-Host "`n🏥 Tentai Ecosystem Health Check" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$allHealthy = $true

# 1. Check Local Backend
Write-Host "1️⃣  Local Backend (localhost:3000)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri http://localhost:3000/v1/health -TimeoutSec 3 -ErrorAction Stop
    Write-Host "   ✅ Online ($($response.StatusCode))" -ForegroundColor Green
    
    # Test chat
    $chatBody = '{"message":"ping"}' 
    $chatResponse = Invoke-WebRequest -Uri http://localhost:3000/v1/chat -Method POST -Body $chatBody -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   ✅ Chat working ($($chatResponse.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Down: $($_.Exception.Message)" -ForegroundColor Red
    $allHealthy = $false
}

# 2. Check Database
Write-Host "`n2️⃣  PostgreSQL Database (localhost:5432)" -ForegroundColor Yellow
$dbProcess = Get-Process -Name postgres -ErrorAction SilentlyContinue
if ($dbProcess) {
    Write-Host "   ✅ Running (PID: $($dbProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Not detected (may be running in Docker)" -ForegroundColor Yellow
}

# 3. Check Console
Write-Host "`n3️⃣  Vi Console (tentaitech.com/console)" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri https://tentaitech.com/console/ -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ Online ($($response.StatusCode))" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Down: $($_.Exception.Message)" -ForegroundColor Red
    $allHealthy = $false
}

# 4. Check Railway Deployment
Write-Host "`n4️⃣  Railway Backend" -ForegroundColor Yellow
Write-Host "   ⚠️  Manual check: https://railway.com/project/6b8f45bb-8423-462d-93d3-0705d322713c" -ForegroundColor Yellow

# Summary
Write-Host "`n================================" -ForegroundColor Cyan
if ($allHealthy) {
    Write-Host "✅ All systems operational!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some systems need attention" -ForegroundColor Yellow
}
Write-Host ""
