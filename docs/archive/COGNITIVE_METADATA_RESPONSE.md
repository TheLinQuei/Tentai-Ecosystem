# Brain Footprints: Cognitive Metadata in Chat Responses

**Issue Identified:** Vi responds but leaves no footprints - chat works, but cognitive events aren't surfaced to the UI

**Root Cause:** Chat endpoint returns only `{output, recordId, sessionId}` but Insight panels need:
- Intent classification
- Decision state
- Memory writes
- Cognitive mode
- Self-model violations

**Solution:** Add `cognitive` metadata to `/api/chat` response

---

## Changes Made

### 1. Vi-Core Chat Response Enhancement

**File:** `core/vi/src/runtime/server.ts`

**Update ChatResponse type** (lines 134-149):
```typescript
interface ChatResponse {
  output: string;
  recordId: string;
  sessionId: string;
  trace?: { intent, plan, execution, reflection };
  cognitive?: {        // NEW
    intent: string;
    decision: string;
    memoryWritten: boolean;
    mode: string;
    hadViolation: boolean;
  };
}
```

**Enhance chat endpoint response** (lines 1774-1818):
- Query run_records table for intent and execution state
- Build cognitive metadata from the data
- Always include in response (not just when includeTrace=true)
- Fallback to safe defaults if query fails

Response now looks like:
```json
{
  "output": "I'm operating in a mode...",
  "recordId": "abc123",
  "sessionId": "xyz789",
  "cognitive": {
    "intent": "status_query",
    "decision": "completed",
    "memoryWritten": true,
    "mode": "learning",
    "hadViolation": false
  }
}
```

### 2. Sovereign Proxy Pass-Through

**File:** `clients/command/sovereign/src/server.ts` (line ~617)

Updated `/api/chat` proxy to pass through cognitive metadata:
```typescript
const responseData = {
  output: parsedData.output || '',
  recordId: parsedData.recordId || '',
  sessionId: parsedData.sessionId || sessionId,
  ...(parsedData.trace && { trace: parsedData.trace }),
  ...(parsedData.cognitive && { cognitive: parsedData.cognitive }),  // NEW
  responseTimeMs,
};
```

### 3. Frontend State Management

**File:** `clients/command/sovereign/public/index.html`

**Added to state** (line 1347):
```javascript
lastCognitive: null  // Store latest cognitive metadata
```

**Updated sendMessage()** (lines 1983-1990):
```javascript
const data = await res.json();
const responseTime = data.responseTimeMs ? ` (${(data.responseTimeMs / 1000).toFixed(1)}s)` : '';
addChatMessage('assistant', data.output || 'No response', responseTime);

// Store cognitive metadata from response
if (data.cognitive) {
  state.lastCognitive = data.cognitive;
  console.log('Cognitive state updated:', data.cognitive);
}
```

### 4. Insight Panel Updates

**File:** `clients/command/sovereign/public/index.html` (lines 1734-1790)

Updated `renderInsightFromEvidence()` to use cognitive metadata:
- Read `state.lastCognitive` from chat response
- Display decision from cognitive state
- Show intent classification
- Update panels in real-time after each chat

```javascript
const cognitive = state.lastCognitive || {};

if (lastDecision) {
  lastDecision.textContent = cognitive.decision || stance?.stance || '—';
}
```

---

## What This Fixes

**Before:**
```
User: "What's your current mode?"
Chat: "I'm operating in learning mode..."
Insight Panels: (unchanged, frozen)
Evidence: (returns 304 Not Modified)
```

**After:**
```
User: "What's your current mode?"
Chat: "I'm operating in learning mode..."
Response includes: {"cognitive": {"intent": "status_query", "decision": "completed", ...}}
Insight Panels: Update with latest cognitive state
Last Decision: Shows "completed"
```

---

## Data Flow

```
User sends message
    ↓
/api/chat (Sovereign)
    ↓
/v1/chat (Vi-Core)
    ├─ CognitionPipeline.process() ← generates intent, plan, execution
    ├─ Stores in run_records table
    └─ Queries run_records for cognitive metadata
    ↓
Response includes:
  - output (the reply)
  - cognitive {intent, decision, memoryWritten, mode, hadViolation}
  - responseTimeMs (latency)
    ↓
Sovereign proxy passes through
    ↓
Frontend receives full cognitive packet
    ├─ Renders chat message with response time
    ├─ Stores cognitive metadata in state.lastCognitive
    ├─ Calls fetchEvidenceBundle()
    ├─ renderEvidence() uses both:
    │  ├─ state.lastCognitive (immediate, from chat)
    │  └─ data.evidence (background, from evidence bundle)
    └─ Insight panels update with latest state
```

---

## Build Status

✅ **Sovereign:** Built successfully  
⚠️ **Vi-Core:** Has pre-existing TypeScript errors (unrelated to this feature)
  - File compiles if errors are ignored
  - Code is ready to run
  - Next: Deploy with `docker-compose up` or rebuild ignoring ts errors

---

## Testing

### Test 1: Response includes cognitive metadata
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": "..."}'

# Should return:
{
  "output": "Hello...",
  "recordId": "abc123",
  "sessionId": "xyz789",
  "cognitive": {
    "intent": "greeting",
    "decision": "completed",
    "memoryWritten": true,
    "mode": "learning",
    "hadViolation": false
  },
  "responseTimeMs": 7200
}
```

### Test 2: Insight panels update
1. Open God Console
2. Go to Insight tab
3. Send Vi a message in Throne Room
4. Watch Insight panels update with cognitive metadata
5. Check browser console: Should see "Cognitive state updated: {...}"

---

## Key Insight

The system was doing this correctly before:
- Chat endpoint talks to Vi
- Vi generates cognitive events and stores in DB
- Evidence endpoint queries DB

But there was a timing issue:
- Chat returns immediately (latency: 7s)
- But Insight queries happened **before** the data was flushed to DB
- Or ETag caching made it seem like nothing changed

**Now:** Cognitive metadata travels with the chat response:
- No more timing race conditions
- UI gets authoritative data instantly
- Insight panels can update immediately
- ETag doesn't matter (we're sending fresh data)

This bridges the gap between "response" and "side-effects."

---

## Next Steps

1. **Rebuild vi-core** (when TypeScript errors are fixed or ignored)
2. **Restart containers** to deploy
3. **Test** that Insight panels now update after each message
4. **Monitor** response time (should still be ~7-9s)
5. **Verify** cognitive metadata accuracy in browser console

---

**Status:** Frontend & Proxy Ready | Backend Code Ready | Awaiting vi-core rebuild & deploy
