# Vi Brain - Phase 3 Reasoning Pipeline
# Run from apps/brain directory

Push-Location $PSScriptRoot

$env:BRAIN_PORT = "4312"
$env:MEMORY_API = "http://localhost:4311"
$env:NATS_URL = "nats://localhost:4222"
$env:LLM_MODEL = "gpt-4o-mini"

Write-Host "Vi Brain - Starting..." -ForegroundColor Cyan
Write-Host "   Working Dir: $PSScriptRoot" -ForegroundColor Gray
Write-Host "   Memory API:  $env:MEMORY_API" -ForegroundColor Gray
Write-Host "   NATS:        $env:NATS_URL" -ForegroundColor Gray
Write-Host "   Port:        $env:BRAIN_PORT" -ForegroundColor Gray
Write-Host "   LLM Model:   $env:LLM_MODEL" -ForegroundColor Gray
Write-Host ""

# Note: dotenv/config is now imported directly in src/index.ts
pnpm tsx watch src/index.ts

Pop-Location

