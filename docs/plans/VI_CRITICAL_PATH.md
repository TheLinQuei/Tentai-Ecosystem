# VI SYSTEM CRITICAL PATH

**Status:** CANONICAL ROADMAP  
**Date:** January 20, 2026  
**Source:** [VI System Audit](../status/VI_SYSTEM_AUDIT_2026-01-19.md)  
**Authority:** Architecture Council

---

## PRINCIPLE: IDENTITY IS THE SPINE

**Why this order matters:**

Vi's continuity (memory, relationships, preferences, canon) depends on **vi_user_id** as the primary key. Without identity wiring across clients, we build continuity systems that work in Sovereign and fail everywhere else. That's how systems rot.

**Identity must be universal before continuity can be reliable.**

---

## CRITICAL PATH (CORRECTED ORDER)

### ✅ STEP 0: Foundation (COMPLETE)
- Cognition Pipeline (M4-M9) ✅
- Memory Storage (M6) ✅
- Tool Framework (M7-M7.2) ✅
- LLM Integration (M5, M8) ✅
- Evaluation System ✅
- Database Schema (20 migrations) ✅

**Status:** LOCKED — No changes to foundation without ADR

---

### 🔧 STEP 1: C2 — Identity Management Endpoints
**Priority:** CRITICAL  
**Blocker:** None  
**Effort:** 4 hours  
**Risk:** LOW (additive API)

**Deliverables:**
1. `GET /v1/identity/map/:vi_user_id` — List linked providers for a user
2. `POST /v1/identity/link` — Link new provider identity to existing vi_user_id
3. `DELETE /v1/identity/link` — Unlink provider identity
4. Audit logs for identity mutations (identity_audit_log table)
5. vi-protocol contract updates (identity schemas)

**Definition of Done:**
- [ ] Endpoints implemented in server.ts
- [ ] Zod validation schemas for all request/response bodies
- [ ] Authentication required (JWT or admin key)
- [ ] Audit logging to identity_audit_log table
- [ ] Error handling (404 user not found, 409 already linked, 403 unauthorized)
- [ ] API documented in docs/API.md
- [ ] vi-protocol schemas updated (if applicable)

**Tests Required:**
- [ ] Unit tests: IdentityResolver.linkProvider(), unlinkProvider() (2 tests)
- [ ] Integration test: Link Discord user → Sovereign user → verify same vi_user_id (1 test)
- [ ] Integration test: Unlink provider → verify identity map updated (1 test)
- [ ] Integration test: Attempt duplicate link → verify 409 error (1 test)
- [ ] E2E test: Cross-client session continuity (user talks to Vi on Discord, opens Sovereign, same vi_user_id) (1 test)

**No Breaking Changes:**
- Existing IdentityResolver.resolve() unchanged
- Existing user_identity_map schema unchanged (additive only)
- No pipeline.ts modifications (only server.ts route additions)

**Rollback Plan:**
- Remove new endpoints from server.ts
- Drop identity_audit_log table (if created)
- No data migration required (additive only)

**Success Metric:**
Link a Discord user to a Sovereign user, verify both resolve to same vi_user_id in logs.

---

### 🔧 STEP 2: C4 — Client Identity Adapters
**Priority:** CRITICAL  
**Blocker:** C2 (needs identity endpoints)  
**Effort:** 8 hours  
**Risk:** MEDIUM (requires client code changes)

**Deliverables:**
1. **Vigil (Discord Bot):**
   - VigilIdentityAdapter service (clients/discord/vigil/src/services/ViIdentityAdapter.ts)
   - Map Discord user_id → vi_user_id on every message
   - Send identity headers: x-provider=discord, x-provider-user-id={discord_id}, x-client-id=vigil
   - Handle guest → authenticated promotion

2. **Astralis Codex:**
   - AstralisIdentityAdapter service (clients/lore/astralis-codex/src/services/ViIdentityAdapter.ts)
   - Map Astralis user_id → vi_user_id
   - Send identity headers: x-provider=astralis, x-provider-user-id={astralis_id}, x-client-id=astralis

3. **Sovereign:**
   - Update proxy to forward identity headers (x-provider, x-provider-user-id, x-client-id)
   - Currently only forwards Authorization + X-Guest-User-Id

