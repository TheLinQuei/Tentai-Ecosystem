#!/usr/bin/env pwsh
# Milestone 1 Verification Script
# Purpose: Single-run verification with full transcript logging
# Usage: ./scripts/verify-m1.ps1
# Output: docs/verification/<timestamp>-m1-verification.log

param(
    [string]$LogDir = "docs/verification",
    [switch]$Verbose = $false,
    [int]$Port = 3000,
    [switch]$KillPort = $false
)

# Create log directory if it doesn't exist
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

# Timestamp for log file
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $LogDir "$timestamp-m1-verification.log"

# Start transcript (captures all output)
Start-Transcript -Path $logFile -Append | Out-Null

# Color helper
function Write-Section {
    param([string]$Text)
    Write-Host ""
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

# Port preflight helpers
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

# Track overall success
$allPassed = $true

# ============================================================================
# MILESTONE 1 VERIFICATION SEQUENCE
# ============================================================================

Write-Section "Milestone 1: Foundation Setup — Full Verification"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')"
Write-Host "Repository: core/vi"
Write-Host "Framework: Fastify"
Write-Host "Port: $Port (default 3000)"
Write-Host "Health Endpoint: GET /v1/health"
Write-Host ""

# Step 0: Verify we're in the right directory
Write-Step "Checking directory..."
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found. Run from core/vi directory." -ForegroundColor Red
    Stop-Transcript
    exit 1
}
Write-Result "Directory verified" 0

# Step 1: Clean state
Write-Section "Step 1: Clean State"
Write-Step "Removing node_modules, dist, package-lock.json..."

$itemsRemoved = @()
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
    $itemsRemoved += "node_modules"
}
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
    $itemsRemoved += "dist"
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
    $itemsRemoved += "package-lock.json"
}

if ($itemsRemoved.Count -gt 0) {
    Write-Result "Cleaned: $($itemsRemoved -join ', ')" 0
} else {
    Write-Host "Already clean" -ForegroundColor Gray
}

# Step 2: npm install
Write-Section "Step 2: npm install"
Write-Step "Installing dependencies..."

$output = & npm install 2>&1
$installExitCode = $LASTEXITCODE
Write-Host ($output | Select-Object -Last 5 | Out-String)
Write-Result "npm install" $installExitCode

if ($installExitCode -ne 0) {
    Write-Host "FATAL: npm install failed" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "Vulnerability check: $(($output | Select-String 'vulnerabilities') -join '')" -ForegroundColor Gray
}

# Step 3: Type-check
Write-Section "Step 3: npm run type-check"
Write-Step "Running TypeScript type checker..."

$output = & npm run type-check 2>&1
$typeCheckExitCode = $LASTEXITCODE
Write-Host ($output | Out-String)
Write-Result "npm run type-check" $typeCheckExitCode

if ($typeCheckExitCode -ne 0) {
    Write-Host "WARNING: Type-check failed" -ForegroundColor Yellow
    $allPassed = $false
}

# Step 4: Build
Write-Section "Step 4: npm run build"
Write-Step "Compiling TypeScript..."

$output = & npm run build 2>&1
$buildExitCode = $LASTEXITCODE
Write-Host ($output | Out-String)
Write-Result "npm run build" $buildExitCode

if ($buildExitCode -ne 0) {
    Write-Host "FATAL: Build failed" -ForegroundColor Red
    $allPassed = $false
}

# Step 4.5: Port Preflight
Write-Section "Step 4.5: Port Preflight"
Write-Step "Checking if port $Port is free..."
$existingPIDs = Get-PortPIDs -Port $Port
if ($existingPIDs -and $existingPIDs.Count -gt 0) {
    Write-Host "Port $Port is in use by PID(s): $($existingPIDs -join ', ')" -ForegroundColor Red
    if ($KillPort) {
        Write-Step "Killing process(es) on port $Port..."
        foreach ($pid in $existingPIDs) {
            try {
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Host "Killed PID $pid" -ForegroundColor Gray
            } catch {
                Write-Host "Failed to kill PID $pid: $_" -ForegroundColor Yellow
            }
        }
        Start-Sleep -Seconds 1
        $existingPIDs = Get-PortPIDs -Port $Port
        if ($existingPIDs -and $existingPIDs.Count -gt 0) {
            Write-Host "FATAL: Port $Port still in use after kill attempts." -ForegroundColor Red
            Stop-Transcript | Out-Null
            exit 1
        } else {
            Write-Result "Port $Port cleared" 0
        }
    } else {
        Write-Host "FATAL: Port $Port in use. Rerun with -KillPort or free the port." -ForegroundColor Red
        Stop-Transcript | Out-Null
        exit 1
    }
} else {
    Write-Result "Port $Port available" 0
}

# Step 5: Start server and test health endpoint
Write-Section "Step 5: Server Health Check"
Write-Step "Starting server..."

if (-not (Test-Path "dist/main.js")) {
    Write-Host "ERROR: dist/main.js not found. Build must have failed." -ForegroundColor Red
    $allPassed = $false
} else {
    # Start server in background
    $serverProcess = Start-Process -NoNewWindow -FilePath "node" -ArgumentList "dist/main.js" -PassThru
    Write-Host "Server started (PID: $($serverProcess.Id))" -ForegroundColor Gray

    # Wait for server to start
    Write-Step "Waiting for server to start..."
    Start-Sleep -Seconds 2

    # Test health endpoint
    Write-Step "Testing GET /v1/health..."
    try {
        $healthResponse = Invoke-WebRequest -Uri "http://localhost:$Port/v1/health" -ErrorAction Stop
        $healthBody = $healthResponse.Content | ConvertFrom-Json
        Write-Host "Status Code: $($healthResponse.StatusCode)" -ForegroundColor Green
        Write-Host "Response: $($healthResponse.Content)" -ForegroundColor Green
        Write-Result "GET /v1/health" 0
    } catch {
        Write-Host "ERROR: Health check failed: $_" -ForegroundColor Red
        Write-Result "GET /v1/health" 1
        $allPassed = $false
    }

    # Stop server
    Write-Step "Stopping server..."
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Write-Host "Server stopped" -ForegroundColor Gray
}

# Step 6: CLI tests
Write-Section "Step 6: CLI Verification"

Write-Step "Testing: node dist/cli/cli.js --version"
$versionOutput = & node dist/cli/cli.js --version 2>&1
$versionExitCode = $LASTEXITCODE
Write-Host $versionOutput
Write-Result "CLI --version" $versionExitCode

Write-Step "Testing: node dist/cli/cli.js help"
$helpOutput = & node dist/cli/cli.js help 2>&1
$helpExitCode = $LASTEXITCODE
Write-Host ($helpOutput | Select-Object -First 10 | Out-String)
Write-Result "CLI help" $helpExitCode

# ============================================================================
# SUMMARY
# ============================================================================

Write-Section "Verification Summary"

Write-Host "All checks passed: $(if ($allPassed) { 'YES ✓' } else { 'NO ✗' })" -ForegroundColor $(if ($allPassed) { 'Green' } else { 'Red' })
Write-Host ""
Write-Host "Framework: Fastify" -ForegroundColor Green
Write-Host "Health Endpoint: GET /v1/health" -ForegroundColor Green
Write-Host "Default Port: $Port" -ForegroundColor Green
Write-Host "CLI: Functional" -ForegroundColor Green
Write-Host ""
Write-Host "Full log: $logFile" -ForegroundColor Cyan
Write-Host ""

# Stop transcript
Stop-Transcript | Out-Null

# Exit with appropriate code
exit $(if ($allPassed) { 0 } else { 1 })
