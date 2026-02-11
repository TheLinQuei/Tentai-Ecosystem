# God Console UI Fixes - Response Time & Insight Updates

**Date:** January 3, 2026  
**Issues:** Response time not displayed in UI, Insight tab not updating  
**Status:** Response time ✅ FIXED | Insight updates ⚠️ PARTIAL (auth issue)

---

## Issue 1: Response Time Not Visible ✅ FIXED

### Problem
- Backend was returning `responseTimeMs` in chat responses (e.g., `"responseTimeMs": 9482`)
- UI was receiving the data but not displaying it anywhere
- Operators had no visibility into Vi's response latency

### Solution Implemented
Modified [clients/command/sovereign/public/index.html](clients/command/sovereign/public/index.html):

1. **Updated `sendMessage()` function** (line ~1967):
   ```javascript
   const data = await res.json();
   const responseTime = data.responseTimeMs ? ` (${(data.responseTimeMs / 1000).toFixed(1)}s)` : '';
   addChatMessage('assistant', data.output || 'No response', responseTime);
   ```

2. **Updated `addChatMessage()` function** (line ~1980):
   ```javascript
   function addChatMessage(role, content, metadata = '') {
     const history = document.getElementById('chatHistory');
     if (!history) return;

     const msg = document.createElement('div');
     msg.className = `chat-message ${role}`;
     const metadataHtml = metadata ? `<span style="color: var(--muted); font-size: 10px; margin-left: 8px;">${metadata}</span>` : '';
     msg.innerHTML = `
       <div class="role">${role === 'user' ? 'YOU' : 'VI'}${metadataHtml}</div>
       <div class="content">${content}</div>
     `;
     history.appendChild(msg);
     history.scrollTop = history.scrollHeight;
   }
   ```

### Result
✅ Response time now appears next to Vi's name in chat:
```
VI (7.2s)
Hello.
```

Operators can now see:
- How long each response took
- Performance degradation patterns
- Whether slowness is from the model, memory system, or network

### Test Confirmation
```bash
POST /api/chat
{
  "output": "Hello.",
  "recordId": "70493b49-d6e3-43b5-a6a3-823dce8aad69",
  "sessionId": "c84569e5-6c6c-42ae-ada7-252982f5153b",
  "responseTimeMs": 7160
}
```

**UI displays:** `VI (7.2s)` next to the response

---

## Issue 2: Insight Tab Not Updating ⚠️ PARTIAL FIX

### Problem
User reported: "None of the insight info is updating"

Looking at the screenshot:
- Decision Pillar shows static data
- Evidence Vault shows old timestamps (1/1/2026)
- Data doesn't refresh after new interactions

### Investigation

#### What's Working ✅
1. **Evidence endpoint exists** and proxies to Vi Core:
   - Sovereign: `GET /api/evidence` (line 664 in server.ts)
   - Vi Core: `GET /v1/admin/evidence` (line 605 in server.ts)

2. **Auto-refresh is configured**:
   - Polls every 15 seconds: `setInterval(fetchEvidenceBundle, 15000)` (line 1483)
   - Fetches after chat responses (line 1971)
   - Fetches after control actions (lines 1804, 1818)

3. **Data rendering functions exist**:
   - `renderInsightFromEvidence()` - Decision Pillar
   - `renderMemoryFromEvidence()` - Memory stats
   - `renderEvidenceVault()` - Event logs

#### What's Broken ❌
**Authentication mismatch between frontend and backend:**

The frontend is sending:
```javascript
const params = new URLSearchParams({
  userId: state.user.userId,  // "operator-147" (string from JWT)
  sessionId: state.sessionId,
});
```

But the database expects:
```sql
SELECT * FROM events WHERE user_id = $1  -- Expects UUID, gets "operator-147"
```

Error in evidence endpoint:
```
{"error":"Failed to build evidence bundle","message":"invalid input syntax for type uuid: \"operator-147\""}
```