**Definition of Done:**
- [ ] VigilIdentityAdapter implemented (150 lines)
- [ ] AstralisIdentityAdapter implemented (150 lines)
- [ ] Sovereign proxy forwards identity headers (6 line change in server.ts)
- [ ] All clients send x-provider, x-provider-user-id, x-client-id on every Vi request
- [ ] Guest users auto-create vi_user_id, can promote to authenticated later

**Tests Required:**
- [ ] Vigil unit test: Discord user → vi_user_id resolution (1 test)
- [ ] Astralis unit test: Astralis user → vi_user_id resolution (1 test)
- [ ] E2E test: Send message via Vigil → Sovereign → same vi_user_id in session (1 test)
- [ ] E2E test: Link Discord user to existing Sovereign user → verify identity map (1 test)

**No Breaking Changes:**
- No changes to Vi Core pipeline
- No database schema changes
- Clients send new headers, but Vi Core already handles them (IdentityResolver exists)

**Rollback Plan:**
- Remove IdentityAdapter services
- Clients fall back to guest user creation (existing behavior)
- No data loss (identity mappings persist)

**Success Metric:**
User sends message on Discord (Vigil), opens Sovereign console, sees same conversation history (same vi_user_id).

---

### 🔧 STEP 3: C1 + C6 — Memory Orchestrator + Continuity Pack
**Priority:** CRITICAL  
**Blocker:** C2 + C4 (needs reliable identity)  
**Effort:** 12 hours  
**Risk:** MEDIUM (orchestration logic)

**Deliverables:**
1. **MemoryOrchestrator** (src/brain/memory/MemoryOrchestrator.ts, 300 lines)
   - `buildContinuityPack(userId: string): Promise<ContinuityPack>`
   - `selectRelevantMemories(query: string, userId: string): Promise<Memory[]>`
   - `writeMemory(memory: MemoryInput, policy: WritePolicy): Promise<void>`

2. **ContinuityPack Structure:**
   ```typescript
   {
     identitySnippet: { vi_user_id, provider, provider_user_id },
     relationshipContext: { relationship_type, trust_level, interaction_mode, tone_preference },
     activePreferences: { key: value, ... },
     recentMemories: Memory[],
     currentMission?: Mission
   }
   ```

3. **Memory Write Policies:**
   - Episodic: Auto-write (conversation events)
   - Semantic: On-demand only (high-confidence extraction, explicit user teaching)
   - Relational: Threshold-based (trust level changes)
   - Garbage prevention: Deduplication check before write

4. **Pipeline Integration:**
   - Inject continuity pack into ThoughtState.perception.context.continuityPack
   - Call MemoryOrchestrator.buildContinuityPack() before intent classification

**Definition of Done:**
- [ ] MemoryOrchestrator class implemented (300 lines)
- [ ] buildContinuityPack() assembles identity + relationship + preferences + memories
- [ ] selectRelevantMemories() uses semantic search + relevance ranking
- [ ] writeMemory() enforces write policies (episodic auto, semantic gated)
- [ ] CognitionPipeline.process() calls buildContinuityPack() and injects into perception.context
- [ ] No duplicate memory writes (deduplication via content hash)

**Tests Required:**
- [ ] Unit test: buildContinuityPack() returns valid structure (1 test)
- [ ] Unit test: selectRelevantMemories() ranks by relevance + recency (1 test)
- [ ] Unit test: writeMemory() enforces episodic auto-write, semantic gated (2 tests)
- [ ] Integration test: Continuity pack persists across sessions (user prefs, tone) (1 test)
- [ ] E2E test: User corrects Vi ("call me Chief") → preference persists → next session uses "Chief" (1 test)

**No Breaking Changes:**
- ThoughtState.perception.context.continuityPack is optional field (additive)
- No changes to MemoryStore interface (uses existing methods)
- Pipeline.process() signature unchanged (internal logic only)

**Rollback Plan:**
- Remove MemoryOrchestrator calls from pipeline.ts
- Continuity pack becomes undefined (system works without it, just less coherent)
- No data loss (memories persist)

