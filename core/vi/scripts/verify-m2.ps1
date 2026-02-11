#!/usr/bin/env pwsh
# Milestone 2 Verification Script
# Purpose: End-to-end verification with Postgres, migrations, and API checks
# Usage: ./scripts/verify-m2.ps1
# Output: docs/verification/<timestamp>-m2-verification.log

param(
    [string]$LogDir = "docs/verification",
    [switch]$Verbose = $false,
    [int]$Port = 3000,
    [int]$DbPort = 55432,
    [switch]$KillPort = $false
)

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $LogDir "$timestamp-m2-verification.log"
Start-Transcript -Path $logFile -Append | Out-Null

function ComposeDown {
    try {
        & docker compose down 2>&1 | Write-Host
    } catch {
        # Ignore teardown errors
    }
}

function Write-Section {
    param([string]$Text)
    Write-Host "";
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host "→ $Text" -ForegroundColor Yellow
}

function Write-Result {
    param([string]$Text, [int]$ExitCode)
    if ($ExitCode -eq 0) {
        Write-Host "✓ $Text (exit code: $ExitCode)" -ForegroundColor Green
    } else {
        Write-Host "✗ $Text (exit code: $ExitCode)" -ForegroundColor Red
    }
}

function Get-PortPIDs {
    param([int]$Port)
    $pids = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        if ($conns) {
            $pids += ($conns | Select-Object -ExpandProperty OwningProcess)
        }
    } catch {
        $lines = & netstat -ano | Select-String ":$Port" | ForEach-Object { $_.Line }
        foreach ($line in $lines) {
            $parts = ($line -split "\s+") | Where-Object { $_ -ne '' }
            if ($parts.Count -ge 5) {
                $pidStr = $parts[-1]
                if ($pidStr -match '^\d+$') { $pids += [int]$pidStr }
            }
        }
    }
    return ($pids | Select-Object -Unique)
}

function Ensure-Port-Free {
    param([int]$Port, [switch]$Kill)
    Write-Step "Checking if port $Port is free..."
    $existingPIDs = Get-PortPIDs -Port $Port
    if ($existingPIDs -and $existingPIDs.Count -gt 0) {
        Write-Host "Port $Port is in use by PID(s): $($existingPIDs -join ', ')" -ForegroundColor Red
        if ($Kill) {
            Write-Step "Killing process(es) on port $Port..."
            foreach ($pidValue in $existingPIDs) {
                try {
                    Stop-Process -Id $pidValue -Force -ErrorAction Stop
                    Write-Host "Killed PID $pidValue" -ForegroundColor Gray
                } catch {
                    Write-Host ("Failed to kill PID {0}: {1}" -f $pidValue, $_) -ForegroundColor Yellow
                }
            }
            Start-Sleep -Seconds 1
            $existingPIDs = Get-PortPIDs -Port $Port
            if ($existingPIDs -and $existingPIDs.Count -gt 0) {
                Write-Host "FATAL: Port $Port still in use after kill attempts." -ForegroundColor Red
                ComposeDown
                Stop-Transcript | Out-Null
                exit 1
            } else {
                Write-Result "Port $Port cleared" 0
            }
        } else {
            Write-Host "FATAL: Port $Port in use. Rerun with -KillPort or free the port." -ForegroundColor Red
            ComposeDown
            Stop-Transcript | Out-Null
            exit 1
        }
    } else {
        Write-Result "Port $Port available" 0
    }
}

function Ensure-Docker {
    Write-Step "Checking Docker availability..."
    $dockerVersion = & docker --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FATAL: Docker is required for Postgres. Install/Start Docker Desktop." -ForegroundColor Red
        ComposeDown
        Stop-Transcript | Out-Null
        exit 1
    }
    Write-Host $dockerVersion -ForegroundColor Gray
}

function Wait-ForPostgres {
    param([string]$ServiceName = "postgres")
    Write-Step "Waiting for Postgres to become ready..."
    for ($i = 0; $i -lt 30; $i++) {
        $ready = & docker compose exec -T $ServiceName pg_isready -U postgres 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Postgres ready." -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "FATAL: Postgres did not become ready in time." -ForegroundColor Red
    ComposeDown
    Stop-Transcript | Out-Null
    exit 1
}

$allPassed = $true

Write-Section "Milestone 2 Verification — DB + API"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Write-Host "Repository: core/vi"
Write-Host "Framework: Fastify"
Write-Host "App Port: $Port"
Write-Host "DB Port: $DbPort"
Write-Host "Health Endpoint: GET /v1/health"
Write-Host ""

Write-Step "Checking directory..."
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found. Run from core/vi directory." -ForegroundColor Red
    ComposeDown
    Stop-Transcript | Out-Null
    exit 1
}
Write-Result "Directory verified" 0

Write-Section "Step 1: Clean State"
Write-Step "Removing node_modules, dist, package-lock.json..."
$itemsRemoved = @()
foreach ($item in @('node_modules','dist','package-lock.json')) {
    if (Test-Path $item) {
        Remove-Item -Recurse -Force $item -ErrorAction SilentlyContinue
        $itemsRemoved += $item
    }
}
if ($itemsRemoved.Count -gt 0) { Write-Result "Cleaned: $($itemsRemoved -join ', ')" 0 } else { Write-Host "Already clean" -ForegroundColor Gray }

