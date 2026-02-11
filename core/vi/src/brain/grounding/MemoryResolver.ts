/**
 * MemoryResolver — Memory-Based Grounding
 *
 * Extends grounding to query user memories alongside canon
 * Used as fallback when canon doesn't have information
 * Part of "canon first, memory second" strategy
 */

import { Citation, MemoryRecord } from './types';

export interface MemoryResolverOptions {
  minRelevance?: number;
  maxResults?: number;
  dimension?: 'long_term' | 'short_term' | 'episodic';
}

/**
 * Resolves claims against user memory
 * Called after canon resolution fails
 */
export class MemoryResolver {
  private readonly logger: any;
  private readonly memoryRepository: any; // MultiDimensionalMemoryRepository
  private readonly defaultOptions: MemoryResolverOptions = {
    minRelevance: 0.6,
    maxResults: 5,
    dimension: 'long_term',
  };

  constructor(memoryRepository: any, logger?: any) {
    this.memoryRepository = memoryRepository;
    this.logger = logger || console;
  }

  /**
   * Resolve a query against user memory
   */
  async resolveFromMemory(
    userId: string,
    query: string,
    options?: MemoryResolverOptions
  ): Promise<Citation[]> {
    const opts = { ...this.defaultOptions, ...options };

    try {
      // Search memory for relevant records
      const memories = await this.searchMemory(userId, query, opts);

      if (memories.length === 0) {
        this.logger.debug(`No memory found for query: "${query}"`);
        return [];
      }

      // Convert memories to citations
      const citations = memories.map((mem, idx) =>
        this.memoryToCitation(mem, idx, userId)
      );

      this.logger.debug(`Found ${citations.length} memory citations for query: "${query}"`);
      return citations;
    } catch (error) {
      this.logger.error('Error resolving from memory', { error, userId, query });
      return [];
    }
  }

  /**
   * Search memory using semantic similarity
   */
  private async searchMemory(
    userId: string,
    query: string,
    options: MemoryResolverOptions
  ): Promise<MemoryRecord[]> {
    // This would use the memory repository's semantic search
    // For now, we'll return structured interface

    try {
      // Call repository methods based on dimension
      let memories: any[] = [];

      if (options.dimension === 'long_term') {
        memories = await this.memoryRepository?.getLongTermByUserId?.(
          userId,
          options.maxResults
        );
      } else if (options.dimension === 'short_term') {
        memories = await this.memoryRepository?.getShortTermByUserId?.(
          userId,
          options.maxResults
        );
      } else if (options.dimension === 'episodic') {
        memories = await this.memoryRepository?.getEpisodicByUserId?.(
          userId,
          options.maxResults
        );
      }

      // Filter by relevance threshold
      const filtered = (memories || []).filter(
        (m) => (m.relevance_score || 0) >= (options.minRelevance || 0)
      );

      return filtered.map((m) => ({
        id: m.id,
        text: m.text,
        entityId: this.extractEntityIdFromMetadata(m.metadata),
        sessionId: m.session_id,
        confidence: m.relevance_score || 0.5,
        timestamp: m.accessed_at || m.created_at,
        dimension: options.dimension || 'long_term',
      }));
    } catch (error) {
      this.logger.warn('Failed to search memory', { error, userId });
      return [];
    }
  }

  /**
   * Convert memory record to citation
   */
  private memoryToCitation(
    memory: MemoryRecord,
    index: number,
    userId: string
  ): Citation {
    return {
      id: `cite-memory-${memory.id}-${Date.now()}`,
      type: 'memory',
      sourceId: memory.entityId || memory.id,
      sourceText: memory.text,
      confidence: Math.min(memory.confidence * 0.8, 0.85), // Slightly lower than canon
      timestamp: memory.timestamp,
      metadata: {
        dimension: memory.dimension,
        sessionId: memory.sessionId,
        searchOrder: index,
        strategy: 'memory_resolver',
      },
    };
  }