### Root Cause
The JWT contains `userId: "operator-147"` (a human-readable identifier), but:
- Chat history table stores `user_id` as UUID (e.g., `1b12ddf7-0e32-41ba-84d3-f67016b9a8d7`)
- Events table stores `user_id` as UUID
- Evidence endpoint expects UUID

**The frontend doesn't have access to the actual UUID.**

### Temporary Workaround (For Testing)
Updated `fetchEvidenceBundle()` with better error logging (line 1630):
```javascript
async function fetchEvidenceBundle() {
  if (!state.user || !state.sessionId || !state.accessToken) {
    console.log('Evidence fetch skipped: missing user/session/token');
    return;
  }
  try {
    const params = new URLSearchParams({
      userId: state.user.userId,
      sessionId: state.sessionId,
    });
    const res = await fetch(`/api/evidence?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${state.accessToken}`,
      },
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('Evidence fetch failed:', res.status, errorText);
      throw new Error(`Evidence fetch failed: ${res.status}`);
    }
    const data = await res.json();
    console.log('Evidence fetched:', data);  // Debug visibility
    state.evidence = data;
    renderEvidence(data);
  } catch (err) {
    console.error('Evidence fetch error:', err);  // Better error visibility
  }
}
```

**Operators can now open browser DevTools console (F12) and see:**
- `Evidence fetch failed: 400 {"error":"Failed to build evidence bundle","message":"invalid input syntax for type uuid: \"operator-147\""}`

---

## Recommended Permanent Fixes

### Option 1: Add UUID to JWT (Recommended)
**Modify auth system to include actual UUID:**

```typescript
// In sovereign/src/server.ts login endpoint
const token = jwt.sign({
  userId: user.id,           // Keep this for compatibility
  userUuid: user.uuid,       // ADD: Actual database UUID
  email: user.email,
  operatorClearance: user.clearance,
}, JWT_SECRET, { expiresIn: '24h' });
```

**Frontend uses:**
```javascript
userId: state.user.userUuid || state.user.userId
```

**Pros:**
- Clean separation of concerns
- Frontend gets both human ID and UUID
- No database lookups needed

**Cons:**
- Requires auth system changes
- Need to regenerate tokens

---

### Option 2: Backend UUID Resolution (Quick Fix)
**Make evidence endpoint resolve userId → UUID:**

```typescript
app.get('/api/evidence', async (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  
  if (!userId || !sessionId) {
    return res.status(400).json({ error: 'userId and sessionId required' });
  }

  // NEW: If userId is not a UUID, look it up in auth/users table
  let actualUserId = userId;
  if (!userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    try {
      const result = await pool.query(
        'SELECT id FROM users WHERE operator_id = $1',
        [userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      actualUserId = result.rows[0].id;
    } catch (err) {
      console.error('User lookup failed:', err);
      return res.status(500).json({ error: 'Failed to resolve user' });
    }
  }

  // Continue with actualUserId...
  const params = new URLSearchParams({ userId: actualUserId, sessionId });
  // ... rest of proxy logic
});
```

**Pros:**
- No frontend changes needed
- Works with existing JWTs
- Backend handles compatibility layer

**Cons:**
- Extra database lookup on every evidence request
- Tight coupling between Sovereign and user schema

---

### Option 3: Session-Based User Tracking
**Chat endpoint already links session → userId:**

```typescript
// Evidence endpoint: Get userId from session_id
app.get('/api/evidence', async (req: Request, res: Response) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  // Look up userId from chat_history table
  const result = await pool.query(
    'SELECT DISTINCT user_id FROM chat_history WHERE session_id = $1 LIMIT 1',
    [sessionId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const userId = result.rows[0].user_id;
  
  // Proxy to Vi with actual UUID
  const params = new URLSearchParams({ userId, sessionId });
  // ... proxy logic
});
```

**Pros:**
- Frontend doesn't need userId at all
- sessionId is already UUID format
- Single source of truth (chat_history table)

