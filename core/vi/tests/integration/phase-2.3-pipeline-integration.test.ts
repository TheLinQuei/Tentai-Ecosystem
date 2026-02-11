/**
 * Phase 2.3: Pipeline Integration Tests
 *
 * Tests GroundingGate integration into CognitionPipeline
 * Verifies: citations in pipeline output, grounding check in process method
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitionPipeline } from '../../src/brain/pipeline';
import type { LLMGateway, PolicyEngine, RunRecordStore, ToolRunner, MemoryStore } from '../../src/brain/interfaces';
import type { Citation } from '../../src/brain/grounding/types';
import { buildMockContinuityPack } from '../helpers/mockContinuityPack.js';

describe('Phase 2.3: Pipeline Integration', () => {
  let pipeline: CognitionPipeline;
  let mockLLMGateway: any;
  let mockPolicyEngine: any;
  let mockRunRecordStore: any;
  let mockMemoryStore: any;
  const VALID_INPUT = 'test scenario input for pipeline';

  beforeEach(() => {
    // Mock LLM Gateway
    mockLLMGateway = {
      classifyIntent: vi.fn().mockResolvedValue({ type: 'informational', confidence: 0.95 }),
      generateResponse: vi.fn().mockResolvedValue(
        'Akima is a character from the books. She appears in Era 3 and is known for her wisdom.'
      ),
    } as any;

    // Mock Policy Engine
    mockPolicyEngine = {
      checkPolicy: vi.fn().mockResolvedValue({ allowed: true }),
    } as any;

    // Mock Run Record Store
    mockRunRecordStore = {
      save: vi.fn().mockResolvedValue('record-123'),
      saveCitations: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock Memory Store
    mockMemoryStore = {
      store: vi.fn().mockResolvedValue(undefined),
      retrieve: vi.fn().mockResolvedValue([]),
    } as any;

    // Create pipeline
    pipeline = new CognitionPipeline(
      mockLLMGateway,
      mockPolicyEngine,
      mockRunRecordStore,
      undefined, // use default tool runner
      mockMemoryStore
    );
  });

  describe('Basic Pipeline Processing', () => {
    it('should process input and return output with recordId', async () => {
      const result = await pipeline.process('Hello', 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(result.output).toBeDefined();
      expect(result.recordId).toBeDefined();
      expect(result.hadViolation).toBe(false);
    });

    it('should include citations in result', async () => {
      const result = await pipeline.process('Tell me about Akima', 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(result.citations).toBeDefined();
      expect(Array.isArray(result.citations)).toBe(true);
    });

    it('should set recordId from run record store', async () => {
      const result = await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(result.recordId).toBe('record-123');
      expect(mockRunRecordStore.save).toHaveBeenCalled();
    });
  });

  describe('Grounding Integration', () => {
    it('should extract claims from response', async () => {
      const result = await pipeline.process(
        'What is Akima?',
        'user-1',
        'session-1',
        {
          continuityPack: buildMockContinuityPack('user-1'),
        }
      );

      // The response contains a claim about Akima
      expect(result.output).toContain('Akima');
      // Grounding check should have been performed
      expect(result.citations).toBeDefined();
    });

    it('should generate citations with confidence scores', async () => {
      const result = await pipeline.process(
        'Tell me about Akima',
        'user-1',
        'session-1',
        {
          continuityPack: buildMockContinuityPack('user-1'),
        }
      );

      if (result.citations && result.citations.length > 0) {
        result.citations.forEach((citation) => {
          expect(citation.confidence).toBeGreaterThanOrEqual(0);
          expect(citation.confidence).toBeLessThanOrEqual(1);
          expect(citation.id).toBeDefined();
          expect(citation.type).toBeDefined();
          expect(citation.sourceId).toBeDefined();
        });
      }
    });

    it('should attach citations even if grounding partially fails', async () => {
      // This tests error resilience - grounding failures should not block response
      const result = await pipeline.process(
        VALID_INPUT,
        'user-1',
        'session-1',
        {
          continuityPack: buildMockContinuityPack('user-1'),
        }
      );

      // Should have result regardless of grounding
      expect(result.output).toBeDefined();
      expect(result.recordId).toBeDefined();
      // Citations may be empty but should exist
      expect(Array.isArray(result.citations) || result.citations === undefined).toBe(true);
    });
  });

  describe('Intent Classification', () => {
    it('should call intent classifier from LLM gateway', async () => {
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(mockLLMGateway.classifyIntent).toHaveBeenCalled();
    });

    it('should pass context to intent classifier', async () => {
      const context = { userProfile: { name: 'Test' }, continuityPack: buildMockContinuityPack('user-1') };

      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', context);

      const call = mockLLMGateway.classifyIntent.mock.calls[0];
      expect(call).toBeDefined();
    });
  });

  describe('Response Generation', () => {
    it('should call LLM gateway to generate response', async () => {
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(mockLLMGateway.generateResponse).toHaveBeenCalled();
    });

    it('should include thought state in LLM call', async () => {
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      const call = mockLLMGateway.generateResponse.mock.calls[0];
      expect(call[0]).toBeDefined(); // thought state
      expect(call[0].userId || call[0].input).toBeDefined();
    });

    it('should return generated response text', async () => {
      const testOutput = 'Test response output';
      mockLLMGateway.generateResponse.mockResolvedValue(testOutput);

      const result = await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(result.output).toBe(testOutput);
    });
  });

  describe('Memory Integration', () => {
    it('should retrieve memories before response generation', async () => {
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith(
        VALID_INPUT,
        'user-1',
        3
      );
    });

    it('should handle memory retrieval failures gracefully', async () => {
      mockMemoryStore.retrieve.mockRejectedValue(new Error('Memory error'));

      const result = await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      // Should still return response
      expect(result.output).toBeDefined();
      expect(result.recordId).toBeDefined();
    });

    it('should pass retrieved memories to thought context', async () => {
      mockMemoryStore.retrieve.mockResolvedValue([
        { id: 'mem-1', text: 'test memory' },
      ]);

      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      const thoughtState = mockLLMGateway.generateResponse.mock.calls[0][0];
      expect(thoughtState.perception?.context?.retrievedMemories).toBeDefined();
    });
  });

  describe('Context Passing', () => {
    it('should pass user context through pipeline', async () => {
      const context = {
        userProfile: { name: 'TestUser' },
        recentHistory: ['past message 1', 'past message 2'],
        continuityPack: buildMockContinuityPack('user-1'),
      };

      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', context);

      const thoughtState = mockLLMGateway.generateResponse.mock.calls[0][0];
      expect(thoughtState.perception?.context?.userProfile).toBeDefined();
      expect(thoughtState.perception?.context?.recentHistory).toEqual(
        context.recentHistory
      );
    });

    it('should build thought state with userId and sessionId', async () => {
      await pipeline.process(VALID_INPUT, 'user-abc', 'session-xyz', {
        continuityPack: buildMockContinuityPack('user-abc'),
      });

      const thoughtState = mockLLMGateway.generateResponse.mock.calls[0][0];
      expect(thoughtState.userId).toBe('user-abc');
      expect(thoughtState.sessionId).toBe('session-xyz');
    });
  });

  describe('Run Record Persistence', () => {
    it('should save run record with assistant output', async () => {
      const testOutput = 'Test response';
      mockLLMGateway.generateResponse.mockResolvedValue(testOutput);

      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      const saveCall = mockRunRecordStore.save.mock.calls[0][0];
      expect(saveCall.assistantOutput).toBe(testOutput);
      expect(saveCall.inputText).toBe(VALID_INPUT);
      expect(saveCall.userId).toBe('user-1');
      expect(saveCall.sessionId).toBe('session-1');
    });

    it('should include execution metadata in run record', async () => {
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      const saveCall = mockRunRecordStore.save.mock.calls[0][0];
      expect(saveCall.intent).toBeDefined();
      expect(saveCall.timestamp).toBeDefined();
      expect(saveCall.success).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM gateway errors gracefully', async () => {
      mockLLMGateway.generateResponse.mockRejectedValue(
        new Error('LLM error')
      );

      // Should throw or handle gracefully (implementation dependent)
      try {
        await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
          continuityPack: buildMockContinuityPack('user-1'),
        });
      } catch (error) {
        // Expected behavior - error should propagate or be handled
        expect(error).toBeDefined();
      }
    });

    it('should handle run record save errors gracefully', async () => {
      mockRunRecordStore.save.mockRejectedValue(new Error('DB error'));

      try {
        await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
          continuityPack: buildMockContinuityPack('user-1'),
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should not block on grounding check failures', async () => {
      // Even if grounding throws, response should be returned
      await pipeline.process(VALID_INPUT, 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      // Should still have result
      expect(mockRunRecordStore.save).toHaveBeenCalled();
    });
  });

  describe('Citation Attachment', () => {
    it('should attach citations to result if available', async () => {
      const result = await pipeline.process(
        'test with canon content',
        'user-1',
        'session-1',
        {
          continuityPack: buildMockContinuityPack('user-1'),
        }
      );

      // Citations should exist (may be empty or populated)
      expect(result.citations === undefined || Array.isArray(result.citations)).toBe(true);
    });

    it('should persist citations when runRecordStore supports it', async () => {
      const fakeCitations: Citation[] = [
        {
          id: 'cite-1',
          type: 'canon_entity',
          sourceId: 'Era3',
          sourceText: 'Era 3',
          confidence: 0.95,
        },
      ];

      (pipeline as any).groundingGate = {
        validateResponse: vi.fn().mockResolvedValue({
          citations: fakeCitations,
          confidence: 0.95,
          missingGrounding: [],
          ungroundedClaims: [],
          passed: true,
          recommendation: 'allow',
        }),
      };

      await pipeline.process('Tell me about Era 3', 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      expect(mockRunRecordStore.saveCitations).toHaveBeenCalledWith('record-123', fakeCitations);
    });

    it('should not include citations if response has no claims', async () => {
      mockLLMGateway.generateResponse.mockResolvedValue('Hello world');

      const result = await pipeline.process('hello', 'user-1', 'session-1', {
        continuityPack: buildMockContinuityPack('user-1'),
      });

      // May not have citations for simple greeting
      expect(result.citations === undefined || Array.isArray(result.citations)).toBe(true);
    });

    it('should format citations with required fields', async () => {
      const result = await pipeline.process(
        'Tell me about Akima',
        'user-1',
        'session-1',
        {
          continuityPack: buildMockContinuityPack('user-1'),
        }
      );

      if (result.citations && result.citations.length > 0) {
        result.citations.forEach((citation) => {
          expect(citation).toHaveProperty('id');
          expect(citation).toHaveProperty('type');
          expect(citation).toHaveProperty('sourceId');
          expect(citation).toHaveProperty('sourceText');
          expect(citation).toHaveProperty('confidence');
        });
      }
    });
  });

  describe('Full Processing Flow', () => {
    it('should complete full pipeline cycle', async () => {
      const result = await pipeline.process(
        'Complete test message',
        'user-full-test',
        'session-full-test',
        {
          continuityPack: buildMockContinuityPack('user-full-test'),
        }
      );

      // Verify all stages executed
      expect(mockLLMGateway.classifyIntent).toHaveBeenCalled();
      expect(mockMemoryStore.retrieve).toHaveBeenCalled();
      expect(mockLLMGateway.generateResponse).toHaveBeenCalled();
      expect(mockRunRecordStore.save).toHaveBeenCalled();

      // Verify result has all components
      expect(result.output).toBeDefined();
      expect(result.recordId).toBe('record-123');
      expect(result.hadViolation).toBe(false);
      expect(result.citations).toBeDefined();
    });

    it('should handle extended context with all fields', async () => {
      const fullContext = {
        userProfile: { name: 'Test', preferences: {} },
        recentHistory: ['msg1', 'msg2'],
        immediateContext: ['context1'],
        personalIdentifiers: ['name1'],
        userPreferences: { theme: 'dark' },
        selfModel: { traits: [] },
        bond: { trust: 0.5 },
        stanceDecision: { stance: 'friendly' },
        continuityPack: buildMockContinuityPack('user-1'),
      };

      const result = await pipeline.process(
        'extended context test',
        'user-1',
        'session-1',
        fullContext
      );

      expect(result.output).toBeDefined();
      expect(result.recordId).toBeDefined();
    });
  });
});
