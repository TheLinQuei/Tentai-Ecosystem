import { describe, it, expect } from 'vitest';
import { CognitionPipeline } from '../../src/brain/pipeline.js';
import type { LLMGateway, PolicyEngine, RunRecordStore, ToolRunner } from '../../src/brain/interfaces.js';
import type { Intent, Plan } from '../../src/brain/types.js';

const stubLLM: LLMGateway = {
  async classifyIntent(): Promise<Intent> {
    return { category: 'conversation', confidence: 0.8 };
  },
  async generatePlan(): Promise<Plan> {
    return {
      steps: [{ id: 'step-1', type: 'respond', description: 'Respond' }],
      reasoning: 'stub',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };
  },
  async generateResponse(): Promise<string> {
    return 'ok';
  },
};

const stubPolicy: PolicyEngine = {
  async authorize() { return true; },
  async check() { return []; },
  async recordDecision() { return; },
};

const stubRunRecordStore: RunRecordStore = {
  async save() { return 'record-1'; },
  async get() { return null; },
  async listByUser() { return []; },
  async listBySession() { return []; },
};

const stubToolRunner: ToolRunner = {
  async execute() { return { success: true }; },
  async listAvailable() { return []; },
};

describe('CognitionPipeline continuity guard', () => {
  it('fails hard when ContinuityPack is missing', async () => {
    const pipeline = new CognitionPipeline(
      stubLLM,
      stubPolicy,
      stubRunRecordStore,
      stubToolRunner
    );

    await expect(
      pipeline.process('hello', 'user-1', 'session-1', {})
    ).rejects.toThrow('ContinuityPack is mandatory');
  });
});
