/**
 * UserRelationshipRepository
 * Database access layer for user_relationships table
 * 
 * RULES:
 * - Default is always 'public'
 * - getOrCreateDefault ensures every user has a relationship record
 * - Updates require explicit authorization (not auto-inferred from chat)
 */

import { Pool } from 'pg';
import type {
  RelationshipType,
  TonePreference,
  VoiceProfile,
  InteractionMode,
  UserRelationshipRow,
} from '../types/relationship.js';
import { DEFAULT_RELATIONSHIP_CONTEXT, validateTrustLevel } from '../types/relationship.js';

export class UserRelationshipRepository {
  constructor(private pool: Pool) {}

  /**
   * Get relationship row for user, or create default public row if missing
   * This is the primary method used by RelationshipResolver
   */
  async getOrCreateDefault(vi_user_id: string): Promise<{
    row: UserRelationshipRow;
    was_created: boolean;
  }> {
    // Try to get existing row
    const existingResult = await this.pool.query<UserRelationshipRow>(
      `SELECT * FROM user_relationships WHERE vi_user_id = $1`,
      [vi_user_id]
    );

    if (existingResult.rows.length > 0) {
      return {
        row: existingResult.rows[0],
        was_created: false,
      };
    }

    // Create default public row
    const insertResult = await this.pool.query<UserRelationshipRow>(
      `INSERT INTO user_relationships (
        vi_user_id,
        relationship_type,
        trust_level,
        tone_preference,
        voice_profile,
        interaction_mode
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        vi_user_id,
        DEFAULT_RELATIONSHIP_CONTEXT.relationship_type,
        DEFAULT_RELATIONSHIP_CONTEXT.trust_level,
        DEFAULT_RELATIONSHIP_CONTEXT.tone_preference,
        DEFAULT_RELATIONSHIP_CONTEXT.voice_profile,
        DEFAULT_RELATIONSHIP_CONTEXT.interaction_mode,
      ]
    );

    return {
      row: insertResult.rows[0],
      was_created: true,
    };
  }

  /**
   * Get relationship row without creating (returns null if missing)
   */
  async get(vi_user_id: string): Promise<UserRelationshipRow | null> {
    const result = await this.pool.query<UserRelationshipRow>(
      `SELECT * FROM user_relationships WHERE vi_user_id = $1`,
      [vi_user_id]
    );

    return result.rows[0] || null;
  }

  /**
   * Update relationship attributes
   * AUTHORIZATION REQUIRED - do not call from chat content inference
   */
  async update(
    vi_user_id: string,
    updates: Partial<{
      relationship_type: RelationshipType;
      trust_level: number;
      tone_preference: TonePreference;
      voice_profile: VoiceProfile;
      interaction_mode: InteractionMode;
    }>
  ): Promise<UserRelationshipRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (updates.relationship_type !== undefined) {
      fields.push(`relationship_type = $${paramCount++}`);
      values.push(updates.relationship_type);
    }

    if (updates.trust_level !== undefined) {
      fields.push(`trust_level = $${paramCount++}`);
      values.push(validateTrustLevel(updates.trust_level));
    }

    if (updates.tone_preference !== undefined) {
      fields.push(`tone_preference = $${paramCount++}`);
      values.push(updates.tone_preference);
    }

    if (updates.voice_profile !== undefined) {
      fields.push(`voice_profile = $${paramCount++}`);
      values.push(updates.voice_profile);
    }

    if (updates.interaction_mode !== undefined) {
      fields.push(`interaction_mode = $${paramCount++}`);
      values.push(updates.interaction_mode);
    }

    if (fields.length === 0) {
      // No updates provided, just return current row
      const current = await this.get(vi_user_id);
      if (!current) {
        throw new Error(`No relationship record exists for user ${vi_user_id}`);
      }
      return current;
    }

    values.push(vi_user_id);

    const result = await this.pool.query<UserRelationshipRow>(
      `UPDATE user_relationships
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE vi_user_id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`No relationship record exists for user ${vi_user_id}`);
    }

    return result.rows[0];
  }

  /**
   * Delete relationship record (administrative action only)
   */
  async delete(vi_user_id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_relationships WHERE vi_user_id = $1`,
      [vi_user_id]
    );
  }

  /**
   * Batch get relationships for multiple users
   */
  async batchGet(vi_user_ids: string[]): Promise<Map<string, UserRelationshipRow>> {
    if (vi_user_ids.length === 0) {
      return new Map();
    }

    const result = await this.pool.query<UserRelationshipRow>(
      `SELECT * FROM user_relationships WHERE vi_user_id = ANY($1)`,
      [vi_user_ids]
    );

    const map = new Map<string, UserRelationshipRow>();
    for (const row of result.rows) {
      map.set(row.vi_user_id, row);
    }

    return map;
  }
}
