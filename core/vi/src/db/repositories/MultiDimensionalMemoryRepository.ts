/**
 * Multi-Dimensional Memory Repository
 * Handles episodic, semantic, relational, and commitment memory with decay
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { EmbeddingService } from '../../brain/memory/embeddings.js';
import { getLogger } from '../../telemetry/logger.js';

// ======= Memory Types =======

export interface EpisodicMemory {
  id: string;
  userId: string;
  sessionId?: string;
  embedding: number[];
  text: string;
  metadata?: Record<string, unknown>;
  relevanceScore: number; // 0.0 to 1.0
  createdAt: Date;
  accessedAt: Date;
  updatedAt: Date;
}

export interface SemanticMemory {
  id: string;
  userId: string;
  embedding: number[];
  text: string;
  category?: string; // preference, skill, context, etc.
  confidence: number; // 0.0 to 1.0
  metadata?: Record<string, unknown>;
  relevanceScore: number;
  createdAt: Date;
  accessedAt: Date;
  updatedAt: Date;
}

export interface RelationalMemory {
  id: string;
  userId: string;
  sessionId?: string;
  embedding: number[];
  text: string;
  affectiveValence?: number; // -1.0 to 1.0
  metadata?: Record<string, unknown>;
  relevanceScore: number;
  createdAt: Date;
  accessedAt: Date;
  updatedAt: Date;
}

export interface CommitmentMemory {
  id: string;
  userId: string;
  sessionId?: string;
  embedding: number[];
  text: string;
  commitmentType?: string; // promise, reminder, stance_taken
  status: 'pending' | 'fulfilled' | 'broken' | 'expired';
  deadline?: Date;
  fulfilledAt?: Date;
  metadata?: Record<string, unknown>;
  relevanceScore: number;
  createdAt: Date;
  accessedAt: Date;
  updatedAt: Date;
}

export interface MemoryAuditEntry {
  userId: string;
  memoryType: 'episodic' | 'semantic' | 'relational' | 'commitment';
  memoryId: string;
  operation: 'create' | 'access' | 'decay' | 'consolidate' | 'delete';
  oldRelevance?: number;
  newRelevance?: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  id: string;
  text: string;
  similarity: number;
  type: 'episodic' | 'semantic' | 'relational' | 'commitment';
  relevanceScore: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// ======= Decay Configuration =======

const DECAY_CONFIG = {
  episodic: {
    halfLifeDays: 30, // Episodic memories decay slower (conversation context)
    minRelevance: 0.1,
  },
  semantic: {
    halfLifeDays: 90, // Facts decay very slowly
    minRelevance: 0.2,
  },
  relational: {
    halfLifeDays: 60, // Bond memories decay moderately
    minRelevance: 0.1,
  },
  commitment: {
    halfLifeDays: 14, // Promises decay faster (urgency)
    minRelevance: 0.05,
  },
};

/**
 * Calculate relevance decay using exponential decay
 */
function calculateDecay(
  currentRelevance: number,
  daysSinceAccess: number,
  halfLifeDays: number
): number {
  if (daysSinceAccess <= 0) return currentRelevance;
  const decayFactor = Math.pow(0.5, daysSinceAccess / halfLifeDays);
  return Math.max(0, currentRelevance * decayFactor);
}

// ======= Repository =======

const ZERO_VECTOR = new Array(1536).fill(0);

export class MultiDimensionalMemoryRepository {
  private embeddingService: EmbeddingService;

  constructor(private pool: Pool, embeddingService?: EmbeddingService) {
    // Use a zero-vector embedding when no embedding service is supplied (unit tests)
    this.embeddingService = (embeddingService ?? {
      embed: async () => ZERO_VECTOR,
    }) as EmbeddingService;
  }

