/**
 * Reflection Pipeline Tests
 * Tests the reflection stage of the cognition pipeline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Reflector } from '../../src/brain/reflector.js';
import { ThoughtState } from '../../src/brain/types.js';

describe('Reflector', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  describe('Basic Reflection', () => {
    it('should reflect on successful execution', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'test query',
        timestamp: new Date(),
        intent: {
          category: 'chat',
          requiresMemory: false,
          requiresTools: false
        },
        plan: {
          steps: [{ type: 'respond', description: 'Generate response' }],
          estimatedComplexity: 'low'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'tool_call', toolName: 'test', duration: 100, result: { output: 'test result' } }
          ],
          toolResults: []
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection).toBeDefined();
      expect(reflection.summary).toBeDefined();
      expect(reflection.confidenceInResponse).toBeGreaterThan(0);
    });

    it('should reflect on failed execution', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'test query',
        timestamp: new Date(),
        intent: {
          category: 'chat',
          requiresMemory: false,
          requiresTools: false
        },
        plan: {
          steps: [{ type: 'respond', description: 'Generate response' }],
          estimatedComplexity: 'low'
        },
        execution: {
          success: false,
          stepsExecuted: [],
          errors: ['Tool failed']
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection).toBeDefined();
      expect(reflection.summary).toContain('failure');
      expect(reflection.keyFindings).toBeDefined();
    });

    it('should extract memory from conversations', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'Remember my birthday is June 15th',
        timestamp: new Date(),
        intent: {
          category: 'chat',
          requiresMemory: true,
          requiresTools: false
        },
        plan: {
          steps: [{ type: 'store_memory', description: 'Store user information' }],
          estimatedComplexity: 'low'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'memory_store', duration: 50, result: { stored: true } }
          ]
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.memoryToStore).toBeDefined();
      expect(reflection.memoryToStore?.length).toBeGreaterThan(0);
    });
  });

  describe('Learning Extraction', () => {
    it('should extract citations from tool results', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'search for data',
        timestamp: new Date(),
        intent: {
          category: 'search',
          requiresMemory: false,
          requiresTools: true
        },
        plan: {
          steps: [{ type: 'tool_use', description: 'Use search tool' }],
          estimatedComplexity: 'medium'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'tool_call', toolName: 'search', duration: 100, result: { output: 'data1' } }
          ],
          toolResults: [
            { toolName: 'search', citations: [{ id: 'cite-1', source: 'test' }] }
          ]
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.memoryToStore).toBeDefined();
      expect(reflection.memoryToStore?.some(m => m.citations)).toBe(true);
    });

    it('should track policy decisions', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'execute command',
        timestamp: new Date(),
        intent: {
          category: 'command',
          requiresMemory: false,
          requiresTools: true
        },
        plan: {
          steps: [{ type: 'policy_check', description: 'Check authorization' }],
          estimatedComplexity: 'medium'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'policy_check', duration: 10, result: { authorized: true } }
          ]
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.policyDecisions).toBeDefined();
      expect(reflection.policyDecisions?.length).toBeGreaterThan(0);
    });
  });

  describe('Reflection Quality', () => {
    it('should produce summary with key metrics', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'complex task',
        timestamp: new Date(),
        intent: {
          category: 'task',
          requiresMemory: false,
          requiresTools: true
        },
        plan: {
          steps: [
            { type: 'tool_call', description: 'Step 1' },
            { type: 'tool_call', description: 'Step 2' }
          ],
          estimatedComplexity: 'high'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'tool_call', duration: 100, toolName: 'tool1', result: {} },
            { type: 'tool_call', duration: 200, toolName: 'tool2', result: {} }
          ]
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.summary).toContain('Completed');
      expect(reflection.summary).toContain('steps');
      expect(reflection.keyFindings.length).toBeGreaterThan(0);
    });

    it('should track confidence in reflections', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'simple task',
        timestamp: new Date(),
        intent: {
          category: 'chat',
          requiresMemory: false,
          requiresTools: false
        },
        plan: {
          steps: [{ type: 'respond', description: 'Generate response' }],
          estimatedComplexity: 'low'
        },
        execution: {
          success: true,
          stepsExecuted: [
            { type: 'respond', duration: 50, result: {} }
          ]
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.confidenceInResponse).toBeDefined();
      expect(reflection.confidenceInResponse).toBeGreaterThanOrEqual(0);
      expect(reflection.confidenceInResponse).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle incomplete thought state gracefully', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'incomplete',
        timestamp: new Date()
        // Missing intent, plan, execution
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection).toBeDefined();
      expect(reflection.summary).toContain('Incomplete');
      expect(reflection.confidenceInResponse).toBe(0);
    });

    it('should handle execution errors', async () => {
      const thought: ThoughtState = {
        userId: 'test-user',
        input: 'error test',
        timestamp: new Date(),
        intent: {
          category: 'test',
          requiresMemory: false,
          requiresTools: false
        },
        plan: {
          steps: [{ type: 'test', description: 'Test step' }],
          estimatedComplexity: 'low'
        },
        execution: {
          success: false,
          stepsExecuted: [],
          errors: ['Network timeout', 'Retry failed']
        }
      };

      const reflection = await reflector.reflect(thought);

      expect(reflection.keyFindings.some(f => f.includes('failed'))).toBe(true);
      expect(reflection.confidenceInResponse).toBeLessThan(0.5);
    });
  });
});
