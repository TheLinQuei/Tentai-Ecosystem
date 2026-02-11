#!/usr/bin/env pwsh
# Milestone 4 Verification Script
# Purpose: Verify cognition skeleton (brain forming)
# Artifacts: types → interfaces → pipeline → test → log

Param(
  [string]$LogPath = "docs/verification/$(Get-Date -Format 'yyyy-MM-dd_HHmmss')-m4-verification.log"
)

$ErrorActionPreference = 'Stop'

function Write-Log($msg) {
  $timestamp = Get-Date -Format o
  "$timestamp $msg" | Tee-Object -FilePath $LogPath -Append
}

function ComposeDown {
  try { docker compose down | Out-Null } catch {}
}

Write-Log "Starting M4 verification"

Push-Location "$PSScriptRoot/.."

try {
  Write-Log "Checking Docker availability"
  $version = & docker --version 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Log "FATAL: Docker not available"; throw "Docker required" }
  Write-Log $version

  Write-Log "Bringing up Postgres via docker-compose"
  docker compose up -d postgres | Tee-Object -FilePath $LogPath -Append
  
  Write-Log "Waiting for Postgres readiness"
  for ($i=0; $i -lt 30; $i++) {
    $ready = & docker compose exec -T postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Log "Postgres ready"; break }
    Start-Sleep -Seconds 2
  }

  Write-Log "Building project"
  npm run build | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Build failed" }

  Write-Log "Running migrations"
  npm run migrate | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Migrations failed" }

  Write-Log "Running unit tests"
  npm run test:unit | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Unit tests failed" }

  Write-Log "Running full integration tests (including cognition)"
  $env:VI_AUTH_ENABLED = 'false'
  npm run test:integration | Tee-Object -FilePath $LogPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Integration tests failed" }

  Write-Log "All checks passed"
} catch {
  Write-Log "Verification failed: $($_.Exception.Message)"
  throw
} finally {
  ComposeDown
  Pop-Location
}
