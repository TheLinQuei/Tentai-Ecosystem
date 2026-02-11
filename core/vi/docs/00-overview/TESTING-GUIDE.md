# Quick Start Guide - Vi Testing

## Problem: Vi Exits When Output is Piped
Vi runs in an event loop and exits when stdin closes. Piping output (`|`, `>`, `Tee-Object`) closes stdin.

## Solution: Run Vi in Dedicated Window

### Start Vi
```powershell
cd "E:\Tentai Ecosystem\core\vi"
pwsh start-vi.ps1  # Starts Vi in new window on port 3100
```

You'll see a new PowerShell window with Vi running. **Leave that window open.**

### Verify Vi is Running
In your main terminal:
```powershell
Invoke-RestMethod -Uri "http://localhost:3100/v1/health"
# Should return: status=ok, version=0.1.0
```

### Run Tests

#### Option 1: Manual Testing (Recommended for Phase 2.0 tests)
1. Start Sovereign:
   ```powershell
   cd "E:\Tentai Ecosystem\clients\command\sovereign"
   npm start
   ```
2. Open http://localhost:3001 in browser
3. Follow [TEST-SCRIPT.md](../../../clients/command/sovereign/TEST-SCRIPT.md) scenarios

#### Option 2: API Testing
```powershell
cd "E:\Tentai Ecosystem\core\vi"
node test-vi-direct.js  # Tests chat API directly
```

**Important:** Do NOT pipe Vi's output (`node dist/main.js > log.txt`). Use `start-vi.ps1` instead.

### Stop Vi
Close the PowerShell window running Vi, or press Ctrl+C in that window.

### Troubleshooting

**"Port 3100 already in use"**
```powershell
Get-NetTCPConnection -LocalPort 3100 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**"Vi window closes immediately"**
- Check if port 3100 is already in use (see above)
- Check PostgreSQL is running: `docker ps` should show `vi-postgres-1`
- Look for errors in the Vi window before it closes

**"Health check fails"**
```powershell
# Check if Vi is actually listening
Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue

# If nothing, Vi is not running - check the Vi window for errors
```

### Environment Variables
- `VI_PORT`: Override default port (default: 3100 via start-vi.ps1)
- `DATABASE_URL`: Postgres connection (default: from .env)
- `PROVIDER_PROFILE`: LLM provider config (default: "default")

### Next Steps for 77EZ Stack
See [77EZ-STACK-TRACKER.md](../../ops/tentai-docs/00-ecosystem/77EZ-STACK-TRACKER.md) for full roadmap.

**Current priority:** Run regression tests to verify Phase 2.0 fixes (name persistence, self-model, relational probes, banned phrases).
