param(
  [switch]$OpenConsole,
  [string]$ConsoleUrl = "https://tentaitech.com/console"
)

$ErrorActionPreference = "Stop"

function Write-Status {
  param([string]$Message)
  Write-Host "[Vi Launcher] $Message"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$viDir = Join-Path $repoRoot "core\vi"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Status "Docker is not available in PATH. Install Docker Desktop or add docker.exe to PATH."
  exit 1
}

Write-Status "Starting Vi containers..."
Push-Location $viDir
try {
  docker compose up -d
  Write-Status "Vi is starting."
} finally {
  Pop-Location
}

if ($OpenConsole) {
  Write-Status "Opening console: $ConsoleUrl"
  Start-Process $ConsoleUrl
}
