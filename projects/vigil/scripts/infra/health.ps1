param(
  [int]$TimeoutSec = 60
)

$deadline = (Get-Date).AddSeconds($TimeoutSec)

function Test-Port($host, $port) {
  try { (New-Object System.Net.Sockets.TcpClient).Connect($host, $port); return $true } catch { return $false }
}

Write-Host "Checking services..."

while ((Get-Date) -lt $deadline) {
  $ok = $true
  if (-not (Test-Port localhost 5434)) { Write-Host "postgres not ready"; $ok = $false }
  if (-not (Test-Port localhost 6333)) { Write-Host "qdrant not ready"; $ok = $false }
  if (-not (Test-Port localhost 7687)) { Write-Host "neo4j not ready"; $ok = $false }
  if (-not (Test-Port localhost 6380)) { Write-Host "redis not ready"; $ok = $false }
  if (-not (Test-Port localhost 4222)) { Write-Host "nats not ready"; $ok = $false }
  if (-not (Test-Port localhost 9090)) { Write-Host "prometheus not ready"; $ok = $false }
  if (-not (Test-Port localhost 3000)) { Write-Host "grafana not ready"; $ok = $false }

  if ($ok) { Write-Host "All core services are reachable."; exit 0 }
  Start-Sleep -Seconds 2
}

Write-Error "Timeout waiting for services"
exit 1
