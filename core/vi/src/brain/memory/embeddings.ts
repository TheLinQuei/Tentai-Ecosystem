/**
 * Embedding Service
 * Converts text to vector embeddings for semantic search
 * Implementations: OpenAI (production), Stub (testing)
 */

/**
 * Embedding service interface
 */
export interface EmbeddingService {
  /**
   * Generate vector embedding for text
   * Returns 1536-dimensional vector (compatible with text-embedding-3-small)
   */
  embed(text: string): Promise<number[]>;

  /**
   * Batch embed multiple texts
   */
  embedBatch(texts: string[]): Promise<number[][]>;
}

import OpenAI from 'openai';

/**
 * OpenAI Embedding Service
 * Uses text-embedding-3-small model
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private client: OpenAI;

  constructor(config: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('No embedding in response');
      }

      return embedding;
    } catch (error) {
      console.error('OpenAI embedding error:', error);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      });

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => {
        if (!item.embedding || !Array.isArray(item.embedding)) {
          throw new Error('No embedding in response');
        }
        return item.embedding;
      });
    } catch (error) {
      console.error('OpenAI batch embedding error:', error);
      throw error;
    }
  }
}

/**
 * Stub Embedding Service
 * Returns deterministic embeddings for testing (no API calls)
 */
export class StubEmbeddingService implements EmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Generate deterministic embedding based on text length and content
    const seed = text.length * 1337 + text.charCodeAt(0) * 73;
    const embedding: number[] = [];
    for (let i = 0; i < 1536; i++) {
      // Deterministic pseudo-random based on seed and index
      const x = Math.sin(seed + i) * 10000;
      embedding.push(x - Math.floor(x));
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

/**
 * Create embedding service based on config
 */
export function createEmbeddingService(config: {
  provider: 'openai' | 'stub';
  apiKey?: string;
}): EmbeddingService {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error(
          'OpenAI API key required for embedding service. Set OPENAI_API_KEY.'
        );
      }
      return new OpenAIEmbeddingService({ apiKey: config.apiKey });

    case 'stub':
    default:
      return new StubEmbeddingService();
  }
}
