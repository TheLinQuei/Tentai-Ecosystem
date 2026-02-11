#Requires -RunAsAdministrator

param(
  [switch]$ShowUI = $true
)

$ErrorActionPreference = "Stop"

function Write-Header {
  Write-Host "`n╔════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "║     Vi Console Setup Installer         ║" -ForegroundColor Cyan
  Write-Host "╚════════════════════════════════════════╝`n" -ForegroundColor Cyan
}

function Write-Success {
  param([string]$Message)
  Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error-Message {
  param([string]$Message)
  Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)
  Write-Host "ℹ $Message" -ForegroundColor Yellow
}

Write-Header

# Check if running as admin
$isMemberOfAdminGroup = ([Security.Principal.WindowsIdentity]::GetCurrent()).Groups -contains 'S-1-5-32-544'
if (-not $isMemberOfAdminGroup) {
  Write-Error-Message "This installer must run as Administrator."
  Write-Info "Please right-click PowerShell and select 'Run as Administrator'"
  exit 1
}

Write-Success "Running with Administrator privileges"

# Step 1: Create desktop shortcut
Write-Host "`n[1/3] Creating desktop shortcut..." -ForegroundColor Cyan
$launcher = "E:\Tentai Ecosystem\ops\vi-launcher\Launch-Vi.cmd"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Launch Vi.lnk"

if (-not (Test-Path $launcher)) {
  Write-Error-Message "Launcher script not found: $launcher"
  exit 1
}

try {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $launcher
  $shortcut.WorkingDirectory = Split-Path $launcher
  $shortcut.IconLocation = "$env:WINDIR\System32\shell32.dll, 1"
  $shortcut.Save()
  Write-Success "Desktop shortcut created: $shortcutPath"
} catch {
  Write-Error-Message "Failed to create shortcut: $_"
  exit 1
}

# Step 2: Register Task Scheduler job
Write-Host "`n[2/3] Registering Task Scheduler job..." -ForegroundColor Cyan
$taskXml = "E:\Tentai Ecosystem\ops\vi-launcher\TaskScheduler-Vi-utf16.xml"

if (-not (Test-Path $taskXml)) {
  Write-Error-Message "Task XML not found: $taskXml"
  exit 1
}

try {
  $schtasks = "$env:WINDIR\System32\schtasks.exe"
  & $schtasks /Create /TN "Vi-Startup" /XML $taskXml /F > $null 2>&1
  
  if ($LASTEXITCODE -eq 0) {
    Write-Success "Task 'Vi-Startup' registered (auto-start on login)"
  } else {
    Write-Info "Note: Task creation may require administrator confirmation"
    Write-Info "If needed, import manually: Task Scheduler → Create Task → Import Task → select $taskXml"
  }
} catch {
  Write-Info "Could not auto-register task. Import manually via Task Scheduler."
}

# Step 3: Summary
Write-Host "`n[3/3] Setup complete!" -ForegroundColor Cyan
Write-Host "`n╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     Vi is ready to launch!              ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "What's installed:" -ForegroundColor Yellow
Write-Host "  ✓ Desktop shortcut: Launch Vi.lnk"
Write-Host "  ✓ Auto-start on login: Vi-Startup task"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Double-click 'Launch Vi.lnk' to start Vi anytime"
Write-Host "  2. Vi will auto-start after you restart or log in next time"
Write-Host "  3. Open https://tentaitech.com/console to access the console"
Write-Host ""
Write-Host "Launcher script location: $launcher" -ForegroundColor DarkGray
Write-Host ""

if ($ShowUI) {
  Read-Host "Press Enter to close this window"
}
