/**
 * SearchMemory Tool (Enhanced)
 * Query user's episodic and semantic memory using semantic search.
 */

import type { Tool, JSONSchema, ToolExecutionContext } from '../types.js';
import type { MemoryStore } from '../../brain/interfaces.js';

const searchMemorySchema: JSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'What to search for (semantic search)',
    },
    type: {
      type: 'string',
      description: 'Filter by memory type (episodic, semantic, or all)',
    },
    limit: {
      type: 'string',
      description: 'Max results to return (default: 5)',
    },
  },
  required: ['query'],
};

/**
 * Create a SearchMemory tool bound to a MemoryStore instance.
 */
export function createSearchMemoryTool(memoryStore: MemoryStore): Tool {
  return {
    name: 'search_memory',
    category: 'memory',
    version: '1.0.0',
    description: 'Search your personal memory using semantic search',
    longDescription:
      'Performs semantic search across your stored memories (both episodic conversations and semantic facts). Returns most relevant memories based on similarity to your query.',
    examples: [
      {
        input: { query: 'what did we talk about last meeting?' },
        output: [
          {
            id: 'mem-123',
            text: 'Discussed project roadmap and Q4 goals',
            type: 'episodic',
            similarity: 0.92,
            timestamp: '2025-12-20T14:30:00Z',
          },
        ],
      },
    ],
    inputSchema: searchMemorySchema,
    permissions: ['memory'],
    rateLimit: { callsPerMinute: 50 },
    cost: { creditsPerExecution: 1 },
    timeout: { milliseconds: 5000 },
    isEnabled: true,

    async execute(
      parameters: Record<string, unknown>,
      context: ToolExecutionContext
    ): Promise<any> {
      const query = parameters.query as string;
      const type = (parameters.type as string) || 'all';
      const limit = parseInt((parameters.limit as string) || '5', 10);

      if (!query) {
        throw new Error('query parameter is required');
      }

      // Use the bound MemoryStore for actual semantic search
      const userId = context.userId;
      const results = await memoryStore.retrieve(query, userId, limit);

      // Filter by type if specified
      const filtered =
        type === 'all'
          ? results
          : results.filter((m: any) => m.type === type);

      return {
        query,
        results: filtered,
        count: filtered.length,
      };
    },
  };
}

/**
 * Legacy stub tool for testing without MemoryStore.
 */
export const SearchMemoryTool: Tool = {
  name: 'search_memory',
  category: 'memory',
  version: '1.0.0',
  description: 'Search your personal memory using semantic search (STUB)',
  longDescription:
    'Performs semantic search across your stored memories (both episodic conversations and semantic facts). Returns most relevant memories based on similarity to your query.',
  examples: [
    {
      input: { query: 'what did we talk about last meeting?' },
      output: [
        {
          id: 'mem-123',
          text: 'Discussed project roadmap and Q4 goals',
          type: 'episodic',
          similarity: 0.92,
          timestamp: '2025-12-20T14:30:00Z',
        },
      ],
    },
  ],
  inputSchema: searchMemorySchema,
  permissions: ['memory'],
  rateLimit: { callsPerMinute: 50 },
  cost: { creditsPerExecution: 1 },
  timeout: { milliseconds: 5000 },
  isEnabled: true,

  async execute(parameters: Record<string, unknown>, _context: ToolExecutionContext): Promise<any> {
    const query = parameters.query as string;
    const type = (parameters.type as string) || 'all';
    const limit = parseInt((parameters.limit as string) || '5', 10);

    if (!query) {
      throw new Error('query parameter is required');
    }

    // Phase 1: This is a stub that returns mock data
    const mockMemories = [
      {
        id: 'mem-001',
        text: 'Discussed project timeline and deliverables',
        type: 'episodic',
        similarity: 0.88,
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'mem-002',
        text: 'Important fact: system requires 99.9% uptime',
        type: 'semantic',
        similarity: 0.75,
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const filtered =
      type === 'all'
        ? mockMemories
        : mockMemories.filter((m) => m.type === type);

    return {
      query,
      results: filtered.slice(0, limit),
      count: filtered.length,
    };
  },
};
