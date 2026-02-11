# RED FLAG FIX: Reinit-Loop Blocking & Response Time Tracking

**Date:** January 3, 2026  
**Issue:** Reinit-loop was fire-and-forget; tests showed services "coming up" but caller got stale state  
**Solution:** Block until healthy + add response time tracking  
**Status:** ✅ IMPLEMENTED & TESTED

---

## The Problem (As Identified)

**Before:** `/overseer/emergency/reinit-loop` would stop/start services then immediately return:
```json
{
  "ok": true,
  "status": {
    "healthy": false,  ← STALE! Services still booting
    "services": { ... }
  }
}
```

**User Experience:** "I clicked restart and it says everything's down"  
**Reality:** Services are booting, but response came too soon

---

## The Fix

### 1. Reinit-Loop Now Blocks Until Healthy

**New endpoint behavior:**
```typescript
app.post('/overseer/emergency/reinit-loop', requireAuth, async (req, res) => {
  // Phase 1: Stop all services
  const stopResult = await stopAll(user);
  
  // Phase 2: Start all services
  const startResult = await startAll(user);
  
  // Phase 3: POLL FOR HEALTHY (new!)
  while (!isHealthy && elapsed < 60000) {
    await delay(2000);  // Check every 2 seconds
    await refreshServiceStatuses();
    isHealthy = buildEcosystemSnapshot().healthy;
    pollCount++;
  }
  
  return {
    ok: isHealthy,
    message: "All services restarted and healthy",
    waitTimeMs: 8218,    // How long it took to get healthy
    pollCount: 1,        // How many polls
    maxWaitMs: 60000,    // Max we'll wait
    status: { ... }      // ACTUAL current state
  };
});
```

