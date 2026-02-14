# Create Mock Skill for Testing Phase 5 Integration
# This bypasses the broken embedder by manually inserting skills

Write-Host "`n🧪 Creating Mock Skill for Testing..." -ForegroundColor Cyan

# Mock skill: "What's the weather?"
$skillId = [guid]::NewGuid().ToString()
$intent = "What is the weather?"
$pattern = "weather-query"
$actions = @(
    @{
        tool = "message.send"
        input = @{
            channelId = "{{channelId}}"
            content = "I'd check the weather for you, but this is a test skill! 🌤️"
        }
    }
) | ConvertTo-Json -Depth 10 -Compress

# Generate a simple mock embedding (384 dimensions, all zeros for testing)
$mockEmbedding = @(1..384 | ForEach-Object { 0.001 * $_ }) | ConvertTo-Json -Compress

Write-Host "`n1️⃣ Inserting skill into Postgres..." -ForegroundColor Yellow

# Create a temp SQL file to avoid escaping issues
$sqlFile = ".\temp-insert-skill.sql"
$sqlContent = @"
INSERT INTO skills (
    id, intent, pattern, actions, inputs, outputs,
    created_at, last_used, metadata,
    success_count, failure_count, total_executions,
    success_rate, avg_latency_ms, status
) VALUES (
    '$skillId',
    'What is the weather?',
    '$pattern',
    '$actions'::jsonb,
    ARRAY['weather query']::text[],
    ARRAY['weather response']::text[],
    NOW(),
    NOW(),
    '{"mockSkill": true, "createdBy": "create-mock-skill.ps1"}'::jsonb,
    5,
    0,
    5,
    1.0,
    150.0,
    'active'
) ON CONFLICT (id) DO NOTHING
RETURNING id;
"@

Set-Content -Path $sqlFile -Value $sqlContent

try {
    Get-Content $sqlFile | docker exec -i infra-postgres-1 psql -U vibot -d vibot
    Remove-Item $sqlFile -ErrorAction SilentlyContinue
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Postgres: Skill inserted" -ForegroundColor Green
        Write-Host "   Skill ID: $skillId" -ForegroundColor Gray
    } else {
        Write-Host "❌ Postgres: Insert failed" -ForegroundColor Red
        Remove-Item $sqlFile -ErrorAction SilentlyContinue
        exit 1
    }
} catch {
    Write-Host "❌ Postgres: Error - $_" -ForegroundColor Red
    Remove-Item $sqlFile -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "`n2️⃣ Inserting embedding into Qdrant..." -ForegroundColor Yellow

# Qdrant point format
$qdrantPayload = @{
    points = @(
        @{
            id = $skillId
            vector = @(1..384 | ForEach-Object { Get-Random -Minimum 0.0 -Maximum 1.0 })
            payload = @{
                intent = $intent
                pattern = $pattern
                status = "active"
                successRate = 1.0
            }
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod `
        -Uri "http://localhost:6333/collections/skills/points" `
        -Method PUT `
        -ContentType "application/json" `
        -Body $qdrantPayload
    
    if ($response.status -eq "ok") {
        Write-Host "✅ Qdrant: Embedding inserted" -ForegroundColor Green
        Write-Host "   Collection: skills" -ForegroundColor Gray
        Write-Host "   Vectors: $($response.result.vectors)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Qdrant: Insert failed - $($response.status)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Qdrant: Error - $_" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Gray
}

Write-Host "`n3️⃣ Verifying skill creation..." -ForegroundColor Yellow

try {
    $skill = Invoke-RestMethod -Uri "http://localhost:4311/v1/skills/$skillId" -Method GET
    Write-Host "✅ Skill verified via Memory API" -ForegroundColor Green
    Write-Host "`nSkill Details:" -ForegroundColor Cyan
    Write-Host "   ID: $($skill.id)" -ForegroundColor White
    Write-Host "   Intent: $($skill.intent)" -ForegroundColor White
    Write-Host "   Success Rate: $($skill.stats.successRate * 100)%" -ForegroundColor White
    Write-Host "   Status: $($skill.stats.status)" -ForegroundColor White
} catch {
    Write-Host "⚠️  Skill created but verification failed (Memory API might not be running)" -ForegroundColor Yellow
}

Write-Host "`n✨ Mock skill created successfully!" -ForegroundColor Green
Write-Host "   Try asking Vi in Discord: 'What's the weather?'" -ForegroundColor Cyan
Write-Host "   Expected: Skill should be reused (no LLM call)" -ForegroundColor Gray
Write-Host ""