  /**
   * Get memory by entity reference
   */
  async getMemoryByEntity(
    userId: string,
    entityId: string,
    options?: MemoryResolverOptions
  ): Promise<Citation[]> {
    try {
      const opts = { ...this.defaultOptions, ...options };

      // Search for memories tagged with this entity
      const memories = await this.searchMemoryByEntity(userId, entityId, opts);

      const citations = memories.map((mem, idx) =>
        this.memoryToCitation(mem, idx, userId)
      );

      return citations;
    } catch (error) {
      this.logger.error('Error getting memory by entity', { error, userId, entityId });
      return [];
    }
  }

  /**
   * Search memory for specific entity
   */
  private async searchMemoryByEntity(
    userId: string,
    entityId: string,
    options: MemoryResolverOptions
  ): Promise<MemoryRecord[]> {
    try {
      // Query memories where metadata contains entity reference
      let memories: any[] = [];

      if (options.dimension === 'long_term') {
        memories = await this.memoryRepository?.getLongTermByUserId?.(
          userId,
          options.maxResults
        );
      } else {
        memories = await this.memoryRepository?.getEpisodicByUserId?.(
          userId,
          options.maxResults
        );
      }

      // Filter to only memories mentioning the entity
      const filtered = (memories || []).filter(
        (m) =>
          (m.metadata?.entityId === entityId || 
           m.text?.toLowerCase().includes(entityId?.toLowerCase())) &&
          (m.relevance_score || 0) >= (options.minRelevance || 0)
      );

      return filtered.map((m) => ({
        id: m.id,
        text: m.text,
        entityId: entityId,
        sessionId: m.session_id,
        confidence: m.relevance_score || 0.5,
        timestamp: m.accessed_at || m.created_at,
        dimension: options.dimension || 'long_term',
      }));
    } catch (error) {
      this.logger.warn('Failed to search memory by entity', {
        error,
        userId,
        entityId,
      });
      return [];
    }
  }

  /**
   * Extract entity ID from memory metadata
   */
  private extractEntityIdFromMetadata(metadata: any): string | undefined {
    if (!metadata) return undefined;

    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata);
        return parsed.entityId;
      } catch {
        return undefined;
      }
    }

    return metadata.entityId;
  }

  /**
   * Combine canon and memory citations
   */
  combineCitations(canonCitations: Citation[], memoryCitations: Citation[]): Citation[] {
    // Remove duplicate source references
    const seen = new Set<string>();
    const combined: Citation[] = [];

    // Add canon first (higher confidence)
    for (const citation of canonCitations) {
      const key = `${citation.type}:${citation.sourceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(citation);
      }
    }

    // Add memory (lower confidence, complementary)
    for (const citation of memoryCitations) {
      const key = `${citation.type}:${citation.sourceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(citation);
      }
    }

    return combined;
  }

  /**
   * Measure memory quality for a user
   */
  async getMemoryQuality(userId: string): Promise<{
    totalMemories: number;
    avgRelevance: number;
    dimensions: Record<string, number>;
  }> {
    try {
      const longTerm = await this.memoryRepository?.getLongTermByUserId?.(userId, 100);
      const shortTerm = await this.memoryRepository?.getShortTermByUserId?.(userId, 100);
      const episodic = await this.memoryRepository?.getEpisodicByUserId?.(userId, 100);

      const allMemories = [...(longTerm || []), ...(shortTerm || []), ...(episodic || [])];
      const totalMemories = allMemories.length;
      const avgRelevance =
        totalMemories > 0
          ? allMemories.reduce((sum, m) => sum + (m.relevance_score || 0), 0) / totalMemories
          : 0;

      return {
        totalMemories,
        avgRelevance,
        dimensions: {
          long_term: longTerm?.length || 0,
          short_term: shortTerm?.length || 0,
          episodic: episodic?.length || 0,
        },
      };
    } catch (error) {
      this.logger.warn('Failed to get memory quality', { error, userId });
      return {
        totalMemories: 0,
        avgRelevance: 0,
        dimensions: {},
      };
    }
  }

  /**
   * Summarize memory for display
   */
  summarizeMemoryCitation(citation: Citation, maxLength: number = 200): string {
    if (citation.sourceText.length <= maxLength) {
      return citation.sourceText;
    }

    return citation.sourceText.substring(0, maxLength) + '...';
  }
}
