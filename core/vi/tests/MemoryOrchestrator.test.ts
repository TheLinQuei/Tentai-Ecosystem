/**
 * Memory Orchestrator Tests
 * Tests continuity pack building, memory selection, and write policies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { runMigrations } from '../src/db/migrations.js';
import { MemoryOrchestrator, type ContinuityPack } from '../src/brain/memory/MemoryOrchestrator.js';
import {
  provisionTestUserWithRelationship,
  type RelationshipOverrides,
} from './helpers/relationshipFixtures.js';

describe('MemoryOrchestrator', () => {
  let pool: Pool;
  let orchestrator: MemoryOrchestrator;
  const createTestUser = async () => {
    const email = `${randomUUID()}@test.local`;
    const username = `user_${randomUUID()}`;
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1,$2,$3,$4,true,true)
       RETURNING id`,
      [email, username, 'hash', 'Memory Orchestrator User']
    );
    return result.rows[0].id as string;
  };

  const createTestUserWithRelationship = async (overrides?: RelationshipOverrides) => {
    const userId = await createTestUser();
    await provisionTestUserWithRelationship(pool, {
      vi_user_id: userId,
      relationship: overrides,
    });
    return userId;
  };

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });

    await runMigrations(pool);

    orchestrator = new MemoryOrchestrator(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe('buildContinuityPack', () => {
    it('should build valid continuity pack with identity', async () => {
      const userId = await createTestUserWithRelationship();

      const pack = await orchestrator.buildContinuityPack(userId, {
        provider: 'discord',
        provider_user_id: 'discord_123'
      });

      expect(pack.vi_user_id).toBe(userId);
      expect(pack.provider).toBe('discord');
      expect(pack.provider_user_id).toBe('discord_123');
      expect(pack.relationship_type).toBeDefined();
      expect(pack.trust_level).toBeGreaterThanOrEqual(0);
      expect(pack.interaction_mode).toBeDefined();
    });

    it('should include user profile data', async () => {
      const userId = await createTestUserWithRelationship({
        relationship_type: 'owner',
        trust_level: 75,
        tone_preference: 'direct',
        voice_profile: 'owner_luxury',
      });

      const pack = await orchestrator.buildContinuityPack(userId);

      expect(pack.relationship_context.relationship_type).toBe('owner');
      expect(pack.relationship_context.trust_level).toBe(75);
      expect(pack.relationship_context.tone_preference).toBe('direct');
      expect(pack.relationship_context.voice_profile).toBe('owner_luxury');
    });

    it('should include memory layers', async () => {
      const userId = await createTestUserWithRelationship();

      // Add episodic memory
      await pool.query(
        `INSERT INTO multi_dimensional_memory (vi_user_id, content, memory_type, layer)
        VALUES ($1, $2, $3, $3)`,
        [userId, 'User mentioned they like coffee', 'episodic']
      );

      // Add semantic memory
      await pool.query(
        `INSERT INTO multi_dimensional_memory (vi_user_id, content, memory_type, layer)
        VALUES ($1, $2, $3, $3)`,
        [userId, 'User is a software engineer', 'semantic']
      );

      // Add relational memory
      await pool.query(
        `INSERT INTO multi_dimensional_memory (vi_user_id, content, memory_type, layer)
        VALUES ($1, $2, $3, $3)`,
        [userId, 'User trusts Vi with technical advice', 'relational']
      );

      const pack = await orchestrator.buildContinuityPack(userId);

      expect(pack.episodic_memory).toHaveLength(1);
      expect(pack.episodic_memory[0].content).toBe('User mentioned they like coffee');
      expect(pack.semantic_memory).toHaveLength(1);
      expect(pack.semantic_memory[0].content).toBe('User is a software engineer');
      expect(pack.relational_memory).toHaveLength(1);
      expect(pack.relational_memory[0].content).toBe('User trusts Vi with technical advice');
    });

    it('should include working memory from session context', async () => {
      const userId = await createTestUserWithRelationship();

      const pack = await orchestrator.buildContinuityPack(userId, {
        session_context: ['User: Hey Vi', 'Vi: Hello! How can I help?']
      });

      expect(pack.working_memory).toEqual(['User: Hey Vi', 'Vi: Hello! How can I help?']);
    });

    it('should return minimal pack on error', async () => {
      const pack = await orchestrator.buildContinuityPack('00000000-0000-0000-0000-000000000000');

      expect(pack.relationship_type).toBe('public');
      expect(pack.trust_level).toBe(0);
      expect(pack.interaction_mode).toBe('default');
      expect(pack.working_memory).toEqual([]);
      expect(pack.episodic_memory).toEqual([]);
      expect(pack.semantic_memory).toEqual([]);
      expect(pack.relational_memory).toEqual([]);
    });
  });

  describe('selectRelevantMemories', () => {
    it('should retrieve recent memories for query', async () => {
      const userId = await createTestUser();

      // Add test memories
      for (let i = 0; i < 10; i++) {
        await pool.query(
          `INSERT INTO multi_dimensional_memory (vi_user_id, content, layer, relevance_score)
          VALUES ($1, $2, $3, $4)`,
          [userId, `Memory ${i}`, 'episodic', 1.0 - (i * 0.1)]
        );
      }

      const memories = await orchestrator.selectRelevantMemories('test query', userId, 5);

      expect(memories).toHaveLength(5);
      expect(memories[0].layer).toBe('episodic');
    });

    it('should return empty array on error', async () => {
      const memories = await orchestrator.selectRelevantMemories('test', 'nonexistent-user', 5);
      expect(memories).toEqual([]);
    });
  });

  describe('writeMemory', () => {
    it('should write episodic memory with auto-write policy', async () => {
      const userId = await createTestUser();

      await orchestrator.writeMemory(
        {
          vi_user_id: userId,
          content: 'User asked about weather',
          layer: 'episodic',
          metadata: { topic: 'weather' }
        },
        {
          auto_write: true,
          require_intent: false,
          garbage_prevention: true
        }
      );

      const result = await pool.query(
        `SELECT * FROM multi_dimensional_memory WHERE vi_user_id = $1 AND content = $2`,
        [userId, 'User asked about weather']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].layer).toBe('episodic');
    });

    it('should reject garbage content', async () => {
      const userId = await createTestUser();

      await orchestrator.writeMemory(
        {
          vi_user_id: userId,
          content: 'hi',
          layer: 'episodic'
        },
        {
          auto_write: true,
          require_intent: false,
          garbage_prevention: true
        }
      );

      const result = await pool.query(
        `SELECT * FROM multi_dimensional_memory WHERE vi_user_id = $1 AND content = $2`,
        [userId, 'hi']
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should reject trivial greetings', async () => {
      const userId = await createTestUser();

      const trivialInputs = ['hello', 'hey', 'thanks', 'ok', 'sure'];

      for (const input of trivialInputs) {
        await orchestrator.writeMemory(
          {
            vi_user_id: userId,
            content: input,
            layer: 'episodic'
          },
          {
            auto_write: true,
            require_intent: false,
            garbage_prevention: true
          }
        );
      }

      const result = await pool.query(
        `SELECT * FROM multi_dimensional_memory WHERE vi_user_id = $1`,
        [userId]
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should write semantic memory', async () => {
      const userId = await createTestUser();

      await orchestrator.writeMemory(
        {
          vi_user_id: userId,
          content: 'User prefers Python over JavaScript',
          layer: 'semantic'
        },
        {
          auto_write: false,
          require_intent: true,
          garbage_prevention: false
        }
      );

      const result = await pool.query(
        `SELECT * FROM multi_dimensional_memory WHERE vi_user_id = $1`,
        [userId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].layer).toBe('semantic');
    });
  });

  describe('Cross-Session Continuity', () => {
    it('should persist preferences across sessions', async () => {
      const userId = await createTestUser();

      // Session 1: Set preferences
      await pool.query(
        `INSERT INTO user_preferences (user_id, vi_user_id, tone_preference, interaction_mode)
        VALUES ($1, $2, $3, $4)`,
        [userId, userId, 'friendly', 'default']
      );

      // Session 2: Build continuity pack
      const pack = await orchestrator.buildContinuityPack(userId);

      expect(pack.tone_preference).toBe('friendly');
      expect(pack.interaction_mode).toBe('default');
    });

    it('should retrieve memories from previous sessions', async () => {
      const userId = await createTestUser();

      // Session 1: Store memory
      await orchestrator.writeMemory(
        {
          vi_user_id: userId,
          content: 'User mentioned birthday is in June',
          layer: 'episodic'
        },
        { auto_write: true, require_intent: false, garbage_prevention: false }
      );

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Session 2: Build continuity pack
      const pack = await orchestrator.buildContinuityPack(userId);

      expect(pack.episodic_memory.some(m => m.content.includes('birthday'))).toBe(true);
    });
  });
});