  async getRecentMemories(
    vi_user_id: string,
    layer: 'episodic' | 'semantic' | 'relational',
    limit: number
  ) {
    const res = await this.pool.query(
      `SELECT id, content, layer, memory_type, relevance_score, created_at
       FROM multi_dimensional_memory
       WHERE vi_user_id = $1 AND (layer = $2 OR memory_type = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [vi_user_id, layer, limit]
    );

    return res.rows.map((row) => ({
      id: row.id,
      content: row.content,
      layer: row.layer || row.memory_type,
      relevance_score: row.relevance_score ?? 1,
      created_at: row.created_at,
      metadata: undefined,
    }));
  }

  async storeMemory(input: {
    vi_user_id: string;
    content: string;
    layer: 'episodic' | 'semantic' | 'relational';
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO multi_dimensional_memory (vi_user_id, content, layer, memory_type, relevance_score, created_at, updated_at)
       VALUES ($1, $2, $3, $3, 1.0, now(), now())`,
      [input.vi_user_id, input.content, input.layer]
    );
  }

  /**
   * Safely handle metadata values from Postgres. If the driver returns a JSONB
   * object, use it directly; if it's a string, parse it. Otherwise, return undefined.
   * Logs a warning with type information on parse failure.
   */
  private safeMetadata(value: any, source: string): Record<string, unknown> | undefined {
    try {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      if (typeof value === 'object') {
        return value as Record<string, unknown>;
      }
      return undefined;
    } catch (err) {
      getLogger().warn({ err, source, metaType: typeof value }, 'Failed to parse metadata');
      return undefined;
    }
  }

  // ======= Episodic Memory =======

  async storeEpisodic(
    userId: string,
    sessionId: string | undefined,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const embedding = await this.embeddingService.embed(text);

    await this.pool.query(
      `INSERT INTO episodic_memory 
       (id, user_id, session_id, embedding, text, metadata, relevance_score, created_at, accessed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1.0, now(), now(), now())`,
      [
        id,
        userId,
        sessionId || null,
        `[${embedding.join(',')}]`,
        text,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    await this.logAudit({
      userId,
      memoryType: 'episodic',
      memoryId: id,
      operation: 'create',
      newRelevance: 1.0,
      metadata,
    });

    return id;
  }

  async getEpisodicByUserId(userId: string, limit: number = 20): Promise<EpisodicMemory[]> {
    const result = await this.pool.query<any>(
      `SELECT id, user_id, session_id, text, metadata, relevance_score, created_at, accessed_at, updated_at
       FROM episodic_memory
       WHERE user_id = $1
       ORDER BY accessed_at DESC, relevance_score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id || undefined,
      embedding: [], // Don't return embeddings (too large)
      text: row.text,
      metadata: this.safeMetadata(row.metadata, 'episodic.getByUserId'),
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      updatedAt: row.updated_at,
    }));
  }

  // ======= Semantic Memory =======

  async storeSemantic(
    userId: string,
    text: string,
    category?: string,
    confidence: number = 0.5,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const embedding = await this.embeddingService.embed(text);

    await this.pool.query(
      `INSERT INTO semantic_memory 
       (id, user_id, embedding, text, category, confidence, metadata, relevance_score, created_at, accessed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, now(), now(), now())`,
      [
        id,
        userId,
        `[${embedding.join(',')}]`,
        text,
        category || null,
        confidence,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    await this.logAudit({
      userId,
      memoryType: 'semantic',
      memoryId: id,
      operation: 'create',
      newRelevance: 1.0,
      metadata,
    });

    return id;
  }

  async getSemanticByUserId(userId: string, limit: number = 20): Promise<SemanticMemory[]> {
    const result = await this.pool.query<any>(
      `SELECT id, user_id, text, category, confidence, metadata, relevance_score, created_at, accessed_at, updated_at
       FROM semantic_memory
       WHERE user_id = $1
       ORDER BY confidence DESC, relevance_score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      embedding: [],
      text: row.text,
      category: row.category || undefined,
      confidence: parseFloat(row.confidence),
      metadata: this.safeMetadata(row.metadata, 'semantic.getByUserId'),
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      updatedAt: row.updated_at,
    }));
  }

  // ======= Relational Memory =======

