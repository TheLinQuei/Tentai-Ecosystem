# Vi M6 Verification Script
# Verifies memory system: embeddings, storage, retrieval, consolidation

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = "docs/verification/$timestamp-m6-verification.log"

# Ensure log directory exists
New-Item -ItemType Directory -Force -Path "docs/verification" | Out-Null

function Log {
    param([string]$message)
    $timestampedMessage = "$(Get-Date -Format 'o') $message"
    Write-Host $timestampedMessage
    Add-Content -Path $logFile -Value $timestampedMessage
}

try {
    Log "Starting M6 verification"

    # Check Docker
    Log "Checking Docker availability"
    $dockerVersion = docker --version 2>&1
    Log $dockerVersion

    # Bring up Postgres
    Log "Bringing up Postgres via docker-compose"
    docker compose up -d postgres 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }

    # Wait for Postgres
    Log "Waiting for Postgres readiness"
    $retries = 0
    while ($retries -lt 30) {
        $ready = docker compose exec -T postgres pg_isready -U postgres 2>&1
        if ($LASTEXITCODE -eq 0) {
            break
        }
        Start-Sleep -Seconds 1
        $retries++
    }
    Log "Postgres ready"

    # Build
    Log "Building project"
    npm run build 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    # Migrations
    Log "Running migrations (including pgvector and memory_vectors table)"
    npm run migrate 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
    if ($LASTEXITCODE -ne 0) { throw "Migrations failed" }

    # Unit tests
    Log "Running unit tests"
    npm run test:unit 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
    if ($LASTEXITCODE -ne 0) { throw "Unit tests failed" }

    # Integration tests (including memory)
    Log "Running integration tests (cognition + memory)"
    npm run test:integration 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
    if ($LASTEXITCODE -ne 0) { throw "Integration tests failed" }

    Log "All checks passed"

} catch {
    Log "Verification failed: $_"
    throw
} finally {
    # Clean up Docker
    docker compose down 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value $_ }
}
