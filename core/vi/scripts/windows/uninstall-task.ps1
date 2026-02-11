# Removes the Scheduled Task for Vi
param(
  [string]$TaskName = "ViCore-StartOnLogon"
)

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
  Write-Host "✓ Scheduled Task '$TaskName' removed" -ForegroundColor Yellow
} catch {
  Write-Host "Failed to remove task: $($_.Exception.Message)" -ForegroundColor Red
  throw
}