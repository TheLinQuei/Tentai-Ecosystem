/**
 * Unit test: RelationshipResolver guarded mode overrides
 * Validates that guarded mode forces public_elegant + neutral regardless of relationship_type
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RelationshipResolver } from '../../src/brain/cognition/RelationshipResolver.js';
import { UserRelationshipRepository } from '../../src/repository/UserRelationshipRepository.js';
import { provisionIdentityRow } from '../helpers/relationshipFixtures.js';

describe('RelationshipResolver - Guarded Mode Override', () => {
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

  it('guarded mode overrides owner -> public_elegant + neutral', async () => {
    const testUserId = await createTestUserId();

    // Create and upgrade to owner
    await resolver.resolveRelationship(testUserId, []);
    await repository.update(testUserId, {
      relationship_type: 'owner',
      voice_profile: 'owner_luxury',
      tone_preference: 'warm',
      interaction_mode: 'guarded', // Guarded mode enabled
    });

    // Resolve (guarded should override)
    const context = await resolver.resolveRelationship(testUserId, []);

    expect(context.relationship_type).toBe('owner'); // Type unchanged
    expect(context.voice_profile).toBe('public_elegant'); // Forced
    expect(context.tone_preference).toBe('neutral'); // Forced
    expect(context.interaction_mode).toBe('guarded');
    expect(context.source).toBe('db');

    // Cleanup
    await repository.delete(testUserId);
  });

  it('guarded mode overrides public (idempotent)', async () => {
    const testUserId = await createTestUserId();

    // Create default public, enable guarded
    await resolver.resolveRelationship(testUserId, []);
    await repository.update(testUserId, {
      interaction_mode: 'guarded',
      tone_preference: 'direct', // Should be forced to neutral
    });

    // Resolve
    const context = await resolver.resolveRelationship(testUserId, []);

    expect(context.relationship_type).toBe('public');
    expect(context.voice_profile).toBe('public_elegant'); // Already correct
    expect(context.tone_preference).toBe('neutral'); // Forced
    expect(context.interaction_mode).toBe('guarded');

    // Cleanup
    await repository.delete(testUserId);
  });

  it('default (non-guarded) mode allows owner_luxury', async () => {
    const testUserId = await createTestUserId();

    // Create and upgrade to owner with default mode
    await resolver.resolveRelationship(testUserId, []);
    await repository.update(testUserId, {
      relationship_type: 'owner',
      voice_profile: 'owner_luxury',
      tone_preference: 'direct',
      interaction_mode: 'default', // NOT guarded
    });

    // Resolve
    const context = await resolver.resolveRelationship(testUserId, []);

    expect(context.relationship_type).toBe('owner');
    expect(context.voice_profile).toBe('owner_luxury'); // NOT forced
    expect(context.tone_preference).toBe('direct'); // NOT forced
    expect(context.interaction_mode).toBe('default');

    // Cleanup
    await repository.delete(testUserId);
  });
});