**Success Metric:**
User talks to Vi, corrects tone preference, ends session. Next session (different client), Vi uses corrected tone without re-teaching.

---

### 🔧 STEP 4: C3 — Canon Auto-Injection
**Priority:** HIGH  
**Blocker:** C1 + C6 (needs continuity pack infrastructure)  
**Effort:** 6 hours  
**Risk:** LOW (additive detection)

**Deliverables:**
1. **CanonInjector** (src/brain/canon/CanonInjector.ts, 200 lines)
   - Detect lore-relevant queries (heuristics: entity mentions, verse keywords, "lore mode" trigger)
   - Query CanonResolver for canonical facts
   - Inject facts into perception.context.canonContext
   - Prevent hallucination (if no canon match → "No canon record")

2. **Lore Mode Detection:**
   - Heuristics: mentions of Codex entities (Movado, Azula, Kaelen, etc.)
   - Explicit toggle: user says "lore mode" or "check canon"
   - Verse context: query mentions specific verse (77EZ, Astralis, etc.)

3. **Pipeline Integration:**
   - Call CanonInjector.detect() in perception stage
   - If lore-relevant, inject canonContext into ThoughtState.perception.context
   - LLM receives canon facts in context, cites them in response

**Definition of Done:**
- [ ] CanonInjector class implemented (200 lines)
- [ ] detect() returns true for lore-relevant queries
- [ ] injectCanon() queries CanonResolver, adds facts to perception.context.canonContext
- [ ] CognitionPipeline calls CanonInjector before intent classification
- [ ] Responses cite canon source IDs when using lore facts

**Tests Required:**
- [ ] Unit test: detect() returns true for "Who is Movado?" (1 test)
- [ ] Unit test: detect() returns false for "What's 2+2?" (1 test)
- [ ] Unit test: injectCanon() queries CanonResolver, returns facts (1 test)
- [ ] Integration test: Ask "Who is Movado?" → Vi responds with Codex canon, cites source (1 test)
- [ ] E2E test: Contradiction attempt → Vi corrects with canon, no hallucination (1 test)

**No Breaking Changes:**
- ThoughtState.perception.context.canonContext is optional field (additive)
- No changes to CanonResolver interface
- No changes to LLM Gateway

**Rollback Plan:**
- Remove CanonInjector calls from pipeline.ts
- Canon context becomes undefined (system works without it, just no lore grounding)
- No data loss

**Success Metric:**
Ask "Who is Movado?" → Vi responds with canonical lore, cites Astralis Codex source ID. Ask non-lore question → no canon injection spam.

---

### ✅ STEP 5: C5 — Mission Memory
**Priority:** MEDIUM  
**Status:** COMPLETE (2025-01-20)  
**Effort:** 6 hours  
**Risk:** MEDIUM (new subsystem) — MITIGATED (18 tests passing)

**Deliverables:**
1. **Mission Memory Table** (migration 0021_mission_memory)
   ```sql
   CREATE TABLE mission_memory (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
     mission_id UUID NOT NULL,
     task TEXT NOT NULL,
     steps JSONB NOT NULL,
     current_step INT DEFAULT 0,
     completed_steps JSONB DEFAULT '[]',
     failed_steps JSONB DEFAULT '[]',
     verification_log JSONB DEFAULT '[]',
     status TEXT DEFAULT 'in_progress',
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   ```

2. **MissionMemoryRepository** (src/db/repositories/MissionMemoryRepository.ts)
   - create(), getById(), getByUser(), update()
   - Track mission state across sessions

3. **TaskExecutor Integration:**
   - Load mission memory before task execution
   - Update mission memory after each step
   - Resume from last checkpoint on session restart

**Definition of Done:**
- [ ] migration 0021_mission_memory applied
- [ ] MissionMemoryRepository implemented (150 lines)
- [ ] TaskExecutor loads mission memory on execution
- [ ] TaskExecutor updates mission memory after each step
- [ ] Resume path: User starts task, disconnects, reconnects → task resumes

