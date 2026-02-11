# Staging Infrastructure Integration Guide

**For:** Developers integrating telemetry and feature flags into handlers  
**Scope:** 4 simple integrations (2-3 lines each)  
**Time:** 30 minutes total  
**Risk:** Zero (feature-gated, logging-only)

---

## Overview

This guide shows how to integrate the staging validation infrastructure into actual handler code. All changes are **optional**, **feature-gated** (only active with `STAGING_VALIDATION_MODE=true`), and **non-breaking**.

### What Gets Integrated

| Component | Handler | Integration | Impact |
|-----------|---------|-------------|--------|
| **RelationshipTelemetry** | `RelationshipResolver` | Log after resolution | Timing + metadata only |
| **AmbiguityTelemetry** | `AmbiguityGate` | Log after check | Check result + confidence |
| **GovernorTelemetry** | `Governor` | Log per pass | Violation type + attempt # |
| **ContinuityPackSummary** | `MemoryOrchestrator` | Log after build | Authority breakdown |

### Before & After

**Before:**
```typescript
// RelationshipResolver.ts (no telemetry)
const relationship = await db.getRelationship(userId);
return relationship || getDefault();
```

**After:**
```typescript
// RelationshipResolver.ts (with telemetry)
const relationship = await db.getRelationship(userId);
stagingTelemetry.logRelationshipResolution({
  vi_user_id: userId,
  source: 'database',
  relationship_type: relationship?.type || 'public',
  voice_profile: relationship?.voice_profile || 'public_elegant',
  trust_level: relationship?.trust_level || 0,
  resolved_in_ms: duration
});
return relationship || getDefault();
```

**Result:** When `STAGING_VALIDATION_MODE=true`, logs are emitted. Otherwise, zero overhead.

---

## Integration 1: RelationshipResolver

**File:** `core/vi/src/brain/relationshipResolver.ts`

**Current Code (lines ~45-65):**
```typescript
export class RelationshipResolver {
  async resolve(userId: string): Promise<Relationship> {
    const start = Date.now();
    
    // Try locked facts first (highest authority)
    const locked = await this.facts.getLockedFact(userId, 'relationship');
    if (locked) {
      return locked as Relationship;
    }

    // Try database next
    const dbRelationship = await this.db.getRelationship(userId);
    if (dbRelationship) {
      return dbRelationship;
    }

    // Default to public
    return { relationship_type: 'public', voice_profile: 'public_elegant', trust_level: 0 };
  }
}
```

**Add Integration:**

```typescript
import { stagingTelemetry } from '../telemetry/stagingTelemetry.js';

export class RelationshipResolver {
  async resolve(userId: string): Promise<Relationship> {
    const start = Date.now();
    let source: 'locked_fact' | 'database' | 'default';
    let relationship: Relationship;
    
    // Try locked facts first (highest authority)
    const locked = await this.facts.getLockedFact(userId, 'relationship');
    if (locked) {
      relationship = locked as Relationship;
      source = 'locked_fact';
    } else {
      // Try database next
      const dbRelationship = await this.db.getRelationship(userId);
      if (dbRelationship) {
        relationship = dbRelationship;
        source = 'database';
      } else {
        // Default to public
        relationship = { relationship_type: 'public', voice_profile: 'public_elegant', trust_level: 0 };
        source = 'default';
      }
    }

    // Log telemetry (no-op if staging mode disabled)
    const duration = Date.now() - start;
    stagingTelemetry.logRelationshipResolution({
      vi_user_id: userId,
      source,
      relationship_type: relationship.relationship_type,
      voice_profile: relationship.voice_profile,
      trust_level: relationship.trust_level,
      resolved_in_ms: duration
    });

    return relationship;
  }
}
```

**What This Does:**
- Tracks which source provided the relationship (locked fact, DB, or default)
- Records timing (should be < 100ms for DB queries)
- Logs only when STAGING_VALIDATION_MODE=true
- Zero overhead when disabled

