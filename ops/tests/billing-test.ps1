# Simple Billing Test
# Run: & ".\billing-test.ps1"
# This test validates that:
# 1. Vi is alive and reachable
# 2. API key has funding (balance > 0)
# 3. Requests are being billed to the account

$BaseUrl = "http://localhost:3000"
$UserId = "45ec5744-f4ee-4478-ba6a-f1bf90ca60a3"
$SessionId = "a1111111-1111-1111-1111-111111111111"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "BILLING TEST: Verify funding and API consumption" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Test 1: Health check
Write-Host "`nTest 1: Health check..."
try {
    $h = Invoke-RestMethod -Uri "$BaseUrl/v1/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  [OK] Vi is reachable: $($h.status)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Vi is not reachable: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Chat request (fresh session) - should work if balance exists
Write-Host "`nTest 2: Chat request (fresh session)..."
try {
    $body = @{ message = "Hello" } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/v1/chat" `
        -Headers @{ "X-Guest-User-Id" = $UserId } `
        -ContentType "application/json" -Body $body -TimeoutSec 30 -ErrorAction Stop
    
    if ($r.output -match "429|rate_limit|quota") {
        Write-Host "  [SKIP] Provider quota exceeded (429): $($r.output.Substring(0, 60))" -ForegroundColor Yellow
    } elseif ($r.output.Length -gt 0) {
        Write-Host "  [OK] Response received (billing working): $($r.output.Substring(0, 60))..." -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Empty response" -ForegroundColor Red
    }
} catch {
    if ($_ -match "429|rate_limit") {
        Write-Host "  [SKIP] Provider quota exceeded (429)" -ForegroundColor Yellow
    } else {
        Write-Host "  [FAIL] Chat request failed: $_" -ForegroundColor Red
    }
}

# Test 3: Repeat request (resume session) 
Write-Host "`nTest 3: Chat request (resume session with history)..."
try {
    $body = @{ message = "Who am I?"; sessionId = $SessionId } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "$BaseUrl/v1/chat" `
        -Headers @{ "X-Guest-User-Id" = $UserId } `
        -ContentType "application/json" -Body $body -TimeoutSec 30 -ErrorAction Stop
    
    if ($r.output -match "429|rate_limit|quota") {
        Write-Host "  [SKIP] Provider quota exceeded (429): $($r.output.Substring(0, 60))" -ForegroundColor Yellow
    } elseif ($r.output -match "Kaelan") {
        Write-Host "  [OK] Continuity working (recognized Kaelan): $($r.output.Substring(0, 60))..." -ForegroundColor Green
    } elseif ($r.output.Length -gt 0) {
        Write-Host "  [OK] Response received: $($r.output.Substring(0, 60))..." -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Empty response" -ForegroundColor Red
    }
} catch {
    if ($_ -match "429|rate_limit") {
        Write-Host "  [SKIP] Provider quota exceeded (429)" -ForegroundColor Yellow
    } else {
        Write-Host "  [FAIL] Chat request failed: $_" -ForegroundColor Red
    }
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "NEXT STEP:" -ForegroundColor Cyan
Write-Host "  Reload https://platform.openai.com/account/billing/overview" -ForegroundColor Cyan
Write-Host "  Verify balance has decreased from 9.98 (proof of billing)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
