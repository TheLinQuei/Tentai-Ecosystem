/**
 * Unit test: RelationshipResolver locked fact override
 * Validates that locked facts can override relationship_type
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RelationshipResolver } from '../../src/brain/cognition/RelationshipResolver.js';
import { UserRelationshipRepository } from '../../src/repository/UserRelationshipRepository.js';
import type { UserFact } from '../../src/db/repositories/UserFactRepository.js';
import { provisionIdentityRow } from '../helpers/relationshipFixtures.js';

describe('RelationshipResolver - Locked Fact Override', () => {
  let pool: Pool;
  let repository: UserRelationshipRepository;
  let resolver: RelationshipResolver;

  const createTestUserId = async () => {
    const userId = randomUUID();
    await provisionIdentityRow(pool, { vi_user_id: userId });
    return userId;
  };

  beforeEach(async () => {
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
    pool = new Pool({ connectionString: dbUrl });

    repository = new UserRelationshipRepository(pool);
    resolver = new RelationshipResolver({ repository });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('locked fact overrides database relationship_type to owner', async () => {
    const testUserId = await createTestUserId();

    // Create default public relationship in DB
    await resolver.resolveRelationship(testUserId, []);
    
    // Verify DB has public
    const dbRow = await repository.get(testUserId);
    expect(dbRow?.relationship_type).toBe('public');

    // Create locked fact that sets relationship_type=owner
    const lockedFacts: UserFact[] = [
      {
        fact_id: 'fact-1',
        vi_user_id: testUserId,
        fact_key: 'relationship_type',
        fact_type: 'rule',
        authority: 'locked',
        scope: 'global',
        value: { type: 'owner' },
        confidence: 1.0,
        source: 'user',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    // Resolve with locked fact
    const context = await resolver.resolveRelationship(testUserId, lockedFacts);

    expect(context.relationship_type).toBe('owner');
    expect(context.voice_profile).toBe('owner_luxury');
    expect(context.source).toBe('locked_fact');

    // Cleanup
    await repository.delete(testUserId);
  });

  it('locked fact overrides database relationship_type to public (downgrade)', async () => {
    const testUserId = await createTestUserId();

    // Create and manually upgrade to owner in DB
    await resolver.resolveRelationship(testUserId, []);
    await repository.update(testUserId, { relationship_type: 'owner', voice_profile: 'owner_luxury' });

    // Verify DB has owner
    let dbRow = await repository.get(testUserId);
    expect(dbRow?.relationship_type).toBe('owner');

    // Create locked fact that forces public
    const lockedFacts: UserFact[] = [
      {
        fact_id: 'fact-2',
        vi_user_id: testUserId,
        fact_key: 'relationship_type',
        fact_type: 'rule',
        authority: 'locked',
        scope: 'global',
        value: { type: 'public' },
        confidence: 1.0,
        source: 'system',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    // Resolve with locked fact (should override to public)
    const context = await resolver.resolveRelationship(testUserId, lockedFacts);

    expect(context.relationship_type).toBe('public');
    expect(context.voice_profile).toBe('public_elegant');
    expect(context.source).toBe('locked_fact');

    // Cleanup
    await repository.delete(testUserId);
  });

  it('ignores non-locked facts for relationship_type', async () => {
    const testUserId = await createTestUserId();

    // Create default public
    await resolver.resolveRelationship(testUserId, []);

    // Create explicit (not locked) fact
    const explicitFacts: UserFact[] = [
      {
        fact_id: 'fact-3',
        vi_user_id: testUserId,
        fact_key: 'relationship_type',
        fact_type: 'preference',
        authority: 'explicit', // NOT locked
        scope: 'global',
        value: { type: 'owner' },
        confidence: 0.9,
        source: 'user',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    // Resolve (should ignore non-locked fact, use DB)
    const context = await resolver.resolveRelationship(testUserId, explicitFacts);

    expect(context.relationship_type).toBe('public'); // DB value, not explicit fact
    expect(context.source).toBe('db');

    // Cleanup
    await repository.delete(testUserId);
  });
});
