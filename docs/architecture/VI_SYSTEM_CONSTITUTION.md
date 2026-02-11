# VI SYSTEM CONSTITUTION

**Status:** CANONICAL LAW  
**Date Established:** January 20, 2026  
**Authority:** Architecture Council  
**Purpose:** Prevent helpful destruction. Enforce preservation during evolution.

---

## PREAMBLE

This document defines the **immutable constraints** that keep Vi coherent during development. These are not guidelines. They are **technical boundaries** that must be enforced via CI, code review, and architecture gates.

**Violation of these rules is a regression, not an improvement.**

---

## ARTICLE I — MUST NEVER BE AUTONOMOUS

These operations require **explicit human approval** and **cannot be automated** without architecture review + multi-signature approval.

### A1. Self Model Updates
**What:** Modifications to [config/selfModel.json](../../core/vi/src/config/selfModel.json) or `self_model` database records  
**Why:** Personality drift, values corruption, coherence loss  
**Current Gate:** SelfModelRepository.upsert() requires explicit admin endpoint call with auth  
**Enforcement:** 
- Admin endpoint requires `ADMIN_ROLE` + `VI_SELF_MODEL_UPDATES_ENABLED=true` env flag
- CI fails if selfModel.json modified without ADR in commit
- Self model version bump required for any change
- Audit log entry mandatory

**Risk if Automated:** CRITICAL — Vi becomes incoherent across sessions

---

### A2. Database Schema Migrations
**What:** Adding, altering, or dropping database tables/columns  
**Why:** Data loss, breaking changes, client breakage  
**Current Gate:** Migration script review + manual execution via `npm run migrate`  
**Enforcement:**
- Migrations numbered sequentially (0001, 0002, etc.)
- Migration runner checks `applied_migrations` table before execution
- Rollback script required for destructive migrations
- CI test: migrations apply cleanly on empty DB + existing DB

**Risk if Automated:** CATASTROPHIC — Data loss, unrecoverable state

---

### A3. External Tool Registration
**What:** Registering tools not in `src/tools/builtins/`  
**Why:** Code injection, privilege escalation, arbitrary execution  
**Current Gate:** Only built-in tools exist; ToolRegistry.register() is internal  
**Enforcement:**
- Tool registration only allowed in DEV_MODE + signed manifest
- External tools require security audit + ADR
- Tool sandboxing validation (input schema, output sanitization, rate limits)
- No dynamic tool loading from external sources

**Risk if Automated:** CRITICAL — Arbitrary code execution

---

### A4. User Identity Deletion
**What:** DELETE operations on `users`, `user_identity_map`, or cascading user data  
**Why:** GDPR compliance, irreversible data loss, legal liability  
**Current Gate:** DELETE endpoints require authentication + explicit user request  
**Enforcement:**
- Soft delete first (mark deleted_at, retain data 30 days)
- Hard delete requires manual confirmation + audit log
- Deletion exports user data before purge (GDPR compliance)
- No batch deletion without explicit approval

**Risk if Automated:** HIGH — Legal compliance violation, accidental data loss

---

### A5. LLM Provider Switching
**What:** Runtime changes to VI_LLM_PROVIDER or API credentials  
**Why:** Cost explosion, API key leaks, budget violations  
**Current Gate:** Environment variable (requires restart)  
**Enforcement:**
- Provider config is immutable at runtime (no dynamic switching)
- API key rotation requires restart + validation
- Cost budget checks before provider initialization
- Alert on API key usage anomalies

**Risk if Automated:** MEDIUM — Uncontrolled API costs, credential leaks

---

## ARTICLE II — REQUIRES HUMAN OR PIPELINE GATING

These operations can be partially automated but require **validation gates** before execution.

### G1. Memory Write Policies
**Current:** All memories written automatically from reflector  
**Required Gate:** 
- Episodic memories: Auto-write (conversation events)
- Semantic memories: On-demand only (explicit user teaching or high-confidence extraction)
- Relational memories: Threshold-based (trust level changes require validation)
- Garbage prevention: No duplicate writes (deduplication check)

