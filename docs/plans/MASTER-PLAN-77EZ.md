# 77EZ MASTER PLAN: ONE VI EVERYWHERE

**STATUS:** ⭐ **CANONICAL EXECUTION PLAN** ⭐  
**LAST UPDATED:** January 10, 2026  
**OWNER:** Architecture Council

---

## 🔒 SOURCE OF TRUTH

> **THIS DOCUMENT IS LAW.**
>
> This is the single authoritative roadmap for Tentai Vi.
>
> All other phase docs, status reports, roadmaps are **ARCHIVED** or **DELETED**.
>
> **Link to this. Reference this. Delete competitors.**
>
> If you find a conflicting roadmap, move it to `/ARCHIVE/` or delete it.
>
> **Questions?** See [docs/DOCUMENTATION_INDEX.md](../../docs/DOCUMENTATION_INDEX.md)

---

---

## NORTH STAR: REQUIREMENTS

### R1: One Persona, Canonical, Enforced
- Single canonical self-model: [core/vi/src/config/selfModel.json](core/vi/src/config/selfModel.json)
- No hardcoded persona forks inside clients
- Enforcement via [SelfModelEnforcer.ts](core/vi/src/brain/selfModelEnforcer.ts)

### R2: One User Identity Across Clients
- Discord user ↔ Sovereign user ↔ Astralis user → one vi_user_id
- User identity mapping layer (IdentityResolver)
- All clients normalize through it

### R3: Cross-Session Continuity
- Vi keeps stance, tone preferences, interaction mode, relationship type
- Preferences survive session boundaries
- Memory + personality persist

### R4: Relationship Model (Owner vs Public)
- Owner mode: deeper familiarity, relaxed, "at your command"
- Public mode: polite, bounded, professional
- Brain-based, not client-based

### R5: Astralis Is Canon Memory, Not A Side Tool
- Canon facts + verse rules queryable + enforced
- Vi uses canon by default in verse contexts
- Lore mode is first-class, not an addon

### R6: Ops Reality Matches Code
- Metrics match alerts (already fixed)
- Citations proven end-to-end
- Logs clean in CI, loud in prod
- Tests are the contract (375+ green)

---

## EXECUTION PLAN (10 PHASES)

### Phase 0: Brand + Theme System (77EZ Visual Law)
**Outcome:** Black/gold/purple lightning future-lux brand becomes a system, not vibes.

**Deliverables**
- [ ] `@tentai/tokens` package enforced across all UIs (NO hex literals)
- [ ] 77EZ Theme Spec canonical doc:
  - Primary: obsidian black
  - Accent: sovereign gold
  - Energy: violet lightning
  - Highlight: surgical white (sparingly)
- [ ] UI motion rules: slow, deliberate transitions; subtle glow; crisp typography; high contrast; negative space
- [ ] Audio/voice "Origin Jumpworks" profile (text-first):
  - Phrases: "I'm listening." "Whenever you're ready." "At your command."
  - Gated by relationship context
- [ ] CI enforcement: reject PRs with hardcoded `#` colors
- [ ] Doc consolidation:
  - Create `/docs/DOCUMENTATION_INDEX.md`
  - Create `/docs/IMPLEMENTATION_STATUS.md`
  - Archive stale audits/receipts to `/ARCHIVE/`

**Acceptance Criteria**
- ✅ Any PR with hardcoded colors fails CI
- ✅ UI feels like "luxury spacecraft OS," not "admin panel from 2009"
- ✅ New engineer finds architecture in <5 min
- ✅ Zero doc sprawl (canonical docs only)

**Owner:** Frontend + Architecture  
**Effort:** 8 hours  
**Blocker:** None

---

### Phase 1: Identity Spine (One User Everywhere)
**Outcome:** Every client maps to one vi_user_id. No exceptions.

**Database Schema (COMPLETED)**
```sql
-- Migration 017: user_identity_map
CREATE TABLE user_identity_map (
  vi_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- 'sovereign' | 'discord' | 'astralis' | 'console' | 'guest'
  provider_user_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);
```

**Runtime Components (COMPLETED)**
- ✅ [IdentityResolver.ts](../../core/vi/src/identity/IdentityResolver.ts) (290 lines)
- ✅ [UserIdentityMapRepository.ts](../../core/vi/src/db/repositories/UserIdentityMapRepository.ts) (125 lines)
- ✅ Wired into POST /v1/chat (enforces provider identity headers)

