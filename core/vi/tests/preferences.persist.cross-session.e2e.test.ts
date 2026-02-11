/**
 * PHASE 3: Cross-Session Persistence E2E Tests
 * 
 * Validates that preferences survive session boundaries:
 * - Tone corrections persist across sessions
 * - Interaction mode changes persist
 * - Relationship cues persist
 * - Response preferences persist
 * - All preferences load on new session start
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { PreferenceRepository } from '../src/brain/PreferenceRepository.js';
import { PreferencePersistenceEngine } from '../src/brain/PreferencePersistenceEngine.js';
import { runMigrations } from '../src/db/migrations.js';

describe('Phase 3: Cross-Session Personality Persistence', () => {
  let pool: Pool;
  let preferenceRepo: PreferenceRepository;
  let persistenceEngine: PreferencePersistenceEngine;
  let testUserId: string;
  const ensureUser = async (userId: string) => {
    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, is_active, is_verified)
       VALUES ($1, $2, $3, $4, true, true)
       ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@test.local`, `test_user_${userId}`, 'hash']
    );
  };

  beforeAll(async () => {
    // Initialize test DB (use test database URL)
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/vi_test';
    pool = new Pool({ connectionString });
    await runMigrations(pool);
    preferenceRepo = new PreferenceRepository(pool);
    persistenceEngine = new PreferencePersistenceEngine(preferenceRepo);
    testUserId = randomUUID();

    // Ensure test user exists
    await ensureUser(testUserId);
    await pool.query(
      `INSERT INTO user_profiles (user_id, profile, vi_user_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [testUserId, '{}', testUserId]
    );
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM preference_audit_log WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM user_preferences WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  describe('Tone Persistence', () => {
    it('should persist tone correction across sessions', async () => {
      // Session 1: User requests direct tone
      const sessionId1 = randomUUID();
      const corrections = await persistenceEngine.detectCorrections(
        'be direct and straightforward',
        testUserId,
        sessionId1
      );

      expect(corrections.length).toBeGreaterThan(0);
      expect(corrections[0].category).toBe('direct');

      // Verify saved to DB
      let prefs = await preferenceRepo.load(testUserId);
      expect(prefs.tone_preference).toBe('direct');

      // Session 2: Load preferences (simulating new session)
      const sessionId2 = randomUUID();
      prefs = await preferenceRepo.load(testUserId);

      expect(prefs.tone_preference).toBe('direct');
      expect(prefs.tone_correction_count).toBe(1);
    });

    it('should change tone preference when user provides new correction', async () => {
      // Session 1: Direct
      await persistenceEngine.detectCorrections(
        'be more direct',
        testUserId,
        randomUUID()
      );

      let prefs = await preferenceRepo.load(testUserId);
      expect(prefs.tone_preference).toBe('direct');

      // Session 2: User changes to elegant
      await persistenceEngine.detectCorrections(
        'actually be more elegant',
        testUserId,
        randomUUID()
      );

      prefs = await preferenceRepo.load(testUserId);
      expect(prefs.tone_preference).toBe('elegant');
      expect(prefs.tone_correction_count).toBeGreaterThan(1);
    });

    it('should track tone correction history', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Apply multiple tone corrections
      await persistenceEngine.detectCorrections('be direct', userId, randomUUID());
      await persistenceEngine.detectCorrections('actually be elegant', userId, randomUUID());
      await persistenceEngine.detectCorrections('now be playful', userId, randomUUID());

      const prefs = await preferenceRepo.load(userId);
      expect(prefs.correction_history.length).toBeGreaterThanOrEqual(3);

      const types = prefs.correction_history.map(c => c.type);
      expect(types).toContain('tone_correction');

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Interaction Mode Persistence', () => {
    it('should persist interaction mode across sessions', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: User requests operator mode
      const sessionId1 = randomUUID();
      const corrections = await persistenceEngine.detectCorrections(
        'operator mode',
        userId,
        sessionId1
      );

      expect(corrections.some(c => c.category === 'operator')).toBe(true);

      // Session 2: Load and verify
      let prefs = await preferenceRepo.load(userId);
      expect(prefs.interaction_mode).toBe('operator');
      expect(prefs.interaction_mode_locked).toBe(true);

      // Session 3: New session still has operator mode
      prefs = await preferenceRepo.load(userId);
      expect(prefs.interaction_mode).toBe('operator');

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });

    it('should support mode switching', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Operator
      await persistenceEngine.detectCorrections('operator mode', userId, randomUUID());
      let prefs = await preferenceRepo.load(userId);
      expect(prefs.interaction_mode).toBe('operator');

      // Session 2: Switch to companion
      await persistenceEngine.detectCorrections('companion mode', userId, randomUUID());
      prefs = await preferenceRepo.load(userId);
      expect(prefs.interaction_mode).toBe('companion');

      // Session 3: Still companion
      prefs = await preferenceRepo.load(userId);
      expect(prefs.interaction_mode).toBe('companion');

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Response Preference Persistence', () => {
    it('should persist concise preference', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Request concise
      await persistenceEngine.detectCorrections('be more concise', userId, randomUUID());

      let prefs = await preferenceRepo.load(userId);
      expect(prefs.prefer_concise).toBe(true);

      // Session 2: Verify persistence
      prefs = await preferenceRepo.load(userId);
      expect(prefs.prefer_concise).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });

    it('should persist no-apologies preference', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Request no apologies
      await persistenceEngine.detectCorrections('don\'t apologize', userId, randomUUID());

      let prefs = await preferenceRepo.load(userId);
      expect(prefs.no_apologies).toBe(true);

      // Session 2: Verify persistence
      prefs = await preferenceRepo.load(userId);
      expect(prefs.no_apologies).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });

    it('should persist no-disclaimers preference', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Request no disclaimers
      await persistenceEngine.detectCorrections('no disclaimers', userId, randomUUID());

      let prefs = await preferenceRepo.load(userId);
      expect(prefs.no_disclaimers).toBe(true);

      // Session 2: Verify persistence
      prefs = await preferenceRepo.load(userId);
      expect(prefs.no_disclaimers).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Relationship Cue Persistence', () => {
    it('should persist trusted cue', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Indicate trusted relationship
      await persistenceEngine.detectCorrections('you should know this', userId, randomUUID());

      let prefs = await preferenceRepo.load(userId);
      expect(prefs.relationship_cue_trusted).toBe(true);

      // Session 2: Verify persistence
      prefs = await preferenceRepo.load(userId);
      expect(prefs.relationship_cue_trusted).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });

    it('should persist restricted cue', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      // Session 1: Request professional mode
      await persistenceEngine.detectCorrections('keep it formal and professional', userId, randomUUID());

      let prefs = await preferenceRepo.load(userId);
      expect(prefs.relationship_cue_restricted).toBe(true);

      // Session 2: Verify persistence
      prefs = await preferenceRepo.load(userId);
      expect(prefs.relationship_cue_restricted).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Audit Log', () => {
    it('should maintain audit history of all corrections', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      const sessionId = randomUUID();

      // Apply corrections
      await persistenceEngine.detectCorrections('be direct', userId, sessionId);
      await persistenceEngine.detectCorrections('operator mode', userId, sessionId);
      await persistenceEngine.detectCorrections('be concise', userId, sessionId);

      // Check audit log
      const history = await preferenceRepo.getAuditHistory(userId);
      expect(history.length).toBeGreaterThanOrEqual(3);

      const changeTypes = history.map(h => h.change_type);
      expect(changeTypes).toContain('tone_correction');
      expect(changeTypes).toContain('mode_change');
      expect(changeTypes).toContain('preference_toggle');

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });

    it('should record reason in audit log', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      const sessionId = randomUUID();
      await persistenceEngine.detectCorrections('be direct', userId, sessionId);

      const history = await preferenceRepo.getAuditHistory(userId);
      const toneEntry = history.find(h => h.change_type === 'tone_correction');
      expect(toneEntry).toBeDefined();
      expect(toneEntry?.reason).toContain('direct');

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Multi-Preference Sessions', () => {
    it('should persist multiple preferences together', async () => {
      const userId = randomUUID();
      await ensureUser(userId);
      await pool.query(
        `INSERT INTO user_profiles (vi_user_id, user_id, profile) VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT DO NOTHING`,
        [userId, userId]
      );

      const sessionId1 = randomUUID();

      // Session 1: Multiple corrections
      await persistenceEngine.detectCorrections(
        'be direct, operator mode, no apologies, be concise',
        userId,
        sessionId1
      );

      // Session 2: Load all preferences
      const prefs = await preferenceRepo.load(userId);
      expect(prefs.tone_preference).toBe('direct');
      expect(prefs.interaction_mode).toBe('operator');
      expect(prefs.no_apologies).toBe(true);
      expect(prefs.prefer_concise).toBe(true);

      // Session 3: All still present
      const prefs2 = await preferenceRepo.load(userId);
      expect(prefs2.tone_preference).toBe('direct');
      expect(prefs2.interaction_mode).toBe('operator');
      expect(prefs2.no_apologies).toBe(true);
      expect(prefs2.prefer_concise).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM preference_audit_log WHERE vi_user_id = $1', [userId]);
      await pool.query('DELETE FROM user_preferences WHERE vi_user_id = $1', [userId]);
    });
  });

  describe('Output Application', () => {
    it('should apply preferences to output (concise)', async () => {
      const prefs = {
        prefer_concise: true,
        no_apologies: false,
        no_disclaimers: false,
      };

      const output = `Line 1\nLine 2\nLine 3\nLine 4\nLine 5`;
      const result = await persistenceEngine.applyPreferencesToOutput(output, prefs, testUserId);

      expect(result).toContain('...');
      expect(result.split('\n').length).toBeLessThanOrEqual(4); // 3 lines + ...
    });

    it('should apply preferences to output (no apologies)', async () => {
      const prefs = {
        prefer_concise: false,
        no_apologies: true,
        no_disclaimers: false,
      };

      const output = `I apologize, but I don't have that information. Sorry for the confusion.`;
      const result = await persistenceEngine.applyPreferencesToOutput(output, prefs, testUserId);

      expect(result).not.toContain('apologize');
      expect(result).not.toContain('Sorry');
    });

    it('should apply preferences to output (no disclaimers)', async () => {
      const prefs = {
        prefer_concise: false,
        no_apologies: false,
        no_disclaimers: true,
      };

      const output = `As an AI assistant, I should note that this information is limited. Please be aware that details may vary.`;
      const result = await persistenceEngine.applyPreferencesToOutput(output, prefs, testUserId);

      expect(result).not.toContain('As an AI');
      expect(result).not.toContain('Please note');
    });
  });

  describe('Defaults', () => {
    it('should return defaults for new user', async () => {
      const userId = randomUUID();
      const prefs = await preferenceRepo.load(userId);

      expect(prefs.tone_preference).toBeNull();
      expect(prefs.interaction_mode).toBe('assistant');
      expect(prefs.no_apologies).toBe(false);
      expect(prefs.no_disclaimers).toBe(false);
      expect(prefs.prefer_concise).toBe(false);
      expect(prefs.prefer_detailed).toBe(false);
    });
  });
});
