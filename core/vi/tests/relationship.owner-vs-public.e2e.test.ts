/**
 * RelationshipResolver E2E
 * Verifies owner vs public posture from resolver
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { RelationshipResolver } from '../src/brain/RelationshipResolver.js';
import { runMigrations } from '../src/db/migrations.js';

describe('RelationshipResolver (Phase 2)', () => {
  let pool: Pool;
  let resolver: RelationshipResolver;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });
    resolver = new RelationshipResolver(pool);

    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.query('TRUNCATE user_profiles, users CASCADE');
    await pool.end();
  });

  it('returns public defaults when no stored profile', async () => {
    const userId = '00000000-0000-0000-0000-000000000001';
    const rel = await resolver.resolveRelationship(userId);
    expect(rel.type).toBe('normal');
    expect(rel.interaction_mode).toBe('assistant');
    expect(rel.voice_profile).toBe('LUXE_ORIGIN');
  });

  it('returns owner posture when stored relationship_type=owner', async () => {
    const userRes = await pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1,$2,$3,$4,true,true)
       RETURNING id` ,
      [`${randomUUID()}@test.local`, `user_${randomUUID()}`, 'hash', 'Relationship Owner User']
    );
    const userId = userRes.rows[0].id as string;

    await pool.query(
      `INSERT INTO user_profiles (user_id, profile, relationship_type, trust_level)
       VALUES ($1, '{"interaction_mode": "operator", "tone_preference": "direct", "voice_profile": "LUXE_ORIGIN"}'::jsonb, 'owner', 0.8)`,
      [userId]
    );

    const rel = await resolver.resolveRelationship(userId);
    expect(rel.type).toBe('owner');
    expect(rel.trust_level).toBeCloseTo(0.8);
  });

  it('explicit settings override stored values', async () => {
    const userRes = await pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1,$2,$3,$4,true,true)
       RETURNING id` ,
      [`${randomUUID()}@test.local`, `user_${randomUUID()}`, 'hash', 'Relationship Explicit User']
    );
    const userId = userRes.rows[0].id as string;

    await pool.query(
      `INSERT INTO user_profiles (user_id, profile, relationship_type, trust_level)
       VALUES ($1, '{}'::jsonb, 'normal', 0.1)`,
      [userId]
    );

    const rel = await resolver.resolveRelationship(userId, {
      explicit_settings: {
        type: 'trusted',
        trust_level: 0.6,
        interaction_mode: 'companion',
        tone_preference: 'warm'
      }
    });

    expect(rel.type).toBe('trusted');
    expect(rel.trust_level).toBeCloseTo(0.6);
  });

  it('history heuristics promote trust and owner mode', async () => {
    const userRes = await pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1,$2,$3,$4,true,true)
       RETURNING id` ,
      [`${randomUUID()}@test.local`, `user_${randomUUID()}`, 'hash', 'Relationship History User']
    );
    const userId = userRes.rows[0].id as string;

    await pool.query(
      `INSERT INTO user_profiles (user_id, profile)
       VALUES ($1, '{}'::jsonb)`,
      [userId]
    );

    const rel = await resolver.resolveRelationship(userId, {
      history: [
        { type: 'session_success', timestamp: new Date().toISOString() },
        { type: 'session_success', timestamp: new Date().toISOString() },
        { type: 'session_success', timestamp: new Date().toISOString() },
        { type: 'console_owner', timestamp: new Date().toISOString() },
      ],
    });

    expect(rel.trust_level).toBeGreaterThanOrEqual(50);
    expect(rel.type).toBe('owner');
    expect(rel.interaction_mode).toBe('operator');
    expect(rel.tone_preference).toBe('direct');
  });
});