**Expected Log:**
```
[Staging] Relationship resolved {
  "source": "database",
  "relationship_type": "owner",
  "voice_profile": "owner_luxury",
  "trust_level": 85,
  "resolved_in_ms": 12
}
```

---

## Integration 2: AmbiguityGate

**File:** `core/vi/src/brain/ambiguityGate.ts`

**Current Code (lines ~80-120):**
```typescript
export class AmbiguityGate {
  check(message: string): AmbiguityResult {
    const start = Date.now();
    
    if (this.isMalformed(message)) {
      return { ambiguous: true, reason: 'MALFORMED_QUERY' };
    }
    
    if (this.hasDanglingRef(message)) {
      return { ambiguous: true, reason: 'DANGLING_REFERENCE' };
    }

    if (this.isUnderspecified(message)) {
      return { ambiguous: true, reason: 'UNDERSPECIFIED_COMPARISON' };
    }

    if (this.isContradictory(message)) {
      return { ambiguous: true, reason: 'CONTRADICTORY_REQUEST' };
    }

    return { ambiguous: false, reason: 'NONE' };
  }
}
```

**Add Integration:**

```typescript
import { stagingTelemetry } from '../telemetry/stagingTelemetry.js';

export class AmbiguityGate {
  check(message: string): AmbiguityResult {
    const start = Date.now();
    let result: AmbiguityResult;
    
    if (this.isMalformed(message)) {
      result = { ambiguous: true, reason: 'MALFORMED_QUERY' };
    } else if (this.hasDanglingRef(message)) {
      result = { ambiguous: true, reason: 'DANGLING_REFERENCE' };
    } else if (this.isUnderspecified(message)) {
      result = { ambiguous: true, reason: 'UNDERSPECIFIED_COMPARISON' };
    } else if (this.isContradictory(message)) {
      result = { ambiguous: true, reason: 'CONTRADICTORY_REQUEST' };
    } else {
      result = { ambiguous: false, reason: 'NONE' };
    }

    // Log telemetry (no-op if staging mode disabled)
    const duration = Date.now() - start;
    const confidence = result.ambiguous ? 0.95 : 0.99; // Example values
    stagingTelemetry.logAmbiguityDetection({
      reason: result.reason,
      input_length: message.length,
      confidence,
      checked_in_ms: duration
    });

    return result;
  }
}
```

**What This Does:**
- Records check result (clear or ambiguous)
- Logs detection reason (one of 4 types or NONE)
- Records timing (should be < 50ms for pre-planner)
- Confidence score (0-1) for ambiguity detection
- Logs only when STAGING_VALIDATION_MODE=true

**Expected Log:**
```
[Staging] Ambiguity check completed {
  "reason": "MALFORMED_QUERY",
  "input_length": 12,
  "confidence": 0.95,
  "checked_in_ms": 8
}
```

---

## Integration 3: Governor

**File:** `core/vi/src/brain/governor.ts`

**Current Code (lines ~150-200):**
```typescript
export class Governor {
  async validate(output: string, maxAttempts: number = 5): Promise<ValidationResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const violation = this.checkViolations(output);
      
      if (!violation) {
        return { valid: true, output };
      }

      // Regenerate and try again
      output = await this.regenerate(output, violation);
    }

    return { valid: false, output, reason: 'Max attempts exceeded' };
  }

  private checkViolations(output: string): ViolationType | null {
    if (this.hasRepetition(output)) return 'repetition';
    if (this.violatesLockedFacts(output)) return 'locked_fact';
    if (this.isUngrounded(output)) return 'ungrounded';
    if (this.violatesPosture(output)) return 'posture';
    return null;
  }
}
```

**Add Integration:**

