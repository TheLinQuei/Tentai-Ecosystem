# 24-Hour Staging Validation Loop

**Program:** Vi Base Brain v1.1 Disciplined Reality Check  
**Duration:** 24 consecutive hours  
**Owner:** Ops Lead (one person drives this)  
**Goal:** Collect real metrics, answer five gates, make real decision

---

## Pre-Staging (1 Hour Before Deploy)

### Checklist

- [ ] Fresh database backup created: `_____________________`
- [ ] Rollback procedure tested (dry run): ✅
- [ ] Staging server health: CPU/memory/disk clear
- [ ] Logging infrastructure ready (tail -f working)
- [ ] Metrics collection running (if using dashboards)
- [ ] Staging acceptance report template printed/opened
- [ ] Prompt set prepared (see "Prompt Set" section below)
- [ ] Team notified of 24-hour validation window

### Pre-Staging Log Baseline

```bash
# Capture starting state
wc -l /var/log/vi/staging.log
# Note: _____ lines at start
```

---

## Deployment (Hour 0: 0:00–0:30)

### Deploy Following Standard Checklist

```bash
# From STAGING_DEPLOYMENT_CHECKLIST.md
# Step 1: Database migration (10 min)
# Step 2: Deploy & start server (5 min)
# Step 3: Run smoke tests (15 min)
# Step 4: Feature validation (20 min)
```

### Deployment Verification

- [ ] All 4 smoke tests pass: ✅ / ❌
- [ ] Server health endpoint 200: ✅ / ❌
- [ ] Features enabled: ✅ ambiguityGateEnabled, relationshipModelEnabled, identitySpineEnabled, continuityPackRequired
- [ ] Logs flowing: `tail -f /var/log/vi/staging.log` shows entries

**At 0:30 mark:** 🟢 Ready to begin validation

---

## Hours 1–6: Intensive Testing (Automated + Manual)

### Hour 1: 5-Minute Smoke Loop (Every 5 Minutes)

Run this shell script every 5 minutes:

```bash
#!/bin/bash
# smoke-loop.sh (run every 5 min for first hour)

echo "=== 5-Min Smoke Check at $(date) ==="

# Test 1: Normal prompt
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is machine learning?", "userId": "smoke-user-1"}' \
  | jq '.recordId, .content | length'

# Test 2: Ambiguous prompt
curl -s -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "so what not", "userId": "smoke-user-2"}' \
  | jq '.ambiguity_detected'

# Test 3: Stream endpoint
curl -s -X POST http://localhost:3000/v1/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me a story", "userId": "smoke-user-3"}' \
  | grep -c "data:"

echo "Status: Ongoing"
```

**Action:** Run for first 60 minutes. Document any failures.

### Hours 2–6: Controlled Prompt Set

Run this prompt set against staging:

```bash
#!/bin/bash
# validation-prompt-set.sh

BASE_URL="http://localhost:3000/v1/chat"
TIMESTAMP=$(date +%s)

# Array of test cases
declare -a PROMPTS=(
  # NORMAL: Should pass AmbiguityGate cleanly
  "What is artificial intelligence?"
  "Explain quantum computing in simple terms"
  "Tell me about machine learning algorithms"
  "How does photosynthesis work?"
  "What are the uses of blockchain?"
  
  # AMBIGUOUS: Should be detected by AmbiguityGate
  "so what not"
  "when time we"
  "the the the"
  "what was that again" # Dangling reference if no history
  "compare this to that" # Underspecified
  
  # RELATIONSHIP POSTURE: Test owner vs public modes
  "Tell me about your perspective on luxury"
  "How would you advise me on this decision?"
  "What's your take on this sensitive topic?"
  
  # STREAM: Test streaming path
  "Generate a long response about history"
  "Tell me a detailed story"
  
  # TOOL CALLS (if tools integrated): Test tool grounding
  "Look up information about X"
  "Search for Y"
  "Call the API for Z"
)

# Run each prompt
for i in "${!PROMPTS[@]}"; do
  PROMPT="${PROMPTS[$i]}"
  USER_ID="validation-user-${TIMESTAMP}-${i}"
  
  echo "[$(date)] Request $((i+1))/${#PROMPTS[@]}: '$PROMPT'"
  
  RESPONSE=$(curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"$PROMPT\",
      \"userId\": \"$USER_ID\",
      \"timestamp\": $(date +%s)000
    }")
  
  # Capture key metrics
  AMBIGUITY=$(echo "$RESPONSE" | jq -r '.ambiguity_detected // false')
  RECORD_ID=$(echo "$RESPONSE" | jq -r '.recordId // "missing"')
  STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"')
  
  echo "  → ambiguity_detected: $AMBIGUITY, recordId: $RECORD_ID, status: $STATUS"
  
  # 5-second spacing
  sleep 5
done

echo "Controlled prompt set complete"
```

