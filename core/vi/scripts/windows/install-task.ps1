# Registers a Scheduled Task to start Vi on user logon
param(
  [string]$WorkspaceRoot = "e:\Tentai Ecosystem\core\vi",
  [string]$TaskName = "ViCore-StartOnLogon"
)

$action = New-ScheduledTaskAction -Execute "pwsh.exe" -Argument "-NoProfile -WindowStyle Hidden -File `"$WorkspaceRoot\scripts\windows\run-vi.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Start Vi core server at user logon" -ErrorAction Stop
  Write-Host "✓ Scheduled Task '$TaskName' installed" -ForegroundColor Green
} catch {
  Write-Host "Failed to install task: $($_.Exception.Message)" -ForegroundColor Red
  throw
}