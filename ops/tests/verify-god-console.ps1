param(
    [switch]$StartServices
)

$ErrorActionPreference = 'Stop'

function Write-Section($name) {
    Write-Host "`n=== $name ===" -ForegroundColor Cyan
}

function Kill-TentaiNode {
    Write-Section "Killing Tentai node processes"
    $procs = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Tentai Ecosystem*" }
    if ($procs) {
        $procs | ForEach-Object { Write-Host "Stopping PID $($_.Id) $($_.Path)"; Stop-Process -Id $_.Id -Force }
    } else {
        Write-Host "No Tentai-scoped node processes found"
    }
}

function Start-ServiceWindow($name, $workdir, $command) {
    Write-Host "Starting $name in new terminal: $command"
    Start-Process -FilePath "pwsh" -ArgumentList '-NoExit', '-Command', "cd -- '$workdir'; $command" -WorkingDirectory $workdir | Out-Null
}

function Wait-Port($port, $timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($listen) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Curl-Check($label, $url) {
    Write-Host "-- $label : $url"
    $cmd = 'C:\\Windows\\System32\\curl.exe'
    $output = & $cmd -sS -w "`n%{http_code}" -o - $url 2>&1
    $parts = $output -split "`n"
    $body = ($parts[0..($parts.Length-2)] -join "`n").Trim()
    $code = $parts[-1].Trim()
    Write-Host "HTTP $code"
    if ($body) { Write-Host $body }
    return [int]$code
}

$workspace = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$overseerDir = Join-Path $workspace 'core/overseer'
$sovereignDir = Join-Path $workspace 'clients/command/sovereign'

Kill-TentaiNode

if ($StartServices) {
    Write-Section "Starting services"
    Start-ServiceWindow "Overseer" $overseerDir "npm run dev"
    Start-ServiceWindow "Sovereign" $sovereignDir "npm run dev"
    Write-Host "Waiting 5s for processes to boot..."; Start-Sleep -Seconds 5
} else {
    Write-Host "Start Overseer and Sovereign manually in separate terminals, then rerun with -StartServices if desired." -ForegroundColor Yellow
}

Write-Section "Waiting for ports"
$portStatus = @{}
foreach ($p in 3200,3001) { $portStatus[$p] = Wait-Port $p 60 }
$portsOkBool = -not ($portStatus.Values -contains $false)
$portStatus.GetEnumerator() | ForEach-Object { Write-Host "Port $($_.Key) listening: $($_.Value)" }
if (-not $portsOkBool) { Write-Error "Ports not listening within timeout" }

Write-Section "Endpoint checks"
$results = @{}
$results['overseer_localhost'] = Curl-Check "Overseer localhost" "http://localhost:3200/health"
$results['overseer_loopback']  = Curl-Check "Overseer 127" "http://127.0.0.1:3200/health"
$results['sovereign_localhost'] = Curl-Check "Sovereign localhost" "http://localhost:3001/health"
$results['sovereign_loopback']  = Curl-Check "Sovereign 127" "http://127.0.0.1:3001/health"
$results['proxy_status'] = Curl-Check "Sovereign → Overseer status" "http://127.0.0.1:3001/overseer/ecosystem/status"

$failures = $results.GetEnumerator() | Where-Object { $_.Value -lt 200 -or $_.Value -ge 300 }
if ($failures) {
    Write-Host "FAIL" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  $($_.Key) → HTTP $($_.Value)" }
    exit 1
} else {
    Write-Host "PASS" -ForegroundColor Green
}

Write-Section "Port table"
Get-NetTCPConnection -LocalPort 3000,3001,3100,3200 -State Listen -ErrorAction SilentlyContinue | ft LocalAddress,LocalPort,State,OwningProcess -AutoSize
