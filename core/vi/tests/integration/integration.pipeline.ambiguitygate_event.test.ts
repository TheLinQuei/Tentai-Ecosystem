import { describe, expect, it, vi } from 'vitest';
import { CognitionPipeline } from '../../src/brain/pipeline.js';
import { buildMockContinuityPack } from '../helpers/mockContinuityPack.js';

const EXPECTED_PROMPT = "That phrase doesn't parse. Did you mean something else?";

describe('CognitionPipeline ambiguity event', () => {
  it('emits ambiguity_detected and stops before planner/tools', async () => {
    const llmGateway = {
      classifyIntent: vi.fn().mockResolvedValue({ type: 'informational', confidence: 0.9 }),
      generatePlan: vi.fn().mockResolvedValue({ steps: [], reasoning: 'n/a', estimatedComplexity: 'simple', toolsNeeded: [], memoryAccessNeeded: false }),
      generateResponse: vi.fn().mockResolvedValue('n/a'),
    } as any;

    const policyEngine = {
      authorize: vi.fn().mockResolvedValue(true),
      check: vi.fn().mockResolvedValue([]),
      recordDecision: vi.fn().mockResolvedValue(undefined),
    } as any;

    const runRecordStore = {
      save: vi.fn().mockResolvedValue('record-123'),
      saveCitations: vi.fn().mockResolvedValue(undefined),
    } as any;

    const toolRunner = {
      execute: vi.fn().mockResolvedValue({ success: true, data: {} }),
      listAvailable: vi.fn().mockResolvedValue([]),
    } as any;

    const pipeline = new CognitionPipeline(
      llmGateway,
      policyEngine,
      runRecordStore,
      toolRunner
    );

    const events: Array<{ type: string }> = [];
    const result = await pipeline.process(
      'so what not',
      'user-1',
      'session-1',
      { continuityPack: buildMockContinuityPack('user-1') },
      (evt) => events.push(evt)
    );

    expect(result.output).toBe(EXPECTED_PROMPT);

    const eventTypes = new Set(events.map((evt) => evt.type));
    expect(eventTypes.has('ambiguity_detected')).toBe(true);
    expect(eventTypes.has('intent')).toBe(false);
    expect(eventTypes.has('plan')).toBe(false);
    expect(eventTypes.has('execution')).toBe(false);
    expect(eventTypes.has('reflection')).toBe(false);

    expect(llmGateway.classifyIntent).not.toHaveBeenCalled();
    expect(toolRunner.execute).not.toHaveBeenCalled();
  });
});
