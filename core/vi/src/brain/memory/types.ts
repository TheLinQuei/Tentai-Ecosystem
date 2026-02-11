/**
 * Memory Types for Vi's Brain
 * Episodic (conversations, facts), Semantic (extracted knowledge), Consolidated
 */

/**
 * Episodic memory: specific conversations, queries, responses
 * Immutable, timestamped, user-specific
 */
export interface EpisodicMemory {
  id: string;
  userId: string;
  sessionId?: string;
  type: 'conversation' | 'query' | 'response' | 'interaction';
  text: string;
  metadata?: {
    intent?: string;
    entities?: Record<string, string>;
    sentiment?: 'positive' | 'neutral' | 'negative';
    tags?: string[];
  };
  timestamp: Date;
}

/**
 * Semantic memory: extracted knowledge, facts, patterns
 * Derived from episodic memory by LLM
 */
export interface SemanticMemory {
  id: string;
  userId: string;
  type: 'fact' | 'preference' | 'pattern' | 'summary';
  text: string;
  metadata?: {
    sources?: string[]; // episodic memory IDs that led to this
    confidence?: number; // 0-1
    category?: string;
    tags?: string[];
  };
  timestamp: Date;
}

/**
 * Unified memory entry (episodic or semantic)
 */
export interface MemoryEntry {
  id: string;
  userId: string;
  sessionId?: string;
  type: 'episodic' | 'semantic';
  subtype:
    | 'conversation'
    | 'query'
    | 'response'
    | 'interaction'
    | 'fact'
    | 'preference'
    | 'pattern'
    | 'summary';
  text: string;
  embedding: number[]; // 1536-dimensional vector
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Semantic search result
 */
export interface MemorySearchResult {
  id: string;
  text: string;
  similarity: number; // 0-1, higher is better
  type: 'episodic' | 'semantic';
  subtype: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Consolidation result (summarization of old memories)
 */
export interface ConsolidationResult {
  userId: string;
  mergedMemoriesCount: number;
  newSummaries: MemoryEntry[];
  removedMemoriesCount: number;
  timestamp: Date;
}
