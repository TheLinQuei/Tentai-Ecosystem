# Staging Deployment Checklist

**Version:** Vi Base Brain v1.1  
**Deployment Date:** _______________  
**Deployment Lead:** _______________

---

## Pre-Deployment (Day -1)

- [ ] **Read Documentation**
  - [ ] `docs/ops/STAGING_RUNBOOK.md` (entire document)
  - [ ] `docs/ops/STAGING_VALIDATION_GUIDE.md` (what to validate)
  - [ ] `docs/STAGING_INFRASTRUCTURE_SUMMARY.md` (overview)

- [ ] **Prepare Environment**
  - [ ] Staging database accessible and backed up
  - [ ] Staging server has 4GB+ RAM available
  - [ ] SSH access verified
  - [ ] PostgreSQL client tools installed (`psql`)

- [ ] **Prepare Rollback Plan**
  - [ ] Database backup created: `____________________`
  - [ ] Previous code version identified: `____________________`
  - [ ] Rollback commands tested and documented
  - [ ] Emergency contact list ready

---

## Deployment Day: Step 1 - Database Migration (10 min)

### Environment Setup

- [ ] Create `.env.staging` with:
  ```
  DATABASE_URL=postgresql://user:password@staging-db:5432/vi_staging
  TEST_DATABASE_URL=$DATABASE_URL
  STAGING_VALIDATION_MODE=true
  LOG_LEVEL=debug
  NODE_ENV=staging
  ```

- [ ] Save `.env.staging` to: `____________________`

### Pre-Migration Checks

- [ ] Database is accessible: `psql $DATABASE_URL -c "SELECT 1"`
  - Result: ✅ / ❌

- [ ] Current schema documented:
  ```bash
  psql $DATABASE_URL -c "\d user_identity_map" > pre_migration_schema.txt
  ```
  - Result: ✅ / ❌

- [ ] Database backup created:
  ```bash
  pg_dump $DATABASE_URL > vi_staging_pre_v1.1_$(date +%s).sql
  ```
  - Backup file: `____________________`
  - Backup size: `____________________` MB
  - Result: ✅ / ❌

### Run Migrations

- [ ] Navigate to vi directory:
  ```bash
  cd /opt/tentai-vi/core/vi
  ```

- [ ] Install dependencies:
  ```bash
  npm ci
  ```
  - Result: ✅ / ❌

- [ ] Check migration status before:
  ```bash
  npm run migrate:status > migration_status_before.txt
  ```
  - Result: ✅ / ❌
  - Output saved: `____________________`

- [ ] Apply migrations:
  ```bash
  npm run migrate:apply
  ```
  - Result: ✅ / ❌
  - Any errors? `____________________`

- [ ] Check migration status after:
  ```bash
  npm run migrate:status > migration_status_after.txt
  ```
  - Migration 0037 present? ✅ / ❌
  - Output saved: `____________________`

### Verify Schema Change

- [ ] Check PRIMARY KEY changed:
  ```bash
  psql $DATABASE_URL -c "\d user_identity_map"
  ```
  - Expected: `PRIMARY KEY (provider, provider_user_id)` ✅ / ❌
  - Actual: `____________________`

- [ ] Check indexes created:
  ```bash
  psql $DATABASE_URL -c "\d user_identity_map" | grep "user_identity_map_vi_user_id"
  ```
  - Expected: Index on vi_user_id exists ✅ / ❌
  - Result: `____________________`

---

## Deployment Day: Step 2 - Deploy & Start Server (5 min)

### Prepare Code

- [ ] Pull latest code:
  ```bash
  cd /opt/tentai-vi/core/vi
  git fetch origin
  git checkout v1.1  # or main
  ```
  - Result: ✅ / ❌
  - Current commit: `____________________`

- [ ] Reinstall dependencies:
  ```bash
  npm ci
  ```
  - Result: ✅ / ❌

### Start Server

