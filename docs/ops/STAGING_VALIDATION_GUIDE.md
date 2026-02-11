# Staging Validation Guide: Vi Base Brain v1.1

**Date:** February 6, 2026  
**Version:** v1.1 (AmbiguityGate + Relationship Model + Identity Spine)  
**Status:** Ready for staging validation

---

## Overview

This guide covers safe deployment and validation of three major features:

1. **AmbiguityGate v1.1** — Pre-planner ambiguity detection (4 deterministic checks)
2. **Relationship Model (Phase 2)** — Owner vs Public behavior (server-side, brain-computed)
3. **Identity Spine (Phase 1 fix)** — Multi-provider identity mapping (Discord + Sovereign + Astralis → one vi_user_id)

All three are **production-ready** with 687/687 tests passing. Staging validation ensures:
- Feature flags work without changing core behavior
- Telemetry is collected without PII leaks
- Smoke tests verify end-to-end functionality
- Rollback procedures are documented and tested

---

## Quick Links

| Resource | Purpose |
|----------|---------|
| [STAGING_RUNBOOK.md](./STAGING_RUNBOOK.md) | Step-by-step deployment guide |
| [scripts/stagingSmoke.ts](../core/vi/scripts/stagingSmoke.ts) | Automated smoke tests (4 tests) |
| [src/telemetry/stagingTelemetry.ts](../core/vi/src/telemetry/stagingTelemetry.ts) | Telemetry formatting (no PII) |
| [src/config/featureFlags.ts](../core/vi/src/config/featureFlags.ts) | Feature flag configuration |

---

## What to Validate

### 1. AmbiguityGate Detection

**Feature:** Pre-planner validation catches malformed input before planning.

**Validation:**
```bash
# Test with malformed input
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{ "message": "so what not", "userId": "test-user" }'

# Expected: Clarification response (short-circuit, no planning)
# Logs should show: [Staging] Ambiguity check completed { reason: "MALFORMED_QUERY" }
```

**Success Criteria:**
- ✅ Malformed input triggers clarification (4 types: MALFORMED_QUERY, DANGLING_REFERENCE, UNDERSPECIFIED_COMPARISON, CONTRADICTORY_REQUEST)
- ✅ Normal input passes through without ambiguity event
- ✅ Response time <100ms (pre-planner, no LLM)

### 2. Relationship Model Resolution

**Feature:** Vi's behavior is determined by relationship context (owner/public), computed server-side.

**Validation:**
```bash
# Owner user gets "owner_luxury" voice profile
# Public user gets "public_elegant" voice profile

# Logs should show: 
# [Staging] Relationship resolved { 
#   relationship_type: "owner",
#   voice_profile: "owner_luxury",
#   source: "database"
# }
```

**Success Criteria:**
- ✅ Relationship loaded from DB based on vi_user_id
- ✅ Correct voice profile (owner_luxury vs public_elegant)
- ✅ Trust level correctly applied (0-100)
- ✅ Governor validates posture (no banned phrases in public mode)
- ✅ Locked facts override DB relationship (highest authority)

### 3. Identity Spine (Multi-Provider)

**Feature:** Multiple identity providers map to single vi_user_id.

**Validation:**
```bash
# Create Discord identity
curl -X POST http://localhost:3000/v1/identity/resolve \
  -d '{ "provider": "discord", "provider_user_id": "discord_123" }'
# Response: { "vi_user_id": "uuid-1" }

# Link Sovereign to same user
curl -X POST http://localhost:3000/v1/identity/link \
  -d '{ "vi_user_id": "uuid-1", "provider": "sovereign", "provider_user_id": "sov_456" }'

# Get all providers for user
curl http://localhost:3000/v1/identity/providers/uuid-1
# Response: [
#   { "provider": "discord", "provider_user_id": "discord_123" },
#   { "provider": "sovereign", "provider_user_id": "sov_456" }
# ]
```

**Success Criteria:**
- ✅ Multiple providers link to one vi_user_id (PRIMARY KEY changed)
- ✅ Reverse lookup by provider (fast via index)
- ✅ Audit trail logged (link/unlink operations)
- ✅ Can't unlink last provider (safety constraint)

---