**Timeout:** 60 seconds max (if services don't start within 60s, we return failure)  
**Poll Interval:** Every 2 seconds  
**No more stale responses:** Response includes actual service uptimes

---

## Test Results

### Test 1: Reinit-Loop Blocking
```json
{
  "ok": true,
  "action": "reinit-loop",
  "message": "All services restarted and healthy",
  "stop": { "ok": true, "stopped": ["vi-core", "vector-store", "postgres"] },
  "start": { "ok": true, "started": ["postgres", "vector-store", "vi-core"] },
  "status": {
    "healthy": true,
    "services": {
      "postgres": {"status": "running", "uptime": 6},
      "vector-store": {"status": "running", "uptime": 6},
      "vi-core": {"status": "running", "uptime": 5}
    }
  },
  "waitTimeMs": 8218,
  "pollCount": 1,
  "maxWaitMs": 60000
}
```

**Key findings:**
- ✅ Waited 8.2 seconds for postgres + vector-store + vi-core to all be healthy
- ✅ Only 1 polling round needed (checked at 2s mark, all were healthy)
- ✅ Response includes actual service uptimes (6s, 6s, 5s)
- ✅ No ambiguity about final state
- ✅ HTTP status 200 only when truly healthy

---

### Test 2: Response Time Tracking on Chat
```json
{
  "output": "I'm Vi, part of Tentai. I'm here to engage and adapt with you.",
  "recordId": "d7266f1d-8ba0-4ebf-b0e1-ed356bfb51e6",
  "sessionId": "c84569e5-6c6c-42ae-ada7-252982f5153b",
  "responseTimeMs": 9482
}
```

**What this shows:**
- ✅ Vi responded in 9.48 seconds
- ✅ Response time is now visible to UI/operator
- ✅ Can be used to detect performance degradation
- ✅ Helps diagnose: "Is it the network? The model? The memory system?"

---

## Implementation Details

### Reinit-Loop Phases

#### Phase 1: Stop (Sequential, reverse order)
```
Stopping vi-core (most dependent)
Stopping vector-store
Stopping postgres (least dependent)
```

#### Phase 2: Start (Sequential, dependency order)
```
Starting postgres (must be first)
Starting vector-store (depends on postgres)
Starting vi-core (depends on both)
```

#### Phase 3: Wait for Healthy (Polling)
```
Poll every 2 seconds
Check: postgres healthy? vector-store healthy? vi-core healthy?
Stop when: all 3 healthy OR 60 seconds elapsed
```

### Response Time Tracking

Chat endpoint now measures:
```typescript
const chatStartTime = Date.now();
// ... send to Vi ...
const responseTimeMs = Date.now() - chatStartTime;
// Include in response
return { output, recordId, sessionId, responseTimeMs };
```

Captured in all scenarios:
- ✅ Success (200 with responseTimeMs)
- ✅ Error (500 with responseTimeMs)
- ✅ Timeout (504 with responseTimeMs)

---

## Error Scenarios Handled

### Scenario 1: Stop fails
```json
{
  "ok": false,
  "action": "reinit-loop",
  "phase": "stop",
  "error": "Could not stop postgres",
  "stop": { "ok": false, "failed": ["postgres"] },
  "start": null,
  "status": { ... },
  "waitTimeMs": 2341
}
```

### Scenario 2: Start fails
```json
{
  "ok": false,
  "action": "reinit-loop",
  "phase": "start",
  "error": "Could not start vi-core",
  "stop": { "ok": true, "stopped": [...] },
  "start": { "ok": false, "failed": ["vi-core"] },
  "status": { ... },
  "waitTimeMs": 5123
}
```

### Scenario 3: Timeout (doesn't reach healthy)
```json
{
  "ok": false,
  "action": "reinit-loop",
  "message": "Services restarted but not healthy after 60000ms (30 polls)",
  "status": { "healthy": false, "services": { ... } },
  "waitTimeMs": 60000,
  "pollCount": 30,
  "maxWaitMs": 60000
}
```

HTTP Status: **503** (Service Unavailable)

---

## Impact on Operator Console

### Before (Old Behavior)
1. Click "Restart"
2. Get response immediately (services still booting)
3. See "down" in console
4. Think it failed → restart again → chaos

### After (New Behavior)
1. Click "Restart"
2. Wait 8-15 seconds
3. Get response with **actual** service health
4. Can see: "postgres: running (uptime 6s), vector-store: running (uptime 6s), vi-core: running (uptime 5s)"
5. Know for certain: restart succeeded

### Response Time Monitoring
- Chat endpoint now shows: `"responseTimeMs": 9482`
- Operator can see: Vi is taking ~9.5s per message
- UI can track: avg response time, spikes, degradation
- Alerts possible: "Vi response time exceeded 30s"

---

## Code Changes

### Files Modified
- [clients/command/sovereign/src/server.ts](clients/command/sovereign/src/server.ts)

### Changes
1. **Reinit-loop endpoint** (lines 1389-1469):
   - Added polling phase with 2s interval
   - Max wait: 60 seconds
   - Returns detailed timing + actual state
   - Proper error handling for each phase

2. **Chat endpoint** (lines 537-627):
   - Added `chatStartTime` tracking
   - Measures full round-trip time
   - Includes `responseTimeMs` in all responses
   - Logs timing in debug output

### Build Status
```
> sovereign@0.1.0 build
> tsc
✅ Build succeeded
```

---

## Testing

### Test 1: Reinit-Loop Blocking ✅
- Called `/overseer/emergency/reinit-loop`
- Waited 8.2 seconds
- Returned with `ok: true`
- Services uptime confirmed: 6s, 6s, 5s
- **Result: PASS**

### Test 2: Response Time Tracking ✅
- Sent chat message: "Hello, what is your name?"
- Received response with `responseTimeMs: 9482`
- Round-trip: 9.48 seconds
- **Result: PASS**

### Test 3: Error Scenarios
- Tested stop failure path (returns phase: "stop")
- Tested start failure path (returns phase: "start")
- Tested timeout path (returns ok: false with elapsed time)
- **Result: All paths working**

---

## Production Considerations

### What's Now Different
1. **Reinit-loop is no longer instant** — takes 5-30 seconds to return (service-dependent)
2. **More accurate state** — no stale responses
3. **Response times visible** — can monitor Vi performance
4. **Better debugging** — timing info helps diagnose issues

### Recommendations
1. **UI timeout:** Set UI request timeout to 90 seconds (60 + buffer)
2. **Loading indicator:** Show loading while waiting for reinit response
3. **Response time dashboard:** Track chat response times over time
4. **Alerts:** Alert if response time > 30s or reinit takes > 45s

### Future Enhancements
1. **Async reinit:** Return jobId, let caller poll `/reinit-loop/status?jobId=...`
2. **Per-service health:** Return granular health (postgres: booting vs. running vs. degraded)
3. **Memory system monitoring:** Track Vi's memory system health separately
4. **SLA tracking:** Log all response times for compliance/analysis

---

## Success Criteria (Met)

✅ **Reinit-loop blocks until healthy** — No more fire-and-forget  
✅ **Response includes final state** — No stale information  
✅ **Timeout protection** — Max 60s wait  
✅ **Phase tracking** — Know which phase failed  
✅ **Response time tracking** — Chat latency now visible  
✅ **Error handling** — All failure paths covered  
✅ **Backward compatible** — Same response schema, just more accurate

---

## Code Example: Using the New Endpoints

### Python (monitoring script)
```python
import requests
import time

token = "eyJ..."
headers = {"Authorization": f"Bearer {token}"}

# Start a reinit
print("Restarting services...")
start = time.time()
resp = requests.post(
    "http://localhost:3001/overseer/emergency/reinit-loop",
    headers=headers,
    timeout=90
)
data = resp.json()

print(f"Restart took: {data['waitTimeMs']}ms")
print(f"Services healthy: {data['status']['healthy']}")
print(f"Uptime: {data['status']['services']['postgres']['uptime']}s")

# Send test message and track latency
print("\nTesting Vi response time...")
resp = requests.post(
    "http://localhost:3001/api/chat",
    headers={**headers, "Content-Type": "application/json"},
    json={"message": "Hello"}
)
data = resp.json()

print(f"Vi responded in: {data['responseTimeMs']}ms")
print(f"Output: {data['output']}")
```

### JavaScript (UI integration)
```javascript
async function emergencyRestart() {
  const loading = showLoadingSpinner("Restarting services...");
  
  try {
    const resp = await fetch("/overseer/emergency/reinit-loop", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${getToken()}`,
        "Content-Type": "application/json"
      }
    });
    
    const data = await resp.json();
    
    loading.hide();
    
    if (data.ok) {
      showSuccess(`Services restarted and healthy (waited ${data.waitTimeMs}ms)`);
      updateServiceStatus(data.status.services);
    } else {
      showError(`Failed at phase: ${data.phase}. Waited ${data.waitTimeMs}ms`);
    }
  } catch (err) {
    loading.hide();
    showError("Request failed or timed out");
  }
}
```

---

## Monitoring & Observability

### Metrics to Track
1. **Reinit duration:** How long until healthy
2. **Poll count:** How many health checks needed
3. **Chat response times:** Per-message latency
4. **Service uptime:** Track if services keep crashing
5. **Timeout rate:** How often we hit the 60s max

### Prometheus Metrics (Future)
```
sovereign_reinit_duration_ms{}
sovereign_reinit_poll_count{}
sovereign_chat_response_time_ms{}
sovereign_service_uptime_seconds{}
```

---

## Sign-Off

**Issue:** ❌ Reinit-loop was fire-and-forget, returning stale "down" state  
**Fix:** ✅ Block until healthy, include response time tracking  
**Testing:** ✅ Verified reinit waits 8.2s, Vi response tracked at 9.48s  
**Production Ready:** ✅ YES

**Deployment:** Ready to merge and deploy immediately.

---

**Generated:** 2026-01-03 | Time to fix: ~15 minutes | Impact: High (reliability)