- [ ] Set environment:
  ```bash
  export STAGING_VALIDATION_MODE=true
  export LOG_LEVEL=debug
  export DATABASE_URL="postgresql://user:password@staging-db:5432/vi_staging"
  ```

- [ ] Start server in background:
  ```bash
  npm run dev > /var/log/vi/staging.log 2>&1 &
  ```
  - Result: ✅ / ❌
  - Process ID: `____________________`

- [ ] Wait for startup (5 seconds):
  ```bash
  sleep 5
  ```

- [ ] Verify server is running:
  ```bash
  curl -s http://localhost:3000/health | jq .
  ```
  - Status: ✅ ok / ❌ error
  - Response: `____________________`

- [ ] Check feature flags enabled:
  ```bash
  curl -s http://localhost:3000/health | jq '.config'
  ```
  - stagingValidationMode: ✅ true / ❌ false
  - ambiguityGateEnabled: ✅ true / ❌ false
  - relationshipModelEnabled: ✅ true / ❌ false
  - identitySpineEnabled: ✅ true / ❌ false
  - continuityPackRequired: ✅ true / ❌ false

- [ ] Check logs for startup errors:
  ```bash
  tail -20 /var/log/vi/staging.log
  ```
  - Any errors? ✅ none / ❌ present
  - If present: `____________________`

---

## Deployment Day: Step 3 - Run Smoke Tests (15 min)

### Run Tests

- [ ] Execute smoke tests:
  ```bash
  cd /opt/tentai-vi/core/vi
  npm run test:staging
  ```
  - Result: ✅ 4/4 passed / ❌ failed

### Test-by-Test Verification

- [ ] **Test 1: Normal Prompt**
  - Status: ✅ / ❌
  - Duration: `____________________` ms
  - Details: `____________________`

- [ ] **Test 2: Ambiguous Prompt Detection**
  - Status: ✅ / ❌
  - Duration: `____________________` ms
  - Details: `____________________`

- [ ] **Test 3: Relationship Context**
  - Status: ✅ / ❌
  - Duration: `____________________` ms
  - Details: `____________________`

- [ ] **Test 4: Stream Endpoint**
  - Status: ✅ / ❌
  - Duration: `____________________` ms
  - Details: `____________________`

### Log Verification

- [ ] Check logs for telemetry:
  ```bash
  tail -100 /var/log/vi/staging.log | grep "\[Staging\]"
  ```
  - Logs contain: ✅ / ❌
  - Log sample: `____________________`

- [ ] Verify no PII in logs:
  ```bash
  grep -E "[0-9a-f]{8}-[0-9a-f]{4}" /var/log/vi/staging.log | wc -l
  ```
  - Count should be 0: ✅ / ❌
  - Actual count: `____________________`

---

## Deployment Day: Step 4 - Feature Validation (20 min)

### AmbiguityGate Validation

- [ ] Test malformed query detection:
  ```bash
  curl -X POST http://localhost:3000/v1/chat \
    -H "Content-Type: application/json" \
    -d '{"message": "so what not", "userId": "test-user"}'
  ```
  - Result: ✅ ambiguity_detected=true / ❌
  - Response: `____________________`

- [ ] Check logs for ambiguity detection:
  ```bash
  grep "Ambiguity check completed" /var/log/vi/staging.log | tail -1
  ```
  - Found: ✅ / ❌
  - Log: `____________________`

### Relationship Model Validation

- [ ] Create test user:
  ```bash
  curl -X POST http://localhost:3000/v1/identity/create \
    -H "Content-Type: application/json" \
    -d '{
      "provider": "discord",
      "provider_user_id": "test_discord_123",
      "email": "test@example.com"
    }' | jq .
  ```
  - Result: ✅ / ❌
  - vi_user_id: `____________________`

- [ ] Set relationship (owner):
  ```bash
  VI_USER_ID="[from above]"
  curl -X POST http://localhost:3000/v1/relationships \
    -H "Content-Type: application/json" \
    -d "{
      \"vi_user_id\": \"$VI_USER_ID\",
      \"relationship_type\": \"owner\",
      \"trust_level\": 100
    }"
  ```
  - Result: ✅ / ❌