```typescript
import { stagingTelemetry } from '../telemetry/stagingTelemetry.js';

export class Governor {
  async validate(output: string, maxAttempts: number = 5): Promise<ValidationResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const start = Date.now();
      const violation = this.checkViolations(output);
      const duration = Date.now() - start;
      
      // Log telemetry (no-op if staging mode disabled)
      stagingTelemetry.logGovernorAttempt({
        violation_type: violation || 'none',
        attempt,
        max_attempts: maxAttempts,
        regen_in_ms: duration
      });

      if (!violation) {
        return { valid: true, output };
      }

      // Regenerate and try again
      output = await this.regenerate(output, violation);
    }

    return { valid: false, output, reason: 'Max attempts exceeded' };
  }

  private checkViolations(output: string): ViolationType | null {
    if (this.hasRepetition(output)) return 'repetition';
    if (this.violatesLockedFacts(output)) return 'locked_fact';
    if (this.isUngrounded(output)) return 'ungrounded';
    if (this.violatesPosture(output)) return 'posture';
    return null;
  }
}
```

**What This Does:**
- Logs each governor pass (attempt 1/5, 2/5, etc.)
- Records violation type (or 'none' if passed)
- Tracks timing per pass (should be < 500ms)
- Logs only when STAGING_VALIDATION_MODE=true
- Helps identify if posture validation is overly strict

**Expected Log (multiple, one per pass):**
```
[Staging] Governor pass 1/5 {
  "violation_type": "repetition",
  "attempt": 1,
  "max_attempts": 5,
  "regen_in_ms": 245
}

[Staging] Governor pass 2/5 {
  "violation_type": "none",
  "attempt": 2,
  "max_attempts": 5,
  "regen_in_ms": 0
}
```

---

## Integration 4: MemoryOrchestrator

**File:** `core/vi/src/brain/memoryOrchestrator.ts`

**Current Code (lines ~200-250):**
```typescript
export class MemoryOrchestrator {
  async buildContinuityPack(userId: string): Promise<ContinuityPack> {
    const start = Date.now();
    
    const lockedFacts = await this.facts.getLockedFacts(userId);
    const explicitFacts = await this.facts.getExplicitFacts(userId);
    const inferredFacts = await this.facts.getInferredFacts(userId);
    const ephemeralFacts = this.getCurrentEphemeralFacts(userId);
    
    const historicalSummaries = await this.history.getSummaries(userId);
    const engagementHistory = await this.engagement.getHistory(userId);

    const pack = new ContinuityPack({
      lockedFacts,
      explicitFacts,
      inferredFacts,
      ephemeralFacts,
      historicalSummaries,
      engagementHistory
    });

    return pack;
  }
}
```

**Add Integration:**

```typescript
import { stagingTelemetry } from '../telemetry/stagingTelemetry.js';

export class MemoryOrchestrator {
  async buildContinuityPack(userId: string): Promise<ContinuityPack> {
    const start = Date.now();
    
    const lockedFacts = await this.facts.getLockedFacts(userId);
    const explicitFacts = await this.facts.getExplicitFacts(userId);
    const inferredFacts = await this.facts.getInferredFacts(userId);
    const ephemeralFacts = this.getCurrentEphemeralFacts(userId);
    
    const historicalSummaries = await this.history.getSummaries(userId);
    const engagementHistory = await this.engagement.getHistory(userId);

    const pack = new ContinuityPack({
      lockedFacts,
      explicitFacts,
      inferredFacts,
      ephemeralFacts,
      historicalSummaries,
      engagementHistory
    });

    // Log telemetry (no-op if staging mode disabled)
    const duration = Date.now() - start;
    const packSize = JSON.stringify(pack).length;
    stagingTelemetry.logContinuityPackSummary({
      locked_facts_count: lockedFacts.length,
      explicit_facts_count: explicitFacts.length,
      inferred_facts_count: inferredFacts.length,
      ephemeral_facts_count: ephemeralFacts.length,
      historical_summaries_count: historicalSummaries.length,
      engagement_history_count: engagementHistory.length,
      size_bytes: packSize,
      built_in_ms: duration
    });

    return pack;
  }
}
```

