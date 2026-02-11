/**
 * RelationshipResolver
 * Deterministic relationship context computation
 * 
 * ALGORITHM (strict order):
 * 1. Check locked_facts for explicit relationship_type override
 * 2. Load from DB (or create default public row)
 * 3. Apply safety clamps (guarded mode overrides)
 * 
 * FORBIDDEN:
 * - Inferring owner from chat language
 * - Auto-escalating public -> owner
 * - Writing back changes (read-only except getOrCreateDefault)
 */

import type { UserFact } from '../../db/repositories/UserFactRepository.js';
import type { UserRelationshipRepository } from '../../repository/UserRelationshipRepository.js';
import type {
  RelationshipContext,
  RelationshipType,
  TonePreference,
  VoiceProfile,
  InteractionMode,
} from '../../types/relationship.js';
import { DEFAULT_RELATIONSHIP_CONTEXT, isRelationshipType, validateTrustLevel } from '../../types/relationship.js';
import { getLogger } from '../../telemetry/logger.js';

const getModuleLogger = () => getLogger();  // Lazy logger initialization

export interface RelationshipResolverDeps {
  repository: UserRelationshipRepository;
}

export class RelationshipResolver {
  constructor(private deps: RelationshipResolverDeps) {}

  /**
   * Resolve relationship context for a user
   * 
   * @param vi_user_id - Canonical user identifier
   * @param locked_facts - Locked facts from ContinuityPack (highest authority)
   * @returns RelationshipContext (always non-null, deterministic)
   */
  async resolveRelationship(
    vi_user_id: string,
    locked_facts: UserFact[] = []
  ): Promise<RelationshipContext> {
    const startTime = Date.now();

    // Step 1: Check locked facts for explicit relationship_type override
    const lockedRelationshipFact = locked_facts.find(
      (fact) =>
        fact.fact_key === 'relationship_type' &&
        fact.authority === 'locked'
    );

    if (lockedRelationshipFact && isRelationshipType(lockedRelationshipFact.value.type)) {
      const overrideType = lockedRelationshipFact.value.type as RelationshipType;
      
      getModuleLogger().info('Relationship context resolved from locked_fact', {
        vi_user_id,
        relationship_type: overrideType,
        source: 'locked_fact',
        duration_ms: Date.now() - startTime,
      });

      // Build context from locked fact, using DB defaults for other fields
      const { row } = await this.deps.repository.getOrCreateDefault(vi_user_id);

      return this.applyGuardedClamp({
        relationship_type: overrideType,
        trust_level: row.trust_level,
        tone_preference: row.tone_preference,
        voice_profile: this.selectVoiceProfile(overrideType, row.interaction_mode),
        interaction_mode: row.interaction_mode,
        computed_at: new Date().toISOString(),
        source: 'locked_fact',
      });
    }

    // Step 2: Load from DB (or create default public row)
    const { row, was_created } = await this.deps.repository.getOrCreateDefault(vi_user_id);

    const source = was_created ? 'db_default' : 'db';

    getModuleLogger().info('Relationship context resolved from database', {
      vi_user_id,
      relationship_type: row.relationship_type,
      source,
      was_created,
      duration_ms: Date.now() - startTime,
    });

    // Step 3: Build context and apply safety clamps
    const context: RelationshipContext = {
      relationship_type: row.relationship_type,
      trust_level: validateTrustLevel(row.trust_level),
      tone_preference: row.tone_preference,
      voice_profile: row.voice_profile,
      interaction_mode: row.interaction_mode,
      computed_at: new Date().toISOString(),
      source,
    };

    return this.applyGuardedClamp(context);
  }

  /**
   * Select appropriate voice profile based on relationship type and interaction mode
   */
  private selectVoiceProfile(
    relationship_type: RelationshipType,
    interaction_mode: InteractionMode
  ): VoiceProfile {
    // Guarded mode always forces public_elegant
    if (interaction_mode === 'guarded') {
      return 'public_elegant';
    }

    return relationship_type === 'owner' ? 'owner_luxury' : 'public_elegant';
  }

  /**
   * Apply guarded mode safety clamp
   * If interaction_mode is 'guarded', force:
   * - voice_profile = 'public_elegant'
   * - tone_preference = 'neutral'
   */
  private applyGuardedClamp(context: RelationshipContext): RelationshipContext {
    if (context.interaction_mode === 'guarded') {
      getModuleLogger().info('Applying guarded mode safety clamp', {
        original_voice_profile: context.voice_profile,
        original_tone_preference: context.tone_preference,
      });

      return {
        ...context,
        voice_profile: 'public_elegant',
        tone_preference: 'neutral',
      };
    }

    return context;
  }

  /**
   * Validate relationship context (defensive check)
   */
  static validate(context: RelationshipContext): void {
    if (!context) {
      throw new Error('RelationshipContext is required');
    }

    if (!isRelationshipType(context.relationship_type)) {
      throw new Error(`Invalid relationship_type: ${context.relationship_type}`);
    }

    if (context.trust_level < 0 || context.trust_level > 100) {
      throw new Error(`Invalid trust_level: ${context.trust_level} (must be 0-100)`);
    }

    if (!['db_default', 'db', 'locked_fact'].includes(context.source)) {
      throw new Error(`Invalid source: ${context.source}`);
    }
  }
}
