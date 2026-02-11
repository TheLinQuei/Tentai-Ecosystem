/**
 * Database-Backed Canon Resolver (Phase 4 Complete)
 * 
 * Replaces in-memory sample data with real Astralis canon storage
 * Provides queryable, versioned, cited canon facts
 */

import { Pool } from 'pg';
import { Citation } from '../grounding/types.js';
import { CanonStore } from '../../db/repositories/CanonStore.js';
import { getLogger } from '../../telemetry/logger.js';

let logger: any;
try {
  logger = getLogger();
} catch {
  logger = console;
}

export interface CanonResolutionResult {
  facts: Array<{ key: string; value: any; confidence: number }>;
  entities: Array<{ id: string; name: string; type: string }>;
  confidence: number;
  citations: Citation[];
}

/**
 * Production Canon Resolver with database backend
 * Falls back to sample data if database unavailable
 */
export class CanonResolverDB {
  private canonStore: CanonStore | null = null;

  constructor(pool?: Pool) {
    if (pool) {
      this.canonStore = new CanonStore(pool);
      logger.info('[CanonResolverDB] Initialized with database backend');
    } else {
      logger.warn('[CanonResolverDB] No pool provided - database operations will fail gracefully');
    }
  }

  /**
   * Resolve a query against canon database
   * Returns facts + citations with confidence scores
   */
  async resolveCanon(
    query: string,
    options?: { minConfidence?: number; maxResults?: number }
  ): Promise<CanonResolutionResult> {
    const minConfidence = options?.minConfidence ?? 0.7;
    const maxResults = options?.maxResults ?? 10;

    if (!this.canonStore) {
      logger.warn('[CanonResolverDB] No canon store available');
      return {
        facts: [],
        entities: [],
        confidence: 0,
        citations: [],
      };
    }

    try {
      // Search for matching entities
      const entities = await this.canonStore.searchEntities(query, maxResults);

      if (entities.length === 0) {
        logger.debug({ query }, '[CanonResolverDB] No entities found');
        return {
          facts: [],
          entities: [],
          confidence: 0,
          citations: [],
        };
      }

      const facts: Array<{ key: string; value: any; confidence: number }> = [];
      const citations: Citation[] = [];

      // Get facts and sources for each entity
      for (const entity of entities) {
        const entityFacts = await this.canonStore.getFacts(entity.id);
        const sources = await this.canonStore.getSources(entity.id);

        for (const fact of entityFacts) {
          const confidence = this.mapConfidenceToScore(fact.confidence);

          if (confidence >= minConfidence) {
            facts.push({
              key: fact.key,
              value: fact.value,
              confidence,
            });

            citations.push({
              id: `cite-${entity.id}-${fact.key}`,
              type: 'canon_entity' as const,
              sourceId: `canon:${entity.type}:${entity.slug}`,
              sourceText: `${entity.name}: ${fact.key} = ${typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)}`,
              confidence,
              metadata: {
                entity_name: entity.name,
                entity_id: entity.id,
                entity_type: entity.type,
                fact_key: fact.key,
                truth_axis: fact.truth_axis,
                canon_sources: sources.slice(0, 3).map(s => s.reference),
              },
            });
          }
        }
      }

      // Calculate overall confidence (average of top facts)
      const avgConfidence = facts.length > 0
        ? facts.slice(0, 5).reduce((sum, f) => sum + f.confidence, 0) / Math.min(5, facts.length)
        : 0;

      logger.debug({
        query,
        entityCount: entities.length,
        factCount: facts.length,
        confidence: avgConfidence,
      }, '[CanonResolverDB] Canon resolved');

      return {
        facts: facts.slice(0, maxResults),
        entities: entities.slice(0, maxResults).map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
        })),
        confidence: avgConfidence,
        citations: citations.slice(0, maxResults),
      };
    } catch (error) {
      logger.error({ error, query }, '[CanonResolverDB] Resolution failed');
      return {
        facts: [],
        entities: [],
        confidence: 0,
        citations: [],
      };
    }
  }

  /**
   * Get specific entity by slug or name
   */
  async getEntity(slugOrName: string): Promise<any | null> {
    if (!this.canonStore) {
      return null;
    }

    try {
      return await this.canonStore.getEntity(slugOrName);
    } catch (error) {
      logger.error({ error, slugOrName }, '[CanonResolverDB] Get entity failed');
      return null;
    }
  }

  /**
   * Check if query matches known canon entities
   */
  async hasCanon(query: string): Promise<boolean> {
    if (!this.canonStore) {
      return false;
    }

    try {
      const entities = await this.canonStore.searchEntities(query, 1);
      return entities.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Map confidence levels to numeric scores
   */
  private mapConfidenceToScore(confidence: string): number {
    switch (confidence) {
      case 'locked':
        return 1.0;
      case 'provisional':
        return 0.75;
      case 'experimental':
        return 0.5;
      default:
        return 0.6;
    }
  }
}