- [ ] Check logs for relationship resolution:
  ```bash
  grep "Relationship resolved" /var/log/vi/staging.log | tail -1
  ```
  - Found: ✅ / ❌
  - relationship_type: `____________________`
  - voice_profile: `____________________`
  - resolved_in_ms: `____________________`

### Identity Spine Validation

- [ ] Link second provider (Sovereign):
  ```bash
  VI_USER_ID="[from above]"
  curl -X POST http://localhost:3000/v1/identity/link \
    -H "Content-Type: application/json" \
    -d "{
      \"vi_user_id\": \"$VI_USER_ID\",
      \"provider\": \"sovereign\",
      \"provider_user_id\": \"test_sovereign_456\"
    }"
  ```
  - Result: ✅ / ❌

- [ ] Verify both providers linked:
  ```bash
  VI_USER_ID="[from above]"
  curl http://localhost:3000/v1/identity/providers/$VI_USER_ID | jq .
  ```
  - Status: ✅ / ❌
  - Provider count: `____________________`
  - Providers: `____________________`

- [ ] Verify schema:
  ```bash
  psql $DATABASE_URL -c "SELECT * FROM user_identity_map WHERE vi_user_id = '[id]';" | wc -l
  ```
  - Should have 2 rows (Discord + Sovereign): ✅ / ❌
  - Actual: `____________________`

---

## Post-Deployment: Monitoring (1-2 hours)

### Real-Time Monitoring

- [ ] Start log tail in separate terminal:
  ```bash
  tail -f /var/log/vi/staging.log | grep "\[Staging\]"
  ```

- [ ] Monitor for 30 minutes:
  - Time started: `____________________`
  - Time ended: `____________________`
  - Issues found: ✅ none / ❌ present

- [ ] Check key metrics:
  ```bash
  # Ambiguity detection rate
  grep "Ambiguity check" /var/log/vi/staging.log | wc -l
  # Expected: < 10 (should be rare in normal use)
  # Actual: `____________________`
  
  # Relationship resolutions
  grep "Relationship resolved" /var/log/vi/staging.log | wc -l
  # Expected: > 0
  # Actual: `____________________`
  
  # Governor attempts
  grep "Governor pass" /var/log/vi/staging.log | wc -l
  # Expected: > 0
  # Actual: `____________________`
  ```

### Performance Checks

- [ ] Response time test:
  ```bash
  curl -w "@curl-format.txt" -o /dev/null -s \
    -X POST http://localhost:3000/v1/chat \
    -H "Content-Type: application/json" \
    -d '{"message": "What is AI?", "userId": "perf-test"}'
  ```
  - Total time: `____________________` ms
  - Should be < 1000ms: ✅ / ❌

- [ ] Latency percentiles (multiple requests):
  ```bash
  for i in {1..10}; do
    curl -w "%{time_total}\n" -o /dev/null -s \
      -X POST http://localhost:3000/v1/chat \
      -H "Content-Type: application/json" \
      -d '{"message": "What is AI?", "userId": "perf-test"}'
  done | sort -n
  ```
  - p50 (median): `____________________` ms (should be < 500ms)
  - p99 (slowest): `____________________` ms (should be < 2000ms)

### Error Rate Check

- [ ] Count errors in logs:
  ```bash
  grep -i "error\|exception" /var/log/vi/staging.log | wc -l
  ```
  - Error count: `____________________`
  - Should be near 0: ✅ / ❌
  - If present, first error: `____________________`

---

## Success Criteria Validation

### Deployment Success
- [ ] Migrations applied (0037 visible)
- [ ] Schema changed (PRIMARY KEY on (provider, provider_user_id))
- [ ] Server started without errors
- [ ] Health endpoint returns 200 + features enabled
- [ ] Database accessible and responsive

