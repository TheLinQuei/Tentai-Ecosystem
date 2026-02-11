# God Console (God-1) - Test Guide

## Server Status
Overseer is running on: **http://localhost:3200**

---

## Quick Test Commands (PowerShell)

### 1. Health Check
```powershell
Invoke-RestMethod http://localhost:3200/health | ConvertTo-Json
```

### 2. Get Ecosystem Status (One Truth)
```powershell
Invoke-RestMethod http://localhost:3200/overseer/ecosystem/status | ConvertTo-Json -Depth 5
```

### 3. Start All Services (Orchestrated Cascade)
```powershell
Invoke-RestMethod -Method POST http://localhost:3200/overseer/ecosystem/start-all | ConvertTo-Json -Depth 5
```

### 4. Stop All Services (Reverse Order)
```powershell
Invoke-RestMethod -Method POST http://localhost:3200/overseer/ecosystem/stop-all | ConvertTo-Json -Depth 5
```

### 5. View Audit Log (Last 24 Hours)
```powershell
Invoke-RestMethod "http://localhost:3200/overseer/audit/log?days=1" | ConvertTo-Json -Depth 5
```

### 6. Individual Service Control
```powershell
# Start Vi Core
Invoke-RestMethod -Method POST http://localhost:3200/overseer/services/vi-core/start

# Stop Vi Core
Invoke-RestMethod -Method POST http://localhost:3200/overseer/services/vi-core/stop

# Restart Vi Core
Invoke-RestMethod -Method POST http://localhost:3200/overseer/services/vi-core/restart

# Get Vi Core Status
Invoke-RestMethod http://localhost:3200/overseer/services/vi-core/status
```

---

## God Console UI

**URL:** http://localhost:3200

The UI shows:
- **Ecosystem Status Panel** - Real-time health of all 6 services
- **Audit Log Panel** - Last 20 actions with timestamps
- **Start All Button** - Orchestrated cascade startup
- **Stop All Button** - Reverse-order shutdown

---

## Registered Services (6 Total)

### Tier 1 (Critical - Start First)
- **vi-core** - Port 3100 - Main Vi engine

### Tier 2 (Critical/Non-Critical)
- **memory-store** - Port 3050 - Memory layer (critical)
- **vector-store** - Port 6333 - Qdrant vector DB (critical)
- **redis** - Port 6379 - Cache layer (non-critical)

### Tier 3 (Workers)
- **workers** - Port 3150 - Worker pool (non-critical)

### Tier 4 (UI)
- **sovereign** - Port 3001 - God Console UI (non-critical)

---

## God-1 Features Implemented

✅ **Multi-Service Ecosystem Control**
- 6 services registered with proper dependency ordering
- Critical vs non-critical flagging
- Start order cascading (1→2→3→4)

✅ **State Machine**
- States: `stopped`, `starting`, `running`, `stopping`, `crashed`, `degraded`
- Auto-degradation after 30s timeout
- Crash detection and counting

✅ **Immutable Audit Trail**
- Append-only JSONL files in `.overseer-audit/`
- Every action logged: timestamp, action, service, user, result, duration
- Query by days: `/overseer/audit/log?days=N`

✅ **Safety Mechanisms**
- Lockout: 1000ms between commands per service (spam prevention)
- Degradation timer: auto-mark DEGRADED if start exceeds 30s
- Crash tracking: increment crashCount on process exit

✅ **Ecosystem Orchestration**
- `startAll()`: cascade by startOrder, fail-fast on critical services
- `stopAll()`: reverse-order shutdown
- `getEcosystemStatus()`: one-truth health snapshot

---

## Test in Real Browser

Open Chrome/Edge/Firefox to: **http://localhost:3200**

The God Console UI will:
1. Auto-poll ecosystem status every 5 seconds
2. Auto-poll audit log every 5 seconds
3. Display all 6 services with status colors
4. Show "Bring Vi Online" and "Take Vi Offline" buttons

Click "Bring Vi Online" to test orchestration.

---

## Verify Overseer Is Running

```powershell
Get-NetTCPConnection -LocalPort 3200 | Select-Object State, LocalPort, OwningProcess
```

Should show: `State: Listen, LocalPort: 3200`

---

## Audit Log Location

`.overseer-audit/audit-YYYY-MM-DD.jsonl`

Example:
```
E:\Tentai Ecosystem\.overseer-audit\audit-2025-12-29.jsonl
```

View latest entries:
```powershell
Get-Content "E:\Tentai Ecosystem\.overseer-audit\audit-*.jsonl" -Tail 10
```

---

**God-1 is operational. All endpoints verified. UI served. Audit system active.**
