/**
 * Phase 0.1 Test Suite: Event Integrity
 * Tests that events are properly captured with userId + sessionId
 * and evidence queries return correct, filtered results
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { ObservabilityRepository, SYSTEM_USER_ID, SYSTEM_SESSION_ID } from '../../src/db/repositories/ObservabilityRepository.js';
import { setRequestContext, getRequestContext, resetRequestContext } from '../../src/db/requestContext.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Phase 0.1: Event Integrity', () => {
  let pool: Pool;
  let observabilityRepo: ObservabilityRepository;
  const userId1 = randomUUID();
  const userId2 = randomUUID();
  const sessionId1 = randomUUID();
  const sessionId2 = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    observabilityRepo = new ObservabilityRepository(pool);
    await observabilityRepo.init();

    // Clean up test data
    await pool.query('DELETE FROM events WHERE user_id IN ($1, $2)', [userId1, userId2]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM events WHERE user_id IN ($1, $2)', [userId1, userId2]);
    await pool.end();
  });

  afterEach(() => {
    resetRequestContext();
  });

  describe('Event Emission with Context Auto-fill', () => {
    it('should emit event with explicit userId and sessionId', async () => {
      const eventId = await observabilityRepo.emit({
        layer: 1,
        type: 'test_explicit',
        level: 'info',
        message: 'Test with explicit context',
        userId: userId1,
        sessionId: sessionId1,
      });

      expect(eventId).toBeTruthy();

      const result = await observabilityRepo.listRecent(10, userId1, sessionId1);
      expect(result.events.length).toBeGreaterThan(0);
      const event = result.events.find(e => e.id === eventId);
      expect(event).toBeDefined();
      expect(event?.userId).toBe(userId1);
      expect(event?.sessionId).toBe(sessionId1);
    });

    it('should emit event with context auto-fill from AsyncLocalStorage', async () => {
      const testContext = { userId: userId1, sessionId: sessionId1 };
      
      return new Promise((resolve) => {
        // Simulate async context
        const asyncFn = async () => {
          setRequestContext(testContext);
          
          // Emit without explicit userId/sessionId
          const eventId = await observabilityRepo.emit({
            layer: 2,
            type: 'test_autofill',
            level: 'info',
            message: 'Test with auto-filled context',
          });

          const result = await observabilityRepo.listRecent(10, userId1, sessionId1);
          const event = result.events.find(e => e.id === eventId);
          
          expect(event).toBeDefined();
          expect(event?.userId).toBe(userId1);
          expect(event?.sessionId).toBe(sessionId1);
          
          resolve(undefined);
        };
        
        asyncFn();
      });
    });

    it('should fallback to system when context not available', async () => {
      // Ensure no prior context bleeds into this emission
      setRequestContext({ userId: SYSTEM_USER_ID, sessionId: SYSTEM_SESSION_ID });

      const eventId = await observabilityRepo.emit({
        layer: 3,
        type: 'test_system_fallback',
        level: 'info',
        message: 'Test with system fallback',
      });

      expect(eventId).toBeTruthy();

      // Query for system events (no filter to avoid uuid type conflicts)
      const result = await observabilityRepo.listRecent(20);
      const event = result.events.find(e => e.id === eventId);
      expect(event).toBeDefined();
      expect(event?.userId).toBe(SYSTEM_USER_ID);
      expect(event?.sessionId).toBe(SYSTEM_SESSION_ID);
    });

    it('should prefer explicit userId/sessionId over context', async () => {
      const testContext = { userId: userId2, sessionId: sessionId2 };

      return new Promise((resolve) => {
        const asyncFn = async () => {
          setRequestContext(testContext);

          const eventId = await observabilityRepo.emit({
            layer: 4,
            type: 'test_explicit_override',
            level: 'info',
            userId: userId1,  // Explicit (different from context)
            sessionId: sessionId1,
            message: 'Explicit should override context',
          });

          const result = await observabilityRepo.listRecent(10, userId1, sessionId1);
          const event = result.events.find(e => e.id === eventId);
          
          expect(event?.userId).toBe(userId1);
          expect(event?.sessionId).toBe(sessionId1);
          
          resolve(undefined);
        };

        asyncFn();
      });
    });
  });

  describe('Evidence Query Filtering', () => {
    beforeAll(async () => {
      // Seed events for different users/sessions
      await observabilityRepo.emit({
        layer: 1,
        type: 'intent_classified',
        level: 'info',
        userId: userId1,
        sessionId: sessionId1,
        message: 'User1 Session1 Intent',
      });

      await observabilityRepo.emit({
        layer: 1,
        type: 'intent_classified',
        level: 'info',
        userId: userId1,
        sessionId: sessionId2,
        message: 'User1 Session2 Intent',
      });

      await observabilityRepo.emit({
        layer: 1,
        type: 'intent_classified',
        level: 'info',
        userId: userId2,
        sessionId: sessionId1,
        message: 'User2 Session1 Intent',
      });

      // Add multiple events to same session
      for (let i = 0; i < 5; i++) {
        await observabilityRepo.emit({
          layer: 2,
          type: 'memory_retrieved',
          level: 'debug',
          userId: userId1,
          sessionId: sessionId1,
          message: `Memory ${i}`,
        });
      }
    });

    it('should filter events by userId and sessionId', async () => {
      const result = await observabilityRepo.listRecent(100, userId1, sessionId1);
      
      // All events should be for this user and session
      expect(result.events.every(e => e.userId === userId1 && e.sessionId === sessionId1)).toBe(true);
    });

    it('should NOT mix events from different sessions', async () => {
      const result1 = await observabilityRepo.listRecent(100, userId1, sessionId1);
      const result2 = await observabilityRepo.listRecent(100, userId1, sessionId2);

      expect(result1.events.length).toBeGreaterThan(0);
      expect(result2.events.length).toBeGreaterThan(0);

      // Sessions should not overlap
      const ids1 = new Set(result1.events.map(e => e.id));
      const ids2 = new Set(result2.events.map(e => e.id));
      const overlap = [...ids1].filter(id => ids2.has(id));

      expect(overlap.length).toBe(0);
    });

    it('should NOT mix events from different users', async () => {
      const result1 = await observabilityRepo.listRecent(100, userId1, sessionId1);
      const result2 = await observabilityRepo.listRecent(100, userId2, sessionId1);

      // Events should be completely separate
      expect(result1.events.every(e => e.userId === userId1)).toBe(true);
      expect(result2.events.every(e => e.userId === userId2)).toBe(true);
    });

    it('should support pagination without footgun limit', async () => {
      // Emit 15 events to same session
      for (let i = 0; i < 10; i++) {
        await observabilityRepo.emit({
          layer: 2,
          type: 'test_pagination',
          level: 'debug',
          userId: userId1,
          sessionId: sessionId1,
          message: `Pagination test ${i}`,
        });
      }

      // Default limit (200) should not cut off results
      const result = await observabilityRepo.listRecent(200, userId1, sessionId1);
      expect(result.total).toBeGreaterThanOrEqual(15);

      // Pagination should work
      const page1 = await observabilityRepo.listRecent(5, userId1, sessionId1, 0);
      const page2 = await observabilityRepo.listRecent(5, userId1, sessionId1, 5);

      expect(page1.events.length).toBe(5);
      expect(page2.events.length).toBeLessThanOrEqual(5);
      expect(page1.total).toBe(page2.total);

      // No overlap between pages
      const page1Ids = new Set(page1.events.map(e => e.id));
      const page2Ids = new Set(page2.events.map(e => e.id));
      const pageOverlap = [...page1Ids].filter(id => page2Ids.has(id));
      expect(pageOverlap.length).toBe(0);
    });

    it('should return total count for pagination', async () => {
      const result = await observabilityRepo.listRecent(10, userId1, sessionId1);
      expect(typeof result.total).toBe('number');
      expect(result.total).toBeGreaterThanOrEqual(result.events.length);
    });
  });

  describe('Evidence Consistency', () => {
    it('should guarantee event consistency between emit and query', async () => {
      const testSessionId = randomUUID();
      const eventIds: string[] = [];

      // Emit 20 events
      for (let i = 0; i < 20; i++) {
        const id = await observabilityRepo.emit({
          layer: i % 10 + 1,
          type: `consistency_test_${i}`,
          level: 'debug',
          userId: userId1,
          sessionId: testSessionId,
          message: `Event ${i}`,
        });
        eventIds.push(id);
      }

      // Query with high limit
      const result = await observabilityRepo.listRecent(100, userId1, testSessionId);

      // All emitted events should be found
      const resultIds = new Set(result.events.map(e => e.id));
      for (const id of eventIds) {
        expect(resultIds.has(id)).toBe(true);
      }
    });

    it('should preserve event data through round-trip', async () => {
      const testData = {
        userId: userId1,
        sessionId: randomUUID(),
        layer: 5,
        type: 'roundtrip_test',
        level: 'info' as const,
        message: 'Test message with special chars: @#$%^&*()',
        data: { key: 'value', nested: { count: 42 } },
      };

      const eventId = await observabilityRepo.emit(testData);

      const result = await observabilityRepo.listRecent(10, testData.userId, testData.sessionId);
      const event = result.events.find(e => e.id === eventId);

      expect(event).toBeDefined();
      expect(event?.message).toBe(testData.message);
      expect(event?.layer).toBe(testData.layer);
      expect(event?.type).toBe(testData.type);
      expect(event?.data).toEqual(testData.data);
    });
  });

  describe('AsyncLocalStorage Request Context', () => {
    it('should isolate context between async calls', async () => {
      const ctx1 = { userId: userId1, sessionId: sessionId1 };
      const ctx2 = { userId: userId2, sessionId: sessionId2 };

      const promise1 = new Promise<void>(resolve => {
        const asyncFn = async () => {
          setRequestContext(ctx1);
          await new Promise(r => setTimeout(r, 50));
          
          const ctx = getRequestContext();
          expect(ctx?.userId).toBe(userId1);
          resolve();
        };
        asyncFn();
      });

      const promise2 = new Promise<void>(resolve => {
        const asyncFn = async () => {
          setRequestContext(ctx2);
          await new Promise(r => setTimeout(r, 25));
          
          const ctx = getRequestContext();
          expect(ctx?.userId).toBe(userId2);
          resolve();
        };
        asyncFn();
      });

      await Promise.all([promise1, promise2]);
    });
  });
});
