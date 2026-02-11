# 77EZ PHASE 1 IMPLEMENTATION GUIDE

**Phase:** Foundation Fixes  
**Duration:** Week 1  
**Status:** Ready for Implementation

---

## OBJECTIVE

Fix the memory expiry bug before implementing autonomy. **Why:** Autonomy with zombie memory = "why did Vi do that?" forever.

---

## BUG DETAILS

**File:** `core/vi/src/db/repositories/MemoryInjectionRepository.ts:85-97`  
**Test:** `core/vi/tests/integration/phase-1.1-memory-injection.test.ts:147-167`

**Symptom:** Expired injections intermittently returned by `listForSession`

**Test Case:**
```typescript
it('should NOT return expired injections', async () => {
  const expiredInjection = await injectionRepo.inject({
    userId,
    sessionId,
    dimension: 'episodic',
    text: 'This should be expired',
    ttl: 1, // 1 second
    createdBy: userId,
  });

  // Wait for expiration window to pass
  await new Promise(r => setTimeout(r, 1500));

  const injections = await injectionRepo.listForSession(userId, sessionId);

  const found = injections.find(i => i.id === expiredInjection.id);
  expect(found).toBeUndefined(); // ❌ FAILS INTERMITTENTLY
});
```

**Current Code:**
```typescript
async listForSession(userId: string, sessionId: string): Promise<MemoryInjection[]> {
  // Exclude expired injections
  const res = await this.pool.query(
    `SELECT id, user_id, session_id, dimension, text, label, injection_label, ttl_seconds, expires_at, created_at, created_by
     FROM memory_injections
     WHERE user_id = $1 AND session_id = $2 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [userId, sessionId]
  );
  // ...
}
```

---

## ROOT CAUSE ANALYSIS

**Issue:** `NOW()` in PostgreSQL is transaction-scoped, not real-time.

If the query starts a transaction before the expiry boundary and commits after, `NOW()` returns the transaction start time, not the actual current time.

**Edge Case:** Race condition at expiry boundary:
1. Injection created with `expires_at = T + 1s`
2. Test waits 1.5s
3. Query starts transaction at `T + 1.4s` (before expiry check)
4. `NOW()` returns `T + 1.4s` (transaction start)
5. `expires_at (T + 1s) > NOW() (T + 1.4s)` = false... **but transaction timing makes this flaky**

**Additional Issue:** No explicit cleanup mechanism. Expired records accumulate until `deleteExpired()` is called manually.

---

## SOLUTION

### Fix 1: Use `CURRENT_TIMESTAMP` Instead of `NOW()`

`CURRENT_TIMESTAMP` is statement-time, more predictable than `NOW()`.

```typescript
async listForSession(userId: string, sessionId: string): Promise<MemoryInjection[]> {
  const res = await this.pool.query(
    `SELECT id, user_id, session_id, dimension, text, label, injection_label, ttl_seconds, expires_at, created_at, created_by
     FROM memory_injections
     WHERE user_id = $1 
       AND session_id = $2 
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC`,
    [userId, sessionId]
  );
  // ...
}
```

### Fix 2: Add Buffer to Test

Account for clock skew and execution timing:

```typescript
it('should NOT return expired injections', async () => {
  const expiredInjection = await injectionRepo.inject({
    userId,
    sessionId,
    dimension: 'episodic',
    text: 'This should be expired',
    ttl: 1, // 1 second
    createdBy: userId,
  });

  // Wait for expiration window + buffer
  await new Promise(r => setTimeout(r, 2000)); // 2s instead of 1.5s

  const injections = await injectionRepo.listForSession(userId, sessionId);

  const found = injections.find(i => i.id === expiredInjection.id);
  expect(found).toBeUndefined();
});
```

### Fix 3: Add Automatic Cleanup (Optional but Recommended)

Add periodic cleanup job or trigger on every retrieval:

```typescript
async listForSession(userId: string, sessionId: string): Promise<MemoryInjection[]> {
  // Clean up expired records first (optional: add throttle to avoid every call)
  await this.deleteExpired();

  const res = await this.pool.query(
    `SELECT id, user_id, session_id, dimension, text, label, injection_label, ttl_seconds, expires_at, created_at, created_by
     FROM memory_injections
     WHERE user_id = $1 
       AND session_id = $2 
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC`,
    [userId, sessionId]
  );
  // ...
}
```

**Or add a database trigger:**
```sql
-- Auto-delete expired injections on insert/update
CREATE OR REPLACE FUNCTION cleanup_expired_injections()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM memory_injections WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_expired
  AFTER INSERT OR UPDATE ON memory_injections
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_expired_injections();
```

---

## IMPLEMENTATION CHECKLIST

- [ ] Update `listForSession` query to use `CURRENT_TIMESTAMP`
- [ ] Update test to use 2s wait instead of 1.5s
- [ ] Add periodic cleanup (either in-app or DB trigger)
- [ ] Run test 10 times consecutively to verify stability
- [ ] Add test documentation explaining timing sensitivity
- [ ] Update `deleteExpired` to use `CURRENT_TIMESTAMP` for consistency

---

## VERIFICATION

**Before:** Test fails intermittently (1-2 times out of 10 runs)  
**After:** Test passes 10/10 consecutive runs

**Command:**
```powershell
cd "e:\Tentai Ecosystem\core\vi"
for ($i=1; $i -le 10; $i++) { 
  Write-Host "Run $i/10"
  npm test -- tests/integration/phase-1.1-memory-injection.test.ts
}
```

**Success Criteria:**
- All 10 runs pass
- No intermittent failures
- Expired records correctly filtered

---

## COMPLETION DEFINITION

✅ Fix applied to `MemoryInjectionRepository.ts`  
✅ Test updated with appropriate buffer  
✅ 10/10 consecutive test runs pass  
✅ Cleanup mechanism added (app-level or DB trigger)  
✅ Documentation updated

**Estimated Time:** 2-4 hours

**Merge Requirement:** All integration tests passing before merge

---

**Next Phase:** Phase 2 (Grounding) depends on stable memory foundation.
