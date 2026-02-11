/**
 * Integration test: Relationship context in ContinuityPack
 * Validates that ContinuityPack always includes relationship_context
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { MemoryOrchestrator } from '../../src/brain/memory/MemoryOrchestrator.js';
import { UserRelationshipRepository } from '../../src/repository/UserRelationshipRepository.js';
import { runMigrations } from '../../src/db/migrations.js';
import {
  provisionIdentityRow,
  provisionRelationshipRow,
} from '../helpers/relationshipFixtures.js';

describe('Integration: Relationship Context in ContinuityPack', () => {
  let pool: Pool;
  let orchestrator: MemoryOrchestrator;
  let relationshipRepo: UserRelationshipRepository;

  const testUserId = randomUUID();

  beforeAll(async () => {
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
    pool = new Pool({ connectionString: dbUrl });

    // Run migrations
    await runMigrations(pool);

    orchestrator = new MemoryOrchestrator(pool);
    relationshipRepo = new UserRelationshipRepository(pool);
  });

  afterAll(async () => {
    await relationshipRepo.delete(testUserId);
    await pool.end();
  });

  it('ContinuityPack includes relationship_context (required)', async () => {
    await provisionIdentityRow(pool, { vi_user_id: testUserId });

    // Build continuity pack for test user
    const pack = await orchestrator.buildContinuityPack(testUserId);

    // Validate relationship_context exists and is complete
    expect(pack.relationship_context).toBeDefined();
    expect(pack.relationship_context.relationship_type).toBeDefined();
    expect(pack.relationship_context.trust_level).toBeGreaterThanOrEqual(0);
    expect(pack.relationship_context.trust_level).toBeLessThanOrEqual(100);
    expect(pack.relationship_context.tone_preference).toBeDefined();
    expect(pack.relationship_context.voice_profile).toBeDefined();
    expect(pack.relationship_context.interaction_mode).toBeDefined();
    expect(pack.relationship_context.computed_at).toBeDefined();
    expect(pack.relationship_context.source).toBeDefined();
    expect(['db_default', 'db', 'locked_fact']).toContain(pack.relationship_context.source);
  });

  it('relationship_context matches repository data', async () => {
    // Create owner user
    await provisionIdentityRow(pool, { vi_user_id: testUserId });
    await provisionRelationshipRow(pool, testUserId, {
      relationship_type: 'owner',
      voice_profile: 'owner_luxury',
      trust_level: 75,
    });

    // Build pack
    const pack = await orchestrator.buildContinuityPack(testUserId);

    // Validate context matches DB
    expect(pack.relationship_context.relationship_type).toBe('owner');
    expect(pack.relationship_context.voice_profile).toBe('owner_luxury');
    expect(pack.relationship_context.trust_level).toBe(75);
    expect(pack.relationship_context.source).toBe('db');
  });

  it('legacy fields populated for backwards compatibility', async () => {
    const pack = await orchestrator.buildContinuityPack(testUserId);

    // Legacy fields should mirror relationship_context
    expect(pack.relationship_type).toBe(pack.relationship_context.relationship_type);
    expect(pack.trust_level).toBe(pack.relationship_context.trust_level);
    expect(pack.interaction_mode).toBe(pack.relationship_context.interaction_mode);
  });

  it('new user gets default public relationship in pack', async () => {
    const newUserId = randomUUID();
    await provisionIdentityRow(pool, { vi_user_id: newUserId });

    const pack = await orchestrator.buildContinuityPack(newUserId);

    expect(pack.relationship_context.relationship_type).toBe('public');
    expect(pack.relationship_context.voice_profile).toBe('public_elegant');
    expect(pack.relationship_context.trust_level).toBe(0);
    expect(pack.relationship_context.source).toBe('db_default');

    // Cleanup
    await relationshipRepo.delete(newUserId);
  });
});