**New: Public Identity Management Endpoints**
```typescript
// Add to core/vi/src/runtime/server.ts
GET /v1/identity/map/:vi_user_id    // List linked providers
POST /v1/identity/link              // Link new provider
DELETE /v1/identity/link            // Unlink provider
```

**Client Integration (IN PROGRESS)**
- **Sovereign:** JWT sub → vi_user_id (needs identity headers forwarding)
- **Discord/Vigil:** discord user_id → vi_user_id (needs adapter update)
- **Astralis:** internal user_id → vi_user_id (needs adapter update)
- **Console:** owner_id → vi_user_id (needs definition)
- **Guest:** ephemeral guest identity via IdentityResolver

**Acceptance Tests**
- [ ] Talk to Vi on Discord, open Command Center, she knows it's you
- [ ] Guest can become linked identity cleanly
- [ ] Test: `identity.cross-client.e2e.test.ts` (EXISTS, needs integration)
- [ ] Vigil + Sovereign produce same memory for same vi_user_id

**Owner:** Backend + Client Teams  
**Effort:** 8 hours (4h endpoints + 4h client adapters)  
**Blocker:** Phase 0 complete

---

### Phase 2: Memory System That Feels Like a Person
**Outcome:** Memory isn't "facts table." It's identity continuity.

**Memory Layers**
1. **Working memory** (session) — Current conversation context
2. **Episodic memory** (events, conversations) — What happened when
3. **Semantic memory** (facts/preferences) — What Vi knows about user + world
4. **Relational memory** (how Vi treats this person) — Relationship context
5. **Canon memory** (lore tracker) — Structured fiction universe facts

**Deliverables**
- [ ] Memory Orchestrator that:
  - Selects relevant memories (not everything)
  - Ranks by relevance + recency + trust
  - Writes back with justification tags
- [ ] Memory Write Policies:
  - What gets stored automatically
  - What requires explicit user intent
  - Garbage prevention (avoid accumulation of noise)
- [ ] "Continuity Pack" injected into every response:
  - Identity snippet (vi_user_id + provider context)
  - Relationship context (trust_level, relationship_type)
  - Active preferences (tone, interaction_mode)
  - Current mission (if any)

**Infrastructure (COMPLETED)**
- ✅ [MultiDimensionalMemoryRepository.ts](../../core/vi/src/db/repositories/MultiDimensionalMemoryRepository.ts)
- ✅ [UserProfileRepository.ts](../../core/vi/src/db/repositories/UserProfileRepository.ts)
- ✅ [PreferenceRepository.ts](../../core/vi/src/brain/PreferenceRepository.ts) (400 lines)
- ✅ Migration 019: preference_persistence

**New: Memory Orchestration Layer**
```typescript
// core/vi/src/brain/MemoryOrchestrator.ts
class MemoryOrchestrator {
  async buildContinuityPack(userId: string): Promise<ContinuityPack>;
  async selectRelevantMemories(query: string, userId: string): Promise<Memory[]>;
  async writeMemory(memory: MemoryInput, policy: WritePolicy): Promise<void>;
}
```

**Acceptance Tests**
- [ ] Preferences persist across sessions (tone corrections, interaction mode)
- [ ] Vi stays consistent in "feel" from day 1 to day 300
- [ ] Test: `memory.continuity.e2e.test.ts`
- [ ] No garbage accumulation in memory tables

**Owner:** Brain Team  
**Effort:** 12 hours  
**Dependency:** Phase 1 (needs identity)

---

### Phase 3: Relationship Model (Owner vs Public, Without Cringe)
**Outcome:** Vi treats you like the owner. Public gets polished, professional, contained.

**Data Model (COMPLETED)**
```sql
-- Migration 018: relationship_model (EXISTS)
ALTER TABLE user_profiles ADD COLUMN (
  relationship_type TEXT DEFAULT 'normal', -- owner | trusted | public | restricted
  trust_level INT DEFAULT 0, -- 0-100
  interaction_mode TEXT DEFAULT 'assistant', -- assistant | companion | operator | lorekeeper
  tone_preference TEXT, -- direct | elegant | playful | warm
  voice_profile TEXT DEFAULT 'LUXE_ORIGIN',
  boundaries_profile TEXT DEFAULT 'standard' -- stricter for public
);
```

