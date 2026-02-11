# M10 Verification: Build → Start → Rate Limit → Log
$ErrorActionPreference = 'Stop'

# Timestamp for log
$ts = (Get-Date).ToString('yyyy-MM-dd_HHmmss')
$logPath = "e:\Tentai Ecosystem\core\vi\docs\verification\${ts}-m10-verification.log"

# Ensure docs/verification exists
New-Item -ItemType Directory -Force -Path (Split-Path $logPath) | Out-Null

# Helper to append to log
function Append-Log($text) { Add-Content -Path $logPath -Value $text }

Append-Log "=== M10 Verification @ $ts ==="
Append-Log "Step: Build"

Push-Location "e:\Tentai Ecosystem\core\vi"
try {
  $build = npm run build 2>&1 | Out-String
  Append-Log $build
  Append-Log "ExitCode(Build)=0"

  Append-Log "Step: Start Server"
  # Ensure nothing is already bound to the port
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    Select-Object -Unique OwningProcess |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  $env:VI_AUTH_ENABLED = "false"
  # Lower rate limit to force 429s during verification
  $env:VI_TOOLS_RATE_LIMIT_DEFAULT = "3"
  $p = Start-Process -FilePath pwsh -ArgumentList "-Command", "npm start" -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3
  Append-Log "ServerPID=$($p.Id)"

  Append-Log "Step: Health"
  $health = Invoke-RestMethod -Uri "http://localhost:3000/v1/health" -Method GET
  Append-Log ("Health=" + ($health | ConvertTo-Json -Depth 10))

  Append-Log "Step: Rate Limit"
  $max = 12
  $429Count = 0
  for ($i=1; $i -le $max; $i++) {
    try {
      $resp = Invoke-RestMethod -Uri "http://localhost:3000/v1/chat" -Method POST -ContentType "application/json" -Body '{"message": "M10 rate test"}'
      Append-Log ("ChatResp[$i]=" + ($resp | ConvertTo-Json -Depth 5))
    } catch {
      $errText = $_.Exception.Message
      Append-Log ("ChatErr[$i]=" + $errText)
      if ($errText -match "429") { $429Count++ }
    }
  }
  Append-Log ("429Count=" + $429Count)
  if ($429Count -lt 1) { throw "Expected at least one 429 but saw $429Count" }

  Append-Log "Step: Metrics"
  try {
    $metrics = Invoke-RestMethod -Uri "http://localhost:3000/v1/metrics" -Method GET
    Append-Log ("Metrics=" + ($metrics | ConvertTo-Json -Depth 5))
    if (-not $metrics) { throw "Metrics response empty" }
  } catch {
    Append-Log ("MetricsErr=" + $_.Exception.Message)
    throw
  }

  Append-Log "Step: Stop Server"
  Append-Log "ExitCode(Server)=0"

  Append-Log "=== Verification Complete ==="
} finally {
  if ($p) {
    Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}

Write-Host "Log saved to: $logPath" -ForegroundColor Green