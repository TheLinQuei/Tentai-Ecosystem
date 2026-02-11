/**
 * Identity Resolver Tests
 * Coverage: Basic resolution, linking, unlinking, migration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { runMigrations } from '../src/db/migrations.js';
import { IdentityResolver, type IdentityContext } from '../src/identity/IdentityResolver.js';
import { provisionIdentityRow } from './helpers/relationshipFixtures.js';

describe('IdentityResolver (Phase 1)', () => {
  let pool: Pool;
  let resolver: IdentityResolver;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString });

    await runMigrations(pool);

    resolver = new IdentityResolver(pool);
  });

  afterAll(async () => {
    // Clean test data (skip if tables don't exist)
    try {
      await pool.query('TRUNCATE TABLE identity_audit_log, user_identity_map CASCADE');
    } catch (error) {
      // Tables might not exist if migrations failed
    }
    await pool.end();
  });

  describe('resolveIdentity', () => {
    it('should create new identity for new provider', async () => {
      const context: IdentityContext = {
        provider: 'discord',
        provider_user_id: 'discord_123',
      };

      const identity = await resolver.resolveIdentity(context);

      expect(identity.vi_user_id).toBeDefined();
      expect(identity.provider).toBe('discord');
      expect(identity.provider_user_id).toBe('discord_123');
      expect(identity.created_at).toBeInstanceOf(Date);
    });

    it('should return existing identity for same provider', async () => {
      const context: IdentityContext = {
        provider: 'sovereign',
        provider_user_id: 'sov_456',
      };

      const identity1 = await resolver.resolveIdentity(context);
      const identity2 = await resolver.resolveIdentity(context);

      expect(identity1.vi_user_id).toBe(identity2.vi_user_id);
      expect(identity1.created_at.getTime()).toBe(identity2.created_at.getTime());
    });

    it('should attach metadata to identity', async () => {
      const context: IdentityContext = {
        provider: 'astralis',
        provider_user_id: 'ast_789',
        email: 'test@example.com',
        username: 'testuser',
        metadata: { custom: 'field' },
      };

      const identity = await resolver.resolveIdentity(context);

      expect(identity.metadata.email).toBe('test@example.com');
      expect(identity.metadata.username).toBe('testuser');
      expect(identity.metadata.custom).toBe('field');
    });
  });

  describe('getLinkedProviders', () => {
    it('should return all providers for a user', async () => {
      const vi_user_id = randomUUID();

      // Create multiple provider identities with unique IDs
      await pool.query(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id)
        VALUES ($1, $2, $3)`,
        [vi_user_id, 'discord', `discord_${randomUUID()}`]
      );

      await pool.query(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id)
        VALUES ($1, $2, $3)`,
        [vi_user_id, 'sovereign', `sov_${randomUUID()}`]
      );

      const providers = await resolver.getLinkedProviders(vi_user_id);

      expect(providers).toHaveLength(2);
      expect(providers.map((p: IdentityContext) => p.provider)).toContain('discord');
      expect(providers.map((p: IdentityContext) => p.provider)).toContain('sovereign');
    });
  });

  describe('linkProvider', () => {
    it('should link new provider to existing user', async () => {
      const context1: IdentityContext = {
        provider: 'console',
        provider_user_id: `console_${randomUUID()}`,
      };

      const identity1 = await resolver.resolveIdentity(context1);
      const vi_user_id = identity1.vi_user_id;

      const context2: IdentityContext = {
        provider: 'guest',
        provider_user_id: `guest_${vi_user_id}`,
      };

      const auditContext = {
        performedBy: 'test-user',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      const linked = await resolver.linkProvider(vi_user_id, context2, auditContext);

      expect(linked.vi_user_id).toBe(vi_user_id);
      expect(linked.provider).toBe('guest');

      // Verify it's in the database
      const providers = await resolver.getLinkedProviders(vi_user_id);
      expect(providers).toHaveLength(2);

      // Verify audit log
      const auditLog = await pool.query(
        `SELECT * FROM identity_audit_log 
        WHERE vi_user_id = $1 AND action = 'link' AND provider = 'guest'`,
        [vi_user_id]
      );
      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].performed_by).toBe('test-user');
      expect(auditLog.rows[0].ip_address).toBe('127.0.0.1');
      expect(auditLog.rows[0].user_agent).toBe('test-agent');
    });

    it('should prevent linking duplicate provider', async () => {
      const uniqueId = `discord_dup_${randomUUID()}`;
      const context: IdentityContext = {
        provider: 'discord',
        provider_user_id: uniqueId,
      };

      const identity1 = await resolver.resolveIdentity(context);
      const vi_user_id = identity1.vi_user_id;

      const context2: IdentityContext = {
        provider: 'discord',
        provider_user_id: uniqueId,
      };

      await expect(resolver.linkProvider('different-user-id', context2)).rejects.toThrow();
    });
  });

  describe('unlinkProvider', () => {
    it('should unlink provider from user', async () => {
      // Provision first identity
      const vi_user_id = await provisionIdentityRow(pool, {
        provider: 'discord',
        provider_user_id: `discord_${randomUUID()}`
      });

      // Add second provider manually (testing multi-provider scenario)
      await pool.query(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id)
        VALUES ($1, $2, $3)`,
        [vi_user_id, 'sovereign', `sov_${randomUUID()}`]
      );

      const auditContext = {
        performedBy: 'admin-user',
        ipAddress: '192.168.1.1',
        userAgent: 'admin-tool'
      };

      await resolver.unlinkProvider(vi_user_id, 'discord', auditContext);

      const providers = await resolver.getLinkedProviders(vi_user_id);
      expect(providers).toHaveLength(1);
      expect(providers[0].provider).toBe('sovereign');

      // Verify audit log
      const auditLog = await pool.query(
        `SELECT * FROM identity_audit_log 
        WHERE vi_user_id = $1 AND action = 'unlink' AND provider = 'discord'`,
        [vi_user_id]
      );
      expect(auditLog.rows).toHaveLength(1);
      expect(auditLog.rows[0].performed_by).toBe('admin-user');
      expect(auditLog.rows[0].ip_address).toBe('192.168.1.1');
      expect(auditLog.rows[0].user_agent).toBe('admin-tool');
    });

    it('should prevent unlinking last provider', async () => {
      const vi_user_id = randomUUID();

      await pool.query(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id)
        VALUES ($1, $2, $3)`,
        [vi_user_id, 'console', 'console_last']
      );

      await expect(resolver.unlinkProvider(vi_user_id, 'console')).rejects.toThrow(
        'Cannot unlink last provider'
      );
    });
  });

  describe('migrateUser', () => {
    it('should migrate existing user to identity map', async () => {
      const existingUserId = 'old-user-id-123';

      const vi_user_id = await resolver.migrateUser(
        existingUserId,
        'sovereign',
        'migrated_user'
      );

      expect(vi_user_id).toBeDefined();

      // Verify it's in the database
      const result = await pool.query(
        `SELECT * FROM user_identity_map WHERE vi_user_id = $1`,
        [vi_user_id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].provider).toBe('sovereign');
      expect(result.rows[0].provider_user_id).toBe('migrated_user');
    });
  });

  describe('Cross-Client Memory Consistency', () => {
    it('should return same vi_user_id for Discord and Sovereign users', async () => {
      // User 1: Discord login with unique ID
      const discordContext: IdentityContext = {
        provider: 'discord',
        provider_user_id: `discord_cross_${randomUUID()}`,
      };

      const discordIdentity = await resolver.resolveIdentity(discordContext);

      // User 1: Later links Sovereign account with unique ID
      const sovereignContext: IdentityContext = {
        provider: 'sovereign',
        provider_user_id: `sov_cross_${randomUUID()}`,
      };

      const sovereignIdentity = await resolver.linkProvider(
        discordIdentity.vi_user_id,
        sovereignContext
      );

      // Verify same vi_user_id
      expect(discordIdentity.vi_user_id).toBe(sovereignIdentity.vi_user_id);

      // Verify both providers link back to same user
      const linkedProviders = await resolver.getLinkedProviders(discordIdentity.vi_user_id);
      expect(linkedProviders).toHaveLength(2);
      expect(linkedProviders.map((p: IdentityContext) => p.provider).sort()).toEqual(['discord', 'sovereign']);
    });
  });
});