  async storeRelational(
    userId: string,
    sessionId: string | undefined,
    text: string,
    affectiveValence?: number,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const embedding = await this.embeddingService.embed(text);

    await this.pool.query(
      `INSERT INTO relational_memory 
       (id, user_id, session_id, embedding, text, affective_valence, metadata, relevance_score, created_at, accessed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1.0, now(), now(), now())`,
      [
        id,
        userId,
        sessionId || null,
        `[${embedding.join(',')}]`,
        text,
        affectiveValence !== undefined ? affectiveValence : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    await this.logAudit({
      userId,
      memoryType: 'relational',
      memoryId: id,
      operation: 'create',
      newRelevance: 1.0,
      metadata,
    });

    return id;
  }

  async getRelationalByUserId(userId: string, limit: number = 20): Promise<RelationalMemory[]> {
    const result = await this.pool.query<any>(
      `SELECT id, user_id, session_id, text, affective_valence, metadata, relevance_score, created_at, accessed_at, updated_at
       FROM relational_memory
       WHERE user_id = $1
       ORDER BY accessed_at DESC, relevance_score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id || undefined,
      embedding: [],
      text: row.text,
      affectiveValence: row.affective_valence !== null ? parseFloat(row.affective_valence) : undefined,
      metadata: this.safeMetadata(row.metadata, 'relational.getByUserId'),
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      updatedAt: row.updated_at,
    }));
  }

  // ======= Commitment Memory =======

  async storeCommitment(
    userId: string,
    sessionId: string | undefined,
    text: string,
    commitmentType?: string,
    deadline?: Date,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const id = randomUUID();
    const embedding = await this.embeddingService.embed(text);

    await this.pool.query(
      `INSERT INTO commitment_memory 
       (id, user_id, session_id, embedding, text, commitment_type, status, deadline, metadata, relevance_score, created_at, accessed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, 1.0, now(), now(), now())`,
      [
        id,
        userId,
        sessionId || null,
        `[${embedding.join(',')}]`,
        text,
        commitmentType || null,
        deadline || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    await this.logAudit({
      userId,
      memoryType: 'commitment',
      memoryId: id,
      operation: 'create',
      newRelevance: 1.0,
      metadata,
    });

    return id;
  }

  async updateCommitmentStatus(
    id: string,
    userId: string,
    status: 'pending' | 'fulfilled' | 'broken' | 'expired'
  ): Promise<void> {
    const fulfilledAt = status === 'fulfilled' ? 'now()' : 'NULL';
    await this.pool.query(
      `UPDATE commitment_memory 
       SET status = $1, fulfilled_at = ${fulfilledAt}, updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [status, id, userId]
    );

    await this.logAudit({
      userId,
      memoryType: 'commitment',
      memoryId: id,
      operation: 'access',
      metadata: { status },
    });
  }

  async getCommitmentsByUserId(userId: string, limit: number = 20): Promise<CommitmentMemory[]> {
    const result = await this.pool.query<any>(
      `SELECT id, user_id, session_id, text, commitment_type, status, deadline, fulfilled_at, metadata, relevance_score, created_at, accessed_at, updated_at
       FROM commitment_memory
       WHERE user_id = $1
       ORDER BY deadline ASC NULLS LAST, relevance_score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id || undefined,
      embedding: [],
      text: row.text,
      commitmentType: row.commitment_type || undefined,
      status: row.status,
      deadline: row.deadline || undefined,
      fulfilledAt: row.fulfilled_at || undefined,
      metadata: this.safeMetadata(row.metadata, 'commitment.getByUserId'),
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      accessedAt: row.accessed_at,
      updatedAt: row.updated_at,
    }));
  }

  // ======= Multi-Dimensional Retrieval =======

  async retrieveRelevant(
    query: string,
    userId: string,
    limit: number = 10,
    dimensions?: Array<'episodic' | 'semantic' | 'relational' | 'commitment'>
  ): Promise<MemorySearchResult[]> {
    const queryEmbedding = await this.embeddingService.embed(query);
    const dims = dimensions || ['episodic', 'semantic', 'relational', 'commitment'];

    const queries: Promise<MemorySearchResult[]>[] = [];

    if (dims.includes('episodic')) {
      queries.push(this.searchEpisodic(queryEmbedding, userId, limit));
    }
    if (dims.includes('semantic')) {
      queries.push(this.searchSemantic(queryEmbedding, userId, limit));
    }
    if (dims.includes('relational')) {
      queries.push(this.searchRelational(queryEmbedding, userId, limit));
    }
    if (dims.includes('commitment')) {
      queries.push(this.searchCommitment(queryEmbedding, userId, limit));
    }

    const results = await Promise.all(queries);
    const merged = results.flat();

    // Sort by combined score: similarity * relevanceScore
    merged.sort((a, b) => {
      const scoreA = a.similarity * a.relevanceScore;
      const scoreB = b.similarity * b.relevanceScore;
      return scoreB - scoreA;
    });

    // Mark as accessed
    for (const result of merged.slice(0, limit)) {
      await this.markAccessed(result.type, result.id);
    }

    return merged.slice(0, limit);
  }

  private async searchEpisodic(
    embedding: number[],
    userId: string,
    limit: number
  ): Promise<MemorySearchResult[]> {
    const result = await this.pool.query<any>(
      `SELECT id, text, relevance_score, created_at, metadata,
              1 - (embedding <-> $1::vector) as similarity
       FROM episodic_memory
       WHERE user_id = $2
       ORDER BY embedding <-> $1::vector
       LIMIT $3`,
      [`[${embedding.join(',')}]`, userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: parseFloat(row.similarity),
      type: 'episodic' as const,
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      metadata: this.safeMetadata(row.metadata, 'episodic.search'),
    }));
  }

  private async searchSemantic(
    embedding: number[],
    userId: string,
    limit: number
  ): Promise<MemorySearchResult[]> {
    const result = await this.pool.query<any>(
      `SELECT id, text, relevance_score, created_at, metadata,
              1 - (embedding <-> $1::vector) as similarity
       FROM semantic_memory
       WHERE user_id = $2
       ORDER BY embedding <-> $1::vector
       LIMIT $3`,
      [`[${embedding.join(',')}]`, userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: parseFloat(row.similarity),
      type: 'semantic' as const,
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      metadata: this.safeMetadata(row.metadata, 'semantic.search'),
    }));
  }

  private async searchRelational(
    embedding: number[],
    userId: string,
    limit: number
  ): Promise<MemorySearchResult[]> {
    const result = await this.pool.query<any>(
      `SELECT id, text, relevance_score, created_at, metadata,
              1 - (embedding <-> $1::vector) as similarity
       FROM relational_memory
       WHERE user_id = $2
       ORDER BY embedding <-> $1::vector
       LIMIT $3`,
      [`[${embedding.join(',')}]`, userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: parseFloat(row.similarity),
      type: 'relational' as const,
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      metadata: this.safeMetadata(row.metadata, 'relational.search'),
    }));
  }

  private async searchCommitment(
    embedding: number[],
    userId: string,
    limit: number
  ): Promise<MemorySearchResult[]> {
    const result = await this.pool.query<any>(
      `SELECT id, text, relevance_score, created_at, metadata,
              1 - (embedding <-> $1::vector) as similarity
       FROM commitment_memory
       WHERE user_id = $2 AND status = 'pending'
       ORDER BY embedding <-> $1::vector
       LIMIT $3`,
      [`[${embedding.join(',')}]`, userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      text: row.text,
      similarity: parseFloat(row.similarity),
      type: 'commitment' as const,
      relevanceScore: parseFloat(row.relevance_score),
      createdAt: row.created_at,
      metadata: this.safeMetadata(row.metadata, 'commitment.search'),
    }));
  }

  private async markAccessed(
    type: 'episodic' | 'semantic' | 'relational' | 'commitment',
    id: string
  ): Promise<void> {
    const table = `${type}_memory`;
    await this.pool.query(
      `UPDATE ${table} SET accessed_at = now() WHERE id = $1`,
      [id]
      ).catch((err) => getLogger().warn({ err, type, id }, 'Failed to mark memory as accessed'));
  }

  // ======= Decay Management =======

  async applyDecay(userId: string): Promise<{
    episodic: number;
    semantic: number;
    relational: number;
    commitment: number;
  }> {
    const counts = {
      episodic: await this.applyDecayToTable('episodic', userId),
      semantic: await this.applyDecayToTable('semantic', userId),
      relational: await this.applyDecayToTable('relational', userId),
      commitment: await this.applyDecayToTable('commitment', userId),
    };

      getLogger().info({ userId, counts }, 'Applied memory decay');
    return counts;
  }

  private async applyDecayToTable(
    type: 'episodic' | 'semantic' | 'relational' | 'commitment',
    userId: string
  ): Promise<number> {
    const table = `${type}_memory`;
    const config = DECAY_CONFIG[type];

    // Fetch all memories for user
    const result = await this.pool.query<any>(
      `SELECT id, relevance_score, accessed_at FROM ${table} WHERE user_id = $1`,
      [userId]
    );

    let updatedCount = 0;

    for (const row of result.rows) {
      const daysSinceAccess = Math.floor(
        (Date.now() - new Date(row.accessed_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const oldRelevance = parseFloat(row.relevance_score);
      const newRelevance = calculateDecay(oldRelevance, daysSinceAccess, config.halfLifeDays);

      if (Math.abs(newRelevance - oldRelevance) > 0.01) {
        await this.pool.query(
          `UPDATE ${table} SET relevance_score = $1, updated_at = now() WHERE id = $2`,
          [Math.max(config.minRelevance, newRelevance), row.id]
        );

        await this.logAudit({
          userId,
          memoryType: type,
          memoryId: row.id,
          operation: 'decay',
          oldRelevance,
          newRelevance,
        });

        updatedCount++;
      }
    }

    return updatedCount;
  }

  // ======= Audit Logging =======

  async logAudit(entry: MemoryAuditEntry): Promise<void> {
    await this.pool
      .query(
        `INSERT INTO memory_audit_log (user_id, memory_type, memory_id, operation, old_relevance, new_relevance, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          entry.userId,
          entry.memoryType,
          entry.memoryId,
          entry.operation,
          entry.oldRelevance || null,
          entry.newRelevance || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ]
      )
        .catch((err) => getLogger().warn({ err, entry }, 'Failed to log memory audit'));
  }

  // ======= Cleanup =======

  async pruneIrrelevant(userId: string, threshold: number = 0.05): Promise<number> {
    const tables = ['episodic_memory', 'semantic_memory', 'relational_memory', 'commitment_memory'];
    let totalPruned = 0;

    for (const table of tables) {
      const result = await this.pool.query(
        `DELETE FROM ${table} WHERE user_id = $1 AND relevance_score < $2 RETURNING id`,
        [userId, threshold]
      );
      totalPruned += result.rowCount || 0;
    }

        getLogger().info({ userId, threshold, totalPruned }, 'Pruned irrelevant memories');
    return totalPruned;
  }

  /**
   * Consolidate obvious facts from episodic into semantic memory.
   * Heuristic-based (non-LLM) extraction for common patterns.
   */
  async consolidateObviousFacts(userId: string): Promise<number> {
    let created = 0;
    // Find episodic turns that look like factual declarations
    const res = await this.pool.query<any>(
      `SELECT id, text FROM episodic_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [userId]
    );
    const factRegexes: Array<{ re: RegExp; transform: (m: RegExpMatchArray) => string }>= [
      { re: /User:\s*Remember:\s*favor(?:ite|ite) test word is ([A-Za-z]+)/i, transform: (m) => `Favorite test word is ${m[1]}` },
      { re: /User:\s*My birthday is\s*([^\n]+)/i, transform: (m) => `Birthday is ${m[1].trim()}` },
      { re: /User:\s*I live in\s*([^\n]+)/i, transform: (m) => `Location is ${m[1].trim()}` },
    ];
    for (const row of res.rows) {
      for (const fx of factRegexes) {
        const m = row.text.match(fx.re);
        if (m) {
          const fact = fx.transform(m);
          const emb = await this.embeddingService.embed(fact);
          await this.pool.query(
            `INSERT INTO semantic_memory (id, user_id, embedding, text, category, confidence, relevance_score, metadata, created_at, accessed_at, updated_at)
             VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8, now(), now(), now())
             ON CONFLICT DO NOTHING`,
            [
              randomUUID(),
              userId,
              `[${emb.join(',')}]`,
              fact,
              'preference',
              0.9,
              0.8,
              JSON.stringify({ source: 'consolidation', episodicId: row.id })
            ]
          );
          created++;
        }
      }
    }
    return created;
  }
}
