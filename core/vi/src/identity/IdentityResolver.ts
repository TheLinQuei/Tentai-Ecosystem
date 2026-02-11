/**
 * Identity Resolver
 * Purpose: Global identity mapping across all clients
 * Constraint: ONE user → ONE vi_user_id (canonical), regardless of provider
 * 
 * This is the critical hub for Phase 1 implementation.
 * Every client must normalize through this before calling /v1/chat.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../telemetry/logger.js';

/**
 * Supported identity providers
 */
export type IdentityProvider = 'sovereign' | 'discord' | 'astralis' | 'console' | 'guest';

/**
 * Context required to resolve or create an identity
 */
export interface IdentityContext {
  provider: IdentityProvider;
  provider_user_id: string;
  metadata?: Record<string, any>;
  email?: string;
  username?: string;
}

/**
 * Resolved identity result
 */
export interface ResolvedIdentity {
  vi_user_id: string;
  provider: IdentityProvider;
  provider_user_id: string;
  created_at: Date;
  metadata: Record<string, any>;
}

/**
 * Identity Resolver: Maps all clients to canonical vi_user_id
 */
export class IdentityResolver {
  private readonly logger = getLogger();

  constructor(private readonly pool: Pool) {}

  /**
   * Resolve or create identity across clients
   * 
   * Behavior:
   * - If provider + provider_user_id exists → return existing vi_user_id
   * - If not exists → create new vi_user_id
   * - Never creates duplicate identities (UNIQUE constraint enforced)
   */
  async resolveIdentity(context: IdentityContext): Promise<ResolvedIdentity> {
    this.logger.debug(
      {
        provider: context.provider,
        provider_user_id: context.provider_user_id,
      },
      '[IdentityResolver] Resolving identity'
    );

    try {
      // Try to find existing mapping
      const existing = await this.pool.query<ResolvedIdentity>(
        `SELECT 
          vi_user_id, 
          provider, 
          provider_user_id, 
          created_at, 
          metadata
        FROM user_identity_map
        WHERE provider = $1 AND provider_user_id = $2`,
        [context.provider, context.provider_user_id]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        this.logger.debug(
          {
            vi_user_id: row.vi_user_id,
            provider: context.provider,
          },
          '[IdentityResolver] Found existing identity mapping'
        );
        
        return {
          vi_user_id: row.vi_user_id,
          provider: row.provider,
          provider_user_id: row.provider_user_id,
          created_at: row.created_at,
          metadata: row.metadata || {},
        };
      }

      // Create new identity
      const vi_user_id = uuidv4();
      const metadata = context.metadata || {};
      
      if (context.email) {
        metadata.email = context.email;
      }
      if (context.username) {
        metadata.username = context.username;
      }

      const created = await this.pool.query<ResolvedIdentity>(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING vi_user_id, provider, provider_user_id, created_at, metadata`,
        [vi_user_id, context.provider, context.provider_user_id, metadata]
      );

      const row = created.rows[0];
      this.logger.info(
        {
          vi_user_id: row.vi_user_id,
          provider: context.provider,
        },
        '[IdentityResolver] Created new identity mapping'
      );

      return row;
    } catch (error) {
      this.logger.error(
        {
          error,
          provider: context.provider,
          provider_user_id: context.provider_user_id,
        },
        '[IdentityResolver] Failed to resolve identity'
      );
      throw error;
    }
  }

  /**
   * Get all providers linked to a vi_user_id
   * Useful for: understanding which clients a user has logged into
   */
  async getLinkedProviders(vi_user_id: string): Promise<IdentityContext[]> {
    const result = await this.pool.query<IdentityContext>(
      `SELECT provider, provider_user_id, metadata
       FROM user_identity_map
       WHERE vi_user_id = $1
       ORDER BY created_at ASC`,
      [vi_user_id]
    );

    return result.rows;
  }

  /**
   * Link a new provider to existing vi_user_id
   * Use case: User logged into Discord, now wants to link Sovereign account
   */
  async linkProvider(
    vi_user_id: string,
    context: IdentityContext,
    auditContext?: { performedBy?: string; ipAddress?: string; userAgent?: string }
  ): Promise<ResolvedIdentity> {
    this.logger.info(
      {
        vi_user_id,
        new_provider: context.provider,
      },
      '[IdentityResolver] Linking new provider to existing user'
    );

    try {
      // Check if this provider identity already exists
      const existing = await this.pool.query<ResolvedIdentity>(
        `SELECT vi_user_id FROM user_identity_map
        WHERE provider = $1 AND provider_user_id = $2`,
        [context.provider, context.provider_user_id]
      );

      if (existing.rows.length > 0) {
        throw new Error(
          `Provider ${context.provider}:${context.provider_user_id} already linked to ${existing.rows[0].vi_user_id}`
        );
      }

      const metadata = context.metadata || {};
      const result = await this.pool.query<ResolvedIdentity>(
        `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING vi_user_id, provider, provider_user_id, created_at, metadata`,
        [vi_user_id, context.provider, context.provider_user_id, metadata]
      );

      // Audit log
      await this.pool.query(
        `INSERT INTO identity_audit_log (vi_user_id, action, provider, provider_user_id, metadata, performed_by, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          vi_user_id,
          'link',
          context.provider,
          context.provider_user_id,
          metadata,
          auditContext?.performedBy || 'system',
          auditContext?.ipAddress || null,
          auditContext?.userAgent || null,
        ]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error(
        {
          error,
          vi_user_id,
          provider: context.provider,
        },
        '[IdentityResolver] Failed to link provider'
      );
      throw error;
    }
  }

  /**
   * Unlink a provider from vi_user_id
   * Use case: User wants to disconnect Discord
   * Safety: Must leave at least one provider linked
   */
  async unlinkProvider(
    vi_user_id: string,
    provider: IdentityProvider,
    auditContext?: { performedBy?: string; ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    this.logger.info(
      {
        vi_user_id,
        provider,
      },
      '[IdentityResolver] Unlinking provider'
    );

    try {
      // Check how many providers this user has
      const countResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM user_identity_map WHERE vi_user_id = $1`,
        [vi_user_id]
      );

      const count = parseInt(countResult.rows[0].count, 10);
      if (count <= 1) {
        throw new Error('Cannot unlink last provider for user');
      }

      // Get provider_user_id before deletion (for audit log)
      const providerRecord = await this.pool.query<{ provider_user_id: string }>(
        `SELECT provider_user_id FROM user_identity_map
        WHERE vi_user_id = $1 AND provider = $2`,
        [vi_user_id, provider]
      );

      if (providerRecord.rows.length === 0) {
        throw new Error(`Provider ${provider} not found for user ${vi_user_id}`);
      }

      const provider_user_id = providerRecord.rows[0].provider_user_id;

      await this.pool.query(
        `DELETE FROM user_identity_map
        WHERE vi_user_id = $1 AND provider = $2`,
        [vi_user_id, provider]
      );

      // Audit log
      await this.pool.query(
        `INSERT INTO identity_audit_log (vi_user_id, action, provider, provider_user_id, performed_by, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          vi_user_id,
          'unlink',
          provider,
          provider_user_id,
          auditContext?.performedBy || 'system',
          auditContext?.ipAddress || null,
          auditContext?.userAgent || null,
        ]
      );

      this.logger.info(
        {
          vi_user_id,
          provider,
        },
        '[IdentityResolver] Provider unlinked successfully'
      );
    } catch (error) {
      this.logger.error(
        {
          error,
          vi_user_id,
          provider,
        },
        '[IdentityResolver] Failed to unlink provider'
      );
      throw error;
    }
  }

  /**
   * Migration helper: Bulk link existing users to identity map
   * Use case: Migrating existing user_id to new vi_user_id system
   */
  async migrateUser(
    existing_user_id: string,
    provider: IdentityProvider,
    provider_user_id: string
  ): Promise<string> {
    const vi_user_id = uuidv4();

    await this.pool.query(
      `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [vi_user_id, provider, provider_user_id]
    );

    this.logger.info(
      {
        existing_user_id,
        vi_user_id,
        provider,
      },
      '[IdentityResolver] User migrated to identity map'
    );

    return vi_user_id;
  }
}
