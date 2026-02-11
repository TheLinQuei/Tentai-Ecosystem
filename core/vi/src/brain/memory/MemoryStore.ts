/**
 * PostgreSQL Memory Store
 * Stores and retrieves episodic/semantic memories using pgvector
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { MemoryStore as MemoryStoreInterface } from '../interfaces.js';
import type {
  MemorySearchResult,
  ConsolidationResult,
} from './types.js';
import type { EmbeddingService } from './embeddings.js';

export class PostgresMemoryStore implements MemoryStoreInterface {
  constructor(private pool: Pool, private embeddingService: EmbeddingService) {}

  /**
   * Store episodic memory from conversation
   */
  async store(record: {
    userId: string;
    sessionId?: string;
    type: 'episodic' | 'semantic';
    subtype: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = randomUUID();

    // Generate embedding
    const embedding = await this.embeddingService.embed(record.text);

    const query = `
      INSERT INTO memory_vectors (
        id, user_id, session_id, type, embedding, text, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      RETURNING id
    `;

    await this.pool.query(query, [
      id,
      record.userId,
      record.sessionId || null,
      record.subtype, // Store subtype in 'type' column for now
      `[${embedding.join(',')}]`, // pgvector format
      record.text,
      record.metadata ? JSON.stringify(record.metadata) : null,
    ]);

    return id;
  }

  /**
   * Retrieve memories similar to query using semantic search
   */
  async retrieve(
    query: string,
    userId: string,
    count: number = 5
  ): Promise<MemorySearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await this.embeddingService.embed(query);

    const sql = `
      SELECT
        id,
        text,
        type,
        created_at,
        metadata,
        1 - (embedding <-> $1::vector) as similarity
      FROM memory_vectors
      WHERE user_id = $2
      ORDER BY embedding <-> $1::vector
      LIMIT $3
    `;

    const result = await this.pool.query<{
      id: string;
      text: string;
      type: string;
      created_at: Date;
      metadata: string | null;
      similarity: number;
    }>(sql, [`[${queryEmbedding.join(',')}]`, userId, count]);

    return result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: row.similarity,
      type: row.type === 'episodic' ? 'episodic' : 'semantic',
      subtype: row.type,
      createdAt: row.created_at,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
    }));
  }

  /**
   * Get all memories for user (paginated)
   */
  async getAll(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    const query = `
      SELECT
        id,
        user_id,
        session_id,
        type,
        text,
        metadata,
        created_at,
        updated_at
      FROM memory_vectors
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.pool.query<{
      id: string;
      user_id: string;
      session_id: string | null;
      type: string;
      text: string;
      metadata: string | null;
      created_at: Date;
      updated_at: Date;
    }>(query, [userId, limit, offset]);

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id || undefined,
      type: row.type === 'episodic' ? 'episodic' : 'semantic',
      subtype: row.type,
      text: row.text,
      embedding: [], // Don't return embeddings (too large)
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Delete specific memory
   */
  async delete(memoryId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM memory_vectors
      WHERE id = $1 AND user_id = $2
    `;

    const result = await this.pool.query(query, [memoryId, userId]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Consolidate old memories (summarization, pruning)
   * This is a stub that will be enhanced with LLM summarization in future versions
   */
  async consolidate(
    userId: string,
    daysOld: number = 30
  ): Promise<ConsolidationResult> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find old memories
    const oldQuery = `
      SELECT id, text FROM memory_vectors
      WHERE user_id = $1 AND created_at < $2
      LIMIT 100
    `;

    const oldResult = await this.pool.query<{ id: string; text: string }>(
      oldQuery,
      [userId, cutoffDate]
    );

    const mergedCount = oldResult.rows.length;

    // For now, just remove old memories (Phase 2: LLM-driven summarization)
    if (mergedCount > 0) {
      const deleteQuery = `
        DELETE FROM memory_vectors
        WHERE user_id = $1 AND created_at < $2
      `;

      await this.pool.query(deleteQuery, [userId, cutoffDate]);
    }

    return {
      userId,
      mergedMemoriesCount: mergedCount,
      newSummaries: [], // Phase 2: LLM-created summaries
      removedMemoriesCount: mergedCount,
      timestamp: new Date(),
    };
  }
}
