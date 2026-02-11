import { Pool } from 'pg';
import { PreferenceRepository } from '../PreferenceRepository.js';
import { RelationshipRepository } from '../RelationshipRepository.js';
import { MultiDimensionalMemoryRepository } from '../../db/repositories/MultiDimensionalMemoryRepository.js';
import { UserProfileRepository } from '../../db/repositories/UserProfileRepository.js';
import { UserFactRepository, type UserFact } from '../../db/repositories/UserFactRepository.js';
import { UserRelationshipRepository } from '../../repository/UserRelationshipRepository.js';
import { RelationshipResolver } from '../cognition/RelationshipResolver.js';
import { getLogger } from '../../telemetry/logger.js';
import type { RelationshipContext } from '../../types/relationship.js';

let logger: any;
try {
  logger = getLogger();
} catch {
  logger = console;
}

/**
 * PHASE 2: Memory Orchestrator
 * 
 * Builds "Continuity Pack" - the context Vi needs to feel like a person:
 * 1. Identity snippet (vi_user_id + provider context)
 * 2. Relationship context (trust_level, relationship_type)
 * 3. Active preferences (tone, interaction_mode)
 * 4. Relevant memories (working, episodic, semantic, relational, canon)
 * 5. Current mission (if any)
 */

export interface ContinuityPack {
  // Identity
  vi_user_id: string;
  provider?: string;
  provider_user_id?: string;

  // Relationship Context (Phase 2: REQUIRED)
  relationship_context: RelationshipContext;
  
  // Legacy fields (deprecated, use relationship_context instead)
  relationship_type: string;
  trust_level: number;
  interaction_mode: string;
  
  // Preferences
  tone_preference?: string;
  voice_profile?: string;
  boundaries_profile?: string;

  // Memory layers
  working_memory: string[]; // Current session context
  episodic_memory: Memory[]; // Recent conversations/events
  semantic_memory: Memory[]; // Facts about user + world
  relational_memory: Memory[]; // How Vi relates to this person

  // Authority ledger
  locked_facts: UserFact[]; // Locked facts (law)
  fact_ledger: UserFact[]; // All facts ordered by authority

  // Mission context
  active_mission?: {
    mission_id: string;
    task: string;
    current_step?: number;
  };
}

export interface Memory {
  id: string;
  content: string;
  layer: 'episodic' | 'semantic' | 'relational' | 'canon';
  relevance_score: number;
  created_at: Date;
  metadata?: Record<string, any>;
}

export interface MemoryInput {
  vi_user_id: string;
  content: string;
  layer: 'episodic' | 'semantic' | 'relational';
  metadata?: Record<string, any>;
}

export interface WritePolicy {
  auto_write: boolean; // Automatically persist
  require_intent: boolean; // Require explicit user intent
  garbage_prevention: boolean; // Filter noise
}

export class MemoryOrchestrator {
  private pool: Pool;
  private preferenceRepo: PreferenceRepository;
  private relationshipRepo: RelationshipRepository;
  private memoryRepo: MultiDimensionalMemoryRepository;
  private profileRepo: UserProfileRepository;
  private userFactRepo: UserFactRepository;
  private userRelationshipRepo: UserRelationshipRepository;
  private relationshipResolver: RelationshipResolver;

  constructor(pool: Pool) {
    this.pool = pool;
    this.preferenceRepo = new PreferenceRepository(pool);
    this.relationshipRepo = new RelationshipRepository(pool);
    this.memoryRepo = new MultiDimensionalMemoryRepository(pool);
    this.profileRepo = new UserProfileRepository(pool);
    this.userFactRepo = new UserFactRepository(pool);
    this.userRelationshipRepo = new UserRelationshipRepository(pool);
    this.relationshipResolver = new RelationshipResolver({
      repository: this.userRelationshipRepo,
    });
  }

