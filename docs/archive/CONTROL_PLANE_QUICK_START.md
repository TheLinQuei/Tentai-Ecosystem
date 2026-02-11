# Quick Start: Vi Control Plane Testing

## Overview

The Vi Sovereign control plane has been fully validated. All critical endpoints, auth flows, and state management are working correctly.

**Status: ✅ READY FOR DEPLOYMENT**

---

## Running the Tests

### Prerequisites
- Docker Compose services running (`postgres`, `vector-store`, `vi-core`, `sovereign`)
- Test user available: `mb-test@example.com` / `Test@1234`
- Network access to `http://localhost:3001`

### Quick Validation (5 minutes)

```powershell
# Get a token
$loginRes = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" `
    -Method POST -ContentType "application/json" `
    -Body '{"email":"mb-test@example.com","password":"Test@1234"}' `
    -UseBasicParsing
$token = ($loginRes.Content | ConvertFrom-Json).data.accessToken
$headers = @{ "Authorization" = "Bearer $token" }

# Test 1: Read control state
Invoke-WebRequest -Uri "http://localhost:3001/overseer/control/state" `
    -Headers $headers -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json

# Test 2: Change behavior mode
Invoke-WebRequest -Uri "http://localhost:3001/overseer/control/behavior" `
    -Method POST -Headers $headers -Body '{"mode":"strict"}' `
    -ContentType "application/json" -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json

# Test 3: Snapshot memory
Invoke-WebRequest -Uri "http://localhost:3001/overseer/control/memory" `
    -Method POST -Headers $headers -Body '{"action":"snapshot"}' `
    -ContentType "application/json" -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json
```

### Full Test Suite (20 minutes)

All tests documented in [TEST_RESULTS_CONTROL_PLANE.md](TEST_RESULTS_CONTROL_PLANE.md)

- **Phase A:** Auth & Endpoints (5 min)
- **Phase C:** Control Actions (5 min)
- **Phase D:** UI Integration (5 min)
- **Phase E:** E2E Suite (5 min)

---

## Control Plane Endpoints

### State Queries (Read-Only)

```
GET /overseer/control/state
  Returns: behaviorMode, memoryLocked, memoryCheckpoints, lastFlushAt, lastRollbackAt
  Auth: Bearer token (required)
  Status: ✅ TESTED

GET /overseer/ecosystem/status
  Returns: healthy, services[], timestamp
  Auth: None required
  Status: ✅ TESTED

GET /overseer/audit/log
  Returns: entries[], count, days
  Auth: Bearer token (required)
  Status: ✅ TESTED
```

### Control Actions (Write)

```
POST /overseer/control/behavior
  Body: { mode: "learning|strict|autonomous|observer" }
  Returns: ok, behaviorMode
  Auth: Bearer token (required)
  Status: ✅ TESTED

POST /overseer/control/memory
  Body: { action: "flush-short|lock-long|unlock-long|snapshot|rollback", note?, checkpointId? }
  Returns: ok, action, message, memoryLocked, memoryCheckpoints
  Auth: Bearer token (required)
  Status: ✅ TESTED
```

### Emergency Operations

```
POST /overseer/emergency/halt
  Stops all services and exits test mode
  Auth: Bearer token (required)
  Status: ✅ TESTED

POST /overseer/emergency/reinit-loop
  Stops all services then restarts them
  Auth: Bearer token (required)
  Status: ✅ TESTED
```

### Service Orchestration

```
POST /overseer/ecosystem/start-all
  Starts postgres, vector-store, vi-core in order
  Auth: Bearer token (required)

POST /overseer/ecosystem/stop-all
  Stops all managed services
  Auth: Bearer token (required)

GET /overseer/services/:id/status
  Check individual service health
  Auth: None required

POST /overseer/services/:id/start|stop|restart
  Control individual service
  Auth: Bearer token (required)
```

---

## Authentication

### Login Flow
```
POST /api/auth/login
  Body: { email: "user@example.com", password: "..." }
  Returns: { data: { accessToken, refreshToken, expiresIn } }
  Status: ✅ TESTED
```

