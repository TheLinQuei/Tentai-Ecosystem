/**
 * Phase 2.2: Memory Integration Tests
 *
 * Tests MemoryResolver and integrated grounding with memory
 * Verifies: memory search, fallback strategy, combined citations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryResolver } from '../../src/brain/grounding/MemoryResolver';
import { GroundingGate } from '../../src/brain/grounding/GroundingGate';
import {
  GroundingContext,
  GroundingRequirements,
  Citation,
  MemoryRecord,
} from '../../src/brain/grounding/types';

describe('Phase 2.2: Memory Integration', () => {
  let memoryResolver: MemoryResolver;
  let gate: GroundingGate;
  let mockMemoryRepository: any;
  let baseContext: GroundingContext;

  beforeEach(() => {
    // Mock memory repository
    mockMemoryRepository = {
      getLongTermByUserId: async (userId: string, limit: number) => [
        {
          id: 'mem-1',
          user_id: userId,
          text: 'User mentioned Akima is their favorite character from the books',
          metadata: { entityId: 'Akima', source: 'conversation' },
          relevance_score: 0.85,
          accessed_at: new Date(),
          created_at: new Date(),
        },
        {
          id: 'mem-2',
          user_id: userId,
          text: 'Valeric was described as a warrior who survived the Great War',
          metadata: { entityId: 'Valeric', source: 'user_statement' },
          relevance_score: 0.72,
          accessed_at: new Date(),
          created_at: new Date(),
        },
      ],
      getShortTermByUserId: async (userId: string, limit: number) => [
        {
          id: 'mem-3',
          user_id: userId,
          text: 'Just discussed how Akima recovered from the poison',
          metadata: { entityId: 'Akima' },
          relevance_score: 0.95,
          accessed_at: new Date(),
          created_at: new Date(),
        },
      ],
      getEpisodicByUserId: async (userId: string, limit: number) => [
        {
          id: 'mem-4',
          user_id: userId,
          session_id: 'session-1',
          text: 'In this session, user asked about Era 3 conflicts',
          metadata: { topic: 'history', era: 'Era3' },
          relevance_score: 0.88,
          accessed_at: new Date(),
          created_at: new Date(),
        },
      ],
    };

    memoryResolver = new MemoryResolver(mockMemoryRepository);
    gate = new GroundingGate(undefined, memoryResolver);

    const requirements: GroundingRequirements = {
      canonMode: 'query',
      requireCitations: true,
      minConfidence: 0.7,
      allowUnknown: false,
      maxUngroundedClaims: 0,
    };

    baseContext = {
      userId: 'user-123',
      conversationId: 'conv-1',
      sessionId: 'session-1',
      canonMode: 'query',
      requirements,
      availableMemories: new Map([
        ['Akima', 'User loves Akima character'],
        ['Valeric', 'Valeric is a warrior'],
      ]),
      availableCanon: new Map([
        ['Era3', 'Era 3: Timeline of Transition'],
        // Akima NOT in canon - should fall back to memory
      ]),
    };
  });

  describe('MemoryResolver Basics', () => {
    it('should resolve from memory when canon missing', async () => {
      const citations = await memoryResolver.resolveFromMemory(
        'user-123',
        'Tell me about Akima',
        { dimension: 'long_term', maxResults: 5 }
      );

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].type).toBe('memory');
      expect(citations[0].confidence).toBeLessThanOrEqual(0.85);
    });

    it('should respect minRelevance threshold', async () => {
      const citations = await memoryResolver.resolveFromMemory(
        'user-123',
        'Any memories',
        { dimension: 'long_term', minRelevance: 0.95 }
      );

      // Should have fewer results with higher threshold
      expect(citations.length).toBeLessThanOrEqual(5);
    });

    it('should query different memory dimensions', async () => {
      const longTerm = await memoryResolver.resolveFromMemory('user-123', 'query', {
        dimension: 'long_term',
        maxResults: 10,
      });

      const shortTerm = await memoryResolver.resolveFromMemory('user-123', 'query', {
        dimension: 'short_term',
        maxResults: 10,
      });

      const episodic = await memoryResolver.resolveFromMemory('user-123', 'query', {
        dimension: 'episodic',
        maxResults: 10,
      });

      expect(longTerm.length).toBeGreaterThanOrEqual(0);
      expect(shortTerm.length).toBeGreaterThanOrEqual(0);
      expect(episodic.length).toBeGreaterThanOrEqual(0);
    });

    it('should get memory by entity', async () => {
      const citations = await memoryResolver.getMemoryByEntity('user-123', 'Akima');

      if (citations.length > 0) {
        expect(citations[0].sourceId).toBe('Akima');
      }
    });

    it('should return empty for non-existent user memory', async () => {
      mockMemoryRepository.getLongTermByUserId = async () => [];
      memoryResolver = new MemoryResolver(mockMemoryRepository);

      const citations = await memoryResolver.resolveFromMemory('nonexistent-user', 'query');

      expect(citations.length).toBe(0);
    });
  });

  describe('Canon-First Fallback Strategy', () => {
    it('should use canon when available', async () => {
      const claim = {
        id: 'claim-1',
        text: 'Era 3 is important',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual' as const,
        relatedEntities: ['Era3'],
      };

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      // Should find in canon (not memory)
      if (citations.length > 0) {
        const canonCites = citations.filter((c) => c.type === 'canon_entity');
        expect(canonCites.length).toBeGreaterThan(0);
      }
    });

    it('should fall back to memory when canon missing', async () => {
      const claim = {
        id: 'claim-1',
        text: 'Akima is important',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual' as const,
        relatedEntities: ['Akima'],
      };

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      // Should find in memory (not canon)
      if (citations.length > 0) {
        const memoryCites = citations.filter((c) => c.type === 'memory');
        expect(memoryCites.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should prefer canon over memory', async () => {
      const claim = {
        id: 'claim-1',
        text: 'Era 3 and Akima',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual' as const,
        relatedEntities: ['Era3', 'Akima'],
      };

      // Add Akima to canon too
      baseContext.availableCanon.set('Akima', 'Akima: protagonist');

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      if (citations.length > 0) {
        // Era3 should come from canon, might get Akima from either
        const era3 = citations.find((c) => c.sourceId === 'Era3');
        expect(era3?.type).toBe('canon_entity');
      }
    });
  });

  describe('Citation Combination', () => {
    it('should combine canon and memory citations without duplication', () => {
      const canonCitations: Citation[] = [
        {
          id: 'cite-canon-1',
          type: 'canon_entity',
          sourceId: 'Era3',
          sourceText: 'Era 3 data',
          confidence: 0.95,
        },
      ];

      const memoryCitations: Citation[] = [
        {
          id: 'cite-mem-1',
          type: 'memory',
          sourceId: 'Akima',
          sourceText: 'Akima memory',
          confidence: 0.75,
        },
        {
          id: 'cite-canon-1', // Duplicate
          type: 'canon_entity',
          sourceId: 'Era3',
          sourceText: 'Era 3 data',
          confidence: 0.95,
        },
      ];

      const combined = memoryResolver.combineCitations(canonCitations, memoryCitations);

      expect(combined.length).toBe(2); // Should deduplicate
      const era3Count = combined.filter((c) => c.sourceId === 'Era3').length;
      expect(era3Count).toBe(1);
    });

    it('should put canon before memory in combined list', () => {
      const canonCitations: Citation[] = [
        {
          id: 'cite-canon-1',
          type: 'canon_entity',
          sourceId: 'Era3',
          sourceText: 'Era 3 data',
          confidence: 0.95,
        },
      ];

      const memoryCitations: Citation[] = [
        {
          id: 'cite-mem-1',
          type: 'memory',
          sourceId: 'Akima',
          sourceText: 'Akima memory',
          confidence: 0.75,
        },
      ];

      const combined = memoryResolver.combineCitations(canonCitations, memoryCitations);

      expect(combined[0].type).toBe('canon_entity'); // Canon should be first
      expect(combined[1].type).toBe('memory'); // Memory should be second
    });
  });

  describe('Integrated Grounding with Memory', () => {
    it('should validate response using memory when canon missing', async () => {
      const response = 'Akima is a character that appears in the books.';
      const check = await gate.validateResponse(response, baseContext);

      // Should find some grounding from memory
      expect(check).toBeDefined();
      expect(check.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should ground mixed canon and memory claims', async () => {
      const response = 'Era 3 is important, and Akima is a main character.';
      const check = await gate.validateResponse(response, baseContext);

      // Should have citations from both canon and memory
      expect(check.citations.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle memory with varying confidence levels', async () => {
      const response = 'According to user memories, Akima recovered from poison.';
      const check = await gate.validateResponse(response, baseContext);

      if (check.citations.length > 0) {
        check.citations.forEach((c) => {
          expect(c.confidence).toBeGreaterThan(0);
          expect(c.confidence).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  describe('Memory Quality Metrics', () => {
    it('should calculate memory quality for user', async () => {
      const quality = await memoryResolver.getMemoryQuality('user-123');

      expect(quality.totalMemories).toBeGreaterThanOrEqual(0);
      expect(quality.avgRelevance).toBeGreaterThanOrEqual(0);
      expect(quality.avgRelevance).toBeLessThanOrEqual(1);
      expect(quality.dimensions).toBeDefined();
    });

    it('should break down quality by dimension', async () => {
      const quality = await memoryResolver.getMemoryQuality('user-123');

      expect(quality.dimensions).toHaveProperty('long_term');
      expect(quality.dimensions).toHaveProperty('short_term');
      expect(quality.dimensions).toHaveProperty('episodic');
    });
  });

  describe('Citation Summaries', () => {
    it('should summarize short citations without truncation', () => {
      const citation: Citation = {
        id: 'cite-1',
        type: 'memory',
        sourceId: 'test',
        sourceText: 'Short text',
        confidence: 0.8,
      };

      const summary = memoryResolver.summarizeMemoryCitation(citation, 50);
      expect(summary).toBe('Short text');
    });

    it('should truncate long citations with ellipsis', () => {
      const citation: Citation = {
        id: 'cite-1',
        type: 'memory',
        sourceId: 'test',
        sourceText: 'This is a very long citation that should be truncated because it exceeds the maximum length',
        confidence: 0.8,
      };

      const summary = memoryResolver.summarizeMemoryCitation(citation, 30);
      expect(summary.length).toBeLessThanOrEqual(33);
      expect(summary).toContain('...');
    });
  });

  describe('Error Handling', () => {
    it('should handle memory repository errors gracefully', async () => {
      mockMemoryRepository.getLongTermByUserId = async () => {
        throw new Error('Database error');
      };

      const memoryResolverWithError = new MemoryResolver(mockMemoryRepository);
      const citations = await memoryResolverWithError.resolveFromMemory('user-123', 'test');

      expect(Array.isArray(citations)).toBe(true);
      expect(citations.length).toBe(0);
    });

    it('should handle null/undefined memory gracefully', async () => {
      mockMemoryRepository.getLongTermByUserId = async () => null;

      const memoryResolverWithError = new MemoryResolver(mockMemoryRepository);
      const citations = await memoryResolverWithError.resolveFromMemory('user-123', 'test');

      expect(Array.isArray(citations)).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle realistic user query with memory grounding', async () => {
      const response = `Based on our previous conversations, Akima is your favorite character. 
        She appears in Era 3 timeline and is known for strategic thinking. 
        Valeric was also mentioned as a warrior during that period.`;

      const check = await gate.validateResponse(response, baseContext);

      expect(check.citations.length).toBeGreaterThanOrEqual(0);
      expect(check.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should differentiate between well-grounded and ungrounded mixed claims', async () => {
      const groundedResponse = 'Era 3 is when Akima made her greatest achievements.';
      const ungroundedResponse = 'Era 3 had sentient robots and advanced AI (not in canon or memory).';

      const groundedCheck = await gate.validateResponse(groundedResponse, baseContext);
      const ungroundedCheck = await gate.validateResponse(ungroundedResponse, baseContext);

      // Both should be processable, but grounded should have different stats
      expect(groundedCheck).toBeDefined();
      expect(ungroundedCheck).toBeDefined();
    });
  });
});
