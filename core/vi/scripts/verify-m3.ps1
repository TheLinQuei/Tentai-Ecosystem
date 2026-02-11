Param(
  [string]$LogPath = "docs/verification/$(Get-Date -Format 'yyyy-MM-dd_HHmmss')-m3-verification.log"
)

$ErrorActionPreference = 'Stop'

function Write-Log($msg) {
  $timestamp = Get-Date -Format o
  "$timestamp $msg" | Tee-Object -FilePath $LogPath -Append
}

function ComposeDown {
  try { docker compose down | Out-Null } catch {}
}

function Ensure-Docker {
  Write-Log "Checking Docker availability"
  $version = & docker --version 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Log "FATAL: Docker not available"; throw "Docker required" }
  Write-Log $version
}

function Get-PortPIDs([int]$Port) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    if ($conns) { return ($conns | Select-Object -ExpandProperty OwningProcess | Select-Object -Unique) }
  } catch {
    # If unavailable, assume no listeners
    return @()
  }
  return @()
}

function Ensure-Port-Free([int]$Port, [switch]$Kill) {
  Write-Log "Checking if port $Port is free"
  $existingPIDs = Get-PortPIDs -Port $Port
  if ($existingPIDs -and $existingPIDs.Count -gt 0) {
    Write-Log "Port $Port in use by PID(s): $($existingPIDs -join ', ')"
    if ($Kill) {
      foreach ($pidValue in $existingPIDs) {
        try {
          Stop-Process -Id $pidValue -Force -ErrorAction Stop
          Write-Log "Killed PID $pidValue"
        } catch {
          Write-Log ("Failed to kill PID {0}: {1}" -f $pidValue, $_)
        }
      }
      Start-Sleep -Seconds 1
      $remaining = Get-PortPIDs -Port $Port
      if ($remaining -and $remaining.Count -gt 0) { throw "Port $Port still in use after kill attempts" }
      Write-Log "Port $Port cleared"
    } else {
      throw "Port $Port is in use"
    }
  } else { Write-Log "Port $Port available" }
}

function Wait-ForPostgres($serviceName) {
  Write-Log "Waiting for Postgres readiness"
  for ($i=0; $i -lt 30; $i++) {
    $ready = & docker compose exec -T $serviceName pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Log "Postgres ready"; return }
    Start-Sleep -Seconds 2
  }
  throw "Postgres did not become ready in time"
}

Write-Log "Starting M3 verification"

Push-Location "$PSScriptRoot/.."

