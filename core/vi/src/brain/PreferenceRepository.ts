import { Pool, QueryResult } from 'pg';
import { randomUUID } from 'crypto';

/**
 * PHASE 3: Preference Persistence Repository
 * 
 * Manages cross-session personality and behavior preferences.
 * 
 * Stores:
 * - Tone corrections (direct, elegant, playful, warm)
 * - Interaction mode (assistant, companion, operator, lorekeeper)
 * - Relationship cues (owner, trusted, restricted)
 * - Response preferences (concise, detailed, no apologies, no disclaimers)
 * - Lore mode default
 * 
 * These survive session boundaries and are loaded automatically.
 */

export interface UserPreference {
  user_id?: string;
  id: string;
  vi_user_id: string;
  
  // Tone
  tone_preference?: 'direct' | 'elegant' | 'playful' | 'warm';
  tone_correction_count: number;
  
  // Interaction Mode
  interaction_mode: 'assistant' | 'companion' | 'operator' | 'lorekeeper';
  interaction_mode_locked: boolean;
  
  // Relationship Cues
  relationship_cue_owner: boolean;
  relationship_cue_trusted: boolean;
  relationship_cue_restricted: boolean;
  
  // Response Preferences
  prefer_concise: boolean;
  prefer_detailed: boolean;
  no_apologies: boolean;
  no_disclaimers: boolean;
  
  // Lore Mode
  default_lore_mode: boolean;
  
  // Metadata
  created_at: string;
  updated_at: string;
  last_applied_session_id?: string;
  correction_history: Array<{ timestamp: string; type: string; detail: string }>;
}

export interface PreferenceAuditEntry {
  id: string;
  vi_user_id: string;
  user_id?: string;
  change_type: 'tone_correction' | 'mode_change' | 'relationship_cue' | 'preference_toggle';
  old_value?: Record<string, any>;
  new_value?: Record<string, any>;
  reason?: string;
  session_id?: string;
  created_at: string;
}