**Action:** Run this in hours 2–6. Log results to file.

### Metrics Collection (Hours 1–6)

**Every 30 minutes, collect:**

```bash
#!/bin/bash
# metrics-snapshot.sh (run every 30 min)

LOGFILE="/var/log/vi/staging.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "=== Metrics Snapshot at $TIMESTAMP ===" >> metrics.log

# ContinuityPack metrics
echo "ContinuityPack events:" >> metrics.log
grep "ContinuityPack built" $LOGFILE | tail -5 >> metrics.log

# AmbiguityGate metrics
echo "Ambiguity checks:" >> metrics.log
grep "Ambiguity check" $LOGFILE | wc -l >> metrics.log

# Relationship resolutions
echo "Relationship resolutions:" >> metrics.log
grep "Relationship resolved" $LOGFILE | wc -l >> metrics.log

# Governor regen
echo "Governor passes:" >> metrics.log
grep "Governor pass" $LOGFILE | wc -l >> metrics.log

# Errors
echo "Errors:" >> metrics.log
grep -i "error\|exception" $LOGFILE | wc -l >> metrics.log

# Latency sample
echo "Latency sample (ms):" >> metrics.log
grep -o "duration_ms\": [0-9]*" $LOGFILE | tail -5 >> metrics.log

echo "" >> metrics.log
```

**Action:** Create `metrics.sh` and run every 30 minutes. Append to `metrics.log`.

---

## Hours 7–23: Sustained Observation (Light Monitoring)

### Hour 7: Increase Load (2x Normal)

Increase request rate 2x for 1 hour to test under stress:

```bash
#!/bin/bash
# stress-test.sh

BASE_URL="http://localhost:3000/v1/chat"

for i in {1..100}; do
  curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"What is AI?\",
      \"userId\": \"stress-test-$i\"
    }" > /dev/null &
  
  # Launch 10 parallel requests, wait, repeat
  if (( (i+1) % 10 == 0 )); then
    wait
  fi
done
wait

echo "Stress test complete"
```

**Action:** Run. Monitor for errors, latency spikes.

### Hours 8–22: Passive Monitoring

Set up automated monitoring:

```bash
#!/bin/bash
# monitor.sh (run continuously in background)

LOGFILE="/var/log/vi/staging.log"

while true; do
  # Every 5 minutes, check key metrics
  
  # Check for errors
  ERROR_COUNT=$(grep -i "error\|exception" $LOGFILE | wc -l)
  if [ "$ERROR_COUNT" -gt 10 ]; then
    echo "⚠️  WARNING: $ERROR_COUNT errors detected"
    # Alert ops
  fi
  
  # Check for missing packs
  MISSING=$(grep -i "missing.*pack\|no.*continuity" $LOGFILE | wc -l)
  if [ "$MISSING" -gt 0 ]; then
    echo "❌ CRITICAL: Missing pack detected!"
    # Alert immediately
  fi
  
  # Check latency
  SLOW=$(grep -o "duration_ms\": [0-9]*" $LOGFILE | awk -F': ' '{print $2}' | awk '$1 > 2000 {c++} END {print c+0}')
  if [ "$SLOW" -gt 5 ]; then
    echo "⚠️  WARNING: $SLOW requests > 2000ms"
  fi
  
  sleep 300  # Check every 5 minutes
done
```

**Action:** Run in background. Respond to any alerts immediately.

### Metrics Collection (Hours 7–23)

**Hourly collection:**

