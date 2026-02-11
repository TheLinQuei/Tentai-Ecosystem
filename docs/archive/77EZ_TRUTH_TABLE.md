# 77EZ ROADMAP — TRUTH TABLE VERIFICATION

**Generated:** January 9, 2026  
**Audit Scope:** Verify claims in COMPREHENSIVE_AUDIT.md against actual repo state  
**Methodology:** File existence, code inspection, test validation, endpoint verification  

---

## VERIFICATION METHODOLOGY

For each claim:
- **VERIFIED**: Code exists, tests pass, components integrated, endpoints respond
- **PARTIAL**: Code exists but incomplete integration, untested paths, or partial functionality
- **NOT FOUND**: Code/files don't exist or claim is unsubstantiated
- **EVIDENCE**: Exact paths, line ranges, test assertions, curl commands

---

## PHASE 1: Foundation Fixes

### Claim: "Fixed memory expiry bug in MemoryInjectionRepository"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | VERIFIED | `core/vi/src/db/repositories/MemoryInjectionRepository.ts` |
| Bug fix documented | PARTIAL | Code exists but no explicit comments marking fix timestamp |
| Integration test | VERIFIED | `tests/integration/memory.injection.e2e.test.ts` exists with consolidation tests |
| CURRENT_TIMESTAMP usage | NEEDS VERIFICATION | Migration files need inspection |

**Command to verify:**
```bash
grep -r "CURRENT_TIMESTAMP" core/vi/db/migrations/ | head -5
grep -r "NOW()" core/vi/db/migrations/ | head -5
```

---

## PHASE 2: Grounding

### Claim 2.1: "Implemented GroundingGate enforcement layer"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | VERIFIED | `core/vi/src/brain/grounding/GroundingGate.ts` (confirmed via file_search) |
| Class definition | NEEDS CHECK | Must inspect file for implementation |
| Integrated into pipeline | NEEDS CHECK | Must verify pipeline.ts references GroundingGate |
| Tests | NEEDS CHECK | Search for tests mentioning GroundingGate |

**File to check:** [core/vi/src/brain/grounding/GroundingGate.ts](core/vi/src/brain/grounding/GroundingGate.ts)

### Claim 2.2: "Added CanonFirstStrategy for lore queries"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | NEEDS CHECK | Should exist in grounding/ or planning/ directories |
| Strategy pattern | NEEDS CHECK | Must verify implementation |

**Search term:** `CanonFirstStrategy`

### Claim 2.3: "response_citations table live"

| Item | Status | Evidence |
|------|--------|----------|
| Migration file exists | NEEDS CHECK | migrations/ directory for response_citations CREATE TABLE |
| Table schema | NEEDS CHECK | Must verify columns, types, indexes |
| Repository class | NEEDS CHECK | ResponseCitationRepository or similar |
| Endpoint returns citations | NEEDS CHECK | POST /v1/chat response includes citations field |

**Expected migration pattern:** `migrations/YYYY-MM-DD-create-response-citations.sql`

### Claim 2.4: "Chat API returns stored citations"

| Item | Status | Evidence |
|------|--------|----------|
| Endpoint: POST /v1/chat | NEEDS CHECK | handler in server.ts, response includes citations |
| Citations persisted | NEEDS CHECK | Query response_citations table after chat request |
| Test validates | NEEDS CHECK | chat.e2e.test.ts includes citation assertions |

---

## PHASE 3: Smart Planning

### Claim 3.1: "Implemented BranchingPlanner with multi-candidate scoring"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | NEEDS CHECK | `core/vi/src/brain/planning/branchingPlanner.ts` or similar |
| generate() method | NEEDS CHECK | Returns Plan + candidates array with scores |
| Scoring algorithm | NEEDS CHECK | Constraint-based scoring logic |
| Tests | NEEDS CHECK | branching.planner.test.ts with candidate generation |

### Claim 3.2: "Added ConstraintSolver for dependency/cycle/tool validation"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | NEEDS CHECK | `core/vi/src/brain/planning/constraintSolver.ts` or similar |
| validate() method | NEEDS CHECK | Checks dependencies, cycles, tool availability |
| Tests | NEEDS CHECK | constraint.solver.test.ts with validation scenarios |