### Token Usage
```
Headers: Authorization: Bearer <accessToken>
TTL: 900 seconds (15 minutes)
Refresh: POST /api/auth/refresh with refreshToken
```

---

## Expected Responses

### Success (200)
```json
{
  "ok": true,
  "behaviorMode": "strict",
  "memoryLocked": false,
  "memoryCheckpoints": [
    {
      "id": "chk-1767465537498",
      "timestamp": "2026-01-03T18:38:57.498Z",
      "note": "checkpoint note"
    }
  ]
}
```

### Unauthorized (401)
```json
{
  "error": "unauthorized"
}
```

### Bad Request (400)
```json
{
  "error": "mode must be one of: learning, strict, autonomous, observer"
}
```

---

## Behavior Modes Explained

| Mode | Purpose | Use Case |
|------|---------|----------|
| **learning** | Open, inquisitive, takes risks | Development, exploration |
| **strict** | Cautious, conservative, asks before acting | Production, safety-critical |
| **autonomous** | Self-directed, high confidence | Established workflows |
| **observer** | Read-only, no actions | Debugging, audit mode |

---

## Memory Controls Explained

| Action | Effect | Use Case |
|--------|--------|----------|
| **flush-short** | Clear short-term memory | Start fresh context |
| **lock-long** | Prevent long-term memory writes | Preserve state |
| **unlock-long** | Re-enable long-term memory writes | Resume learning |
| **snapshot** | Create memory checkpoint | Before risky operations |
| **rollback** | Restore to previous snapshot | Undo bad decisions |

---

## Audit Trail

All control plane actions are logged:
```
GET /overseer/audit/log?days=1
```

Returns entries with:
- `timestamp`: When action occurred
- `action`: What was done (e.g., "behavior.mode", "memory.snapshot")
- `userId`: Who performed it
- `status`: success or failure
- `details`: Additional context

---

## Troubleshooting

### "Connection refused" on localhost:3001
- Check: `docker ps | grep sovereign`
- Restart: `docker restart sovereign`

### 401 Unauthorized on control endpoints
- Check: Bearer token in Authorization header
- Check: Token not expired (TTL 900s)
- Refresh: If expired, call `/api/auth/refresh`

### State not persisting
- Check: Using same token across requests
- Check: No network errors (HTTP 200)
- Verify: Call GET /overseer/control/state immediately after change

### Services won't start/stop
- Check: Docker Compose running
- Check: Services not already in desired state
- Check: Sufficient permissions

---

## Known Behaviors

1. **State is ephemeral:** Control state (behavior mode, memory locks) survives service restart but isn't persisted to database yet
2. **Audit log is in-memory:** Not persisted; cleared on server restart
3. **Bearer tokens only:** Cookies not used for control plane auth
4. **Service detection:** Relies on Docker health checks; assumes Compose orchestration
5. **No rate limiting:** Control endpoints not rate-limited (add in production if needed)

---

## Next: Operator Console UI Testing

Once control plane validation complete, test full UI:

1. **Login:** http://localhost:3001 → Login tab
2. **Command Console:** Navigate to COMMAND tab
3. **Chat:** Send test message, observe decision pillar
4. **Controls:** Click behavior mode buttons, memory controls
5. **Evidence:** View complete trace of chat decision-making
6. **Audit:** Check audit log for all actions

See [TEST_RESULTS_CONTROL_PLANE.md](TEST_RESULTS_CONTROL_PLANE.md) for phase D2 UI test results.

---

## Success Criteria

✅ All endpoints respond with correct HTTP status codes  
✅ All control actions persist immediately  
✅ All auth token flows work correctly  
✅ All audit entries logged  
✅ All error messages are JSON (not HTML fallback)  
✅ UI buttons wire to correct backend endpoints  

**Current Status: ALL CRITERIA MET** ✅

---

## Questions?

- Check [TEST_RESULTS_CONTROL_PLANE.md](TEST_RESULTS_CONTROL_PLANE.md) for detailed test results
- Review [clients/command/sovereign/src/server.ts](clients/command/sovereign/src/server.ts) for endpoint implementation
- Review [clients/command/sovereign/public/index.html](clients/command/sovereign/public/index.html) for UI integration
