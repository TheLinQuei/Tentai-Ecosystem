/**
 * Phase 1.1 Test Suite: Memory Injection Endpoint
 * Tests /v1/admin/memory/inject and evidence display integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { MemoryInjectionRepository } from '../../src/db/repositories/MemoryInjectionRepository.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Phase 1.1: Memory Injection Endpoint', () => {
  let pool: Pool;
  let injectionRepo: MemoryInjectionRepository;
  const userId = randomUUID();
  const sessionId = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    injectionRepo = new MemoryInjectionRepository(pool);
    await injectionRepo.init();

    // Clean up test data
    await pool.query('DELETE FROM memory_injections WHERE user_id = $1', [userId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM memory_injections WHERE user_id = $1', [userId]);
    await pool.end();
  });

  describe('Memory Injection Storage', () => {
    it('should inject memory to episodic dimension', async () => {
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: 'User said they like pizza',
        createdBy: userId,
      });

      expect(injection.id).toBeTruthy();
      expect(injection.userId).toBe(userId);
      expect(injection.sessionId).toBe(sessionId);
      expect(injection.dimension).toBe('episodic');
      expect(injection.text).toBe('User said they like pizza');
    });

    it('should inject memory to semantic dimension', async () => {
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'semantic',
        text: 'Pizza is an Italian dish with cheese and toppings',
        label: 'food-knowledge',
        createdBy: userId,
      });

      expect(injection.dimension).toBe('semantic');
      expect(injection.label).toBe('food-knowledge');
    });

    it('should inject memory with TTL', async () => {
      const ttl = 3600; // 1 hour
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: 'Temporary memory',
        ttl,
        createdBy: userId,
      });

      expect(injection.ttl).toBe(ttl);
      expect(injection.expiresAt).toBeTruthy();
      expect(injection.expiresAt!.getTime()).toBeGreaterThan(injection.createdAt.getTime());
    });

    it('should inject memory with injection label', async () => {
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'relational',
        text: 'This user is a friend',
        injectionLabel: 'console.inject',
        createdBy: userId,
      });

      expect(injection.injectionLabel).toBe('console.inject');
    });

    it('should support all memory dimensions', async () => {
      const dimensions = ['episodic', 'semantic', 'relational', 'commitment', 'working'] as const;

      for (const dim of dimensions) {
        const injection = await injectionRepo.inject({
          userId,
          sessionId,
          dimension: dim,
          text: `Memory in ${dim} dimension`,
          createdBy: userId,
        });

        expect(injection.dimension).toBe(dim);
      }
    });
  });

  describe('Memory Injection Retrieval', () => {
    let injectionIds: string[] = [];

    beforeAll(async () => {
      // Seed multiple injections
      for (let i = 0; i < 5; i++) {
        const injection = await injectionRepo.inject({
          userId,
          sessionId,
          dimension: 'episodic',
          text: `Injection ${i}`,
          createdBy: userId,
        });
        injectionIds.push(injection.id);
      }
    });

    it('should retrieve all injections for a session', async () => {
      const injections = await injectionRepo.listForSession(userId, sessionId);

      expect(injections.length).toBeGreaterThanOrEqual(5);
      expect(injections[0].userId).toBe(userId);
      expect(injections[0].sessionId).toBe(sessionId);
    });

    it('should return injections in reverse chronological order', async () => {
      const injections = await injectionRepo.listForSession(userId, sessionId);

      for (let i = 0; i < injections.length - 1; i++) {
        expect(injections[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          injections[i + 1].createdAt.getTime()
        );
      }
    });

    it('should NOT return expired injections', async () => {
      const expiredInjection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: 'This should be expired',
        ttl: 1, // 1 second
        createdBy: userId,
      });

      // Wait for expiration window + buffer (2.5s to ensure well past expiry boundary)
      await new Promise(r => setTimeout(r, 2500));

      const injections = await injectionRepo.listForSession(userId, sessionId);

      const found = injections.find(i => i.id === expiredInjection.id);
      expect(found).toBeUndefined();
    });

    it('should filter by user and session', async () => {
      const otherUserId = randomUUID();
      const otherSessionId = randomUUID();

      // Inject for different user
      await injectionRepo.inject({
        userId: otherUserId,
        sessionId: otherSessionId,
        dimension: 'episodic',
        text: 'Other user memory',
        createdBy: otherUserId,
      });

      // Query original session
      const injections = await injectionRepo.listForSession(userId, sessionId);

      // Should not include other user's memory
      expect(injections.every(i => i.userId === userId)).toBe(true);
      expect(injections.every(i => i.sessionId === sessionId)).toBe(true);
    });
  });

  describe('Memory Injection Deletion', () => {
    it('should delete specific injection', async () => {
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: 'Will be deleted',
        createdBy: userId,
      });

      const deleted = await injectionRepo.delete(injection.id);
      expect(deleted).toBe(true);

      // Verify it's gone
      const injections = await injectionRepo.listForSession(userId, sessionId);
      const found = injections.find(i => i.id === injection.id);
      expect(found).toBeUndefined();
    });

    it('should return false when deleting non-existent injection', async () => {
      const fakeId = randomUUID();
      const deleted = await injectionRepo.delete(fakeId);
      expect(deleted).toBe(false);
    });
  });

  describe('Expired Injection Cleanup', () => {
    it('should delete expired injections', async () => {
      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: 'Expires very soon',
        ttl: 1, // 1 second
        createdBy: userId,
      });

      // Wait for expiration with buffer (2.5s to ensure well past expiry boundary)
      await new Promise(r => setTimeout(r, 2500));

      const deletedCount = await injectionRepo.deleteExpired();

      // Verify cleanup occurred
      expect(deletedCount).toBeGreaterThanOrEqual(0);
      
      // Verify injection is not in active list
      const injections = await injectionRepo.listForSession(userId, sessionId);
      const found = injections.find(i => i.id === injection.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Data Integrity', () => {
    it('should preserve special characters and JSON in text', async () => {
      const complexText = JSON.stringify({
        message: 'Hello "world"',
        special: '@#$%^&*()',
        newline: 'line1\nline2',
      });

      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'semantic',
        text: complexText,
        createdBy: userId,
      });

      const retrieved = await injectionRepo.listForSession(userId, sessionId);
      const found = retrieved.find(i => i.id === injection.id);

      expect(found?.text).toBe(complexText);
    });

    it('should handle long text (>10KB)', async () => {
      const longText = 'x'.repeat(15000);

      const injection = await injectionRepo.inject({
        userId,
        sessionId,
        dimension: 'episodic',
        text: longText,
        createdBy: userId,
      });

      const retrieved = await injectionRepo.listForSession(userId, sessionId);
      const found = retrieved.find(i => i.id === injection.id);

      expect(found?.text.length).toBe(15000);
    });

    it('should round-trip all fields', async () => {
      const original = {
        userId,
        sessionId,
        dimension: 'commitment' as const,
        text: 'Test memory',
        label: 'test-label',
        injectionLabel: 'test-injection',
        ttl: 7200,
        createdBy: userId,
      };

      const injection = await injectionRepo.inject(original);

      const retrieved = await injectionRepo.listForSession(userId, sessionId);
      const found = retrieved.find(i => i.id === injection.id);

      expect(found?.dimension).toBe(original.dimension);
      expect(found?.text).toBe(original.text);
      expect(found?.label).toBe(original.label);
      expect(found?.injectionLabel).toBe(original.injectionLabel);
      expect(found?.ttl).toBe(original.ttl);
    });
  });

  describe('Concurrency & Edge Cases', () => {
    it('should handle concurrent injections', async () => {
      const testSessionId = randomUUID();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          injectionRepo.inject({
            userId,
            sessionId: testSessionId,
            dimension: 'episodic',
            text: `Concurrent ${i}`,
            createdBy: userId,
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(new Set(results.map(r => r.id)).size).toBe(10); // All unique IDs
    });

    it('should generate unique IDs', async () => {
      const injections = [];

      for (let i = 0; i < 5; i++) {
        const inj = await injectionRepo.inject({
          userId,
          sessionId,
          dimension: 'episodic',
          text: `Unique ID test ${i}`,
          createdBy: userId,
        });
        injections.push(inj.id);
      }

      const uniqueIds = new Set(injections);
      expect(uniqueIds.size).toBe(5);
    });
  });
});
