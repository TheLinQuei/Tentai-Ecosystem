/**
 * Safety Profile Repository
 * Manages user-configurable safety settings
 */

import { Pool } from 'pg';

export interface SafetyProfile {
  profile_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  safety_level: 'maximum' | 'balanced' | 'minimal';
  context_sensitivity: boolean;
  refusal_explanation: 'detailed' | 'brief';
  appeal_process: boolean;
  custom_rules: Array<{
    rule_type: string;
    condition: string;
    action: string;
  }>;
}

export class SafetyProfileRepository {
  constructor(private pool: Pool) {}

  async getByUserId(userId: string): Promise<SafetyProfile | null> {
    const query = `
      SELECT profile_id, user_id, created_at, updated_at,
             safety_level, context_sensitivity, refusal_explanation,
             appeal_process, custom_rules
      FROM safety_profiles
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      profile_id: row.profile_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      safety_level: row.safety_level,
      context_sensitivity: row.context_sensitivity,
      refusal_explanation: row.refusal_explanation,
      appeal_process: row.appeal_process,
      custom_rules: row.custom_rules || [],
    };
  }

  async createOrUpdate(userId: string, settings: {
    safety_level?: 'maximum' | 'balanced' | 'minimal';
    context_sensitivity?: boolean;
    refusal_explanation?: 'detailed' | 'brief';
    appeal_process?: boolean;
    custom_rules?: Array<{
      rule_type: string;
      condition: string;
      action: string;
    }>;
  }): Promise<SafetyProfile> {
    const query = `
      INSERT INTO safety_profiles (
        user_id, safety_level, context_sensitivity,
        refusal_explanation, appeal_process, custom_rules
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        safety_level = COALESCE($2, safety_profiles.safety_level),
        context_sensitivity = COALESCE($3, safety_profiles.context_sensitivity),
        refusal_explanation = COALESCE($4, safety_profiles.refusal_explanation),
        appeal_process = COALESCE($5, safety_profiles.appeal_process),
        custom_rules = COALESCE($6, safety_profiles.custom_rules),
        updated_at = now()
      RETURNING profile_id, user_id, created_at, updated_at,
                safety_level, context_sensitivity, refusal_explanation,
                appeal_process, custom_rules
    `;

    const result = await this.pool.query(query, [
      userId,
      settings.safety_level || null,
      settings.context_sensitivity !== undefined ? settings.context_sensitivity : null,
      settings.refusal_explanation || null,
      settings.appeal_process !== undefined ? settings.appeal_process : null,
      settings.custom_rules ? JSON.stringify(settings.custom_rules) : null,
    ]);

    const row = result.rows[0];
    return {
      profile_id: row.profile_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      safety_level: row.safety_level,
      context_sensitivity: row.context_sensitivity,
      refusal_explanation: row.refusal_explanation,
      appeal_process: row.appeal_process,
      custom_rules: row.custom_rules || [],
    };
  }

  async delete(userId: string): Promise<boolean> {
    const query = `DELETE FROM safety_profiles WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rowCount > 0;
  }
}