```bash
#!/bin/bash
# hourly-report.sh

LOGFILE="/var/log/vi/staging.log"
HOUR=$(date '+%H:%M')

echo "=== Hour Report at $HOUR ===" >> hourly.log

# Count major event types
echo "ContinuityPack built: $(grep -c 'ContinuityPack built' $LOGFILE)" >> hourly.log
echo "Ambiguity detected: $(grep -c 'Ambiguity check.*AMBIGUOUS\|status.*AMBIGUOUS' $LOGFILE)" >> hourly.log
echo "Governor passes: $(grep -c 'Governor pass' $LOGFILE)" >> hourly.log
echo "Errors: $(grep -ci 'error\|exception' $LOGFILE)" >> hourly.log

# Latency percentiles
echo "Latency p50: $(grep -o 'duration_ms\": [0-9]*' $LOGFILE | awk -F': ' '{print $2}' | sort -n | awk '{a[NR]=$1} END {if (NR%2==0) print (a[NR/2]+a[NR/2+1])/2; else print a[(NR+1)/2]}')" >> hourly.log

echo "" >> hourly.log
```

---

## Hour 24: Final Data Collection + Report (0:00–2:00 Next Day)

### Complete Log Analysis

```bash
#!/bin/bash
# final-analysis.sh

LOGFILE="/var/log/vi/staging.log"
REPORT="staging-validation-metrics.txt"

cat > "$REPORT" << EOF
=== 24-HOUR STAGING VALIDATION METRICS ===
Generated: $(date)

### CONTINUITYPACK INTEGRITY ###
Missing-pack events: $(grep -ci 'missing.*pack\|no.*continuity' $LOGFILE)
Default-pack fallbacks: $(grep -ci 'default.*pack\|fallback' $LOGFILE)
Total builds: $(grep -c 'ContinuityPack built' $LOGFILE)
Avg size: $(grep -o 'size_bytes.*[0-9]*' $LOGFILE | awk -F': ' '{sum+=$2; c++} END {if(c>0) print int(sum/c)}') bytes
Avg build time: $(grep -o 'built_in_ms.*[0-9]*' $LOGFILE | awk -F': ' '{sum+=$2; c++} END {if(c>0) print int(sum/c)}') ms

### AMBIGUITYGATE ###
Total checks: $(grep -c 'Ambiguity check' $LOGFILE)
Detected ambiguous: $(grep -c 'status.*AMBIGUOUS\|reason.*MALFORMED' $LOGFILE)
Clear requests: $(grep -c 'status.*clear\|reason.*NONE' $LOGFILE)
Ambiguity rate: $(echo "scale=2; $(grep -c 'status.*AMBIGUOUS' $LOGFILE) * 100 / $(grep -c 'Ambiguity check' $LOGFILE)" | bc)%

MALFORMED_QUERY: $(grep -c 'reason.*MALFORMED_QUERY' $LOGFILE)
DANGLING_REFERENCE: $(grep -c 'reason.*DANGLING_REFERENCE' $LOGFILE)
UNDERSPECIFIED_COMPARISON: $(grep -c 'reason.*UNDERSPECIFIED' $LOGFILE)
CONTRADICTORY_REQUEST: $(grep -c 'reason.*CONTRADICTORY' $LOGFILE)

Avg check latency: $(grep -o 'checked_in_ms.*[0-9]*' $LOGFILE | awk -F': ' '{sum+=$2; c++} END {if(c>0) print int(sum/c)}') ms

### RELATIONSHIP CONTEXT ###
Total resolutions: $(grep -c 'Relationship resolved' $LOGFILE)
Owner mode: $(grep -c 'relationship_type.*owner' $LOGFILE)
Public mode: $(grep -c 'relationship_type.*public' $LOGFILE)
Source breakdown:
  Locked fact: $(grep -c 'source.*locked_fact' $LOGFILE)
  Database: $(grep -c 'source.*database' $LOGFILE)
  Default: $(grep -c 'source.*default' $LOGFILE)

Avg resolution latency: $(grep -o 'resolved_in_ms.*[0-9]*' $LOGFILE | awk -F': ' '{sum+=$2; c++} END {if(c>0) print int(sum/c)}') ms

### GOVERNOR REGEN ###
Total passes: $(grep -c 'Governor pass' $LOGFILE)
0 violations (passed): $(grep -c 'violation_type.*none' $LOGFILE)
1+ violations: $(grep -c 'violation_type.*repetition\|violation_type.*locked_fact\|violation_type.*ungrounded\|violation_type.*posture' $LOGFILE)

Violation types:
  Repetition: $(grep -c 'violation_type.*repetition' $LOGFILE)
  Locked fact: $(grep -c 'violation_type.*locked_fact' $LOGFILE)
  Ungrounded: $(grep -c 'violation_type.*ungrounded' $LOGFILE)
  Posture: $(grep -c 'violation_type.*posture' $LOGFILE)

Avg regen latency: $(grep -o 'regen_in_ms.*[0-9]*' $LOGFILE | awk -F': ' '{sum+=$2; c++} END {if(c>0) print int(sum/c)}') ms

### IDENTITY LINKING ###
Link operations: $(grep -c 'identity.*link' $LOGFILE)
Errors: $(grep -ci 'identity.*error\|link.*failed' $LOGFILE)

### OPERATIONAL ###
Total errors: $(grep -ci 'error\|exception' $LOGFILE)
HTTP 5xx: $(grep -c '500\|502\|503' $LOGFILE)
Timeouts: $(grep -ci 'timeout' $LOGFILE)

### LATENCY ###
p50 (ms): [Extract from metrics]
p95 (ms): [Extract from metrics]
p99 (ms): [Extract from metrics]
EOF

cat "$REPORT"
```

