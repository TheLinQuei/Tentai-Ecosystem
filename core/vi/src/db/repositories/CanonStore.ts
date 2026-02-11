/**
 * CanonStore - Database-backed Canon Repository
 * Phase 4: Astralis Canon Integration
 * 
 * Replaces in-memory sample data with real queryable canon storage
 */

import { Pool } from 'pg';
import { getLogger } from '../../telemetry/logger.js';

let logger: any;
try {
  logger = getLogger();
} catch {
  logger = console;
}

export interface CanonEntity {
  id: string;
  slug: string;
  name: string;
  type: string;
  aliases: string[];
  summary?: string;
  truth_axis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  era_id?: string;
  citations: Array<{source_id: string; excerpt?: string}>;
  created_at: Date;
  updated_at: Date;
}

export interface CanonFact {
  id: string;
  entity_id: string;
  key: string;
  value: any;
  truth_axis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  created_at: Date;
  updated_at: Date;
}

export interface CanonRelationship {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  properties: Record<string, any>;
  truth_axis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  created_at: Date;
  updated_at: Date;
}

export interface CanonSource {
  id: string;
  entity_id: string;
  source_type: 'primary' | 'secondary' | 'inference';
  reference: string;
  excerpt?: string;
  confidence: 'locked' | 'provisional' | 'experimental';
  created_at: Date;
}

/**
 * Database-backed canon repository
 * Provides queryable, versioned canon storage
 */
export class CanonStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Get entity by slug or name
   */
  async getEntity(slugOrName: string): Promise<CanonEntity | null> {
    try {
      const result = await this.pool.query<CanonEntity>(
        `SELECT * FROM codex_entities
         WHERE slug = $1 OR LOWER(name) = LOWER($2)
         LIMIT 1`,
        [slugOrName, slugOrName]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapEntityRow(result.rows[0]);
    } catch (error) {
      logger.error({ error, slugOrName }, '[CanonStore] Failed to get entity');
      return null;
    }
  }

  /**
   * Get all entities of a specific type
   */
  async getEntitiesByType(type: string, limit = 50): Promise<CanonEntity[]> {
    try {
      const result = await this.pool.query<CanonEntity>(
        `SELECT * FROM codex_entities
         WHERE type = $1
         ORDER BY name
         LIMIT $2`,
        [type, limit]
      );

      return result.rows.map(row => this.mapEntityRow(row));
    } catch (error) {
      logger.error({ error, type }, '[CanonStore] Failed to get entities by type');
      return [];
    }
  }

  /**
   * Get facts for an entity
   */
  async getFacts(entityId: string): Promise<CanonFact[]> {
    try {
      const result = await this.pool.query<CanonFact>(
        `SELECT * FROM codex_facets
         WHERE entity_id = $1
         ORDER BY key`,
        [entityId]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, entityId }, '[CanonStore] Failed to get facts');
      return [];
    }
  }

  /**
   * Get relationships from an entity
   */
  async getRelationships(entityId: string): Promise<CanonRelationship[]> {
    try {
      const result = await this.pool.query<CanonRelationship>(
        `SELECT * FROM codex_relationships
         WHERE from_entity_id = $1 OR to_entity_id = $1
         ORDER BY relationship_type`,
        [entityId]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, entityId }, '[CanonStore] Failed to get relationships');
      return [];
    }
  }

  /**
   * Get sources/citations for an entity
   */
  async getSources(entityId: string): Promise<CanonSource[]> {
    try {
      const result = await this.pool.query<CanonSource>(
        `SELECT * FROM codex_sources
         WHERE entity_id = $1
         ORDER BY source_type, created_at DESC`,
        [entityId]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, entityId }, '[CanonStore] Failed to get sources');
      return [];
    }
  }

  /**
   * Create new canon entity
   */
  async createEntity(entity: Omit<CanonEntity, 'id' | 'created_at' | 'updated_at'>): Promise<CanonEntity> {
    try {
      const result = await this.pool.query<CanonEntity>(
        `INSERT INTO codex_entities (slug, name, type, aliases, summary, truth_axis, confidence, era_id, citations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          entity.slug,
          entity.name,
          entity.type,
          JSON.stringify(entity.aliases),
          entity.summary,
          entity.truth_axis,
          entity.confidence,
          entity.era_id || null,
          JSON.stringify(entity.citations)
        ]
      );

      const created = this.mapEntityRow(result.rows[0]);

      // Audit log
      await this.pool.query(
        `INSERT INTO codex_audit_log (entity_id, action, changes)
         VALUES ($1, $2, $3)`,
        [created.id, 'create', JSON.stringify({ entity: created })]
      );

      logger.info({ entityId: created.id, slug: created.slug }, '[CanonStore] Entity created');
      return created;
    } catch (error) {
      logger.error({ error, entity }, '[CanonStore] Failed to create entity');
      throw error;
    }
  }

  /**
   * Add fact to entity
   */
  async addFact(fact: Omit<CanonFact, 'id' | 'created_at' | 'updated_at'>): Promise<CanonFact> {
    try {
      const result = await this.pool.query<CanonFact>(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          fact.entity_id,
          fact.key,
          JSON.stringify(fact.value),
          fact.truth_axis,
          fact.confidence
        ]
      );

      logger.info({ entityId: fact.entity_id, key: fact.key }, '[CanonStore] Fact added');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, fact }, '[CanonStore] Failed to add fact');
      throw error;
    }
  }

  /**
   * Add relationship between entities
   */
  async addRelationship(rel: Omit<CanonRelationship, 'id' | 'created_at' | 'updated_at'>): Promise<CanonRelationship> {
    try {
      const result = await this.pool.query<CanonRelationship>(
        `INSERT INTO codex_relationships (from_entity_id, to_entity_id, relationship_type, properties, truth_axis, confidence)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          rel.from_entity_id,
          rel.to_entity_id,
          rel.relationship_type,
          JSON.stringify(rel.properties),
          rel.truth_axis,
          rel.confidence
        ]
      );

      logger.info({
        from: rel.from_entity_id,
        to: rel.to_entity_id,
        type: rel.relationship_type
      }, '[CanonStore] Relationship added');
      return result.rows[0];
    } catch (error) {
      logger.error({ error, rel }, '[CanonStore] Failed to add relationship');
      throw error;
    }
  }

  /**
   * Search entities by text query
   */
  async searchEntities(query: string, limit = 10): Promise<CanonEntity[]> {
    try {
      const result = await this.pool.query<CanonEntity>(
        `SELECT * FROM codex_entities
         WHERE name ILIKE $1 OR summary ILIKE $1 OR aliases::text ILIKE $1
         ORDER BY 
           CASE WHEN LOWER(name) = LOWER($2) THEN 0
                WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
                ELSE 2
           END,
           name
         LIMIT $3`,
        [`%${query}%`, query, limit]
      );

      return result.rows.map(row => this.mapEntityRow(row));
    } catch (error) {
      logger.error({ error, query }, '[CanonStore] Failed to search entities');
      return [];
    }
  }

  /**
   * Get canon audit log for entity
   */
  async getAuditLog(entityId: string, limit = 50): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM codex_audit_log
         WHERE entity_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [entityId, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error({ error, entityId }, '[CanonStore] Failed to get audit log');
      return [];
    }
  }

  /**
   * Map database row to CanonEntity
   */
  private mapEntityRow(row: any): CanonEntity {
    return {
      ...row,
      aliases: Array.isArray(row.aliases) ? row.aliases : JSON.parse(row.aliases || '[]'),
      citations: Array.isArray(row.citations) ? row.citations : JSON.parse(row.citations || '[]'),
    };
  }
}