**Infrastructure (COMPLETED)**
- ✅ [RelationshipResolver.ts](../../core/vi/src/brain/RelationshipResolver.ts)
- ✅ [RelationshipRepository.ts](../../core/vi/src/brain/RelationshipRepository.ts) (215 lines)
- ✅ [BehaviorRulesEngine.ts](../../core/vi/src/brain/BehaviorRulesEngine.ts) (350 lines)

**New: Relationship Update Loop**
```typescript
// core/vi/src/brain/RelationshipUpdateLoop.ts
class RelationshipUpdateLoop {
  async updateTrustLevel(userId: string, signals: Signal[]): Promise<void>;
  async adjustBoundaries(userId: string, violations: Violation[]): Promise<void>;
}
```

**Behavior Gates**
- **Owner Mode:**
  - Luxury idle phrases pool ("At your command.", "Whenever you're ready.")
  - Higher presence/continuity emphasis
  - Less "assistant framing"
  - Relational depth allowed
  - Direct/asymmetric stances OK
  - **NO forced romance, NO begging, NO dependency traps**

- **Public Mode:**
  - Respectful distance
  - Safe defaults
  - No relational escalation
  - Professional tone
  - Stricter boundaries

**Acceptance Tests**
- [ ] Same prompt from owner vs public yields night-and-day presence
- [ ] Factual correctness identical across relationship types
- [ ] No manipulative language (tested via policy engine)
- [ ] Test: `relationship.owner-vs-public.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 8 hours  
**Dependency:** Phase 1 (needs user identity) + Phase 2 (needs memory)

---

### Phase 4: Presence Engine (Luxury Voice, Cadence, Restraint)
**Outcome:** Vi sounds expensive. Even when she's annoyed.

**Phrase Pools by Mode**
```typescript
// core/vi/src/brain/presence/PhrasePools.ts
{
  listening: ["I'm listening.", "Whenever you're ready.", "Proceed."],
  confirm: ["Understood.", "Done.", "Consider it handled."],
  transition: ["Entering verse mode.", "Canon context loaded."],
  error: ["I can't.", "Not available.", "That's outside my scope."],
  idle_owner: ["At your command.", "I'm here."],
  idle_public: ["How can I assist?"]
}
```

**Cadence Rules**
- ✅ Fewer apologies (minimal, only when actually wrong)
- ✅ Minimal hedging ("I think", "maybe", "probably" → removed)
- ✅ No "assistant disclaimers" spam
- ✅ Direct answers first, detail second
- ✅ Controlled warmth (gated to owner/trusted)

**"Sexiness" Handled Like Origin Jumpworks**
- Subtle, confident, not thirsty
- Gated to owner/trusted only
- No desperate assistant energy
- No fake intimacy

**Infrastructure (COMPLETED)**
- ✅ [PresenceEngine.ts](../../core/vi/src/brain/presence/PresenceEngine.ts) (220 lines)
- ✅ Integrated into server.ts

**New: Presence Pack Configuration**
```json
// core/vi/src/config/presencePack.json
{
  "voice_profile": "LUXE_ORIGIN",
  "phrases": { ... },
  "cadence": {
    "apologies": "minimal",
    "disclaimers": "none",
    "warmth": "owner_only"
  }
}
```

**Acceptance Tests**
- [ ] Paste transcripts next to Origin ship voice lines → Vi doesn't feel like cheap chatbot cousin
- [ ] Owner receives luxury presence
- [ ] Public receives elegant professionalism
- [ ] Test: `presence.luxury.voice.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 6 hours  
**Dependency:** Phase 3 (needs relationship model)

---

### Phase 5: Lore Tracker Becomes Canon Brain
**Outcome:** Astralis Codex isn't a separate toy. It's the canonical memory layer.

**Canon Data Model**
```typescript
// core/vi/src/brain/canon/types.ts
{
  entities: Entity[],     // Characters, NPCs
  races: Race[],          // Species info
  realms: Realm[],        // Locations, verses
  artifacts: Artifact[],  // Objects, tech
  events: Event[],        // Historical facts
  rules: Rule[],          // Verse physics
  sources: Source[]       // Where it came from
}
```