## Running Smoke Tests

```bash
cd core/vi

# Enable staging validation
export STAGING_VALIDATION_MODE=true
export LOG_LEVEL=debug

# Run 4 smoke tests
npm run test:staging

# Expected output:
# ✅ Test 1: Normal prompt
# ✅ Test 2: Ambiguous prompt detected
# ✅ Test 3: Relationship context resolved
# ✅ Test 4: Stream endpoint works
# 
# Results: 4/4 tests passed
# 🎉 All smoke tests passed! Staging is ready.
```

### Manual Smoke Test

```bash
# 1. Start server in staging mode
STAGING_VALIDATION_MODE=true npm run dev

# 2. In another terminal, test each feature
npm run test:staging

# 3. Check logs for telemetry
tail -f logs/vi-staging.log | grep "\[Staging\]"
```

---

## Telemetry Fields (No PII)

When `STAGING_VALIDATION_MODE=true`, you'll see:

### Relationship Resolution Logs

```
[Staging] Relationship resolved {
  hashedUserId: "user_a1b2c3d4",  // SHA256 hash, not real ID
  source: "database",              // locked_fact | database | guarded_clamp | default
  relationship_type: "owner",       // owner | public
  voice_profile: "owner_luxury",    // owner_luxury | public_elegant
  trust_level: 85,                  // 0-100
  resolved_in_ms: 42
}
```

### Ambiguity Detection Logs

```
[Staging] Ambiguity check completed {
  status: "AMBIGUOUS",              // clear | AMBIGUOUS
  reason: "MALFORMED_QUERY",        // 4 types
  input_length: 12,                 // chars
  confidence: 0.95,                 // 0-1
  checked_in_ms: 8
}
```

### Governor Regeneration Logs

```
[Staging] Governor pass 1/5 {
  status: "violation_detected",     // passed | violation_detected
  violation_type: "repetition",     // repetition | locked_fact | ungrounded | posture | none
  attempt: 1,
  max_attempts: 5,
  regen_in_ms: 245
}
```

### ContinuityPack Summary

```
[Staging] ContinuityPack built {
  hashedUserId: "user_a1b2c3d4",
  total_facts: 12,
  authority_breakdown: {
    locked: 3,      // User-explicit law
    explicit: 4,    // User-stated facts
    inferred: 5,    // Derived from data
    ephemeral: 0    // Transient observations
  },
  historical_summaries: 2,
  engagement_history: 8,
  size_bytes: 24856,
  built_in_ms: 67
}
```

**Note:** No user IDs, memory contents, or private facts are logged. Only counts, timing, and decision reasons.

---

## Feature Flags

Control behavior via environment variables:

```bash
# Enable staging validation (all telemetry)
export STAGING_VALIDATION_MODE=true

# Control individual features (all enabled by default)
export DISABLE_AMBIGUITY_GATE=true         # ⚠️  Not recommended
export DISABLE_RELATIONSHIP_MODEL=true     # ⚠️  Not recommended
export DISABLE_IDENTITY_SPINE=true         # ⚠️  Not recommended
export ALLOW_MISSING_CONTINUITY_PACK=true  # ⚠️  Not recommended

# Future (currently disabled)
export ENABLE_CANON_INTEGRATION=true
export ENABLE_PRESENCE_LAYER=true
```

**Critical Features (Always Enabled in Production):**
- `ambiguityGateEnabled` — Prevents confident answers to malformed input
- `relationshipModelEnabled` — Owner/public behavior differentiation
- `identitySpineEnabled` — Cross-client user identity
- `continuityPackRequired` — Hard fail if missing (enforce bounded context)

---

## Validation Checklist

Before promoting to production:

- [ ] **Database Migrations**
  - [ ] 0035_create_user_facts applied
  - [ ] 0036_create_user_relationships applied
  - [ ] 0037_fix_identity_map_primary_key applied
  - [ ] Schema matches expected (run `\d` in psql)

- [ ] **Test Suite**
  - [ ] Full test suite passing: `npm test` → 687/687 ✅
  - [ ] Smoke tests passing: `npm run test:staging` → 4/4 ✅