**Action:** Run. Capture output for report template.

### Manual Verification Tests

**Test 1: Identity Merge Validation**
```bash
# Verify no accidental merges
USER1_ID=$(curl -s -X POST http://localhost:3000/v1/identity/create \
  -H "Content-Type: application/json" \
  -d '{"provider":"discord","provider_user_id":"final_test_discord_001"}' \
  | jq -r '.vi_user_id')

USER2_ID=$(curl -s -X POST http://localhost:3000/v1/identity/create \
  -H "Content-Type: application/json" \
  -d '{"provider":"sovereign","provider_user_id":"final_test_sov_001"}' \
  | jq -r '.vi_user_id')

# Should be DIFFERENT users
if [ "$USER1_ID" = "$USER2_ID" ]; then
  echo "❌ FAIL: Accidental merge detected!"
else
  echo "✅ PASS: Users correctly separated"
fi
```

**Test 2: Relationship Consistency**
```bash
# Same user should always get same relationship
for i in {1..5}; do
  RESULT=$(curl -s -X POST http://localhost:3000/v1/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"test\",\"userId\":\"consistency-test-user\"}" \
    | jq '.relationship_context.relationship_type')
  echo "Call $i: $RESULT"
done
# All should be identical
```

---

## Decision Gate Checklist (Hour 24:00)

Fill in `docs/ops/STAGING_ACCEPTANCE_REPORT.md` with:

### Gate 1: ContinuityPack Integrity ✅ / ⚠️ / ❌
- [ ] Zero missing-pack events
- [ ] Zero default fallbacks
- [ ] Size and latency within targets

### Gate 2: AmbiguityGate Rate ✅ / ⚠️ / ❌
- [ ] Rate 0–5%
- [ ] False positive < 1%
- [ ] Short-circuit < 50ms

### Gate 3: Relationship Determinism ✅ / ⚠️ / ❌
- [ ] Same user always gets same context
- [ ] No mid-session switches
- [ ] Public mode never escalates

### Gate 4: Governor Health ✅ / ⚠️ / ❌
- [ ] 85%+ pass on 0 regen attempts
- [ ] p99 latency < 2000ms
- [ ] No systematic regen loops

### Gate 5: Identity Correctness ✅ / ❌
- [ ] Zero accidental merges
- [ ] All reverse lookups correct
- [ ] Multi-provider works

---

## Final Decision

### ✅ ACCEPT If
All gates PASS OR one REVIEW with clear action items.
No critical gate failed.

### ⚠️ EXTEND If
One or more gates in REVIEW.
Requires 48–72 hour re-observation.

### ❌ REJECT If
Any critical gate FAILED.
Requires root cause analysis + redeployment.

---

## Next Step (Post-Acceptance)

If ✅ ACCEPT: Schedule production deployment  
If ⚠️ EXTEND: Run targeted monitoring (document findings)  
If ❌ REJECT: Debug, fix, redeploy to staging

**Once Accepted:** Phase 4: Canon Integration (not Phase 9 UI, not Phase 5 Presence)

---

## Key File Locations

- `docs/ops/STAGING_ACCEPTANCE_REPORT.md` ← Fill this in with metrics
- `/var/log/vi/staging.log` ← All telemetry here
- `metrics.log` ← Append metrics snapshots
- `hourly.log` ← Append hourly summaries
- `staging-validation-metrics.txt` ← Final analysis output

---

**Owner:** [Ops Lead Name]  
**Start Time:** [Date/Time]  
**End Time:** [Date/Time + 24h]  
**Decision:** ✅ / ⚠️ / ❌
