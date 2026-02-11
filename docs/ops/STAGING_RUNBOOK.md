# Staging Runbook: Base Brain v1.1 + Relationship Model

**Date:** February 6, 2026  
**Components:** AmbiguityGate v1.1, Relationship Model (Phase 2), Identity Spine (Phase 1 fix)  
**Status:** Ready for staging validation

---

## Quick Start

### Prerequisites

Ensure you have:
- Node.js 18+
- PostgreSQL 14+
- `.env` file configured for staging DB

### Environment Variables

```bash
# Database
TEST_DATABASE_URL=postgres://user:pass@staging-db:5432/vi_staging
DATABASE_URL=$TEST_DATABASE_URL

# Feature flags
STAGING_VALIDATION_MODE=true  # Enables detailed logging
LOG_LEVEL=debug               # For staging diagnostics

# OpenAI (optional, tool.grounding E2E test may be skipped)
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...
```

---

## Deployment Flow

### Step 1: Database Migration

**Before deploying code**, apply all pending migrations in order:

```bash
cd core/vi

# Verify pending migrations
npm run migrate:status

# Apply migrations (0035, 0036, 0037)
npm run migrate:up

# Verify success
npm run migrate:status  # Should show all as "applied"

# Verify schema
psql $TEST_DATABASE_URL -c "\dt user_identity_map user_relationships user_facts"
```

**Expected tables:**
- `user_identity_map` — PRIMARY KEY (provider, provider_user_id), index on vi_user_id ✅
- `user_relationships` — relationship_type, trust_level, voice_profile ✅
- `user_facts` — authority, scope, expires_at ✅

### Step 2: Start Server

```bash
cd core/vi

# Install dependencies
npm install

# Start server (development mode)
npm run dev

# Expected output:
# [Vi] Server listening on port 3000
# [Vi] Migrations applied: 0035, 0036, 0037
# [Vi] STAGING_VALIDATION_MODE enabled
```

### Step 3: Run Smoke Tests

```bash
cd core/vi

# Run staging validation harness
npm run test:staging

# Expected output:
# ✅ SMOKE TEST: Normal prompt via /v1/chat
# ✅ SMOKE TEST: Ambiguous prompt detection
# ✅ SMOKE TEST: Owner vs Public posture
# ✅ SMOKE TEST: Stream endpoint happy path
# ✅ All smoke tests passed (4/4)
```

### Step 4: Validate Core Features

#### A. AmbiguityGate Detection

Test that ambiguous input triggers short-circuit:

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "message": "so what not",
    "userId": "test-user-1"
  }'

# Expected response:
# {
#   "output": "Could you clarify what you mean? ...",
#   "ambiguity_detected": true,
#   "reason": "MALFORMED_QUERY"
# }
```

#### B. Relationship Context Resolution

Test that relationship affects posture:

```bash
# First, insert a user with "owner" relationship
psql $TEST_DATABASE_URL -c "
  INSERT INTO user_relationships (vi_user_id, relationship_type, voice_profile)
  VALUES ('550e8400-e29b-41d4-a716-446655440000', 'owner', 'owner_luxury')
  ON CONFLICT DO NOTHING;
"

# Send same prompt as owner
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -d '{
    "message": "status report",
    "userId": "550e8400-e29b-41d4-a716-446655440000"
  }'

# Check logs for relationship_context telemetry:
# relationship_type: owner
# voice_profile: owner_luxury
# source: database
```

#### C. Identity Spine (Multi-Provider)

Test that Discord + Sovereign map to same user:

```bash
# Create mapping: Discord → vi_user_id
curl -X POST http://localhost:3000/v1/identity/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "discord",
    "provider_user_id": "discord_12345"
  }'

# Response: { "vi_user_id": "550e8400-..." }

# Link Sovereign to same user
curl -X POST http://localhost:3000/v1/identity/link \
  -H "Content-Type: application/json" \
  -d '{
    "vi_user_id": "550e8400-...",
    "provider": "sovereign",
    "provider_user_id": "sov_67890"
  }'

# Verify link
curl http://localhost:3000/v1/identity/providers/550e8400-...
# Response: [
#   { "provider": "discord", "provider_user_id": "discord_12345" },
#   { "provider": "sovereign", "provider_user_id": "sov_67890" }
# ]
```

#### D. Stream Endpoint

Test `/v1/chat/stream` with relationship context:

```bash
curl -X POST http://localhost:3000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "message": "hello",
    "userId": "test-user-1"
  }' \
  | head -20

# Expected: SSE stream with events
# event: pipeline.start
# event: pipeline.relationship_context
# event: pipeline.ambiguity_check
# event: generation.token
# ...
```

---

## Telemetry Validation

### Key Logs to Monitor

When `STAGING_VALIDATION_MODE=true`, expect these logs:

#### 1. Relationship Resolution

```
[RelationshipResolver] Resolving relationship
  userId: "550e8400-..."
  source: "database|locked_fact|guarded_clamp"
  relationship_type: "owner|public"
  voice_profile: "owner_luxury|public_elegant"
  trust_level: 75
