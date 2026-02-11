# Runs Vi core in a persistent PowerShell session
param(
  [string]$WorkspaceRoot = "e:\Tentai Ecosystem\core\vi"
)

Push-Location $WorkspaceRoot
try {
  Write-Host "Starting Vi..." -ForegroundColor Cyan
  # Ensure environment from .env is picked by Node via dotenv
  npm start
} finally {
  Pop-Location
}