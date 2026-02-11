/**
 * RelationshipResolver
 * Purpose: Resolve relationship context (owner/trusted/normal/restricted)
 * Influences: tone, verbosity, stance, initiative
 */

import type { Pool } from 'pg';
import { getLogger } from '../telemetry/logger.js';

export type RelationshipType = 'owner' | 'trusted' | 'normal' | 'restricted';
export type InteractionMode = 'assistant' | 'companion' | 'operator' | 'lorekeeper';
export type TonePref = 'direct' | 'elegant' | 'playful' | 'warm' | 'neutral';

export interface RelationshipContext {
  type: RelationshipType;
  trust_level: number; // 0-100
  interaction_mode: InteractionMode;
  tone_preference?: TonePref;
  voice_profile: string; // e.g., LUXE_ORIGIN
}

export interface RelationshipResolutionInput {
  history?: Array<{ type: string; timestamp: string; data?: any }>;
  explicit_settings?: Partial<RelationshipContext> & { type?: RelationshipType };
}

export class RelationshipResolver {
  private readonly logger = getLogger();

  constructor(private readonly pool: Pool) {}

  /**
   * Resolve relationship context for a user
   * Priority:
   * 1) explicit_settings overrides
   * 2) stored profile fields (user_profiles columns)
   * 3) heuristic defaults
   */
  async resolveRelationship(
    userId: string,
    input: RelationshipResolutionInput = {}
  ): Promise<RelationshipContext> {
    try {
      const stored = await this.pool.query(
        `SELECT relationship_type, trust_level, interaction_mode, tone_preference, voice_profile, profile
         FROM user_profiles
         WHERE vi_user_id = $1 OR user_id = $1
         ORDER BY (vi_user_id = $1) DESC
         LIMIT 1`,
        [userId]
      );

      const row = stored.rows[0] || {};
      const profile = row.profile && typeof row.profile === 'object' ? row.profile : {};

      // Defaults (public mode)
      let context: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      // Apply stored
      context = {
        type: (row.relationship_type as RelationshipType) ?? context.type,
            trust_level: row.trust_level !== undefined && row.trust_level !== null
              ? Number(row.trust_level)
              : context.trust_level,
        interaction_mode: (row.interaction_mode as InteractionMode) ?? (profile.interaction_mode as InteractionMode) ?? context.interaction_mode,
        tone_preference: (row.tone_preference as TonePref) ?? (profile.tone_preference as TonePref) ?? context.tone_preference,
        voice_profile: typeof row.voice_profile === 'string' ? row.voice_profile : (profile.voice_profile as string) ?? context.voice_profile,
      };

      // Apply explicit overrides
      if (input.explicit_settings) {
        const e = input.explicit_settings;
        context = {
          type: e.type ?? context.type,
              trust_level: e.trust_level !== undefined && e.trust_level !== null
                ? Number(e.trust_level)
                : context.trust_level,
          interaction_mode: (e.interaction_mode as InteractionMode) ?? context.interaction_mode,
          tone_preference: (e.tone_preference as TonePref) ?? context.tone_preference,
          voice_profile: typeof e.voice_profile === 'string' ? e.voice_profile : context.voice_profile,
        };
      }

      // Lightweight heuristics from history (optional)
      if (input.history && input.history.length > 0) {
        // Increase trust if multiple successful sessions observed
        const successEvents = input.history.filter((h) => h.type === 'session_success');
        if (successEvents.length >= 3 && context.trust_level < 50) {
          context.trust_level = 50; // baseline trust after repeated success
        }

        // If console owner hint present, force owner mode
        const ownerHints = input.history.filter((h) => h.type === 'console_owner');
        if (ownerHints.length > 0) {
          context.type = 'owner';
          context.interaction_mode = 'operator';
          context.tone_preference = 'direct';
        }
      }

      this.logger.debug({ userId, relationship: context }, '[RelationshipResolver] Resolved');
      return context;
    } catch (error) {
      this.logger.error({ error, userId }, '[RelationshipResolver] Failed to resolve');
      // Fail closed to public defaults
      return {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };
    }
  }
}
