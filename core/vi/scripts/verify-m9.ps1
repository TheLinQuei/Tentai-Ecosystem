# M9 Verification Script (Section 13 compliant)
# Logs commands, full outputs, and explicit ExitCode lines

$ErrorActionPreference = 'Stop'

function Resolve-DocLogPath {
  param([string]$s)
  ($s -replace '[\[\]\(\)]','').Trim()
}

function New-LogPath {
  param([string]$Suffix)
  $timestamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $folder = Join-Path -Path "docs" -ChildPath "verification"
  if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder | Out-Null }
  return Join-Path -Path $folder -ChildPath "$timestamp-$Suffix.log"
}

function Write-Log {
  param([string]$Path,[string]$Text)
  Add-Content -Path $Path -Value $Text
}

function Run-Step {
  param([string]$Log,[string]$Title,[string]$Command)
  Write-Log -Path $Log -Text "## STEP: $Title"
  Write-Log -Path $Log -Text "### COMMAND: $Command"
  Write-Log -Path $Log -Text "--- OUTPUT START ---"
  try {
    $output = Invoke-Expression "$Command" 2>&1
    if ($null -ne $output) {
      $output | ForEach-Object { Write-Log -Path $Log -Text ($_ | Out-String).TrimEnd() }
    }
  }
  finally {
    Write-Log -Path $Log -Text "--- OUTPUT END ---"
    if ($LASTEXITCODE -eq $null) { $exitCode = 0 } else { $exitCode = $LASTEXITCODE }
    Write-Log -Path $Log -Text "ExitCode: $exitCode"
    Write-Log -Path $Log -Text ""
  }
}

# Main
$logPath = New-LogPath -Suffix "m9-verification"
Write-Host "M9 Verification: writing log to $logPath"
Write-Log -Path $logPath -Text "== M9 Verification Log =="
Write-Log -Path $logPath -Text "Project: core/vi"
Write-Log -Path $logPath -Text ("Date: " + (Get-Date).ToString("s"))
Write-Log -Path $logPath -Text ""

# Steps
Run-Step -Log $logPath -Title "Environment" -Command 'pwd; node -v; npm -v; try { git rev-parse HEAD | Write-Output } catch { Write-Output "git rev-parse: unavailable" }; try { git status --short | Write-Output } catch { Write-Output "git status: unavailable" }; $global:LASTEXITCODE = 0'
Run-Step -Log $logPath -Title "Build" -Command "npm run build"
Run-Step -Log $logPath -Title "Unit Tests" -Command "npm run test:unit"
Run-Step -Log $logPath -Title "Integration Tests" -Command "npm run test:integration"
Run-Step -Log $logPath -Title "Chat Endpoint Test" -Command "npm run test -- tests/integration/chat.e2e.test.ts"

Write-Host ("Log saved: " + $logPath)
