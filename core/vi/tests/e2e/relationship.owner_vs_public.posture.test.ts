/**
 * E2E test: Owner vs Public posture validation
 * Validates that same prompt yields different posture but identical factual content
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { runMigrations } from '../../src/db/migrations.js';
import { MemoryOrchestrator } from '../../src/brain/memory/MemoryOrchestrator.js';
import { getPostureTemplate } from '../../src/brain/voice/PostureTemplates.js';
import {
  provisionIdentityRow,
  provisionRelationshipRow,
} from '../helpers/relationshipFixtures.js';

describe('E2E: Owner vs Public Posture', () => {
  let pool: Pool;
  let orchestrator: MemoryOrchestrator;

  const ownerUserId = randomUUID();
  const publicUserId = randomUUID();

  beforeAll(async () => {
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
    pool = new Pool({ connectionString: dbUrl });

    // Run migrations
    await runMigrations(pool);

    orchestrator = new MemoryOrchestrator(pool);

    await provisionIdentityRow(pool, { vi_user_id: ownerUserId });
    await provisionRelationshipRow(pool, ownerUserId, {
      relationship_type: 'owner',
      voice_profile: 'owner_luxury',
      tone_preference: 'direct',
      trust_level: 80,
    });

    await provisionIdentityRow(pool, { vi_user_id: publicUserId });
    await provisionRelationshipRow(pool, publicUserId, {
      relationship_type: 'public',
      voice_profile: 'public_elegant',
      tone_preference: 'neutral',
      trust_level: 0,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('same prompt produces different posture (owner vs public)', async () => {
    const ownerPack = await orchestrator.buildContinuityPack(ownerUserId);
    const publicPack = await orchestrator.buildContinuityPack(publicUserId);

    const ownerTemplate = getPostureTemplate(ownerPack.relationship_context);
    const publicTemplate = getPostureTemplate(publicPack.relationship_context);

    expect(ownerPack.relationship_context.relationship_type).toBe('owner');
    expect(ownerPack.relationship_context.voice_profile).toBe('owner_luxury');

    expect(publicPack.relationship_context.relationship_type).toBe('public');
    expect(publicPack.relationship_context.voice_profile).toBe('public_elegant');

    expect(ownerTemplate.allow_micro_phrases).toBe(true);
    expect(publicTemplate.allow_micro_phrases).toBe(false);
    expect(ownerTemplate.assistant_framing).toBe('minimal');
    expect(publicTemplate.assistant_framing).toBe('standard');
  });

  it('factual content identical across modes (posture-only delta)', async () => {
    const ownerPack = await orchestrator.buildContinuityPack(ownerUserId);
    const publicPack = await orchestrator.buildContinuityPack(publicUserId);

    // Relationship context differs, factual content should be unaffected by posture layer
    expect(ownerPack.relationship_context.relationship_type).not.toBe(
      publicPack.relationship_context.relationship_type
    );
    expect(ownerPack.fact_ledger).toEqual(publicPack.fact_ledger);
  });
});