  /**
   * Build complete continuity pack for a user
   */
  async buildContinuityPack(
    userId: string,
    options?: {
      provider?: string;
      provider_user_id?: string;
      session_context?: string[];
    }
  ): Promise<ContinuityPack> {
    // Fetch user profile (relationship + preferences) with error handling
    let profile: any = null;
    try {
      profile = await this.profileRepo.getByUserId(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to fetch user profile, using defaults');
    }

    // Get active preferences with error handling
    let preferences: any = null;
    try {
      preferences = await this.preferenceRepo.getPreferences(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to fetch preferences, using defaults');
    }

    // Identity hints from identity map (fallback to options)
    let identity: any = {};
    try {
      const identityRes = await this.pool.query(
        `SELECT provider, provider_user_id FROM user_identity_map WHERE vi_user_id = $1 LIMIT 1`,
        [userId]
      );
      identity = identityRes.rows[0] || {};
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to fetch identity map, using options');
    }

    // Get relevant memories (limit to top 10 per layer for performance)
    let episodicMemories: any[] = [];
    let semanticMemories: any[] = [];
    let relationalMemories: any[] = [];
    try {
      episodicMemories = await this.memoryRepo.getRecentMemories(userId, 'episodic', 10);
      semanticMemories = await this.memoryRepo.getRecentMemories(userId, 'semantic', 10);
      relationalMemories = await this.memoryRepo.getRecentMemories(userId, 'relational', 5);
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to fetch memories, using empty arrays');
    }

    // Authority ledger: locked facts are law; full ledger ordered by authority
    let factLedger: UserFact[] = [];
    let lockedFacts: UserFact[] = [];
    try {
      factLedger = await this.userFactRepo.listFactsOrdered(userId);
      lockedFacts = factLedger.filter((fact) => fact.authority === 'locked');
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to fetch fact ledger, using empty arrays');
    }

    // PHASE 2: Resolve relationship context (deterministic, locked-fact-aware)
    let relationshipContext: RelationshipContext;
    try {
      relationshipContext = await this.relationshipResolver.resolveRelationship(userId, lockedFacts);
      logger.debug({ userId, relationshipContext }, 'Resolved relationship context');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to resolve relationship context, using default public');
      // Fallback to safe default
      relationshipContext = {
        relationship_type: 'public',
        trust_level: 0,
        tone_preference: 'neutral',
        voice_profile: 'public_elegant',
        interaction_mode: 'default',
        computed_at: new Date().toISOString(),
        source: 'db_default',
      };
    }

    // Build continuity pack
    const pack: ContinuityPack = {
      vi_user_id: userId,
      provider: options?.provider ?? identity.provider,
      provider_user_id: options?.provider_user_id ?? identity.provider_user_id,

      // Phase 2: Relationship context (REQUIRED)
      relationship_context: relationshipContext,

      // Legacy fields (deprecated, kept for backwards compatibility)
      relationship_type: relationshipContext.relationship_type,
      trust_level: relationshipContext.trust_level,
      interaction_mode: relationshipContext.interaction_mode,

      // Preferences
      tone_preference: preferences?.tone_preference || profile?.tone_preference || relationshipContext.tone_preference,
      voice_profile: relationshipContext.voice_profile,
      boundaries_profile: profile?.boundaries_profile || 'standard',

      // Memory layers
      working_memory: options?.session_context || [],
      episodic_memory: episodicMemories.map(m => ({
        id: m.id,
        content: m.content,
        layer: 'episodic' as const,
        relevance_score: m.relevance_score || 1.0,
        created_at: m.created_at,
        metadata: m.metadata
      })),
      semantic_memory: semanticMemories.map(m => ({
        id: m.id,
        content: m.content,
        layer: 'semantic' as const,
        relevance_score: m.relevance_score || 1.0,
        created_at: m.created_at,
        metadata: m.metadata
      })),
      relational_memory: relationalMemories.map(m => ({
        id: m.id,
        content: m.content,
        layer: 'relational' as const,
        relevance_score: m.relevance_score || 1.0,
        created_at: m.created_at,
        metadata: m.metadata
      })),

      // Authority ledger
      locked_facts: lockedFacts,
      fact_ledger: factLedger,

      // Mission context (intentionally omitted until mission memory is introduced)
      active_mission: undefined
    };

    logger.debug({ userId, pack }, 'Built continuity pack');
    return pack;
  }

  /**
   * Select relevant memories for a query (semantic search)
   */
  async selectRelevantMemories(
    query: string,
    userId: string,
    limit: number = 5
  ): Promise<Memory[]> {
    try {
      // Use recency-based retrieval for now
      const memories = await this.memoryRepo.getRecentMemories(userId, 'episodic', limit);
      return memories.map(m => ({
        id: m.id,
        content: m.content,
        layer: 'episodic' as const,
        relevance_score: m.relevance_score || 1.0,
        created_at: m.created_at,
        metadata: m.metadata
      }));
    } catch (error) {
      logger.error({ error, query, userId }, 'Failed to select relevant memories');
      return [];
    }
  }

  /**
   * Write memory with policy enforcement
   */
  async writeMemory(
    input: MemoryInput,
    policy: WritePolicy = {
      auto_write: true,
      require_intent: false,
      garbage_prevention: true
    }
  ): Promise<void> {
    try {
      // Garbage prevention: filter noise
      if (policy.garbage_prevention) {
        const isNoise = this.isGarbage(input.content);
        if (isNoise) {
          logger.debug({ content: input.content }, 'Memory write rejected: garbage detected');
          return;
        }
      }

      // Write memory to appropriate layer
      await this.memoryRepo.storeMemory({
        vi_user_id: input.vi_user_id,
        content: input.content,
        layer: input.layer,
        metadata: input.metadata || {}
      });

      logger.debug({ vi_user_id: input.vi_user_id, layer: input.layer }, 'Memory written successfully');

    } catch (error) {
      logger.error({ error, input }, 'Failed to write memory');
      throw error;
    }
  }

  /**
   * Garbage detection: filter noise from memory
   */
  private isGarbage(content: string): boolean {
    // Filter empty/trivial content
    if (!content || content.trim().length < 10) {
      return true;
    }

    // Filter repetitive greetings (noise accumulation)
    const trivialPatterns = [
      /^(hi|hey|hello|yo)\.?$/i,
      /^(ok|okay|sure|alright)\.?$/i,
      /^(thanks|thank you)\.?$/i
    ];

    for (const pattern of trivialPatterns) {
      if (pattern.test(content.trim())) {
        return true;
      }
    }

    return false;
  }
}
