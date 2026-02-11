# Stability Verification Script
# Runs clean install → type-check → build → test → health check
# Logs output to docs/verification/<timestamp>-stability.log

param(
  [string]$Port = "3000"
)

$ErrorActionPreference = "Stop"

function Append-Log($text) {
  Add-Content -Path $LogPath -Value $text
}

function Write-Header($title) {
  Append-Log "`n=== $title ==="
}

function Run-Cmd($label, $command) {
  Write-Header $label
  Append-Log "$ $command"
  $output = Invoke-Expression $command 2>&1
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { Append-Log $_ }
  Append-Log "exit_code=$exitCode"
  if ($exitCode -ne 0) { throw "Step failed: $label (exit $exitCode)" }
}

# Timestamped log path
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LogDir = Join-Path -Path "docs" -ChildPath "verification"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogPath = Join-Path -Path $LogDir -ChildPath "$timestamp-stability.log"

Append-Log "Stability Verification"
Append-Log "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Append-Log "CWD: $PWD"

# Clean
Write-Header "Clean"
if (Test-Path "node_modules") { Append-Log "Removing node_modules"; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "node_modules" }
if (Test-Path "dist") { Append-Log "Removing dist"; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "dist" }
if (Test-Path "package-lock.json") { Append-Log "Removing package-lock.json"; Remove-Item -Force -ErrorAction SilentlyContinue "package-lock.json" }

# Install
Run-Cmd "Install" "npm install 2>&1"

# Type-check
Run-Cmd "Type Check" "npm run type-check 2>&1"

# Build
Run-Cmd "Build" "npm run build 2>&1"

# Test
Run-Cmd "Test" "npm test 2>&1"

# Run health check
Write-Header "Run + Health"
Append-Log "$ npm start &"
$startOutput = & npm start 2>&1
$startExit = $LASTEXITCODE
$startOutput | ForEach-Object { Append-Log $_ }
Append-Log "start_exit_code=$startExit"
Start-Sleep -Seconds 3

try {
  $healthUrl = "http://localhost:$Port/v1/health"
  Append-Log "$ curl $healthUrl"
  $health = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 10
  Append-Log (ConvertTo-Json $health)
} catch {
  Append-Log "Health check failed: $($_.Exception.Message)"
  throw
} finally {
  Append-Log "Stopping server (Get-Process node | Stop-Process)"
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Append-Log "\nVerification: PASSED"
Write-Host "Verification complete. Log: $LogPath"
