import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '../../../src/brain/interfaces.js';
import { createSearchMemoryTool, SearchMemoryTool } from '../../../src/tools/builtins/SearchMemory.js';

describe('SearchMemoryTool', () => {
  it('returns mock results with stub tool', async () => {
    const context = { userId: 'test-user', sessionId: 'test-session' };
    const result = await SearchMemoryTool.execute(
      { query: 'project timeline' },
      context
    );

    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('count');
    expect(result.count).toBeGreaterThan(0);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('filters by memory type', async () => {
    const context = { userId: 'test-user', sessionId: 'test-session' };
    const result = await SearchMemoryTool.execute(
      { query: 'something', type: 'episodic' },
      context
    );

    expect(result.results.every((m: any) => m.type === 'episodic')).toBe(true);
  });

  it('respects limit parameter', async () => {
    const context = { userId: 'test-user', sessionId: 'test-session' };
    const result = await SearchMemoryTool.execute(
      { query: 'something', limit: '1' },
      context
    );

    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it('throws on missing query parameter', async () => {
    const context = { userId: 'test-user', sessionId: 'test-session' };
    await expect(
      SearchMemoryTool.execute({ query: '' }, context)
    ).rejects.toThrow('query parameter is required');
  });

  it('creates a tool with custom MemoryStore', async () => {
    const mockMemoryStore: MemoryStore = {
      store: async () => 'mock-id',
      retrieve: async (query, userId, limit) => [
        {
          id: 'custom-mem-1',
          text: `Search results for: ${query}`,
          similarity: 0.95,
          type: 'episodic',
          createdAt: new Date(),
        },
      ],
    };

    const customTool = createSearchMemoryTool(mockMemoryStore);
    const context = { userId: 'test-user', sessionId: 'test-session' };
    const result = await customTool.execute(
      { query: 'custom search' },
      context
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe('custom-mem-1');
    expect(result.results[0].text).toContain('custom search');
  });
});
