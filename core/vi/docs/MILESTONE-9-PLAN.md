# Milestone 9: Chat Interface

**Status:** In Progress  
**Date:** 2025-12-27

## Context

Vi's brain is complete (M1-M8, MB): authentication, LLM integration, memory, tools, planning. The cognition pipeline works end-to-end in integration tests. But there's no way for humans or clients to invoke it over HTTP.

M9 delivers the public chat interface: `POST /v1/chat` that calls `CognitionPipeline.process()` and returns the response with optional thought trace.

## Goals

- Add `POST /v1/chat` endpoint to Vi's HTTP server
- Accept: user message, optional session context, optional settings
- Return: Vi's response + thought record ID + optional trace
- Wire endpoint to CognitionPipeline with proper error handling
- Support authenticated and unauthenticated modes (based on config)
- Fix CLI stubs to call `/v1/chat` or throw NotImplementedByDesign
- Maintain audit trail (run records persisted by pipeline)

## Design

### Endpoint

```
POST /v1/chat
```

**Request Body:**
```typescript
{
  message: string;           // Required: user input
  sessionId?: string;        // Optional: resume session (defaults to new UUID)
  context?: {                // Optional: additional context
    recentHistory?: string[];
    userPreferences?: Record<string, unknown>;
  };
  includeTrace?: boolean;    // Optional: include full thought trace in response
}
```

**Response:**
```typescript
{
  output: string;            // Vi's response
  recordId: string;          // Run record ID for audit
  sessionId: string;         // Session ID (new or resumed)
  trace?: {                  // Optional: full cognition trace
    intent: Intent;
    plan: Plan;
    execution: Execution;
    reflection: Reflection;
  };
}
```

**Status Codes:**
- 200: Success
- 400: Invalid request (missing message, bad JSON)
- 401: Authentication required (if auth enabled and no token)
- 500: Internal error (LLM failure, DB failure)

### Implementation

**File:** `src/runtime/server.ts`

1. Add Zod schema for chat request/response
2. Add route handler:
   - Validate request body
   - Extract userId from JWT (if auth enabled) or use anonymous UUID
   - Generate or resume sessionId
   - Call `CognitionPipeline.process(message, userId, sessionId, context)`
   - Return response with output + recordId + optional trace
3. Add telemetry event for chat requests
4. Add error handling (LLM failures, DB failures, validation errors)

**Dependencies:**
- CognitionPipeline (M4-M8: already exists)
- LLMGateway factory (M5: already exists)
- RunRecordStore (M4: already exists)
- ToolRunner (M7: already exists)
- Auth middleware (M3: already exists, optional)

### CLI Fix

**Current state:** CLI stubs print "not yet implemented"  
**Violates:** Section 3 Boundary Policy (no-op implementations forbidden)

**Options:**
1. Wire CLI to call `http://localhost:3000/v1/chat` (requires server running)
2. Throw `NotImplementedByDesign` with context

**Decision:** Option 2 (simpler, follows rules)

**File:** `src/cli/commands.ts`

```typescript
import { NotImplementedByDesign } from '../errors/NotImplementedByDesign.js';

export async function handleChatCommand(args: string[]): Promise<void> {
  throw new NotImplementedByDesign(
    'CLI chat interface not yet implemented',
    {
      phase: 'M9.1',
      reason: 'Requires HTTP client or in-process pipeline wiring',
      when: 'After M9 chat endpoint is verified',
      workaround: 'Use: curl -X POST http://localhost:3000/v1/chat -H "Content-Type: application/json" -d \'{"message":"your question"}\'',
    }
  );
}
```

## Exit Criteria

- [ ] `POST /v1/chat` endpoint exists in server.ts
- [ ] Request body validated with Zod schema
- [ ] Response includes output, recordId, sessionId
- [ ] CognitionPipeline invoked with correct parameters
- [ ] Run record persisted (via pipeline)
- [ ] Auth-aware: accepts JWT if enabled, allows anonymous if disabled
- [ ] Integration test: send message → receive response → verify run record in DB
- [ ] CLI stubs replaced with NotImplementedByDesign
- [ ] Telemetry event logged for each chat request
- [ ] Error handling: 400 for bad input, 500 for internal errors
- [ ] Verification script: `scripts/verify-m9.ps1` passes
- [ ] Completion doc: `docs/MILESTONE-9-COMPLETION.md` with log reference

## Test Plan

### Unit Tests
- Request schema validation (valid/invalid bodies)
- Response schema validation

### Integration Tests
- **Happy path:** POST /v1/chat → 200 with output + recordId
- **Auth enabled:** POST without token → 401
- **Auth enabled:** POST with valid token → 200
- **Invalid request:** POST with missing message → 400
- **Trace requested:** POST with includeTrace=true → response includes trace
- **Run record created:** Verify DB contains run_records entry after chat

### Manual Verification
```bash
# Start server
npm start

# Send chat request
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is 2+2?"}'

# Expected response:
{
  "output": "2 + 2 equals 4.",
  "recordId": "uuid",
  "sessionId": "uuid"
}
```

## Dependencies

All dependencies locked and verified:
- ✅ M1: Fastify server
- ✅ M2: Database + migrations
- ✅ M3: Auth middleware (optional)
- ✅ M4: CognitionPipeline
- ✅ M5: LLM gateways
- ✅ M6: Memory store
- ✅ M7: Tools framework
- ✅ M8: LLM planning
- ✅ MB: Memory consolidation

## Brain Progress

- ✅ M1-M8, MB: Infrastructure (80%)
- ⏳ M9: Chat Interface (90%)
- ⏳ M10: Production Hardening (95%)
- ⏳ M11: Continuous Operation (100%)

M9 is the "Jarvis moment"—the first time a human can talk to Vi without writing test code.

## Next Steps

After M9:
- **M10:** Production hardening (rate limits, cost tracking, monitoring)
- **M11:** Continuous operation (background tasks, proactive behaviors)
- **Phase 2:** Unfreeze Sovereign UI (consumes /v1/chat)

---

**This milestone transforms Vi from a test-only brain into a conversational AI.**
