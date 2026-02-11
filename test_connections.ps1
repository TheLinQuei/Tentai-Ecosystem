#!/usr/bin/env pwsh

Write-Host "`n=== System Audit ===" -ForegroundColor Cyan

# Test 1: Check Vi on 3100
Write-Host "`n[1] Testing Vi Core on 3100..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3100/health" -UseBasicParsing -TimeoutSec 2
    Write-Host "✓ Vi Core RESPONSIVE on 3100: Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "✗ Vi Core NOT RESPONSIVE on 3100: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Check Sovereign on 3001
Write-Host "`n[2] Testing Sovereign on 3001..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" -UseBasicParsing -TimeoutSec 2
    Write-Host "✓ Sovereign RESPONSIVE on 3001: Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "✗ Sovereign NOT RESPONSIVE on 3001: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check running processes
Write-Host "`n[3] Running Node processes:" -ForegroundColor Yellow
$processes = Get-Process -Name node,npm -ErrorAction SilentlyContinue
if ($processes) {
    $processes | Select-Object Id, Name, @{N='Memory(MB)';E={[math]::Round($_.WorkingSet / 1MB)}} | Format-Table
} else {
    Write-Host "No Node/npm processes found!" -ForegroundColor Red
}

# Test 4: Check listening ports
Write-Host "`n[4] Checking listening ports..." -ForegroundColor Yellow
$ports = @(3001, 3100, 3200)
foreach ($port in $ports) {
    try {
        $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop 2>&1
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "  Port $port : LISTENING (PID: $($connection.OwningProcess))" -ForegroundColor Green
    } catch {
        Write-Host "  Port $port : NOT LISTENING" -ForegroundColor Yellow
    }
}

Write-Host "`n=== End Audit ===" -ForegroundColor Cyan