---

## PHASE 4: Self-Correction

### Claim 4.1: "Implemented BacktrackingExecutor with fallback respond plan"

| Item | Status | Evidence |
|------|--------|----------|
| File exists | NEEDS CHECK | `core/vi/src/brain/backtrackingExecutor.ts` |
| execute() method | NEEDS CHECK | Takes plan, executes, catches errors, retries |
| Fallback respond | NEEDS CHECK | Has alternative response plan for failures |
| Tests | NEEDS CHECK | backtracking.executor.test.ts |

### Claim 4.2: "Added structured ReflectionDelta on reflections"

| Item | Status | Evidence |
|------|--------|----------|
| ReflectionDelta type | NEEDS CHECK | Interface/type definition |
| Reflector creates delta | NEEDS CHECK | Reflector.ts generates delta on failure |
| Delta used in retry | NEEDS CHECK | BacktrackingExecutor uses delta for next attempt |

---

## PHASE 5: Verified Actions

### Claim 5.1: "Added VerificationOutcome + verificationSummary on tool executions"

| Item | Status | Evidence |
|------|--------|----------|
| VerificationOutcome type | NEEDS CHECK | types.ts or interfaces.ts |
| Executor adds outcome | NEEDS CHECK | executor.ts includes verification logic |
| ChatResponse includes summary | NEEDS CHECK | Response type has verificationSummary field |
| Tests | NEEDS CHECK | verified.actions.test.ts |

### Claim 5.2: "Wired executor to verifier registry with default tool verifiers"

| Item | Status | Evidence |
|------|--------|----------|
| VerifierRegistry class | NEEDS CHECK | `core/vi/src/verification/VerifierRegistry.ts` |
| registerDefaultVerifiers() | NEEDS CHECK | Called at startup |
| Default verifiers exist | NEEDS CHECK | SearchMemory, RecallMemory, Math, CurrentTime |
| Executor uses registry | NEEDS CHECK | Calls verifier.verify() on tool outcomes |

---

## PHASE 6: Real-Time Feel

### Claim 6.1: "Added SSE streaming endpoint (/v1/chat/stream)"

| Item | Status | Evidence |
|------|--------|----------|
| Route defined | NEEDS CHECK | server.ts POST /v1/chat/stream handler |
| SSE headers | NEEDS CHECK | Content-Type: text/event-stream |
| Emits events | NEEDS CHECK | Sends data: JSON\n\n for perception/intent/plan/execution/reflection |
| Tests | NEEDS CHECK | chat.stream.e2e.test.ts validates event sequence |

**Verification command:**
```bash
curl -X POST http://localhost:3000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","sessionId":"test-123"}' \
  --max-time 5 | head -20
```

**Expected output pattern:**
```
data: {"type":"perception",...}
data: {"type":"intent",...}
data: {"type":"plan",...}
...
```

### Claim 6.2: "Streamed plan/execution/reflection events for live consoles"

| Item | Status | Evidence |
|------|--------|----------|
| Events emitted | NEEDS CHECK | pipeline.ts calls progress callback with event types |
| Event types | NEEDS CHECK | 'perception', 'intent', 'plan', 'execution', 'reflection' |
| Citations in stream | NEEDS CHECK | Final event includes citations array |

---

## PHASE 7: Safe Autonomy

### Claim 7.1: "EventBus + RelevanceScorer + AutonomyPolicyEngine wired into chat/stream"

| Item | Status | Evidence |
|------|--------|----------|
| EventBus class | NEEDS CHECK | `core/vi/src/brain/autonomy/eventBus.ts` |
| subscribe/emit methods | NEEDS CHECK | Event pub/sub working |
| RelevanceScorer class | NEEDS CHECK | `core/vi/src/brain/autonomy/relevanceScorer.ts` |
| Scoring factors | NEEDS CHECK | freshness, urgency, importance, type weights |
| AutonomyPolicyEngine | NEEDS CHECK | Thresholds autonomy.relevance >= 0.45 |
| Integration in server.ts | NEEDS CHECK | Instantiated and used in /v1/chat handler |

### Claim 7.2: "ChimeManager emits per-session reminders"