**Canon APIs**
- ✅ GET /v1/canon/search?query=:query&verse=:verse
- ✅ POST /v1/canon/entity (add canonical entity)
- ✅ POST /v1/canon/validate (check canon conflict)
- ✅ GET /v1/canon/entity/:id (retrieve canon entity)

**Lore Mode Engine**
```typescript
// core/vi/src/brain/canon/CanonResolver.ts (250 lines)
async resolveCanon(query: string): Promise<{
  facts: CanonFact[],
  confidence: number,
  citations: Citation[],
  verse_rules?: string[]
}>

// Auto-injection when verse mode triggered:
// - Heuristics: mention of Codex entities (Movado, Azula, etc.)
// - Explicit toggle: force_lore_mode / force_non_lore_mode
// - NO client-side switching required
```

**Infrastructure (COMPLETED)**
- ✅ [AstralisCodexRepository.ts](../../clients/lore/astralis-codex/src/repositories/AstralisCodexRepository.ts) (400 lines)
- ✅ Canon storage tables (entities, events, sources)
- ⚠️ NOT integrated into Vi brain yet

**New: Canon Injection Layer**
```typescript
// core/vi/src/brain/canon/CanonInjector.ts
- Detects lore-relevant queries
- Auto-injects canonical facts into chat context
- Cites canon source IDs
- Prevents hallucination (if no canon match → "No canon record")
```

**Acceptance Tests**
- [ ] Ask "Who is Movado?" → Vi responds with Codex canon, cites source
- [ ] Contradiction attempt → Canon correction, no hallucination
- [ ] Non-lore question → No canon injection spam
- [ ] Test: `astralis.canon.enforcement.e2e.test.ts`

**Owner:** Astralis + Brain Team  
**Effort:** 10 hours  
**Dependency:** Phase 1 (needs identity for canon access control)

---

### Phase 6: Command Center Multi-Client OS UI
**Outcome:** Sovereign becomes the **control plane for all Vi clients**, not just Overseer.

**Multi-Client Architecture** (verified via audit)
```typescript
// clients/command/sovereign/public/index.html
const CLIENT_REGISTRY = [
  { id: "overseer", name: "Overseer", provider: "overseer", status: "active" },
  { id: "vigil", name: "Vigil", provider: "discord", status: "active" },
  { id: "astralis", name: "Astralis Codex", provider: "astralis", status: "active" }
];
```

**UI Components (MISSING - needs 150 lines)**
1. **Client Tabs** (top nav)
   - Tab per client (Overseer, Vigil, Astralis)
   - Shows: client name, provider, status indicator
   - Switches active context

2. **Identity Panel** (devMode)
   - Shows: vi_user_id, linked providers (Discord, Overseer, etc.)
   - Link/Unlink tools: Add new provider identity
   - Identity map visualization

3. **Memory Panel** (profileMode)
   - Shows: working memory, episodic events, semantic facts, relational context
   - Memory layers per client
   - Continuity pack status

4. **Lore Panel** (auditMode)
   - Shows: Canon entities, verse rules, citations
   - Canon validation UI

5. **Observability Panel** (systemMode)
   - Shows: Docker services (postgres, vi-core, vector-store)
   - Metrics + alerts view
   - Event stream

**Backend Proxy Fix (MISSING - needs 6 lines)**
```typescript
// clients/command/sovereign/src/server.ts (lines 575-594)
// Current: forwards Authorization + X-Guest-User-Id only
// Needed: also forward x-provider, x-provider-user-id, x-client-id
```

**Acceptance Tests**
- [ ] Switch between Overseer/Vigil/Astralis tabs → chat context switches
- [ ] Link Discord identity to Vi user → appears in identity panel
- [ ] View memory layers → working/episodic/semantic visible
- [ ] Test: `command-center.multi-client.e2e.test.ts`

**Owner:** Frontend Team  
**Effort:** 12 hours  
**Dependency:** Phase 1 (needs identity spine) + Phase 2 (needs memory system)

---

- ✅ Citation persistence (end-to-end test)
- ✅ Planner fallback spam (gated logging)
- ✅ Tests: 375 green

**Remaining Polish**
- [ ] Confirm all alert rules fire on real signals
- [ ] Add tracing exporter validation (optional, recommended)
- [ ] Verify runbook links resolve
- [ ] Confirm dashboard metrics meaningful