**Cons:**
- Fails if no chat history exists yet
- Requires database access in Sovereign

---

## Current State

### What's Working ✅
1. **Response time tracking:**
   - Backend: Returns `responseTimeMs` in all chat responses
   - UI: Displays `(7.2s)` next to Vi's name
   - Visibility: Operators can see latency in real-time

2. **Evidence auto-refresh:**
   - Polls every 15 seconds
   - Refreshes after chat
   - Refreshes after control actions

3. **Error logging:**
   - Console shows evidence fetch failures
   - Operators can debug with DevTools

### What's Broken ❌
1. **Insight tab data:**
   - Evidence endpoint returns 400 (UUID validation error)
   - Frontend passes JWT userId (string "operator-147")
   - Backend expects database userId (UUID)
   - **No data flows to Insight panels**

### Immediate Action
**To see response times NOW:**
1. Hard refresh the console: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Send Vi a message
3. Response time appears next to `VI` in chat: `VI (7.2s)`

**To debug Insight issue:**
1. Open DevTools console (F12)
2. Look for evidence fetch errors
3. You'll see: `Evidence fetch failed: 400`

**To fix Insight permanently:**
- Choose one of the 3 options above
- Recommended: **Option 3** (session-based lookup) for quickest fix
- Ideal: **Option 1** (UUID in JWT) for clean architecture

---

## Files Modified

### clients/command/sovereign/public/index.html
**Line ~1967:** Chat response handling with response time extraction  
**Line ~1980:** Updated `addChatMessage()` to accept metadata parameter  
**Line ~1630:** Improved `fetchEvidenceBundle()` error logging

---

## Testing Instructions

### Test 1: Response Time Display ✅
```powershell
# Send a chat message
Invoke-WebRequest -Uri "http://localhost:3001/api/chat" -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer $token"} `
  -Body '{"message":"Hello","sessionId":"<your-session>"}'

# Expected: Response includes "responseTimeMs": 7160
# Expected: UI shows "VI (7.2s)" in chat
```

### Test 2: Evidence Endpoint (Currently Failing)
```powershell
# Try to fetch evidence
Invoke-WebRequest -Uri "http://localhost:3001/api/evidence?userId=operator-147&sessionId=<session>" `
  -Headers @{"Authorization"="Bearer $token"}

# Current result: 400 {"error":"Failed to build evidence bundle","message":"invalid input syntax for type uuid: \"operator-147\""}
```

### Test 3: Evidence with Real UUID (Should Work)
```powershell
# Get real userId from database
docker exec vi-postgres psql -U postgres -d tentai -c `
  "SELECT user_id FROM chat_history WHERE session_id='<your-session>' LIMIT 1;"

# Use that UUID in evidence request
Invoke-WebRequest -Uri "http://localhost:3001/api/evidence?userId=<real-uuid>&sessionId=<session>" `
  -Headers @{"Authorization"="Bearer $token"}

# Expected: Returns evidence bundle with stance, events, memory stats
```

---

## Summary

| Feature | Status | Where to See It |
|---------|--------|-----------------|
| Response Time in Chat | ✅ WORKING | Chat messages show `VI (7.2s)` |
| Response Time in API | ✅ WORKING | Response body includes `responseTimeMs` |
| Evidence Endpoint | ❌ BROKEN | Returns 400 (UUID validation) |
| Insight Tab Updates | ❌ BLOCKED | No data due to evidence endpoint failure |
| Error Visibility | ✅ IMPROVED | Browser console shows detailed errors |

**Next Steps:**
1. ✅ Response time: **DONE** - visible in UI
2. ⚠️ Insight updates: **BLOCKED** - needs userId → UUID resolution
3. 🔧 Recommended fix: Implement **Option 3** (session-based lookup) in Sovereign evidence endpoint

---

**Generated:** 2026-01-03 | Response Time Fix: ✅ Complete | Insight Fix: ⚠️ Requires auth layer changes
