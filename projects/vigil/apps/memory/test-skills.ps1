# Test Memory API Skills Endpoints
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " MEMORY API SKILLS ENDPOINT TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: GET /v1/skills (list all)
Write-Host "[TEST 1] GET /v1/skills" -ForegroundColor Yellow
try {
    $skills = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills" -Method GET
    Write-Host "✅ SUCCESS - Found $($skills.Count) skills" -ForegroundColor Green
    if ($skills.Count -gt 0) {
        $skills | ConvertTo-Json -Depth 3
    }
} catch {
    Write-Host "❌ FAILED - $_" -ForegroundColor Red
}

# Test 2: POST /v1/skills/promote (create a skill)
Write-Host "`n[TEST 2] POST /v1/skills/promote" -ForegroundColor Yellow
$testSkill = @{
    skill = @{
        id = "skill-test-$(Get-Date -Format 'yyyyMMddHHmmss')"
        intent = "test skill for validation"
        pattern = "test-pattern"
        actions = @(
            @{ tool = "message.send"; input = @{ content = "Hello!" } }
        )
        inputs = @("user_message")
        outputs = @("response")
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        lastUsed = (Get-Date).ToUniversalTime().ToString("o")
        metadata = @{ test = $true }
    }
}

try {
    $result = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills/promote" `
        -Method POST `
        -ContentType "application/json" `
        -Body ($testSkill | ConvertTo-Json -Depth 5)
    Write-Host "✅ SUCCESS - Skill promoted: $($result.skillId)" -ForegroundColor Green
    $global:testSkillId = $result.skillId
} catch {
    Write-Host "❌ FAILED - $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
}

# Test 3: GET /v1/skills/:id (get single skill)
if ($global:testSkillId) {
    Write-Host "`n[TEST 3] GET /v1/skills/$global:testSkillId" -ForegroundColor Yellow
    try {
        $skill = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills/$global:testSkillId" -Method GET
        Write-Host "✅ SUCCESS - Retrieved skill" -ForegroundColor Green
        $skill | ConvertTo-Json -Depth 3
    } catch {
        Write-Host "❌ FAILED - $_" -ForegroundColor Red
    }
}

# Test 4: POST /v1/skills/search (vector search)
Write-Host "`n[TEST 4] POST /v1/skills/search" -ForegroundColor Yellow
$searchQuery = @{
    query = "test skill"
    limit = 5
}

try {
    $results = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills/search" `
        -Method POST `
        -ContentType "application/json" `
        -Body ($searchQuery | ConvertTo-Json)
    Write-Host "✅ SUCCESS - Found $($results.Count) similar skills" -ForegroundColor Green
    if ($results.Count -gt 0) {
        Write-Host "Top result similarity: $($results[0].similarity)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ FAILED - $_" -ForegroundColor Red
}

# Test 5: POST /v1/skills/:id/record (execution tracking)
if ($global:testSkillId) {
    Write-Host "`n[TEST 5] POST /v1/skills/$global:testSkillId/record" -ForegroundColor Yellow
    $execution = @{
        success = $true
        latencyMs = 150
    }
    
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills/$global:testSkillId/record" `
            -Method POST `
            -ContentType "application/json" `
            -Body ($execution | ConvertTo-Json)
        Write-Host "✅ SUCCESS - Execution recorded" -ForegroundColor Green
    } catch {
        Write-Host "❌ FAILED - $_" -ForegroundColor Red
    }
}

# Test 6: Verify Postgres table
Write-Host "`n[TEST 6] Verify Postgres skills table" -ForegroundColor Yellow
try {
    docker exec infra-postgres-1 psql -U vibot -d vibot -c "SELECT COUNT(*) as skill_count FROM skills;" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SUCCESS - Postgres skills table exists" -ForegroundColor Green
    } else {
        Write-Host "❌ FAILED - Skills table not found" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ FAILED - $_" -ForegroundColor Red
}

# Test 7: Verify Qdrant collection
Write-Host "`n[TEST 7] Verify Qdrant skills collection" -ForegroundColor Yellow
try {
    $qdrantResponse = Invoke-RestMethod -Uri "http://localhost:6333/collections/skills" -Method GET
    Write-Host "✅ SUCCESS - Qdrant skills collection exists" -ForegroundColor Green
    Write-Host "   Vectors count: $($qdrantResponse.result.points_count)" -ForegroundColor Cyan
    Write-Host "   Vector size: $($qdrantResponse.result.config.params.vectors.size)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED - $_" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " TESTS COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