---

### G2. Relationship Type Escalation
**Current:** Manually set in `user_profiles.relationship_type`  
**Required Gate:**
- Trust level 0-30 → `restricted` (auto)
- Trust level 31-60 → `normal` (auto)
- Trust level 61-80 → `trusted` (requires 7-day observation period)
- Trust level 81-100 → `owner` (requires explicit user confirmation)

---

### G3. Canon Proposal Approval
**Current:** Manual via Astralis Codex  
**Required Gate:**
- Conflict detection: Auto (canonical fact mismatch)
- Proposal submission: Auto (from lore mode interactions)
- Approval: Human review (canon council or owner)
- Publication: After approval only

---

### G4. Cost Budget Enforcement
**Current:** Per-tool credit system  
**Required Gate:**
- Daily budget cap (alert at 80%, block at 100%)
- Per-user credit limits (configurable)
- Tool cost monitoring (flag anomalies)
- API usage dashboards

---

### G5. Task Execution Limits
**Current:** No global limits on task execution  
**Required Gate:**
- Max concurrent tasks: 10 per user
- Task timeout: 5 minutes default (configurable per task)
- Retry limit: 3 attempts with exponential backoff
- Escalation to human if task fails 3 times

---

## ARTICLE III — STRUCTURALLY SENSITIVE COMPONENTS

**Definition:** Components where breaking changes cascade catastrophically. Changes must be **additive-only** or require migration paths.

### S1. CognitionPipeline
**Location:** [core/vi/src/brain/pipeline.ts](../../core/vi/src/brain/pipeline.ts)  
**Why Sensitive:** Single orchestration point for all thought cycles  
**Protection:**
- Backward-compatible interfaces only
- No method signature changes without deprecation period
- Integration test suite (7+ tests) must pass
- Milestone lock system (M4, M5, M8, M9 locked)

**Breaking Change Examples:**
- ❌ Removing fields from ThoughtState
- ❌ Changing pipeline.process() signature
- ❌ Removing stages (perception, intent, plan, execute, reflect)
- ✅ Adding optional fields to ThoughtState.perception.context
- ✅ Adding new stages (post-reflection grounding)

---

### S2. Database Schema
**Location:** [core/vi/src/db/migrations.ts](../../core/vi/src/db/migrations.ts)  
**Why Sensitive:** 20 migrations, 25+ repositories depend on schema stability  
**Protection:**
- Additive migrations only (new tables, new columns with defaults)
- No column renames without migration + backfill
- No table drops without data export + confirmation
- Migration rollback scripts mandatory

**Breaking Change Examples:**
- ❌ Renaming columns (breaks repositories)
- ❌ Dropping tables (data loss)
- ❌ Changing column types (requires backfill)
- ✅ Adding nullable columns
- ✅ Adding indexes
- ✅ Creating new tables

---

### S3. LLM Gateway Interface
**Location:** [core/vi/src/brain/interfaces.ts](../../core/vi/src/brain/interfaces.ts)  
**Why Sensitive:** Provider switching, testing, fallback logic depend on stable contract  
**Protection:**
- Interface versioning (LLMGatewayV1, LLMGatewayV2)
- Stub implementation must match production interface
- All providers implement same interface
- Breaking changes require all providers updated simultaneously

**Breaking Change Examples:**
- ❌ Changing method signatures (breaks all providers)
- ❌ Removing methods (breaks pipeline)
- ❌ Changing return types (breaks callers)
- ✅ Adding optional methods with defaults
- ✅ Adding optional parameters to existing methods

---

### S4. Identity Resolution
**Location:** [core/vi/src/identity/IdentityResolver.ts](../../core/vi/src/identity/IdentityResolver.ts)  
**Why Sensitive:** All user context depends on vi_user_id; corruption breaks continuity  
**Protection:**
- Unique constraint on (provider, provider_user_id)
- Audit logging for all identity mutations
- Identity map cannot be deleted without cascade validation
- Guest → authenticated promotion path preserved