### Testing Success
- [ ] Smoke tests pass 4/4: ✅ / ❌
- [ ] No test timeouts or connection errors: ✅ / ❌
- [ ] Logs show expected telemetry (no PII): ✅ / ❌

### Feature Success
- [ ] AmbiguityGate detects malformed input: ✅ / ❌
- [ ] Relationship model resolves from DB: ✅ / ❌
- [ ] Owner gets owner_luxury voice: ✅ / ❌
- [ ] Multi-provider identity works: ✅ / ❌
- [ ] Governor validates posture: ✅ / ❌

### Performance Success
- [ ] Ambiguity check < 50ms: ✅ / ❌
- [ ] Relationship resolution < 100ms: ✅ / ❌
- [ ] Full response < 500ms (p50): ✅ / ❌
- [ ] No latency regression: ✅ / ❌

### Monitoring Success
- [ ] Metrics dashboard populated: ✅ / ❌
- [ ] Alerts configured: ✅ / ❌
- [ ] Log aggregation working: ✅ / ❌

---

## Sign-Off

### Deployment Results

**Overall Status:** ✅ SUCCESS / ⚠️ PARTIAL / ❌ FAILED

**Pass Rate:** `____________________` / 100%

**Critical Issues:** 
```
[List any blocking issues]
```

**Non-Critical Issues:**
```
[List any minor issues]
```

### Deployment Details

| Item | Value |
|------|-------|
| Deployment Start Time | `____________________` |
| Deployment End Time | `____________________` |
| Total Duration | `____________________` min |
| Migration Duration | `____________________` min |
| Smoke Test Duration | `____________________` min |
| Monitoring Duration | `____________________` min |

### Approvals

- **Deployed By:** `____________________`
- **Verified By:** `____________________`
- **Approved For Production:** ✅ YES / ❌ NO / ⚠️ CONDITIONAL

**Conditions (if conditional):**
```
[List conditions for production approval]
```

### Sign-Off Confirmation

- [ ] All checklist items completed
- [ ] All success criteria met
- [ ] Sign-off authorized

**Signature:** `____________________` **Date:** `____________________`

---

## Rollback Instructions (If Needed)

### Quick Rollback (< 15 min)

If deployment is unsuccessful:

```bash
# 1. Stop server
pkill -f "npm run dev"

# 2. Restore database
psql $DATABASE_URL < vi_staging_pre_v1.1_[backup_timestamp].sql

# 3. Revert code (optional)
cd /opt/tentai-vi/core/vi
git checkout v1.0

# 4. Restart with old code
npm ci
npm run dev
```

### Validation After Rollback

- [ ] Database restored: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM user_identity_map;"`
- [ ] Server running: `curl http://localhost:3000/health`
- [ ] Schema reverted: `psql $DATABASE_URL -c "\d user_identity_map"`
- [ ] Tests passing: `npm test`

---

## Post-Deployment Monitoring (First 24 Hours)

### Hour 1 (Immediate)

- [ ] Server health check: ✅ / ❌
- [ ] Error rate < 1%: ✅ / ❌
- [ ] Response latency normal: ✅ / ❌
- [ ] Database queries responsive: ✅ / ❌

### Hour 2-4

- [ ] No unusual log patterns: ✅ / ❌
- [ ] Metrics stable: ✅ / ❌
- [ ] No PII leaks detected: ✅ / ❌
- [ ] Feature flags working: ✅ / ❌

### Hour 4-24

- [ ] Continue monitoring metrics
- [ ] Document any anomalies
- [ ] Plan production release if all stable

**Monitoring Notes:**
```
[Document any observations, issues, or patterns]
```

---

## Next Steps

After successful staging validation (24 hours of stable operation):

- [ ] Schedule production release (2 weeks recommended)
- [ ] Notify stakeholders of readiness
- [ ] Create production deployment checklist
- [ ] Plan maintenance window (30 min downtime)
- [ ] Prepare production runbook (same as staging)

---

**Checklist Version:** 1.0  
**Last Updated:** February 6, 2026  
**Status:** Ready for Staging Deployment