Write-Section "Step 2: npm install"
$output = & npm install 2>&1
$installExitCode = $LASTEXITCODE
Write-Host ($output | Select-Object -Last 5 | Out-String)
Write-Result "npm install" $installExitCode
if ($installExitCode -ne 0) { $allPassed = $false }

Write-Section "Step 3: Docker Compose (Postgres)"
Ensure-Docker
Write-Step "Starting postgres via docker compose..."
& docker compose up -d postgres 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) { Write-Host "FATAL: docker compose up failed" -ForegroundColor Red; ComposeDown; Stop-Transcript | Out-Null; exit 1 }
Wait-ForPostgres -ServiceName "postgres"

Write-Section "Step 4: Type-check and Build"
$output = & npm run type-check 2>&1
$typeCheckExitCode = $LASTEXITCODE
Write-Host ($output | Out-String)
Write-Result "npm run type-check" $typeCheckExitCode
if ($typeCheckExitCode -ne 0) { $allPassed = $false }

$output = & npm run build 2>&1
$buildExitCode = $LASTEXITCODE
Write-Host ($output | Out-String)
Write-Result "npm run build" $buildExitCode
if ($buildExitCode -ne 0) { $allPassed = $false }

Write-Section "Step 5: Migrations"
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:$DbPort/vi"
$output = & npm run migrate 2>&1
$migrateExitCode = $LASTEXITCODE
Write-Host ($output | Out-String)
Write-Result "npm run migrate" $migrateExitCode
if ($migrateExitCode -ne 0) { $allPassed = $false }

Write-Section "Step 6: Tests"
$output = & npm run test:unit 2>&1
$unitExitCode = $LASTEXITCODE
Write-Host ($output | Select-Object -Last 10 | Out-String)
Write-Result "npm run test:unit" $unitExitCode
if ($unitExitCode -ne 0) { $allPassed = $false }

$output = & npm run test:integration 2>&1
$integrationExitCode = $LASTEXITCODE
Write-Host ($output | Select-Object -Last 10 | Out-String)
Write-Result "npm run test:integration" $integrationExitCode
if ($integrationExitCode -ne 0) { $allPassed = $false }

Write-Section "Step 7: Port Preflight"
Ensure-Port-Free -Port $Port -Kill:$KillPort

Write-Section "Step 8: Server + API Checks"
if (-not (Test-Path "dist/main.js")) {
    Write-Host "ERROR: dist/main.js not found. Build must have failed." -ForegroundColor Red
    $allPassed = $false
} else {
    $serverProcess = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "dist/main.js" -PassThru -Environment @{"DATABASE_URL"=$env:DATABASE_URL; "VI_PORT"=$Port}
    Write-Host "Server started (PID: $($serverProcess.Id))" -ForegroundColor Gray
    Start-Sleep -Seconds 2

    Write-Step "Health check"
    try {
        $healthResponse = Invoke-WebRequest -Uri "http://localhost:$Port/v1/health" -ErrorAction Stop
        Write-Host "Status Code: $($healthResponse.StatusCode)" -ForegroundColor Green
        Write-Host "Response: $($healthResponse.Content)" -ForegroundColor Green
        Write-Result "GET /v1/health" 0
    } catch {
        Write-Host "ERROR: Health check failed: $_" -ForegroundColor Red
        Write-Result "GET /v1/health" 1
        $allPassed = $false
    }

    Write-Step "Create conversation"
    $conversationResponse = Invoke-WebRequest -Method Post -Uri "http://localhost:$Port/v1/conversations" -ContentType "application/json" -Body '{"title":"Verification Conversation"}' -ErrorAction Stop
    $conversation = $conversationResponse.Content | ConvertFrom-Json
    $conversationExit = if ($conversationResponse.StatusCode -eq 201) { 0 } else { 1 }
    Write-Result "POST /v1/conversations" $conversationExit
    if ($conversationExit -ne 0) { $allPassed = $false }

    Write-Step "Add message"
    $messageBody = '{"role":"user","content":"Hello from verify-m2"}'
    $messageResponse = Invoke-WebRequest -Method Post -Uri "http://localhost:$Port/v1/conversations/$($conversation.id)/messages" -ContentType "application/json" -Body $messageBody -ErrorAction Stop
    $message = $messageResponse.Content | ConvertFrom-Json
    $messageExit = if ($messageResponse.StatusCode -eq 201) { 0 } else { 1 }
    Write-Result "POST /v1/conversations/:id/messages" $messageExit
    if ($messageExit -ne 0) { $allPassed = $false }

    Write-Step "List messages"
    $listResponse = Invoke-WebRequest -Method Get -Uri "http://localhost:$Port/v1/conversations/$($conversation.id)/messages" -ErrorAction Stop
    $listExit = if ($listResponse.StatusCode -eq 200) { 0 } else { 1 }
    Write-Result "GET /v1/conversations/:id/messages" $listExit
    if ($listExit -ne 0) { $allPassed = $false }

    Write-Step "Stopping server..."
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "Server stopped" -ForegroundColor Gray
}

Write-Section "Step 9: Docker Compose Down"
ComposeDown

Write-Section "Verification Summary"
Write-Host "All checks passed: $(if ($allPassed) { 'YES ✓' } else { 'NO ✗' })" -ForegroundColor $(if ($allPassed) { 'Green' } else { 'Red' })
Write-Host "Full log: $logFile" -ForegroundColor Cyan

Stop-Transcript | Out-Null
exit $(if ($allPassed) { 0 } else { 1 })
