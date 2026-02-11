# Ops: What You Actually Do (24-Hour Staging Validation)

**Reality Check Version:** February 8, 2026  
**Your Job:** Deploy, measure, decide.

---

## Hour 0: Deploy

Follow `docs/STAGING_DEPLOYMENT_CHECKLIST.md` steps 1–4:
1. Database migration (10 min)
2. Deploy code (5 min)
3. Run smoke tests (15 min)
4. Verify features (20 min)

**At 0:30:** ✅ Staging is live

---

## Hours 1–6: Measure (While Paying Attention)

### Every 5 Minutes (First Hour)

```bash
# Run smoke-loop.sh
./smoke-loop.sh
```

Tests should pass 4/4. If not, something is broken. Stop. Debug.

### Next 5 Hours

Run this prompt set:
```bash
./validation-prompt-set.sh
```

Keep outputting results to a log file. You're collecting baseline data.

### Every 30 Minutes

```bash
# Collect metric snapshot
./metrics-snapshot.sh
```

Appends to `metrics.log`. You're building a 5-hour picture.

### At Hour 7: Light Stress Test

```bash
./stress-test.sh
```

Double the load for 1 hour. See if anything breaks. If it does, document it.

---

## Hours 8–23: Watch (Mostly Passive)

Start the background monitoring loop:
```bash
./monitor.sh &
```

This checks every 5 minutes for:
- Errors (if > 10, alert)
- Missing packs (if any, alert immediately)
- Slow requests (if > 5 hitting 2000ms+, alert)

Otherwise, you can step back. System monitors itself.

### Collect Hourly Report

```bash
./hourly-report.sh
```

Run every hour. Appends to `hourly.log`. Takes 30 seconds.

---

## Hour 24: Decide

### Collect Final Metrics

```bash
./final-analysis.sh
```

This dumps everything into `staging-validation-metrics.txt`.

### Fill Report

Open `docs/ops/STAGING_ACCEPTANCE_REPORT.md` and fill in:

1. **ContinuityPack Integrity**
   - Missing packs: check logs for count
   - Fallbacks: check logs for count
   - → PASS if both = 0, else FAIL

2. **AmbiguityGate Rate**
   - Total ambiguous: from metrics
   - Total requests: from metrics
   - Rate = ambiguous / requests
   - → PASS if < 5%, FAIL if > 10%

3. **Relationship Determinism**
   - Pick one user, run 5 requests
   - Same context all 5 times? → PASS
   - Different? → FAIL

4. **Governor Regen**
   - From metrics: what % passed on 0 attempts?
   - → PASS if > 85%, FAIL if < 70%

5. **Identity Correctness**
   - Create 2 users (Discord, Sovereign)
   - Did they get different IDs? → PASS
   - Same ID? → FAIL (critical bug)

### Make Decision

Look at your 5 gates:

✅ **PASS** if: All gates pass OR 1 REVIEW with clear action
→ Action: Schedule production release

⚠️ **EXTEND** if: 2+ gates in REVIEW status
→ Action: Run 48–72 more hours, re-measure, decide again

❌ **REJECT** if: Any gate FAILS
→ Action: Stop, debug root cause, redeployment needed

---

## Tools You Get

All scripts are in `docs/ops/24_HOUR_VALIDATION_LOOP.md`:
- `smoke-loop.sh` (every 5 min, hour 1)
- `validation-prompt-set.sh` (hours 2–6)
- `metrics-snapshot.sh` (every 30 min)
- `stress-test.sh` (hour 7)
- `monitor.sh` (background, hours 8–23)
- `hourly-report.sh` (every hour)
- `final-analysis.sh` (hour 24)

Copy-paste them. They work.

---

## What Actually Matters

### ContinuityPack Missing → REJECT
If the brain ever runs without a ContinuityPack, it's a hard failure. Stop everything. This is non-negotiable.

### Ambiguity Rate > 10% → EXTEND (Not REJECT)
This might just be user patterns different from dev. But you need more data. Re-run for 48 hours.

### Governor Regen p99 > 3000ms → EXTEND (Not REJECT)
Something's slow, but maybe it's just high-context requests. Collect more data.

### Identity Accidental Merge → REJECT (IMMEDIATELY)
This is data loss. Stop production plans. This is the one catastrophic failure mode. Treat it like one.

---

## One-Sentence Decision Rule

**ACCEPT if:** All critical gates (1, 2, 3, 5) pass  
**EXTEND if:** Critical gates pass, 1+ secondary (4) gates in REVIEW  
**REJECT if:** Any critical gate fails

---

## After Decision

### ✅ ACCEPT
Email: "Staging passed. Releasing to production [date]."

### ⚠️ EXTEND
Email: "Staging extended 48 hours. Will re-measure [reason]."

### ❌ REJECT
Email: "Staging failed at [gate]. Root cause: [reason]. Redeploying [date]."

---

## Files You Reference

- `docs/STAGING_DEPLOYMENT_CHECKLIST.md` (steps 0–0.5)
- `docs/ops/24_HOUR_VALIDATION_LOOP.md` (scripts, procedures)
- `docs/ops/STAGING_ACCEPTANCE_REPORT.md` (fill this in at hour 24)
- `docs/ops/STAGING_RUNBOOK.md` (if you need to debug something)

That's it. Three documents, one report form.

---

## TL;DR

1. Deploy (30 min)
2. Run scripts (24 hours, mostly automated)
3. Fill report form (2 hours)
4. Make real decision (ACCEPT/EXTEND/REJECT)
5. Email result

---

**Expected Outcome:** Staging passes or fails with clear metrics, not vibes.

**Your Decision:** ACCEPT (production ready) OR EXTEND (need more data) OR REJECT (critical issue)
