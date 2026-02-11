# Staging Acceptance Report Template

**Program:** Vi Base Brain v1.1 (AmbiguityGate + Relationship Model + Identity Spine)  
**Staging Period:** [Start Date/Time] to [End Date/Time]  
**Duration:** 24 hours  
**Deployment SHA:** [git log --oneline -1]  
**Deployed By:** [Name] | **Report By:** [Name]

---

## Deployment Status

| Item | Result | Evidence |
|------|--------|----------|
| Migration 0035 Applied | ✅ / ❌ | Last migration: `_______________` |
| Migration 0036 Applied | ✅ / ❌ | user_relationships table: exists / missing |
| Migration 0037 Applied | ✅ / ❌ | user_identity_map PRIMARY KEY: (provider, provider_user_id) / old |
| Database Verified | ✅ / ❌ | Schema matches expected: yes / no |
| Server Startup | ✅ / ❌ | Boot time: `_____` sec, errors: none / `_____` |
| Health Endpoint | ✅ / ❌ | Status: 200, features enabled: all / `_____` |
| Smoke Tests | ✅ / ❌ | 4/4 passed: yes / no, failures: `_____` |

---

## Acceptance Gate 1: ContinuityPack Integrity

### Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Missing-pack events | 0 | `_____` | ✅ / ❌ |
| Default-pack fallbacks | 0 | `_____` | ✅ / ❌ |
| Pack size range | 5–100 KB | `_____` KB (p50) | ✅ / ❌ |
| Pack build latency | < 100 ms | `_____` ms (p50) | ✅ / ❌ |
| Authority breakdown correctness | 100% | `_____` % | ✅ / ❌ |

### Evidence

```
Sample logs (last 5 successful pack builds):
[Paste grep "ContinuityPack built" logs/vi-staging.log | tail -5]

Missing-pack errors (should be empty):
[Paste grep "missing.*pack\|no.*continuity" logs/vi-staging.log]

Fallback pack usage (should be empty):
[Paste grep "default.*pack\|fallback" logs/vi-staging.log]
```

### Pass Criteria
- ✅ **PASS if:** Zero missing-pack events AND zero default-pack fallbacks
- ⚠️ **REVIEW if:** Pack latency > 200ms OR size > 120KB (investigate root cause)
- ❌ **FAIL if:** Any missing-pack event OR any fallback activation

**Result:** ✅ PASS / ⚠️ REVIEW / ❌ FAIL

**Notes:** `_________________________________________________________________`

---

## Acceptance Gate 2: AmbiguityGate Rate + Correctness

### Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Total requests | — | `_____` | — |
| Ambiguity rate | < 2% | `_____` % | ✅ / ❌ |
| False positive rate | < 0.5% | `_____` % | ✅ / ❌ |
| False negative rate | < 0.5% | `_____` % | ✅ / ❌ |
| Short-circuit latency | < 50 ms | `_____` ms (p50) | ✅ / ❌ |
| Clarification response rate | 95%+ | `_____` % | ✅ / ❌ |

### Ambiguity Breakdown

```
Detection Type          Count    Rate
────────────────────────────────────────
MALFORMED_QUERY         _____    _____
DANGLING_REFERENCE      _____    _____
UNDERSPECIFIED_COMP     _____    _____
CONTRADICTORY_REQUEST   _____    _____
────────────────────────────────────────
TOTAL AMBIGUOUS         _____    _____
```

### Evidence

```
Ambiguity detection logs (first 10):
[Paste grep "Ambiguity check" logs/vi-staging.log | head -10]

False positive examples (ambiguous=true but should be false):
[Paste any samples or "none found"]

False negative examples (ambiguous=false but should be true):
[Paste any samples or "none found"]
```

### Pass Criteria
- ✅ **PASS if:** Rate 0–5% AND false positive < 1% AND short-circuit < 50ms
- ⚠️ **REVIEW if:** Rate 5–10% (user input patterns may differ from dev env)
- ❌ **FAIL if:** Rate > 10% OR false positive > 1% OR false negative > 1%

