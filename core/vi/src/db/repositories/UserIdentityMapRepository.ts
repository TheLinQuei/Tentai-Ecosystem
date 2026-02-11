/**
 * User Identity Map Repository
 * Purpose: Database operations for user_identity_map table
 * Constraint: UNIQUE(provider, provider_user_id)
 */

import { Pool } from 'pg';

export interface UserIdentityRecord {
  vi_user_id: string;
  provider: 'sovereign' | 'discord' | 'astralis' | 'console' | 'guest';
  provider_user_id: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export class UserIdentityMapRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Find vi_user_id by provider identity
   */
  async findByProviderIdentity(
    provider: string,
    provider_user_id: string
  ): Promise<UserIdentityRecord | null> {
    const result = await this.pool.query<UserIdentityRecord>(
      `SELECT vi_user_id, provider, provider_user_id, metadata, created_at
       FROM user_identity_map
       WHERE provider = $1 AND provider_user_id = $2`,
      [provider, provider_user_id]
    );

    return result.rows[0] || null;
  }

  /**
   * Find all identities for a vi_user_id
   */
  async findAllIdentitiesForUser(vi_user_id: string): Promise<UserIdentityRecord[]> {
    const result = await this.pool.query<UserIdentityRecord>(
      `SELECT vi_user_id, provider, provider_user_id, metadata, created_at
       FROM user_identity_map
       WHERE vi_user_id = $1
       ORDER BY created_at ASC`,
      [vi_user_id]
    );

    return result.rows;
  }

  /**
   * Create new identity mapping
   */
  async create(record: Omit<UserIdentityRecord, 'created_at'>): Promise<UserIdentityRecord> {
    const result = await this.pool.query<UserIdentityRecord>(
      `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING vi_user_id, provider, provider_user_id, metadata, created_at`,
      [
        record.vi_user_id,
        record.provider,
        record.provider_user_id,
        record.metadata || {},
      ]
    );

    return result.rows[0];
  }

  /**
   * Update metadata for identity
   */
  async updateMetadata(
    vi_user_id: string,
    provider: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE user_identity_map
       SET metadata = $1
       WHERE vi_user_id = $2 AND provider = $3`,
      [metadata, vi_user_id, provider]
    );
  }

  /**
   * Delete identity mapping
   */
  async delete(vi_user_id: string, provider: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_identity_map
       WHERE vi_user_id = $1 AND provider = $2`,
      [vi_user_id, provider]
    );
  }

  /**
   * Check identity exists
   */
  async exists(provider: string, provider_user_id: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM user_identity_map
        WHERE provider = $1 AND provider_user_id = $2
       ) as exists`,
      [provider, provider_user_id]
    );

    return result.rows[0].exists;
  }

  /**
   * Count identities for a user
   */
  async countIdentitiesForUser(vi_user_id: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM user_identity_map WHERE vi_user_id = $1`,
      [vi_user_id]
    );

    return parseInt(result.rows[0].count, 10);
  }
}