| Item | Status | Evidence |
|------|--------|----------|
| ChimeManager class | NEEDS CHECK | `core/vi/src/brain/autonomy/chimeManager.ts` |
| Rate limits | NEEDS CHECK | minInterval (30s default), maxPerMinute (2 default) |
| emitChime() method | NEEDS CHECK | Enforces limits before emitting |
| Per-session tracking | NEEDS CHECK | SessionId-keyed rate limit state |
| Tests | NEEDS CHECK | eventBus.autonomy.test.ts validates rate limiting |

### Claim 7.3: "Chime telemetry recorded and exposed via metrics/autonomy payloads"

| Item | Status | Evidence |
|------|--------|----------|
| autonomy_chimes counter | NEEDS CHECK | server.ts increments on chime |
| ChatResponse.autonomy.chimes | NEEDS CHECK | Response includes chimes array |
| Metrics exported | NEEDS CHECK | /v1/metrics includes autonomy_chimes |

---

## PHASE 8: Production Ops

### Claim 8.1: "/v1/metrics exports Prometheus text/plain + JSON"

| Item | Status | Evidence |
|------|--------|----------|
| Route exists | NEEDS CHECK | server.ts GET /v1/metrics handler |
| Prometheus format | NEEDS CHECK | Metrics in text/plain format (# HELP, # TYPE, metric_name value) |
| JSON fallback | NEEDS CHECK | Accept header handling |
| Counters exported | NEEDS CHECK | vi_chat_requests_total, vi_rate_limited_total, vi_autonomy_events_total, vi_autonomy_chimes_total |

**Verification command:**
```bash
curl -s http://localhost:3000/v1/metrics | head -20
```

**Expected output pattern:**
```
# HELP vi_chat_requests_total Total chat requests
# TYPE vi_chat_requests_total counter
vi_chat_requests_total 42

# HELP vi_rate_limited_total Rate limited requests
...
```

### Claim 8.2: "OpenTelemetry tracing integrated"

| Item | Status | Evidence |
|------|--------|----------|
| tracing.ts exists | NEEDS CHECK | `core/vi/src/telemetry/tracing.ts` |
| initializeTracing() | NEEDS CHECK | Called from main.ts |
| Auto-instrumentation | NEEDS CHECK | HTTP, Fastify instrumentations registered |
| Manual spans | NEEDS CHECK | traceOperation() helper for pipeline |
| OTLP export | NEEDS CHECK | Configured via OTEL_EXPORTER_OTLP_ENDPOINT |

### Claim 8.3: "Prometheus alert rules defined"

| Item | Status | Evidence |
|------|--------|----------|
| vi-alerts.yml exists | NEEDS CHECK | `ops/alerts/vi-alerts.yml` |
| Alert groups | NEEDS CHECK | availability, performance, capacity, resources, database, SLO |
| Rule examples | NEEDS CHECK | At least 5+ specific alert rules with thresholds |

### Claim 8.4: "Operational runbooks created"

| Item | Status | Evidence |
|------|--------|----------|
| RUNBOOKS.md exists | NEEDS CHECK | `ops/alerts/RUNBOOKS.md` |
| Investigation procedures | NEEDS CHECK | Documented for each alert |
| Resolution steps | NEEDS CHECK | Clear next steps per alert type |

### Claim 8.5: "k6 load testing harness created"

| Item | Status | Evidence |
|------|--------|----------|
| load-test.js exists | NEEDS CHECK | `ops/tests/load-test.js` |
| Scenarios defined | NEEDS CHECK | smoke, load, stress, spike, soak |
| Thresholds set | NEEDS CHECK | p95 <3s, error rate <5% |
| Custom metrics | NEEDS CHECK | chat_duration, stream_duration, autonomy_chimes |

---

## DATABASE & SCHEMA VERIFICATION

### Required Tables

| Table | Status | Evidence |
|--------|--------|----------|
| conversations | NEEDS CHECK | Migration file |
| messages | NEEDS CHECK | Migration file |
| users | NEEDS CHECK | Migration file |
| response_citations | NEEDS CHECK | Migration file (Phase 2 claim) |
| audit_logs | NEEDS CHECK | Migration file |
| memory_entries | NEEDS CHECK | Migration file |

**How to verify:** `ls -la core/vi/db/migrations/ | grep -E "(conversations|messages|response_citations)"`

---

## TEST COVERAGE VERIFICATION

### Claim: "374/374 tests passing"

| Test File | Status | Count | Evidence |
|-----------|--------|-------|----------|
| eventBus.autonomy.test.ts | NEEDS CHECK | Should exist + pass | Phase 7 tests |
| backtracking.executor.test.ts | NEEDS CHECK | Should exist + pass | Phase 4 tests |
| verified.actions.test.ts | NEEDS CHECK | Should exist + pass | Phase 5 tests |
| branching.planner.test.ts | NEEDS CHECK | Should exist + pass | Phase 3 tests |
| constraint.solver.test.ts | NEEDS CHECK | Should exist + pass | Phase 3 tests |
| chat.stream.e2e.test.ts | NEEDS CHECK | Should exist + pass | Phase 6 tests |
| **Full Suite** | **PARTIAL** | 374 tests | Last run showed 374 passing but needs re-run verification |

**Verification command:**
```bash
cd core/vi && npm test 2>&1 | grep -E "Test Files|Tests|PASS|FAIL"
```

---

## ENDPOINT VERIFICATION CHECKLIST

### Critical Endpoints (Claimed as COMPLETE)

```bash
# Health check (baseline)
curl http://localhost:3000/v1/health

# Chat endpoint with autonomy response
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","sessionId":"test-1"}' | jq '.autonomy.chimes'

# Streaming endpoint
curl -X POST http://localhost:3000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","sessionId":"test-1"}' --max-time 5

# Metrics endpoint
curl http://localhost:3000/v1/metrics | grep -E "vi_autonomy|vi_chat_requests"
```

---

## CAPABILITY SCORES — CLAIMED vs. ACTUAL

### Claimed Scores (After 77EZ)
| Capability | Claimed | Evidence Level |
|------------|---------|-----------------|
| Cognitive reasoning depth | 75 | Requires: branching planner tests, constraint solver |
| Memory realism | 80 | Requires: consolidation working, no expiry bugs |
| Autonomy | 70 | Requires: EventBus+ChimeManager tested+rate-limited |
| Self-model consistency | 75 | Requires: profile tests, consistency checks |
| Canon awareness | 80 | Requires: GroundingGate enforced, citations persisted |
| Tool intelligence | 80 | Requires: VerifierRegistry, pre/postconditions |
| Real-time readiness | 85 | Requires: SSE /v1/chat/stream working |
| Multi-client orchestration | 60 | Minimal testing |
| Production robustness | 85 | Requires: metrics, tracing, alerts, load tests |

### Verification Status
- [ ] Cognitive reasoning: Branching planner + constraint solver both implemented
- [ ] Memory: Consolidation service exists, expiry bug claims CURRENT_TIMESTAMP fix
- [ ] Autonomy: EventBus, RelevanceScorer, AutonomyPolicyEngine, ChimeManager all claimed
- [ ] Self-model: Profile system exists (needs testing)
- [ ] Canon: GroundingGate exists, response_citations table claimed
- [ ] Tool verification: VerifierRegistry exists, verifiers wired
- [ ] Real-time: /v1/chat/stream exists as SSE endpoint
- [ ] Ops: Metrics, tracing, alerts, k6 all created

---

## MINIMUM WORK TO VERIFY REMAINING CLAIMS

If any claims are NOT FOUND or PARTIAL:

### For NOT FOUND items:
1. File creation (if code missing)
2. Integration point (wire into existing code)
3. Test addition (1-3 tests to validate)
4. Documentation update

### For PARTIAL items:
1. Complete implementation (finish stubbed functions)
2. Add missing tests
3. Verify integration end-to-end
4. Update audit document

---

## NEXT STEPS

1. **Run all verification commands above** to populate this table
2. **Check each file** for implementation completeness
3. **Run full test suite** to confirm 374/374 passing
4. **Hit endpoints** to validate behavior
5. **Generate updated scores** based on verified items only
6. **Document gaps** for handoff team

---

**TRUTH TABLE EXECUTION BEGINS BELOW**