export class PreferenceRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Load user preferences by vi_user_id
   * Returns defaults if no preferences exist yet
   */
  async load(vi_user_id: string): Promise<UserPreference> {
    const result = await this.pool.query(
      `SELECT * FROM user_preferences
       WHERE vi_user_id = $1 OR user_id = $1
       ORDER BY (vi_user_id = $1) DESC
       LIMIT 1`,
      [vi_user_id]
    );

    if (result.rows.length > 0) {
      return result.rows[0] as UserPreference;
    }

    // Return default preferences
    return {
      id: randomUUID(),
      vi_user_id,
       tone_preference: null,
      tone_correction_count: 0,
      interaction_mode: 'assistant',
      interaction_mode_locked: false,
      relationship_cue_owner: false,
      relationship_cue_trusted: false,
      relationship_cue_restricted: false,
      prefer_concise: false,
      prefer_detailed: false,
      no_apologies: false,
      no_disclaimers: false,
      default_lore_mode: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      correction_history: [],
    };
  }

  /**
   * Save or update preferences
   */
  async save(prefs: UserPreference): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_preferences (
        user_id, vi_user_id, tone_preference, tone_correction_count, interaction_mode,
        interaction_mode_locked, relationship_cue_owner, relationship_cue_trusted,
        relationship_cue_restricted, prefer_concise, prefer_detailed, no_apologies,
        no_disclaimers, default_lore_mode, created_at, updated_at,
        last_applied_session_id, correction_history
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (vi_user_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        tone_preference = EXCLUDED.tone_preference,
        tone_correction_count = EXCLUDED.tone_correction_count,
        interaction_mode = EXCLUDED.interaction_mode,
        interaction_mode_locked = EXCLUDED.interaction_mode_locked,
        relationship_cue_owner = EXCLUDED.relationship_cue_owner,
        relationship_cue_trusted = EXCLUDED.relationship_cue_trusted,
        relationship_cue_restricted = EXCLUDED.relationship_cue_restricted,
        prefer_concise = EXCLUDED.prefer_concise,
        prefer_detailed = EXCLUDED.prefer_detailed,
        no_apologies = EXCLUDED.no_apologies,
        no_disclaimers = EXCLUDED.no_disclaimers,
        default_lore_mode = EXCLUDED.default_lore_mode,
        updated_at = EXCLUDED.updated_at,
        last_applied_session_id = EXCLUDED.last_applied_session_id,
        correction_history = EXCLUDED.correction_history`,
      [
        prefs.user_id || prefs.vi_user_id,
        prefs.vi_user_id,
        prefs.tone_preference || null,
        prefs.tone_correction_count,
        prefs.interaction_mode,
        prefs.interaction_mode_locked,
        prefs.relationship_cue_owner,
        prefs.relationship_cue_trusted,
        prefs.relationship_cue_restricted,
        prefs.prefer_concise,
        prefs.prefer_detailed,
        prefs.no_apologies,
        prefs.no_disclaimers,
        prefs.default_lore_mode,
        prefs.created_at,
        new Date().toISOString(),
        prefs.last_applied_session_id || null,
        JSON.stringify(prefs.correction_history),
      ]
    );
  }

  /**
   * Alias used by MemoryOrchestrator (returns full preference object)
   */
  async getPreferences(vi_user_id: string): Promise<UserPreference> {
    return this.load(vi_user_id);
  }

  /**
   * Apply a tone correction (user feedback)
   */
  async applyToneCorrection(
    vi_user_id: string,
    tone: 'direct' | 'elegant' | 'playful' | 'warm',
    reason?: string,
    session_id?: string
  ): Promise<void> {
    const prefs = await this.load(vi_user_id);

    const oldValue = { tone_preference: prefs.tone_preference };
    prefs.tone_preference = tone;
    prefs.tone_correction_count += 1;
    prefs.correction_history.push({
      timestamp: new Date().toISOString(),
      type: 'tone_correction',
      detail: `Changed to ${tone}`,
    });

    await this.save(prefs);

    // Audit log
    await this.logAudit({
      vi_user_id,
      change_type: 'tone_correction',
      old_value: oldValue,
      new_value: { tone_preference: tone },
      reason: reason || 'User feedback',
      session_id,
    });
  }

  /**
   * Set interaction mode
   */
  async setInteractionMode(
    vi_user_id: string,
    mode: 'assistant' | 'companion' | 'operator' | 'lorekeeper',
    locked: boolean = false,
    reason?: string,
    session_id?: string
  ): Promise<void> {
    const prefs = await this.load(vi_user_id);

    const oldValue = {
      interaction_mode: prefs.interaction_mode,
      interaction_mode_locked: prefs.interaction_mode_locked,
    };

    prefs.interaction_mode = mode;
    prefs.interaction_mode_locked = locked;
    prefs.correction_history.push({
      timestamp: new Date().toISOString(),
      type: 'mode_change',
      detail: `Changed to ${mode}${locked ? ' (locked)' : ''}`,
    });

    await this.save(prefs);

    // Audit log
    await this.logAudit({
      vi_user_id,
      change_type: 'mode_change',
      old_value: oldValue,
      new_value: { interaction_mode: mode, interaction_mode_locked: locked },
      reason: reason || 'User request',
      session_id,
    });
  }

  /**
   * Alias for setInteractionMode (used by detectCorrections flow)
   */
  async applyInteractionModeChange(
    vi_user_id: string,
    mode: 'assistant' | 'companion' | 'operator' | 'lorekeeper',
    reason?: string,
    session_id?: string
  ): Promise<void> {
    return this.setInteractionMode(vi_user_id, mode, false, reason, session_id);
  }

  /**
   * Set relationship cue
   */
  async setRelationshipCue(
    vi_user_id: string,
    cue: 'owner' | 'trusted' | 'restricted',
    value: boolean = true,
    reason?: string,
    session_id?: string
  ): Promise<void> {
    const prefs = await this.load(vi_user_id);

    const cueMap: Record<string, keyof UserPreference> = {
      owner: 'relationship_cue_owner',
      trusted: 'relationship_cue_trusted',
      restricted: 'relationship_cue_restricted',
    };

    const key = cueMap[cue] as keyof UserPreference;
    const oldValue = { [key]: prefs[key] };

    (prefs[key] as boolean) = value;
    prefs.correction_history.push({
      timestamp: new Date().toISOString(),
      type: 'relationship_cue',
      detail: `${value ? 'Set' : 'Unset'} ${cue} cue`,
    });

    await this.save(prefs);

    // Audit log
    await this.logAudit({
      vi_user_id,
      change_type: 'relationship_cue',
      old_value: oldValue,
      new_value: { [key]: value },
      reason: reason || 'System detection',
      session_id,
    });
  }

  /**
   * Alias for setRelationshipCue (used by detectCorrections flow)
   */
  async applyRelationshipCue(
    vi_user_id: string,
    cue: 'owner' | 'trusted' | 'restricted',
    reason?: string,
    session_id?: string
  ): Promise<void> {
    return this.setRelationshipCue(vi_user_id, cue, true, reason, session_id);
  }

  /**
   * Set response preference flag
   */
  async setResponsePreference(
    vi_user_id: string,
    prefType: 'concise' | 'detailed' | 'no_apologies' | 'no_disclaimers',
    value: boolean = true,
    reason?: string,
    session_id?: string
  ): Promise<void> {
    const prefs = await this.load(vi_user_id);

    const prefMap: Record<string, keyof UserPreference> = {
      concise: 'prefer_concise',
      detailed: 'prefer_detailed',
      no_apologies: 'no_apologies',
      no_disclaimers: 'no_disclaimers',
    };

    const key = prefMap[prefType] as keyof UserPreference;
    const oldValue = { [key]: prefs[key] };

    (prefs[key] as boolean) = value;
    prefs.correction_history.push({
      timestamp: new Date().toISOString(),
      type: 'preference',
      detail: `${value ? 'Enabled' : 'Disabled'} ${prefType}`,
    });

    await this.save(prefs);

    // Audit log
    await this.logAudit({
      vi_user_id,
      change_type: 'preference_toggle',
      old_value: oldValue,
      new_value: { [key]: value },
      reason: reason || 'User correction',
      session_id,
    });
  }

  /**
   * Alias for setResponsePreference (used by detectCorrections flow)
   */
  async applyResponsePreference(
    vi_user_id: string,
    prefType: 'concise' | 'detailed' | 'no_apologies' | 'no_disclaimers',
    reason?: string,
    session_id?: string
  ): Promise<void> {
    return this.setResponsePreference(vi_user_id, prefType, true, reason, session_id);
  }

  /**
   * Set lore mode default
   */
  async setDefaultLoreMode(
    vi_user_id: string,
    enabled: boolean = true,
    session_id?: string
  ): Promise<void> {
    const prefs = await this.load(vi_user_id);
    prefs.default_lore_mode = enabled;

    await this.save(prefs);

    await this.logAudit({
      vi_user_id,
      change_type: 'preference_toggle',
      old_value: { default_lore_mode: !enabled },
      new_value: { default_lore_mode: enabled },
      reason: 'Lore mode toggle',
      session_id,
    });
  }

  /**
   * Log preference change to audit table
   */
  private async logAudit(entry: Omit<PreferenceAuditEntry, 'id' | 'created_at'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO preference_audit_log (user_id, vi_user_id, preference_type, change_type, old_value, new_value, reason, session_id, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.vi_user_id,
        entry.vi_user_id,
        entry.change_type,
        entry.change_type,
        entry.old_value ? JSON.stringify(entry.old_value) : null,
        entry.new_value ? JSON.stringify(entry.new_value) : null,
        entry.reason || null,
        entry.session_id || null,
        1,
      ]
    );
  }

  /**
   * Get audit history for user
   */
  async getAuditHistory(
    vi_user_id: string,
    limit: number = 50
  ): Promise<PreferenceAuditEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM preference_audit_log
       WHERE vi_user_id = $1 OR user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [vi_user_id, limit]
    );

    return result.rows.map((row: any) => ({
      ...row,
      old_value: row.old_value ? JSON.parse(row.old_value) : undefined,
      new_value: row.new_value ? JSON.parse(row.new_value) : undefined,
    }));
  }

  /**
   * Reset preferences for a user (returns to defaults)
   */
  async reset(vi_user_id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_preferences WHERE vi_user_id = $1 OR user_id = $1`,
      [vi_user_id]
    );
  }

  /**
   * Get preference stats by change type
   */
  async getStats(vi_user_id: string): Promise<Record<string, number>> {
    const result = await this.pool.query(
      `SELECT change_type, COUNT(*) as count FROM preference_audit_log
       WHERE vi_user_id = $1
       GROUP BY change_type`,
      [vi_user_id]
    );

    const stats: Record<string, number> = {};
    for (const row of result.rows) {
      stats[row.change_type] = parseInt(row.count, 10);
    }
    return stats;
  }
}