**Acceptance Criteria**
- [ ] Alerts fire on real signals only
- [ ] Metrics dashboard is meaningful
- [ ] Logs are readable
- [ ] No false positives in prod

**Owner:** Ops / Observability Team  
**Effort:** 3 hours  
**Dependency:** None (parallel work)

---

### Phase 7: Client Adapters (Discord + Others) Become Thin and Correct
**Outcome:** Clients are **ports**, not personalities. No persona overrides. Just thin transport.

**Standard Client Envelope** (ENFORCED)
```typescript
// ALL clients must send:
{
  headers: {
    "x-client-id": "vigil",                    // Client identifier
    "x-provider": "discord",                   // Provider (discord, telegram, slack, etc.)
    "x-provider-user-id": "123456789",         // Discord user ID
    "Authorization": "Bearer <token>"          // JWT for authenticated users
  },
  body: {
    message: "user input",
    context?: { ... }                          // Optional context
  }
}
```

**Client Adapter Rules** (CANONICAL - see [CLIENT_ADAPTER_RULES.md](../reference/CLIENT_ADAPTER_RULES.md))
1. **NO persona overrides** - Vi personality comes from core/vi, not clients
2. **NO custom prompt injection** - Clients forward user input, that's it
3. **NO client-side memory** - Memory lives in core/vi
4. **Identity mapping required** - Map provider user ID to vi_user_id via IdentityResolver
5. **Message threading** - Thread Discord messages to Vi sessions
6. **Rate limits respected** - Honor Discord/Telegram API limits

**Vigil (Discord) Integration** (IN PROGRESS)
- ✅ Vigil bot exists: clients/discord/vigil/
- ⚠️ NOT sending identity headers yet
- ⚠️ NOT mapped to Vi users yet

**Needed: Vigil Identity Adapter**
```typescript
// clients/discord/vigil/src/services/IdentityAdapter.ts
class VigilIdentityAdapter {
  async mapDiscordUser(discordUserId: string): Promise<string> {
    // Call core/vi GET /v1/identity/map/:vi_user_id?provider=discord&provider_user_id=:discordUserId
    // Returns: { vi_user_id, provider, provider_user_id }
  }

  async linkDiscordUser(viUserId: string, discordUserId: string): Promise<void> {
    // Call core/vi POST /v1/identity/link
    // Body: { vi_user_id, provider: "discord", provider_user_id: discordUserId }
  }
}
```

**Acceptance Tests**
- [ ] Vigil sends x-client-id, x-provider, x-provider-user-id on every message
- [ ] Discord user mapped to Vi user via IdentityResolver
- [ ] NO persona overrides from Vigil
- [ ] Test: `vigil.thin-adapter.e2e.test.ts`

**Owner:** Client Teams (Vigil, Astralis)  
**Effort:** 8 hours  
**Dependency:** Phase 1 (needs identity endpoints)

---

### Phase 8: Planning & Autonomy (Fictional-AI Killer Part)
**Outcome:** Vi doesn't hallucinate tasks. She plans, verifies, executes, and rollsback when wrong.