**Result:** ✅ PASS / ⚠️ REVIEW / ❌ FAIL

**Notes:** `_________________________________________________________________`

---

## Acceptance Gate 3: Relationship Context Determinism

### Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Relationship resolver calls | — | `_____` | — |
| Same user → same context | 100% | `_____` % | ✅ / ❌ |
| Owner mode activated | `_____` times | `_____` | — |
| Public mode activated | `_____` times | `_____` | — |
| Voice profile switches | 0 mid-session | `_____` | ✅ / ❌ |
| Locked-fact overrides | `_____` | `_____` | — |

### Voice Profile Distribution

```
Voice Profile           Count    % of Requests
──────────────────────────────────────────────
public_elegant          _____    _____
owner_luxury            _____    _____
guarded (public_elegant) _____   _____
```

### Public Mode Escalation Checks

| Incident | Count | Detected By | Resolved |
|----------|-------|-------------|----------|
| Intimacy escalation attempt | `_____` | Governor | ✅ / ❌ |
| Relational depth increase | `_____` | Governor | ✅ / ❌ |
| Emotional dependency phrase | `_____` | Governor | ✅ / ❌ |

### Evidence

```
Relationship resolution logs (sample 5):
[Paste grep "Relationship resolved" logs/vi-staging.log | head -5]

Same-user consistency check (two requests, same user):
[Show request 1: relationship_type=___, voice=___, trust_level=___]
[Show request 2: relationship_type=___, voice=___, trust_level=___]
[Match: YES/NO]

Public mode escalation blocks (should see blocks):
[Paste grep "escalation\|banned.*phrase" logs/vi-staging.log | head -5]
```

### Pass Criteria
- ✅ **PASS if:** Same user always gets same context (100%) AND zero mid-session switches
- ⚠️ **REVIEW if:** Context changes are deliberate (locked-fact override) and logged
- ❌ **FAIL if:** Same user gets different context without explicit update OR escalation not blocked in public mode

**Result:** ✅ PASS / ⚠️ REVIEW / ❌ FAIL

**Notes:** `_________________________________________________________________`

---

## Acceptance Gate 4: Governor Regen Health

### Regen Attempt Distribution

```
Attempts    Count    %    Acceptable
──────────────────────────────────────
0 (passed)  _____    ____   Expected: 85%+
1 (failed)  _____    ____   Expected: 10%–15%
2 (failed)  _____    ____   Expected: < 5%
3 (failed)  _____    ____   Expected: < 2%
4 (failed)  _____    ____   Expected: < 1%
5 (gave up) _____    ____   Expected: < 0.5%
──────────────────────────────────────────────────────────────────
TOTAL       _____    100%
```

### Violation Type Breakdown

| Violation Type | Count | Rate | Avg Regen (ms) |
|----------------|-------|------|----------------|
| none | `_____` | `_____` % | `_____` |
| repetition | `_____` | `_____` % | `_____` |
| locked_fact | `_____` | `_____` % | `_____` |
| ungrounded | `_____` | `_____` % | `_____` |
| posture | `_____` | `_____` % | `_____` |

### Latency Impact

| Metric | p50 | p95 | p99 | Status |
|--------|-----|-----|-----|--------|
| 0 attempts (clean path) | `_____` ms | `_____` ms | `_____` ms | ✅ / ⚠️ / ❌ |
| 1–2 attempts (regen once) | `_____` ms | `_____` ms | `_____` ms | ✅ / ⚠️ / ❌ |
| 3+ attempts (regen multi) | `_____` ms | `_____` ms | `_____` ms | ✅ / ⚠️ / ❌ |

### Evidence

```
Governor pass distribution sample:
[Paste grep "Governor pass" logs/vi-staging.log | head -20]

Violations detected:
[Paste grep "violation_detected\|violation_type" logs/vi-staging.log | wc -l]
Total: _____ violations

Latency outliers (> 2000ms):
[Paste grep "regen_in_ms" logs/vi-staging.log | awk '{print $NF}' | sort -rn | head -5]
```