**Breaking Change Examples:**
- ❌ Changing vi_user_id format (breaks all user context)
- ❌ Removing provider types (breaks clients)
- ❌ Changing identity resolution logic (inconsistent user mapping)
- ✅ Adding new provider types
- ✅ Adding metadata fields

---

### S5. Self Model
**Location:** [core/vi/src/config/selfModel.json](../../core/vi/src/config/selfModel.json)  
**Why Sensitive:** Defines personality, values, boundaries; corruption creates incoherent AI  
**Protection:**
- File-based source of truth (version controlled)
- Version field incremented on every change
- Violation logging (SelfModelEnforcer)
- Rollback path (previous version in git history)

**Breaking Change Examples:**
- ❌ Removing core values (personality shift)
- ❌ Changing voice profile drastically (coherence loss)
- ❌ Removing behavioral rules (boundary violations)
- ✅ Adding new values (clarification)
- ✅ Refining existing rules (precision)

---

## ARTICLE IV — REGRESSION CATASTROPHE ZONES

**Definition:** Specific code patterns that, if broken, cause immediate system failure or data corruption.

### R1. Breaking Perception Context
**What:** Removing or renaming fields in `ThoughtState.perception.context`  
**Impact:** Pipeline crashes, context loss, 404s in cognition flow  
**Prevention:**
- Schema changes must be additive only
- Backward compatibility tests (old context format still works)
- Deprecation warnings for 2 milestones before removal

---

### R2. Tool Interface Changes
**What:** Modifying `Tool.execute()` signature or `ToolResult` structure  
**Impact:** All tools break (5 built-in + future external)  
**Prevention:**
- Tool versioning (toolVersion field)
- Execute method signature locked
- New capabilities via optional parameters only

---

### R3. Memory Schema Changes
**What:** Altering `memory_vectors` columns or embedding dimensions  
**Impact:** Embedding mismatch, retrieval failure, semantic search breaks  
**Prevention:**
- Embedding dimension locked (1536 for text-embedding-3-small)
- No column renames (breaks MemoryStore queries)
- Backfill scripts for data migrations

---

### R4. Auth Token Format
**What:** Changing JWT payload structure or signing algorithm  
**Impact:** All active sessions invalidated, users logged out  
**Prevention:**
- Token versioning (v1, v2 in payload)
- Grace period (accept both old + new for 7 days)
- Migration path (refresh endpoint issues new tokens)

---

### R5. API Endpoint Removals
**What:** Deleting `/v1/*` routes without deprecation  
**Impact:** Client breakage (Sovereign, Vigil, Astralis)  
**Prevention:**
- Deprecation warnings (3 milestones before removal)
- Versioned APIs (`/v2/*` for breaking changes)
- Sunset headers (warn clients of upcoming removal)

---

## ARTICLE V — ADDITIVE-ONLY RULE

**Principle:** When in doubt, **add** instead of **change**.

### Examples

**❌ WRONG (Breaking):**
```typescript
// Before
interface ThoughtState {
  input: string;
}

// After (BREAKS EXISTING CODE)
interface ThoughtState {
  userInput: string; // renamed field
}
```

**✅ CORRECT (Additive):**
```typescript
// Before
interface ThoughtState {
  input: string;
}

// After (BACKWARD COMPATIBLE)
interface ThoughtState {
  input: string; // kept for backward compat
  userInput?: string; // new optional field
}
```

---

**❌ WRONG (Breaking):**
```typescript
// Before
async process(input: string): Promise<string>

// After (BREAKS CALLERS)
async process(input: string, userId: string): Promise<string>
```

**✅ CORRECT (Additive):**
```typescript
// Before
async process(input: string): Promise<string>

// After (BACKWARD COMPATIBLE)
async process(input: string, userId?: string): Promise<string>
```

---

## ARTICLE VI — MILESTONE LOCK RULES

**Principle:** Once a milestone is marked ✅ LOCKED, its core contracts are **immutable**.

### Locked Milestones

