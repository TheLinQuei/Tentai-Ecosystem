/**
 * RelationshipRepository
 * Purpose: Data access layer for relationship context persistence
 * Manages: CRUD operations for user relationship profiles
 */

import type { Pool } from 'pg';
import { getLogger } from '../telemetry/logger.js';
import type { RelationshipContext } from './RelationshipResolver.js';

export class RelationshipRepository {
  private readonly logger = getLogger();

  constructor(private readonly pool: Pool) {}

  /**
   * Load relationship context for a user
   */
  async load(userId: string): Promise<RelationshipContext | null> {
    try {
      const result = await this.pool.query(
        `SELECT relationship_type, trust_level, interaction_mode, tone_preference, voice_profile
         FROM user_profiles
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        type: row.relationship_type || 'normal',
        trust_level: row.trust_level ?? 0,
        interaction_mode: row.interaction_mode || 'assistant',
        tone_preference: row.tone_preference,
        voice_profile: row.voice_profile || 'LUXE_ORIGIN',
      };
    } catch (error) {
      this.logger.error({ userId, error }, '[RelationshipRepository] Load failed');
      return null;
    }
  }

  /**
   * Save/update relationship context for a user
   */
  async save(userId: string, relationship: Partial<RelationshipContext>): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE user_profiles
         SET relationship_type = COALESCE($2, relationship_type),
             trust_level = COALESCE($3, trust_level),
             interaction_mode = COALESCE($4, interaction_mode),
             tone_preference = COALESCE($5, tone_preference),
             voice_profile = COALESCE($6, voice_profile),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING user_id`,
        [
          userId,
          relationship.type,
          relationship.trust_level,
          relationship.interaction_mode,
          relationship.tone_preference,
          relationship.voice_profile,
        ]
      );

      if (result.rows.length === 0) {
        // User not found, try insert
        await this.pool.query(
          `INSERT INTO user_profiles (user_id, relationship_type, trust_level, interaction_mode, tone_preference, voice_profile)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE
           SET relationship_type = COALESCE($2, user_profiles.relationship_type),
               trust_level = COALESCE($3, user_profiles.trust_level),
               interaction_mode = COALESCE($4, user_profiles.interaction_mode),
               tone_preference = COALESCE($5, user_profiles.tone_preference),
               voice_profile = COALESCE($6, user_profiles.voice_profile),
               updated_at = CURRENT_TIMESTAMP`,
          [
            userId,
            relationship.type || 'normal',
            relationship.trust_level ?? 0,
            relationship.interaction_mode || 'assistant',
            relationship.tone_preference,
            relationship.voice_profile || 'LUXE_ORIGIN',
          ]
        );
      }

      this.logger.debug({ userId, relationship }, '[RelationshipRepository] Saved');
      return true;
    } catch (error) {
      this.logger.error({ userId, relationship, error }, '[RelationshipRepository] Save failed');
      return false;
    }
  }

  /**
   * Increment trust level for a user (e.g., after successful interaction)
   */
  async incrementTrust(userId: string, amount: number = 5, max: number = 100): Promise<boolean> {
    try {
      await this.pool.query(
        `UPDATE user_profiles
         SET trust_level = LEAST(trust_level + $2, $3),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, amount, max]
      );

      this.logger.debug({ userId, amount }, '[RelationshipRepository] Trust incremented');
      return true;
    } catch (error) {
      this.logger.error({ userId, amount, error }, '[RelationshipRepository] Trust increment failed');
      return false;
    }
  }

  /**
   * Update relationship type
   */
  async updateRelationshipType(userId: string, type: string): Promise<boolean> {
    const validTypes = ['owner', 'trusted', 'normal', 'restricted'];
    if (!validTypes.includes(type)) {
      this.logger.warn({ userId, type }, '[RelationshipRepository] Invalid type');
      return false;
    }

    try {
      await this.pool.query(
        `UPDATE user_profiles
         SET relationship_type = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, type]
      );

      this.logger.debug({ userId, type }, '[RelationshipRepository] Relationship type updated');
      return true;
    } catch (error) {
      this.logger.error({ userId, type, error }, '[RelationshipRepository] Type update failed');
      return false;
    }
  }

  /**
   * Query users by relationship type
   */
  async findByRelationshipType(type: string, limit: number = 100): Promise<Array<{ user_id: string; trust_level: number }>> {
    try {
      const result = await this.pool.query(
        `SELECT user_id, trust_level
         FROM user_profiles
         WHERE relationship_type = $1
         LIMIT $2`,
        [type, limit]
      );

      return result.rows;
    } catch (error) {
      this.logger.error({ type, error }, '[RelationshipRepository] Query by type failed');
      return [];
    }
  }

  /**
   * Get aggregate stats
   */
  async getStats(): Promise<{
    total_users: number;
    owner_count: number;
    trusted_count: number;
    normal_count: number;
    restricted_count: number;
    avg_trust_level: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_users,
          SUM(CASE WHEN relationship_type = 'owner' THEN 1 ELSE 0 END) as owner_count,
          SUM(CASE WHEN relationship_type = 'trusted' THEN 1 ELSE 0 END) as trusted_count,
          SUM(CASE WHEN relationship_type = 'normal' THEN 1 ELSE 0 END) as normal_count,
          SUM(CASE WHEN relationship_type = 'restricted' THEN 1 ELSE 0 END) as restricted_count,
          AVG(trust_level) as avg_trust_level
        FROM user_profiles
      `);

      const row = result.rows[0];
      return {
        total_users: parseInt(row.total_users || '0'),
        owner_count: parseInt(row.owner_count || '0'),
        trusted_count: parseInt(row.trusted_count || '0'),
        normal_count: parseInt(row.normal_count || '0'),
        restricted_count: parseInt(row.restricted_count || '0'),
        avg_trust_level: parseFloat(row.avg_trust_level || '0'),
      };
    } catch (error) {
      this.logger.error({ error }, '[RelationshipRepository] Stats query failed');
      return {
        total_users: 0,
        owner_count: 0,
        trusted_count: 0,
        normal_count: 0,
        restricted_count: 0,
        avg_trust_level: 0,
      };
    }
  }

  /**
   * Increment interaction count for relationship tracking
   */
  async incrementInteraction(userId: string, relationshipType: string): Promise<boolean> {
    try {
      await this.pool.query(
        `UPDATE user_profiles
         SET interaction_count = interaction_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );
      return true;
    } catch (error) {
      this.logger.debug({ userId, error }, '[RelationshipRepository] Increment failed');
      return false;
    }
  }
}