```

#### 2. Ambiguity Detection

```
[AmbiguityGate] Ambiguity detected
  reason: "MALFORMED_QUERY|DANGLING_REFERENCE|..."
  input: "so what not"
  confidence: 0.95
```

#### 3. Governor Regeneration

```
[Governor] Violation detected, regenerating
  violation_type: "repetition|locked_fact|ungrounded"
  attempt: 1/5
  duration_ms: 245
```

#### 4. ContinuityPack Summary (No PII)

```
[Pipeline] ContinuityPack built
  locked_facts: 3
  fact_ledger_size: 12
  relationship_context: { type: "owner", trust_level: 75 }
  authority_tiers: { locked: 3, explicit: 4, inferred: 5, ephemeral: 0 }
```

---

## Health Checks

### Database

```bash
# Check migrations
psql $TEST_DATABASE_URL -c "SELECT * FROM applied_migrations ORDER BY applied_at DESC LIMIT 5;"

# Check schemas
psql $TEST_DATABASE_URL -c "\d user_identity_map"
psql $TEST_DATABASE_URL -c "\d user_relationships"
```

### API

```bash
# Health endpoint
curl http://localhost:3000/health

# Expected: { "status": "ok", "migrations": ["0035", "0036", "0037"] }
```

### Test Suite

```bash
# Full test suite (should all pass)
npm test

# Expected:
# Test Files  65 passed | 1 skipped (66)
# Tests       687 passed | 1 skipped (688)
```

---

## Rollback Steps

### If Issues Detected

#### Option A: Rollback Migrations (DB Only)

```bash
# View applied migrations
psql $TEST_DATABASE_URL -c "SELECT * FROM applied_migrations ORDER BY id DESC;"

# Rollback 0037 (identity schema fix)
psql $TEST_DATABASE_URL << EOF
DELETE FROM applied_migrations WHERE id = '0037_fix_identity_map_primary_key';

-- Restore old schema (if backup exists)
-- OR drop user_identity_map and let 017_user_identity_map.sql recreate it
DROP TABLE IF EXISTS user_identity_map CASCADE;
-- Re-run migrations up to 0036
EOF

npm run migrate:up
```

#### Option B: Full Rollback (Code + DB)

```bash
# Stop server
pkill -f "npm run dev"

# Rollback code to previous commit
git checkout HEAD~1 core/vi/src core/vi/prisma

# Drop test DB and recreate
dropdb vi_staging
createdb vi_staging

# Reapply previous migrations only
npm run migrate:up  # Stops at 0036 if 0037 missing

# Restart
npm run dev
```

#### Option C: Emergency Rollback (Production)

If production deployment goes wrong:

```bash
# 1. Stop Vi service
systemctl stop vi-core

# 2. Verify backup DB exists
ls -lh /var/backups/vi_prod_*.sql

# 3. Restore from backup
pg_restore -d vi_prod /var/backups/vi_prod_2026-02-06.sql

# 4. Rollback code
git checkout release-v1.1 core/vi/src core/vi/prisma

# 5. Restart
systemctl start vi-core

# 6. Verify
curl http://localhost:3000/health
```

---

## Monitoring in Staging

### Metrics to Watch

- **latency** — /v1/chat p50, p99 (should be <500ms for cached relationships)
- **ambiguity_detected_rate** — % of requests hitting AmbiguityGate (should be <5% for normal input)
- **relationship_resolve_time** — time to resolve from DB/cache (should be <50ms)
- **governor_regen_count** — # of regen attempts per request (should avg <1.2 for valid input)
- **continuity_pack_size** — bytes serialized (should be <50KB)

### Log Tail

```bash
# Watch for errors
tail -f logs/vi-staging.log | grep -i "error\|fail\|exception"

# Watch for telemetry
tail -f logs/vi-staging.log | grep "RelationshipResolver\|AmbiguityGate\|Governor"

# Count ambiguity hits
tail -f logs/vi-staging.log | grep "ambiguity_detected" | wc -l
```

---

## Success Criteria

✅ Staging is ready when:

1. All 4 smoke tests pass (`npm run test:staging`)
2. Migrations 0035, 0036, 0037 all applied
3. Normal prompt: returns response + ContinuityPack telemetry
4. Ambiguous prompt: short-circuits + ambiguity_detected event
5. Owner prompt: voice_profile = owner_luxury in logs
6. Public prompt: voice_profile = public_elegant in logs
7. Multi-provider identity: Discord + Sovereign resolve to same vi_user_id
8. Full test suite: 687/687 passing
9. No PII in logs (STAGING_VALIDATION_MODE doesn't leak user data)
10. Rollback procedure confirmed working

---

## Support

**Questions?** Check these:
- [docs/README.md](../README.md) — Architecture overview
- [docs/plans/MASTER-PLAN-77EZ.md](../plans/MASTER-PLAN-77EZ.md) — Execution roadmap
- [core/vi/QUICKSTART.md](../../core/vi/QUICKSTART.md) — Dev environment setup
- [core/vi/README.md](../../core/vi/README.md) — Feature documentation

**Issues?** File a ticket with:
- Error message (first 500 chars)
- Timestamp from logs
- Which step failed (smoke test #, database check, etc.)
- Database schema check output (`\d user_identity_map`)
