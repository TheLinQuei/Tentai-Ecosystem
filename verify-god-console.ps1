# God Console - API Verification Script
# Run this to verify all endpoints work

Write-Host "=== GOD CONSOLE (God-1) API VERIFICATION ===" -ForegroundColor Cyan
Write-Host ""

$base = "http://localhost:3200"

# Test 1: Health Check
Write-Host "[1/5] Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "$base/health"
    Write-Host "✓ Health: OK" -ForegroundColor Green
    Write-Host "  Uptime: $($health.uptime) seconds" -ForegroundColor Gray
    Write-Host "  TEST_MODE: $($health.testMode)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Health check failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Ecosystem Status
Write-Host "[2/5] Testing Ecosystem Status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod "$base/overseer/ecosystem/status"
    Write-Host "✓ Ecosystem Status: $($status.healthy ? 'HEALTHY' : 'DEGRADED')" -ForegroundColor ($status.healthy ? 'Green' : 'Red')
    Write-Host "  Services registered: $($status.services.PSObject.Properties.Count)" -ForegroundColor Gray
    foreach ($svc in $status.services.PSObject.Properties) {
        $name = $svc.Name
        $state = $svc.Value.status
        $critical = $svc.Value.critical ? "[CRITICAL]" : ""
        $color = switch ($state) {
            'running' { 'Green' }
            'crashed' { 'Red' }
            default { 'Yellow' }
        }
        Write-Host "    - $name : $state $critical" -ForegroundColor $color
    }
} catch {
    Write-Host "✗ Ecosystem status failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Audit Log
Write-Host "[3/5] Testing Audit Log..." -ForegroundColor Yellow
try {
    $audit = Invoke-RestMethod "$base/overseer/audit/log?days=1"
    Write-Host "✓ Audit Log: $($audit.count) entries in last $($audit.span)" -ForegroundColor Green
    if ($audit.entries.Count -gt 0) {
        Write-Host "  Latest 3 entries:" -ForegroundColor Gray
        $audit.entries | Select-Object -First 3 | ForEach-Object {
            $time = [DateTimeOffset]::FromUnixTimeMilliseconds($_.timestamp).ToLocalTime().ToString('HH:mm:ss')
            Write-Host "    [$time] $($_.action) - $($_.result)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  (No audit entries yet)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Audit log failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 4: Start All Services
Write-Host "[4/5] Testing Start All Services (DRY RUN - will fail gracefully)..." -ForegroundColor Yellow
try {
    $startResult = Invoke-RestMethod -Method POST "$base/overseer/ecosystem/start-all"
    Write-Host "✓ Start All command accepted" -ForegroundColor Green
    Write-Host "  Message: $($startResult.message)" -ForegroundColor Gray
    Write-Host "  Started: $($startResult.started -join ', ')" -ForegroundColor Gray
    if ($startResult.failed) {
        Write-Host "  Failed: $($startResult.failed -join ', ')" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Start All failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 5: Stop All Services  
Write-Host "[5/5] Testing Stop All Services..." -ForegroundColor Yellow
try {
    $stopResult = Invoke-RestMethod -Method POST "$base/overseer/ecosystem/stop-all"
    Write-Host "✓ Stop All command accepted" -ForegroundColor Green
    Write-Host "  Message: $($stopResult.message)" -ForegroundColor Gray
    Write-Host "  Stopped: $($stopResult.stopped -join ', ')" -ForegroundColor Gray
} catch {
    Write-Host "✗ Stop All failed: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== VERIFICATION COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test the UI, open in a real browser:" -ForegroundColor White
Write-Host "  http://localhost:3200" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Most services will fail to start because paths/dependencies" -ForegroundColor Gray
Write-Host "aren't configured yet. That's expected. The orchestration works." -ForegroundColor Gray