try {
  Ensure-Docker
  Write-Log "Bringing up Postgres via docker-compose"
  docker compose up -d postgres | Tee-Object -FilePath $LogPath -Append
  Wait-ForPostgres "postgres"

  Write-Log "Building project"
  npm run build | Tee-Object -FilePath $LogPath -Append

  Write-Log "Running migrations"
  npm run migrate | Tee-Object -FilePath $LogPath -Append

  Write-Log "Running unit tests"
  npm run test:unit | Tee-Object -FilePath $LogPath -Append

  # Enable auth for verification
  $env:VI_AUTH_ENABLED = 'true'
  $env:VI_JWT_SECRET = 'verify-secret'
  $env:DATABASE_URL = "postgres://postgres:postgres@localhost:55432/vi"

  Write-Log "Starting server for endpoint proofs"
  Ensure-Port-Free -Port 3000 -Kill
  $server = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "dist/main.js" -PassThru -Environment @{"DATABASE_URL"=$env:DATABASE_URL; "VI_AUTH_ENABLED"=$env:VI_AUTH_ENABLED; "VI_JWT_SECRET"=$env:VI_JWT_SECRET; "VI_PORT"="3000"}
  Start-Sleep -Seconds 2

  # Health check
  Write-Log "GET /v1/health"
  try {
    $health = Invoke-WebRequest -Uri "http://localhost:3000/v1/health" -ErrorAction Stop
    Write-Log "Status: $($health.StatusCode) Body: $($health.Content)"
  } catch { Write-Log "Health failed: $($_)"; throw }

  # Register user A
  Write-Log "POST /v1/auth/register (user A)"
  $suffix = Get-Date -Format "yyyyMMddHHmmss"
  $emailA = "userA+$suffix@example.com"
  $userA = "userA_$suffix"
  $regABodyObj = @{ email = $emailA; username = $userA; password = "Passw0rd!123"; displayName = "User A" }
  $regA = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/register" -ContentType "application/json" -Body ($regABodyObj | ConvertTo-Json)
  Write-Log "Status: $($regA.StatusCode) Body: $($regA.Content)"
  $regABody = $regA.Content | ConvertFrom-Json
  $accessA = $regABody.data.accessToken
  $refreshA = $regABody.data.refreshToken

  # Login user A
  Write-Log "POST /v1/auth/login (user A)"
  $loginABodyObj = @{ email = $emailA; password = "Passw0rd!123" }
  $loginA = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/login" -ContentType "application/json" -Body ($loginABodyObj | ConvertTo-Json)
  Write-Log "Status: $($loginA.StatusCode) Body: $($loginA.Content)"
  $loginABody = $loginA.Content | ConvertFrom-Json
  $accessA = $loginABody.data.accessToken

  # Protected endpoint without token (should be 401)
  Write-Log "POST /v1/conversations without token (expect 401)"
  try {
    $convNoAuth = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/conversations" -ContentType "application/json" -Body '{"title":"NoAuth"}' -ErrorAction Stop
    Write-Log "UNEXPECTED: Status $($convNoAuth.StatusCode) Body: $($convNoAuth.Content)"
  } catch {
    $resp = $_.Exception.Response
    $code = $resp.StatusCode
    $body = $_.ErrorDetails.Message
    Write-Log "Expected failure: $code Body: $body"
  }

  # Protected endpoint with token (should be 201)
  Write-Log "POST /v1/conversations with token (expect 201)"
  $headersA = @{ Authorization = "Bearer $accessA" }
  $convA = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/conversations" -ContentType "application/json" -Body '{"title":"Auth Conversation"}' -Headers $headersA
  Write-Log "Status: $($convA.StatusCode) Body: $($convA.Content)"
  $convABody = $convA.Content | ConvertFrom-Json
  $convId = $convABody.id

  # Add message with token
  Write-Log "POST /v1/conversations/:id/messages with token (expect 201)"
  $msgA = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/conversations/$convId/messages" -ContentType "application/json" -Body '{"role":"user","content":"hello"}' -Headers $headersA
  Write-Log "Status: $($msgA.StatusCode) Body: $($msgA.Content)"

  # Register user B
  Write-Log "POST /v1/auth/register (user B)"
  $emailB = "userB+$suffix@example.com"
  $userB = "userB_$suffix"
  $regBBodyObj = @{ email = $emailB; username = $userB; password = "Passw0rd!123"; displayName = "User B" }
  $regB = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/register" -ContentType "application/json" -Body ($regBBodyObj | ConvertTo-Json)
  Write-Log "Status: $($regB.StatusCode) Body: $($regB.Content)"
  $loginBBodyObj = @{ email = $emailB; password = "Passw0rd!123" }
  $loginB = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/login" -ContentType "application/json" -Body ($loginBBodyObj | ConvertTo-Json)
  $loginBBody = $loginB.Content | ConvertFrom-Json
  $headersB = @{ Authorization = "Bearer $($loginBBody.data.accessToken)" }

  # Ownership enforcement (expect 403)
  Write-Log "GET /v1/conversations/:id/messages as foreign user (expect 403)"
  try {
    $listB = Invoke-WebRequest -Method Get -Uri "http://localhost:3000/v1/conversations/$convId/messages" -Headers $headersB -ErrorAction Stop
    Write-Log "UNEXPECTED: Status $($listB.StatusCode) Body: $($listB.Content)"
  } catch {
    $resp = $_.Exception.Response
    $code = $resp.StatusCode
    $body = $_.ErrorDetails.Message
    Write-Log "Expected forbidden: $code Body: $body"
  }

  # Refresh token
  Write-Log "POST /v1/auth/refresh (user A)"
  $refreshRes = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/refresh" -ContentType "application/json" -Body (@{ refreshToken = $refreshA } | ConvertTo-Json)
  Write-Log "Status: $($refreshRes.StatusCode) Body: $($refreshRes.Content)"

  # Logout
  Write-Log "POST /v1/auth/logout (user A)"
  $logoutRes = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/logout" -ContentType "application/json" -Body (@{ refreshToken = $refreshA } | ConvertTo-Json)
  Write-Log "Status: $($logoutRes.StatusCode) Body: $($logoutRes.Content)"

  # Refresh after logout (expect 401)
  Write-Log "POST /v1/auth/refresh after logout (expect 401)"
  try {
    $refreshAgain = Invoke-WebRequest -Method Post -Uri "http://localhost:3000/v1/auth/refresh" -ContentType "application/json" -Body (@{ refreshToken = $refreshA } | ConvertTo-Json) -ErrorAction Stop
    Write-Log "UNEXPECTED: Status $($refreshAgain.StatusCode) Body: $($refreshAgain.Content)"
  } catch {
    $resp = $_.Exception.Response
    $code = $resp.StatusCode
    $body = $_.ErrorDetails.Message
    Write-Log "Expected unauthorized: $code Body: $body"
  }

  Write-Log "Stopping server"
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue

  # Run auth integration tests with auth enabled
  Write-Log "Running full integration tests with auth enabled"
  npm run test:integration | Tee-Object -FilePath $LogPath -Append

  Write-Log "All checks passed"
} catch {
  Write-Log "Verification failed: $($_.Exception.Message)"
  throw
} finally {
  ComposeDown
  Pop-Location
}