**Tests Required:**
- [ ] Unit test: MissionMemoryRepository CRUD operations (4 tests)
- [ ] Integration test: Start multi-step task → disconnect → reconnect → resume from checkpoint (1 test)
- [ ] E2E test: Ask Vi to "fix all TypeScript errors" → Vi plans steps, executes, tracks progress (1 test)

**No Breaking Changes:**
- New table (no existing schema changes)
- TaskExecutor modified but existing tests still pass
- No API changes

**Rollback Plan:**
- Drop mission_memory table
- TaskExecutor continues working (no mission continuity, but tasks still execute)

**Success Metric:**
Ask Vi to perform multi-step task, disconnect mid-execution, reconnect → Vi resumes from last completed step (doesn't restart from scratch).

---

### 🔧 STEP 6: S5 — Sovereign Multi-Client UI
**Priority:** MEDIUM  
**Status:** NOT STARTED (C2+C4 complete, no blockers)  
**Effort:** 12 hours  
**Risk:** LOW (frontend only)

**Deliverables:**
1. **Client Tabs** (top nav)
   - Tab per client: Overseer, Vigil, Astralis, Sovereign
   - Shows client name, provider, status indicator
   - Switches active chat context

2. **Identity Panel** (devMode)
   - Shows: vi_user_id, linked providers (Discord, Sovereign, etc.)
   - Link/Unlink tools: Call POST /v1/identity/link, DELETE /v1/identity/link
   - Identity map visualization

3. **Memory Panel** (profileMode)
   - Shows: Working memory, episodic events, semantic facts, relational context
   - Memory layers per client
   - Continuity pack status

4. **Lore Panel** (auditMode)
   - Shows: Canon entities, verse rules, citations
   - Canon validation UI

5. **Observability Panel** (systemMode)
   - Shows: Docker services (postgres, vi-core, vector-store)
   - Metrics + alerts view
   - Event stream (SSE from Vi Core)

**Definition of Done:**
- [ ] Client tabs implemented (HTML + CSS + JS, ~100 lines)
- [ ] Identity panel implemented (~50 lines)
- [ ] Memory panel implemented (~50 lines)
- [ ] Lore panel implemented (~50 lines)
- [ ] Observability panel implemented (~50 lines)
- [ ] UI follows 77EZ theme (black/gold/purple, no hardcoded colors)

**Tests Required:**
- [ ] Manual test: Switch between client tabs → chat context switches
- [ ] Manual test: Link Discord identity → appears in identity panel
- [ ] Manual test: View memory layers → working/episodic/semantic visible
- [ ] Manual test: View canon entities → Codex entities listed

**No Breaking Changes:**
- Frontend only (no backend changes)
- Existing chat interface remains functional

**Rollback Plan:**
- Revert to MVP chat interface (public/index.html)
- No data loss

**Success Metric:**
Open Sovereign, see tabs for Overseer/Vigil/Astralis. Click Vigil tab → chat context switches to Vigil. Identity panel shows linked Discord user.

---

## PARALLEL WORK (Can Run Alongside Critical Path)

### S1. 77EZ Tokens Package
- **Effort:** 2 hours
- **Blocker:** None
- **Impact:** Enforce brand consistency
- **Files:** packages/tokens/index.ts

### S3. Relationship Update Loop
- **Effort:** 8 hours
- **Blocker:** None (uses existing repositories)
- **Impact:** Trust/boundary adjustments over time
- **Files:** src/brain/RelationshipUpdateLoop.ts

### S4. Verification Integration
- **Effort:** 6 hours
- **Blocker:** None (uses existing VerifierRegistry)
- **Impact:** Per-step verification during task execution
- **Files:** Modify TaskExecutor.executeTask()

---

## SEQUENCING RULES

1. **C2 must complete before C4** (clients need endpoints to call)
2. **C2 + C4 must complete before C1/C6** (identity must be reliable before continuity)
3. **C1/C6 must complete before C3** (continuity pack infrastructure needed for canon context)
4. **C1/C6 must complete before C5** (memory infrastructure needed for mission tracking)
5. **C2 + C4 must complete before S5** (identity needed for multi-client UI)

**No step should start until its blockers are complete and tested.**

---

## ACCEPTANCE CRITERIA (SYSTEM-LEVEL)

After all 6 steps complete:

1. **Cross-Client Continuity:**
   - [ ] User talks to Vi on Discord (Vigil)
   - [ ] User opens Sovereign console
   - [ ] Same conversation history visible (same vi_user_id)
   - [ ] Preferences persist (tone, interaction mode)

2. **Canon Grounding:**
   - [ ] User asks "Who is Movado?" in any client
   - [ ] Vi responds with canonical lore, cites Astralis Codex source
   - [ ] No hallucination if canon missing

3. **Mission Continuity:**
   - [ ] User asks Vi to perform multi-step task
   - [ ] User disconnects mid-execution
   - [ ] User reconnects (same or different client)
   - [ ] Vi resumes from last checkpoint (doesn't restart)

4. **UI Consistency:**
   - [ ] Sovereign shows all clients (Overseer, Vigil, Astralis)
   - [ ] Identity panel shows linked providers
   - [ ] Memory panel shows continuity pack
   - [ ] All UI follows 77EZ theme (no hardcoded colors)

---

## GOVERNANCE

**Who approves steps:**
- Steps 1-4 (C2, C4, C1/C6, C3): Architecture Council (1 approval)
- Steps 5-6 (C5, S5): Team Lead (1 approval)
- Constitutional violations: Architecture Council (unanimous)

**Who implements:**
- Backend (C2, C1/C6, C3, C5): Brain Team
- Clients (C4): Client Teams (Vigil, Astralis, Sovereign)
- Frontend (S5): Frontend Team

**Who tests:**
- All teams: Unit + integration tests required
- QA: E2E acceptance tests before step marked complete

---

## CURRENT STATUS

| Step | Status | Blocker | Completion Date |
|------|--------|---------|-----------------|
| C2 (Identity Endpoints) | ✅ **COMPLETE** | None | 2025-01-20 |
| C4 (Client Adapters) | ✅ **COMPLETE** | C2 | 2025-01-20 |
| C1+C6 (Memory Orchestrator) | ✅ **COMPLETE** | C2, C4 | 2025-01-20 |
| C3 (Canon Injection) | ✅ **COMPLETE** | C1, C6 | 2025-01-20 |
| C5 (Mission Memory) | ✅ **COMPLETE** | None | 2025-01-20 |
| S5 (Sovereign UI) | ✅ **COMPLETE** | None | 2025-01-20 |

---

## COMPLETION REPORTS

- ✅ [C2 Identity Endpoints](../status/C2_IDENTITY_ENDPOINTS_COMPLETE.md) — Identity spine, audit logging, API endpoints (2025-01-20)
- ✅ [C4 Client Adapters](../status/C4_CLIENT_IDENTITY_ADAPTERS_COMPLETE.md) — Vigil, Astralis, Sovereign wiring (2025-01-20)
- ✅ [C1+C6 Memory Orchestrator](../status/C1_C6_MEMORY_ORCHESTRATOR_COMPLETE.md) — Continuity pack, cross-session memory (2025-01-20)
- ✅ [C3 Canon Injection](../status/C3_CANON_INJECTION_COMPLETE.md) — Lore wiring, entity state, multiverse tracking (2025-01-20)
- ✅ [C5 Mission Memory](../status/C5_MISSION_MEMORY_COMPLETE.md) — Checkpoint resumption, multi-step task tracking (2025-01-20)
- ✅ [S5 Sovereign Multi-Client UI](../status/S5_SOVEREIGN_MULTICLIENT_UI_COMPLETE.md) — Identity panels, memory browser, lore explorer, observability dashboard (2025-01-20)

---

## NEXT ACTION

**Start with C5 (Mission Memory).**

**Implementation instructions:**
```
Implement C5: Mission Memory
Create mission_memory table (migration 0021_mission_memory)
Track multi-step task execution progress
Resume from checkpoint on session restart
Implement MissionMemoryRepository (CRUD)
Wire into TaskExecutor pre/post-execution
No refactors. Additive-only.
Must include tests (unit + integration + e2e).
Must not break existing task system.
Tests or it doesn't exist.
```

---

**Document Owner:** Architecture Council  
**Last Updated:** January 20, 2026  
**Next Review:** After C2 completion
