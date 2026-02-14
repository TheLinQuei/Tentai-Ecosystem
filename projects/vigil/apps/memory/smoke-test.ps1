# Memory API Smoke Tests
Write-Host "🧪 Testing Memory API endpoints..." -ForegroundColor Cyan

$base = "http://localhost:4311"

# Test health endpoints
Write-Host "`n1️⃣ Testing health endpoints..." -ForegroundColor Yellow
try {
    $pgHealth = Invoke-RestMethod -Uri "$base/health/postgres"
    Write-Host "✅ Postgres health: $($pgHealth.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Postgres health failed: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $qdrantHealth = Invoke-RestMethod -Uri "$base/health/qdrant"
    Write-Host "✅ Qdrant health: $($qdrantHealth.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Qdrant health failed: $($_.Exception.Message)" -ForegroundColor Red
}

try {
    $neo4jHealth = Invoke-RestMethod -Uri "$base/health/neo4j"
    Write-Host "✅ Neo4j health: $($neo4jHealth.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Neo4j health failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test upsert
Write-Host "`n2️⃣ Testing upsert endpoint..." -ForegroundColor Yellow
$upsertBody = @{
    scope = "user"
    scopeId = "test-user-123"
    text = "This is a test memory from the smoke test suite."
    meta = @{ source = "smoke-test"; timestamp = (Get-Date).ToString("o") }
} | ConvertTo-Json

try {
    $upsertResult = Invoke-RestMethod -Uri "$base/v1/mem/upsert" -Method Post -Body $upsertBody -ContentType "application/json"
    Write-Host "✅ Upsert succeeded: $($upsertResult.id)" -ForegroundColor Green
    $testId = $upsertResult.id
} catch {
    Write-Host "❌ Upsert failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test hybrid search
Write-Host "`n3️⃣ Testing hybrid search endpoint..." -ForegroundColor Yellow
$searchBody = @{
    q = "test memory"
    limit = 5
} | ConvertTo-Json

try {
    $searchResult = Invoke-RestMethod -Uri "$base/v1/mem/searchHybrid" -Method Post -Body $searchBody -ContentType "application/json"
    Write-Host "✅ Hybrid search succeeded: found $($searchResult.items.Count) results" -ForegroundColor Green
    if ($searchResult.items.Count -gt 0) {
        Write-Host "   Top result: $($searchResult.items[0].text.Substring(0, [Math]::Min(50, $searchResult.items[0].text.Length)))..." -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Hybrid search failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test context endpoint
Write-Host "`n4️⃣ Testing context endpoint..." -ForegroundColor Yellow
try {
    $contextResult = Invoke-RestMethod -Uri "$base/v1/mem/context?user=test-user-123&n=10"
    Write-Host "✅ Context endpoint succeeded: $($contextResult.episodes.Count) episodes + $($contextResult.nearest.Count) nearest" -ForegroundColor Green
} catch {
    Write-Host "❌ Context endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test relate endpoint
Write-Host "`n5️⃣ Testing relate endpoint..." -ForegroundColor Yellow
$relateBody = @{
    from = "concept:ai"
    to = "concept:memory"
    relation = "RELATES_TO"
    weight = 0.85
} | ConvertTo-Json

try {
    $relateResult = Invoke-RestMethod -Uri "$base/v1/mem/relate" -Method Post -Body $relateBody -ContentType "application/json"
    Write-Host "✅ Relate succeeded: $($relateResult.ok)" -ForegroundColor Green
} catch {
    Write-Host "❌ Relate failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test jobs status
Write-Host "`n6️⃣ Testing jobs status endpoint..." -ForegroundColor Yellow
try {
    $jobsResult = Invoke-RestMethod -Uri "$base/jobs/status"
    Write-Host "✅ Jobs status: waiting=$($jobsResult.waiting), active=$($jobsResult.active), completed=$($jobsResult.completed)" -ForegroundColor Green
} catch {
    Write-Host "❌ Jobs status failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n✨ Smoke tests complete!" -ForegroundColor Cyan
