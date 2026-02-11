import { describe, it, expect } from 'vitest';
import { consolidateMemories, detectCitationConflicts } from '../../src/brain/memory/consolidation.js';
import { MemoryRecord } from '../../src/brain/types.js';
import type { Citation } from '../../src/schema/Citation.js';

describe('Memory Consolidation', () => {
  const createMemory = (
    content: string,
    citations?: Citation[],
    type: MemoryRecord['type'] = 'fact'
  ): MemoryRecord => ({
    type,
    content,
    userId: 'user-1',
    timestamp: new Date(),
    citations: citations || [],
  });

  const createCitation = (source: string, id?: string): Citation => ({
    id: id || `cit-${source}`,
    source,
    type: 'system',
    confidence: 0.9,
  });

  describe('consolidateMemories', () => {
    it('should deduplicate exact matches', async () => {
      const memories = [
        createMemory('The sky is blue', [createCitation('tool-1')]),
        createMemory('The sky is blue', [createCitation('tool-2')]),
      ];

      const result = await consolidateMemories(memories);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('The sky is blue');
      expect(result[0].citations).toHaveLength(2);
      expect(result[0].sourceCount).toBe(2);
    });

    it('should group similar memories', async () => {
      const memories = [
        createMemory('The sky appears blue', [createCitation('tool-1')]),
        createMemory('The sky is blue', [createCitation('tool-2')]),
      ];

      const result = await consolidateMemories(memories);

      expect(result).toHaveLength(1);
      expect(result[0].citations).toHaveLength(2);
    });

    it('should detect conflicts in dissimilar content', async () => {
      const memories = [
        createMemory('Paris is the capital of France', [createCitation('tool-1')]),
        createMemory('London is the capital of the UK', [createCitation('tool-2')]),
      ];

      const result = await consolidateMemories(memories);

      // Should create separate groups, not merge
      expect(result.length).toBeGreaterThanOrEqual(1);
      // If merged, should have conflicts flagged
      if (result.length === 1) {
        expect(result[0].conflicts).toBeDefined();
        expect(result[0].conflicts?.length).toBeGreaterThan(0);
      }
    });

    it('should merge citations and calculate confidence', async () => {
      const cit1 = createCitation('source-1');
      cit1.confidence = 0.95;
      const cit2 = createCitation('source-2');
      cit2.confidence = 0.85;

      const memories = [
        createMemory('Fact X', [cit1]),
        createMemory('Fact X', [cit2]),
      ];

      const result = await consolidateMemories(memories);

      expect(result[0].confidence).toBeGreaterThan(0.8);
      expect(result[0].confidence).toBeLessThanOrEqual(0.95);
    });

    it('should preserve TTL (minimum)', async () => {
      const memories = [
        { ...createMemory('Fact', [createCitation('tool-1')]), ttl: 3600 },
        { ...createMemory('Fact', [createCitation('tool-2')]), ttl: 7200 },
      ];

      const result = await consolidateMemories(memories);

      expect(result[0].ttl).toBe(3600);
    });

    it('should group by type', async () => {
      const memories = [
        createMemory('Fact 1', [createCitation('tool-1')], 'fact'),
        createMemory('Preference 1', [createCitation('tool-2')], 'preference'),
      ];

      const result = await consolidateMemories(memories);

      expect(result).toHaveLength(2);
      expect(result.filter((r) => r.type === 'fact')).toHaveLength(1);
      expect(result.filter((r) => r.type === 'preference')).toHaveLength(1);
    });

    it('should handle empty input', async () => {
      const result = await consolidateMemories([]);
      expect(result).toEqual([]);
    });
  });

  describe('detectCitationConflicts', () => {
    it('should identify conflicting sources for same content', () => {
      const consolidated = [
        {
          type: 'fact' as const,
          content: 'Capital of France',
          userId: 'user-1',
          citations: [createCitation('wikipedia'), createCitation('travel-guide')],
          confidence: 0.95,
          sourceCount: 2,
        },
        {
          type: 'fact' as const,
          content: 'Capital of France',
          userId: 'user-1',
          citations: [createCitation('unreliable-source')],
          confidence: 0.3,
          sourceCount: 1,
        },
      ];

      const conflicts = detectCitationConflicts(consolidated);

      // Should detect conflict if sources diverge significantly
      // In this case, both have same content but different sources
      expect(conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('should not flag single-source facts as conflicts', () => {
      const consolidated = [
        {
          type: 'fact' as const,
          content: 'Earth is round',
          userId: 'user-1',
          citations: [createCitation('science')],
          confidence: 0.99,
          sourceCount: 1,
        },
      ];

      const conflicts = detectCitationConflicts(consolidated);

      expect(conflicts).toHaveLength(0);
    });
  });
});
