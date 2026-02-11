/**
 * Unit test: RelationshipResolver defaults
 * Validates that new users get default public relationship
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RelationshipResolver } from '../../src/brain/cognition/RelationshipResolver.js';
import { UserRelationshipRepository } from '../../src/repository/UserRelationshipRepository.js';
import { provisionIdentityRow } from '../helpers/relationshipFixtures.js';

describe('RelationshipResolver - Defaults', () => {
  let pool: Pool;
  let repository: UserRelationshipRepository;
  let resolver: RelationshipResolver;

  const createTestUserId = async () => {
    const userId = randomUUID();
    await provisionIdentityRow(pool, { vi_user_id: userId });
    return userId;
  };

  beforeEach(async () => {
    // Use global test database connection
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
    pool = new Pool({ connectionString: dbUrl });

    repository = new UserRelationshipRepository(pool);
    resolver = new RelationshipResolver({ repository });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('creates default public relationship for new user', async () => {
    const testUserId = await createTestUserId();

    // Resolve relationship (should create default)
    const context = await resolver.resolveRelationship(testUserId, []);

    expect(context).toBeDefined();
    expect(context.relationship_type).toBe('public');
    expect(context.trust_level).toBe(0);
    expect(context.tone_preference).toBe('neutral');
    expect(context.voice_profile).toBe('public_elegant');
    expect(context.interaction_mode).toBe('default');
    expect(context.source).toBe('db_default');
    expect(context.computed_at).toBeDefined();

    // Cleanup
    await repository.delete(testUserId);
  });

  it('returns existing relationship for existing user', async () => {
    const testUserId = await createTestUserId();

    // First call creates default
    const context1 = await resolver.resolveRelationship(testUserId, []);
    expect(context1.source).toBe('db_default');

    // Second call retrieves existing
    const context2 = await resolver.resolveRelationship(testUserId, []);
    expect(context2.source).toBe('db');
    expect(context2.relationship_type).toBe('public');

    // Cleanup
    await repository.delete(testUserId);
  });

  it('validates trust_level is clamped 0-100', async () => {
    const testUserId = await createTestUserId();

    // Create default
    await resolver.resolveRelationship(testUserId, []);

    // Update with invalid trust levels
    await repository.update(testUserId, { trust_level: -10 });
    let context = await resolver.resolveRelationship(testUserId, []);
    expect(context.trust_level).toBe(0); // Clamped to 0

    await repository.update(testUserId, { trust_level: 150 });
    context = await resolver.resolveRelationship(testUserId, []);
    expect(context.trust_level).toBe(100); // Clamped to 100

    // Cleanup
    await repository.delete(testUserId);
  });
});
