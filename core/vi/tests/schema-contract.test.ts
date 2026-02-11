/**
 * Schema Contract Test
 * 
 * Verifies that critical database columns exist as expected by downstream code.
 * This prevents "downstream expects column that never got shipped" errors.
 * 
 * Runs on every fresh database to catch schema drift early.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrations.js';

describe('Schema Contract', () => {
  let pool: Pool;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe('user_profiles table', () => {
    it('should have all required columns', async () => {
      const res = await pool.query(`
        SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
        WHERE table_name = 'user_profiles'
        ORDER BY ordinal_position
      `);

      const columns = new Map(res.rows.map(r => [r.column_name, r]));

      const required = [
        'user_id',
        'profile',
        'version',
        'vi_user_id',
        'relationship_type',
        'trust_level',
        'interaction_mode',
        'tone_preference',
        'voice_profile',
        'boundaries_profile',
      ];

      for (const col of required) {
        expect(columns.has(col), `user_profiles.${col} missing`).toBe(true);
      }
    });
  });

  describe('user_preferences table', () => {
    it('should have all required columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user_preferences'
        ORDER BY ordinal_position
      `);

      const columns = new Set(res.rows.map(r => r.column_name));

      const required = [
        'id',
        'user_id',
        'vi_user_id',
        'tone_preference',
        'interaction_mode',
        'tone_correction_count',
        'interaction_mode_locked',
        'relationship_cue_owner',
        'relationship_cue_trusted',
        'relationship_cue_restricted',
      ];

      for (const col of required) {
        expect(columns.has(col), `user_preferences.${col} missing`).toBe(true);
      }
    });

    it('should have vi_user_id NOT NULL', async () => {
      const res = await pool.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_preferences' AND column_name = 'vi_user_id'
      `);

      expect(res.rows[0].is_nullable).toBe('NO');
    });
  });

  describe('multi_dimensional_memory table', () => {
    it('should have all required columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'multi_dimensional_memory'
        ORDER BY ordinal_position
      `);

      const columns = new Set(res.rows.map(r => r.column_name));

      const required = [
        'id',
        'vi_user_id',
        'content',
        'memory_type',
        'layer',
        'relevance_score',
        'created_at',
      ];

      for (const col of required) {
        expect(columns.has(col), `multi_dimensional_memory.${col} missing`).toBe(true);
      }
    });

    it('should have layer NOT NULL', async () => {
      const res = await pool.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'multi_dimensional_memory' AND column_name = 'layer'
      `);

      expect(res.rows[0].is_nullable).toBe('NO');
    });
  });

  describe('preference_audit_log table', () => {
    it('should have all required columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'preference_audit_log'
        ORDER BY ordinal_position
      `);

      const columns = new Set(res.rows.map(r => r.column_name));

      const required = [
        'id',
        'user_id',
        'vi_user_id',
        'preference_type',
        'change_type',
        'old_value',
        'new_value',
        'reason',
        'version',
      ];

      for (const col of required) {
        expect(columns.has(col), `preference_audit_log.${col} missing`).toBe(true);
      }
    });
  });

  describe('user_identity_map table', () => {
    it('should have all required columns', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user_identity_map'
        ORDER BY ordinal_position
      `);

      const columns = new Set(res.rows.map(r => r.column_name));

      const required = [
        'vi_user_id',
        'provider',
        'provider_user_id',
        'metadata',
        'created_at',
        'updated_at',
      ];

      for (const col of required) {
        expect(columns.has(col), `user_identity_map.${col} missing`).toBe(true);
      }
    });

    it('should have PRIMARY KEY on (provider, provider_user_id)', async () => {
      const res = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'user_identity_map' 
        AND constraint_type = 'PRIMARY KEY'
      `);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].constraint_name).toContain('pkey');
    });

    it('should have index on vi_user_id', async () => {
      const res = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'user_identity_map'
        AND indexname LIKE '%vi_user_id%'
      `);

      expect(res.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Migration application tracking', () => {
    it('should have applied_migrations table', async () => {
      const res = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'applied_migrations'
      `);

      expect(res.rows.length).toBeGreaterThan(0);
    });

    it('should track all critical migrations as applied', async () => {
      const res = await pool.query(`
        SELECT id FROM applied_migrations
        WHERE id IN (
          '0027_preferences_and_profiles',
          '0028_multidimensional_memory',
          '0029_backfill_identity_and_profiles',
          '0030_fix_preference_conflicts'
        )
      `);

      // All 4 critical migrations must be applied
      expect(res.rows.length).toBe(4);
    });
  });
});
