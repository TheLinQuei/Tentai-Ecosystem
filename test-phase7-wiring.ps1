# Phase 7 Client Identity Wiring Test
# Tests cross-client identity continuity across Sovereign and Astralis

Write-Host "=== Phase 7 Client Identity Wiring Test ===" -ForegroundColor Cyan
Write-Host ""

# Check if Vi is running
Write-Host "Checking Vi server..." -ForegroundColor Yellow
$viRunning = Test-NetConnection -ComputerName localhost -Port 3300 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $viRunning) {
    Write-Host "❌ Vi server not running on port 3300" -ForegroundColor Red
    Write-Host "Start Vi with: cd core/vi && npm run dev" -ForegroundColor Gray
    exit 1
}
Write-Host "✓ Vi server running" -ForegroundColor Green

# Check if Sovereign is running
Write-Host "Checking Sovereign server..." -ForegroundColor Yellow
$sovereignRunning = Test-NetConnection -ComputerName localhost -Port 3200 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $sovereignRunning) {
    Write-Host "⚠ Sovereign server not running on port 3200" -ForegroundColor Yellow
    Write-Host "Start Sovereign with: cd clients/command/sovereign && npm start" -ForegroundColor Gray
} else {
    Write-Host "✓ Sovereign server running" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Test 1: Sovereign Chat with Identity Headers ===" -ForegroundColor Cyan

# Create test user identity
$testUserId = "test-sovereign-user-$(Get-Random -Maximum 99999)"
Write-Host "Test User ID: $testUserId" -ForegroundColor Gray

# Send chat message with identity headers
$chatBody = @{
    message = "Hello Vi, remember that I prefer concise responses"
} | ConvertTo-Json

$chatHeaders = @{
    'Content-Type' = 'application/json'
    'x-provider' = 'sovereign'
    'x-provider-user-id' = $testUserId
    'x-client-id' = 'sovereign'
}

Write-Host "Sending chat message to Vi..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3300/v1/chat" `
        -Method POST `
        -Headers $chatHeaders `
        -Body $chatBody `
        -ErrorAction Stop

    Write-Host "✓ Chat response received" -ForegroundColor Green
    Write-Host "Response: $($response.reply)" -ForegroundColor Gray
    
    # Check if identity was resolved
    if ($response.metadata -and $response.metadata.vi_user_id) {
        Write-Host "✓ Vi User ID: $($response.metadata.vi_user_id)" -ForegroundColor Green
    } else {
        Write-Host "⚠ No vi_user_id in response metadata" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Chat request failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test 2: Astralis Lore Query with Identity Headers ===" -ForegroundColor Cyan

$testAstralisUserId = "test-astralis-user-$(Get-Random -Maximum 99999)"
Write-Host "Test Astralis User ID: $testAstralisUserId" -ForegroundColor Gray

$loreBody = @{
    message = "Who is Aria and what are her powers?"
} | ConvertTo-Json

$loreHeaders = @{
    'Content-Type' = 'application/json'
    'x-provider' = 'astralis'
    'x-provider-user-id' = $testAstralisUserId
    'x-client-id' = 'astralis'
}

Write-Host "Sending lore query to Vi..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3300/v1/chat" `
        -Method POST `
        -Headers $loreHeaders `
        -Body $loreBody `
        -ErrorAction Stop

    Write-Host "✓ Lore response received" -ForegroundColor Green
    Write-Host "Response: $($response.reply)" -ForegroundColor Gray
    
    if ($response.metadata -and $response.metadata.vi_user_id) {
        Write-Host "✓ Vi User ID: $($response.metadata.vi_user_id)" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Lore request failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test 3: Cross-Client Continuity ===" -ForegroundColor Cyan

# Use same provider_user_id from both clients to verify same vi_user_id
$sharedUserId = "shared-test-user-$(Get-Random -Maximum 99999)"
Write-Host "Shared User ID: $sharedUserId" -ForegroundColor Gray

# First chat from Sovereign
Write-Host "Sending preference from Sovereign..." -ForegroundColor Yellow
$sovereignBody = @{
    message = "From now on, be very concise"
} | ConvertTo-Json

$sovereignHeaders = @{
    'Content-Type' = 'application/json'
    'x-provider' = 'sovereign'
    'x-provider-user-id' = $sharedUserId
    'x-client-id' = 'sovereign'
}

try {
    $sovereignResponse = Invoke-RestMethod -Uri "http://localhost:3300/v1/chat" `
        -Method POST `
        -Headers $sovereignHeaders `
        -Body $sovereignBody `
        -ErrorAction Stop

    $sovereignViUserId = $sovereignResponse.metadata.vi_user_id
    Write-Host "✓ Sovereign Vi User ID: $sovereignViUserId" -ForegroundColor Green
} catch {
    Write-Host "❌ Sovereign request failed: $_" -ForegroundColor Red
    exit 1
}

# Then query from Astralis with same user
Write-Host "Sending query from Astralis with same user..." -ForegroundColor Yellow
$astralisBody = @{
    message = "What is your current interaction mode?"
} | ConvertTo-Json

$astralisHeaders = @{
    'Content-Type' = 'application/json'
    'x-provider' = 'astralis'
    'x-provider-user-id' = $sharedUserId
    'x-client-id' = 'astralis'
}

try {
    $astralisResponse = Invoke-RestMethod -Uri "http://localhost:3300/v1/chat" `
        -Method POST `
        -Headers $astralisHeaders `
        -Body $astralisBody `
        -ErrorAction Stop

    $astralisViUserId = $astralisResponse.metadata.vi_user_id
    Write-Host "✓ Astralis Vi User ID: $astralisViUserId" -ForegroundColor Green
    
    # Verify same vi_user_id
    if ($sovereignViUserId -eq $astralisViUserId) {
        Write-Host "✓ CROSS-CLIENT CONTINUITY VERIFIED!" -ForegroundColor Green
        Write-Host "  Same vi_user_id across Sovereign and Astralis" -ForegroundColor Green
    } else {
        Write-Host "❌ CONTINUITY BROKEN!" -ForegroundColor Red
        Write-Host "  Sovereign: $sovereignViUserId" -ForegroundColor Red
        Write-Host "  Astralis: $astralisViUserId" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Astralis request failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