- [ ] **Feature Functionality**
  - [ ] AmbiguityGate detects malformed input
  - [ ] Relationship model resolves from DB correctly
  - [ ] Owner and public users get different voice profiles
  - [ ] Identity spine links multiple providers per user
  - [ ] Governor validates posture (no banned phrases in public)
  - [ ] Stream endpoint works end-to-end

- [ ] **Telemetry & Logging**
  - [ ] STAGING_VALIDATION_MODE logs don't leak PII
  - [ ] All key decision points logged (relationship, ambiguity, governor)
  - [ ] Hashed user IDs in logs (not real IDs)
  - [ ] Timing metrics collected

- [ ] **Rollback Procedures**
  - [ ] Database rollback tested (drop migration, restore from backup)
  - [ ] Code rollback tested (git checkout + restart)
  - [ ] Service restart verified working

- [ ] **Monitoring**
  - [ ] Metrics dashboard configured (latency, ambiguity rate, regen count)
  - [ ] Alert rules configured (violations, errors)
  - [ ] Log aggregation working (tail -f, grep for [Staging])

---

## Common Issues & Fixes

### "STAGING_VALIDATION_MODE is not recognized"

**Issue:** Feature flag not being read.

**Fix:**
```bash
# Ensure env var is exported
export STAGING_VALIDATION_MODE=true

# Start server with env
STAGING_VALIDATION_MODE=true npm run dev

# Verify it's enabled
curl http://localhost:3000/health | jq '.config.stagingValidationMode'
```

### "Tests fail with 'ambiguity_detected not found'"

**Issue:** AmbiguityGate not integrated into pipeline.

**Fix:**
1. Check that `core/vi/src/brain/pipeline.ts` calls `ambiguityGate.check()`
2. Verify response has `ambiguity_detected` field
3. Check logs: `grep "AmbiguityGate" logs/vi-staging.log`

### "Relationship not resolving correctly"

**Issue:** Relationship resolver not finding DB record.

**Fix:**
1. Check database: `SELECT * FROM user_relationships WHERE vi_user_id = 'uuid'`
2. Verify MemoryOrchestrator calls RelationshipResolver before building ContinuityPack
3. Check logs: `grep "Relationship resolved" logs/vi-staging.log`

### "Multi-provider identity fails"

**Issue:** Schema migration 0037 not applied.

**Fix:**
```bash
# Check applied migrations
psql $DATABASE_URL -c "SELECT * FROM applied_migrations ORDER BY applied_at DESC;"

# Check schema
psql $DATABASE_URL -c "\d user_identity_map"

# Expected PRIMARY KEY: (provider, provider_user_id)
# Expected indexes: vi_user_id
```

---

## Next Steps

### Immediate (Staging Validation)
1. Deploy to staging with STAGING_VALIDATION_MODE=true
2. Run smoke tests: `npm run test:staging`
3. Monitor logs for 1-2 days
4. Confirm all validation criteria met

### Production (After Staging Sign-Off)
1. Disable STAGING_VALIDATION_MODE (or leave enabled, no behavior change)
2. Deploy with database migrations
3. Monitor metrics: ambiguity rate, relationship resolve time, identity links
4. Alert on anomalies (high ambiguity rate, relationship resolve slowness)

### Future Work (Not in v1.1)
- [ ] Phase 4: Canon integration (Astralis codex)
- [ ] Phase 5: Presence layer (luxury voice)
- [ ] Phase 7: Cross-client adapter standardization
- [ ] Phase 9: Vi Console UI (immersive workspaces)

---

## Support

**Questions?** See:
- [STAGING_RUNBOOK.md](./STAGING_RUNBOOK.md) — Step-by-step operations
- [docs/plans/MASTER-PLAN-77EZ.md](../plans/MASTER-PLAN-77EZ.md) — Architecture & roadmap
- [core/vi/README.md](../../core/vi/README.md) — Feature documentation

**Issues?** File a ticket with:
- Error message + logs (first 500 chars)
- Which test failed (smoke test #, feature area)
- Database check output (`\d user_identity_map`)
- Staging mode enabled (check STAGING_VALIDATION_MODE)

---

**Status:** ✅ Ready for staging. All features tested and documented.

*Last updated: February 6, 2026*
