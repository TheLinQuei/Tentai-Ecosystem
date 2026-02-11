import { describe, it, expect } from 'vitest';
import { consolidateMemories, detectCitationConflicts } from '../../src/brain/memory/consolidation.js';

describe('Memory consolidation boundary', () => {
  it('should be implemented (no longer throws NotImplementedByDesign)', async () => {
    // Memory consolidation is now implemented in Phase 2
    const result = await consolidateMemories([]);
    expect(result).toEqual([]);
  });

  it('should provide citation tracking via detectCitationConflicts', () => {
    const consolidated = [
      {
        type: 'fact' as const,
        content: 'Test fact',
        userId: 'user-1',
        citations: [{ id: 'c1', source: 'source1', type: 'system' as const }],
        confidence: 0.9,
        sourceCount: 1,
      },
    ];

    const conflicts = detectCitationConflicts(consolidated);
    expect(Array.isArray(conflicts)).toBe(true);
  });
});