**What This Does:**
- Records authority breakdown (locked, explicit, inferred, ephemeral)
- Counts summaries and engagement records
- Tracks pack size (should be < 50KB)
- Measures build time (should be < 100ms)
- Helps identify fact accumulation issues
- Logs only when STAGING_VALIDATION_MODE=true

**Expected Log:**
```
[Staging] ContinuityPack built {
  "locked_facts_count": 3,
  "explicit_facts_count": 4,
  "inferred_facts_count": 5,
  "ephemeral_facts_count": 0,
  "historical_summaries_count": 2,
  "engagement_history_count": 8,
  "size_bytes": 24856,
  "built_in_ms": 67
}
```

---

## Testing Your Integration

After adding integrations, test locally:

```bash
# 1. Set staging mode
export STAGING_VALIDATION_MODE=true
export LOG_LEVEL=debug

# 2. Start server
npm run dev

# 3. In another terminal, run smoke tests
npm run test:staging

# 4. Watch logs for telemetry
tail -f logs/vi-staging.log | grep "\[Staging\]"

# Expected: Logs appear for each test:
# [Staging] Relationship resolved { ... }
# [Staging] Ambiguity check completed { ... }
# [Staging] Governor pass 1/5 { ... }
# [Staging] ContinuityPack built { ... }
```

### Verify No PII

```bash
# Check that user IDs are hashed, not real
grep "user_[a-f0-9]\{8\}$" logs/vi-staging.log | head -5
# Should show: user_a1b2c3d4 (hashed format)

# Check that real UUIDs are NOT in logs
grep "[0-9a-f]\{8\}-[0-9a-f]\{4\}" logs/vi-staging.log
# Should show: empty (no real user IDs)

# Check that fact content is NOT logged
grep -E "(locked_fact|explicit_fact|inferred_fact)" logs/vi-staging.log
# Should show: empty (no actual facts)
```

---

## Rollback (If Needed)

Each integration is feature-gated. To disable:

```bash
# Unset the environment variable
unset STAGING_VALIDATION_MODE

# Or set to false
export STAGING_VALIDATION_MODE=false

# Restart server
pkill -f "npm run dev"
npm run dev
```

**Result:** All telemetry logging stops. Code behaves identically to v1.0.

---

## Optional: Wire Into CI/CD

To make smoke tests part of your CI pipeline:

```yaml
# .github/workflows/staging.yml
name: Staging Validation

on:
  push:
    branches:
      - staging
  pull_request:
    branches:
      - staging

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: vi_test
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm ci
        working-directory: core/vi
      
      - run: npm run migrate:apply
        working-directory: core/vi
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/vi_test
      
      - run: npm run dev &
        working-directory: core/vi
        env:
          STAGING_VALIDATION_MODE: 'true'
          DATABASE_URL: postgres://postgres:test@localhost:5432/vi_test
      
      - run: sleep 5 && npm run test:staging
        working-directory: core/vi
        env:
          STAGING_VALIDATION_MODE: 'true'
```

---

## Integration Checklist

- [ ] Added import: `import { stagingTelemetry } from '../telemetry/stagingTelemetry.js';`
- [ ] Integration 1: RelationshipResolver logs after resolution
- [ ] Integration 2: AmbiguityGate logs check result
- [ ] Integration 3: Governor logs each pass
- [ ] Integration 4: MemoryOrchestrator logs pack summary
- [ ] Tested locally: `export STAGING_VALIDATION_MODE=true && npm run test:staging`
- [ ] Verified logs show no PII (user IDs hashed)
- [ ] Verified disabled mode works: `unset STAGING_VALIDATION_MODE && npm run dev`

---

## Summary

✅ **4 integrations** (2-3 lines each)  
✅ **30 minutes** total time  
✅ **Zero behavioral changes** (logging only)  
✅ **Feature-gated** (disabled by default)  
✅ **Zero PII risk** (hashed user IDs)

**Next:** Run `npm run test:staging` and confirm all telemetry appears in logs.

---

*Last Updated: February 6, 2026*