- **M1:** Server, CLI, config, logging (LOCKED)
- **M2:** Database, migrations, repositories (LOCKED)
- **M3:** Auth, JWT, users, sessions (LOCKED)
- **M4:** Cognition pipeline types, interfaces (LOCKED)
- **M5:** LLM integration, gateway interface (LOCKED)
- **M6:** Memory foundation, pgvector (LOCKED)
- **M7:** Tools framework, registry, runner (LOCKED)
- **M7.2:** Tool integration into pipeline (LOCKED)
- **M8:** LLM-driven planning (LOCKED)
- **MB:** Memory consolidation (LOCKED)
- **M9:** Chat interface (LOCKED)

### Locked Means

1. **No breaking changes** to locked interfaces
2. **No method signature changes** without new milestone
3. **Additive enhancements only** (new optional fields, new methods)
4. **Tests must continue passing** (backward compatibility validation)

### Unlocking Process

To unlock a milestone for breaking changes:
1. Create ADR (Architecture Decision Record) explaining why
2. Get approval from Architecture Council
3. Create migration path for dependent code
4. Update all affected tests
5. Increment milestone version (M4 → M4.1)

---

## ARTICLE VII — PR GATING RULES

**Principle:** CI enforces constitutional rules, not humans remembering them.

### CI Checks (Mandatory)

1. **TypeScript Build:** 0 errors, 0 warnings (strict mode)
2. **Tests:** All unit + integration tests pass
3. **Migrations:** Apply cleanly on empty DB + test DB
4. **Breaking Change Detection:**
   - No locked interface changes without version bump
   - No schema changes without additive migration
   - No API endpoint removals without deprecation
5. **Security:**
   - No hardcoded API keys
   - No secrets in logs
   - Tool registration validation
6. **Style:**
   - No hardcoded hex colors (must use tokens)
   - Prettier formatting
   - No `any` types (except validated boundaries)

### Review Requirements

- **1 approval:** Documentation, tests, additive features
- **2 approvals:** Structural changes, new subsystems
- **Architecture Council:** Breaking changes, milestone unlocks, constitutional amendments

---

## ARTICLE VIII — ENFORCEMENT

### Technical Enforcement

**CI Pipeline:**
- Husky pre-commit hooks (format, lint)
- GitHub Actions on PR (build, test, breaking change detection)
- Merge protection rules (required checks, approvals)

**Runtime Enforcement:**
- Environment flags for dangerous operations (A1-A5)
- Admin role checks (self model, migrations)
- Audit logging (identity mutations, tool registration, memory writes)

**Code Review Enforcement:**
- PR template checklist (breaking changes? migration? tests?)
- Automated labeling (breaking, additive, docs-only)
- Required reviewers for sensitive components (S1-S5)

### Social Enforcement

**Architecture Council:**
- Weekly review of constitutional violations
- ADR approval for breaking changes
- Milestone lock/unlock decisions

**Team Discipline:**
- Onboarding: Constitution is required reading
- Code reviews: Reference constitutional articles
- Post-mortems: Document violations and preventions

---

## ARTICLE IX — AMENDMENT PROCESS

This constitution can be amended, but requires:

1. **ADR (Architecture Decision Record)** explaining why
2. **Architecture Council approval** (unanimous for Articles I-V)
3. **Impact analysis** (what breaks? what needs migration?)
4. **Migration path** (how do we get from current to amended state?)
5. **Version bump** (Constitution v2, v3, etc.)

**No silent edits. No "just this once" exceptions.**

---

## CONCLUSION

**This constitution exists because "helpful" destroys systems.**

Every rule here came from a real failure mode:
- A1-A5: Things that went autonomous and broke production
- G1-G5: Things that needed gates and didn't have them
- S1-S5: Components that cascaded failures when changed
- R1-R5: Regressions that took days to fix

**Follow this, and Vi evolves.**  
**Violate this, and Vi fragments.**

---

**Constitution Status:** ACTIVE  
**Version:** 1.0  
**Next Review:** After Phase 1-2 Completion  
**Document Owner:** Architecture Council