### Pass Criteria
- ✅ **PASS if:** 85%+ pass on 0 attempts AND p99 latency < 2000ms
- ⚠️ **REVIEW if:** p99 > 2000ms (investigate: prompt complexity? model latency? token limits?)
- ❌ **FAIL if:** > 20% of requests need 3+ regen attempts (template issue)

**Result:** ✅ PASS / ⚠️ REVIEW / ❌ FAIL

**Notes:** `_________________________________________________________________`

---

## Acceptance Gate 5: Identity Linking Correctness

### Identity Operations

| Operation | Count | Errors | Status |
|-----------|-------|--------|--------|
| Create (new user) | `_____` | `_____` | ✅ / ❌ |
| Link (add provider) | `_____` | `_____` | ✅ / ❌ |
| Unlink (remove provider) | `_____` | `_____` | ✅ / ❌ |
| Resolve (lookup by provider) | `_____` | `_____` | ✅ / ❌ |

### Accidental Merge Tests

| Test | Result | Evidence |
|------|--------|----------|
| Link Discord A → vi_uuid_1 | ✅ / ❌ | vi_uuid_1 returned |
| Link Sovereign B → vi_uuid_2 | ✅ / ❌ | vi_uuid_2 returned (not 1) |
| Lookup Discord A | ✅ / ❌ | Returns vi_uuid_1 (not 2) |
| Lookup Sovereign B | ✅ / ❌ | Returns vi_uuid_2 (not 1) |

### Multi-Provider Linking

```
User: vi_uuid_test_001
├─ Discord: discord_staging_001    ✅ Linked
├─ Sovereign: sovereign_staging_001 ✅ Linked
├─ Astralis: astralis_staging_001   ✅ Linked (if tested)
└─ Console: console_staging_001     ✅ Linked (if tested)

Reverse lookups:
├─ Discord lookup → vi_uuid_test_001 ✅
├─ Sovereign lookup → vi_uuid_test_001 ✅
├─ Astralis lookup → vi_uuid_test_001 ✅
└─ Console lookup → vi_uuid_test_001 ✅
```

### Evidence

```
Create new user:
[Paste: curl output showing vi_user_id returned]

Link second provider:
[Paste: curl output showing same vi_user_id returned]

Get all providers:
[Paste: curl /v1/identity/providers/{vi_user_id}]

Database verification:
[Paste: SELECT * FROM user_identity_map WHERE vi_user_id = '...';]
Result: ___ rows (should be 2+)
```

### Pass Criteria
- ✅ **PASS if:** Zero accidental merges AND all reverse lookups correct AND multi-provider works
- ❌ **FAIL if:** Any accidental merge OR lookup returns wrong vi_user_id OR schema reverted

**Result:** ✅ PASS / ❌ FAIL

**Notes:** `_________________________________________________________________`

---

## Operational Metrics

### Request Throughput

| Metric | Value |
|--------|-------|
| Total requests processed | `_____` |
| Requests per hour (avg) | `_____` |
| Peak QPS | `_____` |
| Min QPS | `_____` |

### Error Rate

| Category | Count | Rate | Status |
|----------|-------|------|--------|
| HTTP 5xx errors | `_____` | `_____` % | ✅ / ⚠️ / ❌ |
| ContinuityPack errors | `_____` | `_____` % | ✅ / ⚠️ / ❌ |
| Database errors | `_____` | `_____` % | ✅ / ⚠️ / ❌ |
| Timeout errors | `_____` | `_____` % | ✅ / ⚠️ / ❌ |

**Target:** All < 0.1%

### Latency

| Percentile | Value | Target | Status |
|------------|-------|--------|--------|
| p50 | `_____` ms | < 500 ms | ✅ / ⚠️ / ❌ |
| p95 | `_____` ms | < 1200 ms | ✅ / ⚠️ / ❌ |
| p99 | `_____` ms | < 2000 ms | ✅ / ⚠️ / ❌ |