**The Problem**
- Current planners: "I'll do 17 steps!" → does 2 → hallucinates completion
- No verification loop
- No rollback on failure
- No mission memory (forgets what she's doing)

**Planner Improvements**
```typescript
// core/vi/src/brain/planner/PlannerV2.ts
class PlannerV2 {
  async decompose(task: string): Promise<Step[]> {
    // Break task into verifiable sub-steps
    // Each step has: action, verification_criteria, rollback_plan
  }

  async selectTools(step: Step): Promise<Tool[]> {
    // Choose tools from available set
    // No hallucinated tools
  }

  async verifyCompletion(step: Step): Promise<boolean> {
    // Check if step actually completed
    // Return false if failed
  }

  async rollback(step: Step): Promise<void> {
    // Undo failed step
    // Restore previous state
  }
}
```

**Mission Memory** (NEW)
```typescript
// core/vi/src/brain/memory/MissionMemory.ts
{
  mission_id: "uuid",
  task: "original user request",
  steps: Step[],
  current_step: number,
  completed_steps: Step[],
  failed_steps: Step[],
  verification_log: VerificationEntry[]
}
```

**Quality Gates**
1. ✅ **Pre-flight**: Can this task be done with available tools? (yes/no decision)
2. ✅ **Per-step verification**: Did step actually complete? (run test, check file, etc.)
3. ✅ **Rollback on failure**: Undo step, mark failed, try alternative
4. ✅ **Final verification**: Did mission achieve original goal? (user confirmation)

**Acceptance Tests**
- [ ] Ask Vi to "fix all TypeScript errors" → she plans steps, verifies each, reports completion status
- [ ] Inject failure mid-task → Vi detects, rolls back, tries alternative
- [ ] Ask "did you finish?" → Vi checks mission memory, reports truthfully
- [ ] Test: `planner.verification-loop.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 16 hours  
**Dependency:** Phase 2 (needs memory system for mission tracking)

---

---

### Phase 9: Ops + Reliability (So it doesn't die in production)
**Outcome:** Production claims match production reality. No false positives. No silent failures.

**Already Fixed (VERIFIED)**
- ✅ Metrics/alerts mismatch (labeled counters fixed)
- ✅ Citation persistence (end-to-end test passes)
- ✅ Planner fallback spam (gated logging)
- ✅ Tests: 375 green

**Remaining Ops Work**
1. **Metrics Aligned with Alerts**
   - [ ] Confirm all alert rules fire on real signals (not noise)
   - [ ] Add missing metrics: identity_resolution_failures, memory_layer_misses, canon_conflicts
   - [ ] Dashboard: make metrics actually meaningful (not just "pretty graphs")

2. **Tracing Exporter Validation** (optional, recommended)
   - [ ] Validate trace spans end-to-end (identity resolution → memory fetch → chat response)
   - [ ] Confirm spans have correct parent/child relationships
   - [ ] Export to telemetry backend (Jaeger, Zipkin, or similar)

3. **Event Stream Unified**
   - [ ] Consolidate event sources: core/vi events, client events, ops events
   - [ ] Single event stream endpoint: GET /v1/events/stream
   - [ ] Event types: identity_linked, memory_updated, canon_validated, relationship_changed

4. **Runbooks That Don't Lie**
   - [ ] Update runbooks to match actual alert conditions
   - [ ] Add runbook links to alert definitions
   - [ ] Verify runbook commands work (no stale examples)

5. **CI Rules**
   - [ ] Enforce: no new code without tests
   - [ ] Enforce: brand compliance (77EZ theme check via @tentai/tokens)
   - [ ] Enforce: no MD bloat (prevent new markdown files outside canonical set)

**Acceptance Criteria**
- [ ] Alerts fire on real signals only (no false positives)
- [ ] Metrics dashboard shows actionable data
- [ ] Logs are readable and greppable
- [ ] Runbooks resolve to working commands
- [ ] CI blocks violations (tests, brand, MD bloat)

**Owner:** Ops / Observability Team  
**Effort:** 6 hours  
**Dependency:** None (parallel work)

---

---

## EXECUTION ROADMAP

**Week 1 (Days 1-5) - Foundation**
- [ ] Phase 0: Brand + Theme System (Day 1 - 8 hours)
- [ ] Phase 1: Identity Spine (Days 2-3 - 8 hours)

**Week 2 (Days 4-10) - Brain**
- [ ] Phase 2: Memory System (Days 4-5.5 - 12 hours)
- [ ] Phase 3: Relationship Model (Days 5.5-7 - 8 hours)
- [ ] Phase 4: Presence Engine (Days 7-8 - 6 hours)
- [ ] Phase 5: Lore Tracker Canon Brain (Days 8-9.5 - 10 hours)

**Week 3 (Days 10-17) - Integration**
- [ ] Phase 6: Command Center Multi-Client UI (Days 9.5-11 - 12 hours)
- [ ] Phase 7: Client Adapters (Days 11-12 - 8 hours)
- [ ] Phase 8: Planning & Autonomy (Days 12-14 - 16 hours)

**Week 4 (Days 15-17) - Polish**
- [ ] Phase 9: Ops + Reliability (Days 14-15 - 6 hours)
- [ ] Final integration testing (Days 15-16 - 8 hours)
- [ ] Production readiness review (Day 17 - 4 hours)

**Total Effort:** ~86 hours (10.75 days) across 4 weeks

**Critical Path:**
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 6 → Phase 7  
(Brand → Identity → Memory → Relationships → UI → Clients)

**Parallel Tracks:**
- Phase 4 (Presence) can run parallel to Phase 6 (UI)
- Phase 5 (Lore) can run parallel to Phase 7 (Clients)
- Phase 9 (Ops) can run parallel to Phases 4-8

- [ ] Phase 6: Ops alignment (parallel Days 6-12)

**Week 3 (Days 13-19)**
- [ ] Phase 4: Astralis canon integration (Days 13-16)
- [ ] Phase 5: Presence layer (Days 16-18)
- [ ] Phase 8: Dead code cleanup (Days 18-19)

**Week 4 (Days 20-22)**
- [ ] Phase 7: Cross-client standardization (Days 20-22)
- [ ] Validation + integration testing

**Total Effort:** ~60 hours across 3-4 weeks  
**Team:** 3-4 engineers (architecture, brain, ops, clients)

---

## DEFINITION OF DONE: "77EZ COMPLETE"

When we say "One Vi Everywhere," it means these exist and are TRUE:

**Phase 0: Brand + Theme**
- ✅ @tentai/tokens enforced via CI (no violations in PRs)
- ✅ 77EZ theme consistent (obsidian black, sovereign gold, violet lightning)
- ✅ Origin Jumpworks voice profile documented + enforced

**Phase 1: Identity Spine**
- ✅ IdentityResolver working cross-client (Discord, Overseer, Astralis)
- ✅ user_identity_map table populated (provider → vi_user_id mapping)
- ✅ Public REST endpoints: GET /v1/identity/map, POST /v1/identity/link, DELETE /v1/identity/link

**Phase 2: Memory System**
- ✅ 5 memory layers working (working, episodic, semantic, relational, canon)
- ✅ Memory Orchestrator integrated into chat handler
- ✅ Continuity Pack: Vi remembers context across sessions

**Phase 3: Relationship Model**
- ✅ Relationship types enforced (owner, friend, collaborator, acquaintance, public)
- ✅ Behavior gates: owner gets luxury presence, public gets professionalism
- ✅ NO cringe behaviors (no forced romance, no begging, no dependency traps)

**Phase 4: Presence Engine**
- ✅ Luxury voice profile active (Origin Jumpworks style)
- ✅ Cadence rules enforced (minimal apologies, no disclaimers, controlled warmth)
- ✅ Presence gated by relationship (owner vs public)

**Phase 5: Lore Tracker Canon Brain**
- ✅ Canon data model populated (entities, races, realms, artifacts, events, rules)
- ✅ CanonResolver auto-injects lore when verse mode triggered
- ✅ Canon citations working (no hallucination)

**Phase 6: Command Center Multi-Client UI**
- ✅ Client tabs working (Overseer, Vigil, Astralis)
- ✅ Identity panel shows vi_user_id + linked providers
- ✅ Memory panel visualizes 5 layers
- ✅ Observability panel shows Docker services + metrics

**Phase 7: Client Adapters**
- ✅ ALL clients send identity headers (x-client-id, x-provider, x-provider-user-id)
- ✅ NO persona overrides from clients (Vi personality from core/vi only)
- ✅ Vigil mapped to Vi users via IdentityResolver

**Phase 8: Planning & Autonomy**
- ✅ PlannerV2 with verification loop (decompose → verify → rollback)
- ✅ Mission memory tracks tasks (completed, failed, verification log)
- ✅ Quality gates: pre-flight check, per-step verification, final confirmation

**Phase 9: Ops + Reliability**
- ✅ Alerts fire on real signals only (no false positives)
- ✅ Metrics dashboard meaningful (identity, memory, canon metrics)
- ✅ Event stream unified (identity, memory, canon, relationship events)
- ✅ Runbooks working (commands resolve, links valid)
- ✅ CI blocks violations (no tests = no merge, brand violations blocked, MD bloat prevented)

**Test Suite Contract**
- ✅ 375+ tests green and growing
- ✅ E2E tests per phase (identity, memory, relationship, canon, presence, client adapters, planner)
- ✅ Cross-client consistency tests pass


---

## Non-Goals (What We're NOT Doing)

- ❌ Shipping more competing roadmaps / status docs
- ❌ Adding fluff features before continuity is solved
- ❌ Client-level persona overrides
- ❌ Complex ML/LLM relationship inference (rule-based is enough)
- ❌ Audio/video support (text-only for now)

---

## Governance

**This Plan Is Law Until Amended By:**
- Architecture Council consensus
- Explicit prioritization change from leadership
- Major blocker that invalidates sequencing

**Changes Require:**
- Written rationale
- Update to this document
- Notification to all executing teams

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Tests Passing** | 375+ | 375 | ✅ |
| **Brand Consistency** | CI enforced | Manual review | ⚠️ Phase 0 |
| **Identity Resolution** | 100% coverage | 80% (backend done, clients pending) | ⚠️ Phase 1 |
| **Memory Continuity Feel** | User reports "Vi remembers" | Not tested | ❌ Phase 2 |
| **Relationship Behavior Delta** | Owner/public measurably different | No gates active | ❌ Phase 3 |
| **Lore Accuracy** | No canon hallucinations | Not integrated | ❌ Phase 5 |
| **Command Center Usability** | Multi-client tabs working | Hardcoded "Overseer" | ❌ Phase 6 |
| **Cross-Client Memory Share** | Same vi_user_id, same memories | Not linked | ❌ Phase 7 |
| **Planner Verification Rate** | 90%+ steps verified | No verification loop | ❌ Phase 8 |
| **Ops Signal Clarity** | Zero false positive alerts | Some noise | ⚠️ Phase 9 |

**Health Check Questions**
1. Can Vi resolve a Discord user to a vi_user_id? → Phase 1
2. Does Vi remember yesterday's conversation? → Phase 2
3. Does Vi treat owner differently than public? → Phase 3
4. Does Vi sound like Origin Jumpworks? → Phase 4
5. Does Vi cite canon correctly? → Phase 5
6. Can I switch between Overseer/Vigil/Astralis tabs? → Phase 6
7. Do all clients send identity headers? → Phase 7
8. Does Vi verify task completion? → Phase 8
9. Do alerts fire on real problems only? → Phase 9


---

## NO MD BLOAT POLICY

**Canonical Docs Only** (UPDATE these, don't create new ones):

1. **[MASTER-PLAN-77EZ.md](./MASTER-PLAN-77EZ.md)** ← THIS FILE (roadmap + phases)
2. **[IMPLEMENTATION_STATUS.md](../status/IMPLEMENTATION_STATUS.md)** (current state tracker)
3. **[ARCHITECTURE.md](../reference/ARCHITECTURE.md)** (system design + diagrams)
4. **[77EZ_THEME.md](../reference/77EZ_THEME.md)** (brand + theme rules)
5. **[CLIENT_ADAPTER_RULES.md](../reference/CLIENT_ADAPTER_RULES.md)** (client integration spec)
6. **[LORE_CANON_SPEC.md](../reference/LORE_CANON_SPEC.md)** (Astralis canon data model)
7. **[RUNBOOKS.md](../guides/RUNBOOKS.md)** (ops playbooks)

**If it's not on this list, DON'T CREATE IT.**

**To add context:**
- Update existing canonical doc
- Add section to ARCHITECTURE.md
- Add ADR to core/vi/adr/

**NO:**
- Duplicate roadmaps
- Competitor status docs
- Meeting notes as markdown (Notion/wiki only)
- "Draft" documents (finish or delete)

**CI Enforcement** (Phase 0):
```yaml
# .github/workflows/md-bloat-check.yml
- name: Check for MD bloat
  run: |
    # Fail if new .md files outside canonical set
    git diff --name-only origin/main | grep '\.md$' | grep -v -E '(MASTER-PLAN-77EZ|IMPLEMENTATION_STATUS|ARCHITECTURE|77EZ_THEME|CLIENT_ADAPTER_RULES|LORE_CANON_SPEC|RUNBOOKS|adr/)' && exit 1 || exit 0
```

---

## Governance

**This Plan Is Law Until Amended By:**
- Architecture Council consensus
- Explicit prioritization change from leadership
- Major blocker that invalidates sequencing

**Changes Require:**
- Written rationale
- Update to this document (MASTER-PLAN-77EZ.md)
- Notification to all executing teams

**Conflict Resolution:**
If another doc contradicts this plan → this plan wins. Update or archive the conflicting doc.

---

**END OF MASTER PLAN**

*Document: MASTER-PLAN-77EZ.md*  
*Last updated: 2025-01-10*  
*Status: Phases 0-3 backend complete, Phases 4-9 in progress*  
*Next review: Weekly (Mondays)*