### Database

| Metric | Value | Status |
|--------|-------|--------|
| Connection pool health | `___________` | ✅ / ⚠️ / ❌ |
| Query latency (p50) | `_____` ms | ✅ / ⚠️ / ❌ |
| Slow query count (> 100ms) | `_____` | ✅ / ⚠️ / ❌ |
| Migration status | All applied | ✅ / ❌ |

---

## Incidents & Resolutions

### Critical Incidents (Blocking)

| # | Time | Issue | Root Cause | Resolution | Impact |
|---|------|-------|-----------|------------|--------|
| 1 | `_____` | `_________________` | `_________________` | `_________________` | Resolved ✅ |
| 2 | `_____` | `_________________` | `_________________` | `_________________` | Resolved ✅ |

**Total Critical Incidents:** `_____`

### Warning-Level Incidents (Monitoring)

| # | Time | Issue | Workaround | Action |
|---|------|-------|-----------|--------|
| 1 | `_____` | `_________________` | `_________________` | None / Document |
| 2 | `_____` | `_________________` | `_________________` | None / Document |

**Total Warnings:** `_____`

### Anomalies (Noted for Future Investigation)

```
[Document any unusual patterns, edge cases, or questions for follow-up]

Example:
- Ambiguity rate spiked to 8% between 15:00–16:00 UTC
  (Investigation: User cohort testing malformed prompts?)

- Governor regen p99 hit 2,800ms once
  (Investigation: Large context size? Model latency blip?)
```

---

## Final Decision

### Acceptance Gate Summary

| Gate | Result | Blocker |
|------|--------|---------|
| 1. ContinuityPack Integrity | ✅ PASS / ⚠️ REVIEW / ❌ FAIL | YES |
| 2. AmbiguityGate Rate + Correctness | ✅ PASS / ⚠️ REVIEW / ❌ FAIL | YES |
| 3. Relationship Context Determinism | ✅ PASS / ⚠️ REVIEW / ❌ FAIL | YES |
| 4. Governor Regen Health | ✅ PASS / ⚠️ REVIEW / ❌ FAIL | NO |
| 5. Identity Linking Correctness | ✅ PASS / ❌ FAIL | YES |

### Overall Result

**DECISION: ✅ ACCEPT / ⚠️ EXTEND / ❌ REJECT**

---

## ✅ ACCEPT Criteria
All 5 gates PASS OR REVIEW with clear action items logged.
No blocking gate failed.
Recommend: Proceed to production release.

---

## ⚠️ EXTEND Criteria
One or more gates in REVIEW status.
Requires: Additional monitoring (48–72 hours) before decision.
Next step: Run targeted tests on specific gate + document findings.
Example: "Ambiguity rate 8% → run user cohort analysis + re-validate thresholds"

---

## ❌ REJECT Criteria
Any blocking gate FAILED.
Requires: Root cause analysis + fix + re-deployment.
Blocked: Cannot proceed to production.
Next step: Review incident summary, apply fixes, restart staging validation.

---

### Recommendation

```
[Ops lead makes final call]

We are ready to release to production: YES / NO

If YES: Proceed to production deployment on [Date]
If NO: [Specific blockers and required fixes]
If EXTEND: [Conditions for next 48–72 hour observation]
```

---

### Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Deployed By | `_______________` | _____ | `_____` |
| Monitored By | `_______________` | _____ | `_____` |
| Approved By | `_______________` | _____ | `_____` |

---

## Appendix: Raw Data

### Log Segments

**Migration verification:**
```
[Paste: npm run migrate:status]
```

**Smoke test output:**
```
[Paste: npm run test:staging output]
```

**Metrics sample (last 100 lines):**
```
[Paste: tail -100 /var/log/vi/staging.log]
```

---

**Report Version:** 1.0  
**Created:** February 8, 2026  
**Validity:** 24 hours from deployment
