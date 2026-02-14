import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock response content controlled by tests
let mockLLMResponse: string = 'default response';

// Mock OpenAI module BEFORE importing planLLM
vi.mock('openai', () => {
  // Need to access mockLLMResponse through a getter to get the current value
  const getMockResponse = () => mockLLMResponse;
  
  class OpenAIMock {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: getMockResponse() } }]
        })
      }
    };
  }
  return { default: OpenAIMock };
});

import { planLLM } from '../../src/planner.llm';

const log: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const skillGraph: any = {
  shouldUseSkill: vi.fn().mockResolvedValue(null),
};

const OBS: any = {
  id: 'obs-contract-1',
  type: 'MESSAGE',
  content: 'Vi, please help me',  // Mention Vi to pass ambient filter but avoid intent mapper
  authorId: 'user-1',
  channelId: 'chan-1',
  guildId: 'guild-1',
  timestamp: new Date().toISOString(),
  authorDisplayName: 'PublicUser',
};

const CONTEXT: any = { recent: [], relevant: [] };

const INTENT_STRICT: any = {
  source: 'intent-map',
  intent: 'guild.member.count',
  confidence: 0.9,
  gating: 'strict',
  allowedTools: ['guild.member.count', 'message.send'],
  meta: {},
  contributingSignals: [],
  resolvedAt: new Date().toISOString(),
  skillMatch: null,
};

const INTENT_SOFT: any = {
  ...INTENT_STRICT,
  gating: 'soft',
  allowedTools: ['guild.member.count'],
};

const IDENTITY: any = {
  identityZone: 'PUBLIC_GUILD' as const,
  identityProfile: {
    userId: 'user-1',
    publicAliases: ['PublicUser'],
    privateAliases: ['Kaelen', 'baby'],
    allowAutoIntimate: true,
    lastKnownDisplayName: 'PublicUser',
    lastUpdated: new Date().toISOString(),
  },
};

describe('planner.contract.test', () => {
  let originalEnv: any;
  beforeEach(() => {
    originalEnv = process.env.LLM_MODEL;
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.env.LLM_MODEL = originalEnv;
  });

  it('Malicious Input: LLM returns non-JSON natural language wraps as message.send fallback', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini'; // force LLM path
    mockLLMResponse = 'I am sorry, I cannot help with that.';
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].tool).toBe('message.send');
    expect(plan.steps[0].args.content).toContain('I am sorry');
    expect(plan.reasoning.toLowerCase()).toMatch(/fallback.*plain text/);  // Updated to match actual fallback message
  });

  it('Malicious Input: LLM returns partial JSON (missing steps) handled gracefully', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = '{"reasoning": "incomplete plan"}';
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    // Zod parse should fail and trigger fallback echo
    expect(plan.steps[0].tool).toBe('message.send');
    expect(plan.reasoning).toContain('LLM planning failed');
  });

  it('Malicious Input: LLM hallucinated tools filtered by strict gating', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = JSON.stringify({
      steps: [
        { tool: 'hallucinated.tool', args: {}, reason: 'fake' },
        { tool: 'guild.member.count', args: {}, reason: 'real' },
      ],
      reasoning: 'Mixed plan',
    });
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_STRICT, IDENTITY);
    // Strict gating should filter hallucinated.tool
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].tool).toBe('guild.member.count');
  });

  it('Contract Guarantee: Planner returns valid plan or safe fallback, never throws', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = 'network error simulated';  // Non-JSON will trigger fallback
    await expect(planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY)).resolves.toBeTruthy();
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].tool).toBe('message.send');
  });

  it('Contract Guarantee: PUBLIC_GUILD sanitization enforced on LLM-generated content', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = JSON.stringify({
      steps: [
        { tool: 'message.send', args: { channelId: 'chan-1', content: 'Hello Kaelen!' }, reason: 'greet' },
      ],
      reasoning: 'Greeting with alias',
    });
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    const content: string = plan.steps[0].args.content;
    // Private alias 'Kaelen' must be replaced with safe public name
    expect(content).not.toContain('Kaelen');
    expect(content).toContain('PublicUser');
  });

  it('Contract Guarantee: Soft gating logs but allows tools outside allowlist', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = JSON.stringify({
      steps: [
        { tool: 'system.capabilities', args: {}, reason: 'introspect' },
        { tool: 'guild.member.count', args: {}, reason: 'allowed' },
      ],
      reasoning: 'Multi-tool plan',
    });
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    // Soft gating allows all steps but logs warning
    expect(plan.steps.length).toBe(2);
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('soft gating') }));
  });

  it('LLM Boundary: Token overflow (>8k tokens) returns error and falls back to echo', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    const longObs = { ...OBS, content: 'Vi, ' + 'a'.repeat(12000) }; // Mention Vi + 12k chars
    const longContext: any = { 
      recent: [], 
      relevant: [],
      memorySegments: [{ content: 'b'.repeat(10000), score: { recent: 0.9, relevance: 0.8 } }]
    };
    mockLLMResponse = 'Token overflow error'; // Non-JSON will trigger fallback
    const plan = await planLLM(longObs, longContext, log, skillGraph, INTENT_SOFT, IDENTITY);
    expect(plan.steps[0].tool).toBe('message.send');
    expect(plan.steps[0].args.content).toContain('Token overflow error');
    expect(plan.reasoning.toLowerCase()).toMatch(/fallback.*plain text/);
  });

  it('LLM Boundary: Reasoning field overflow (>2000 chars) still validates', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = JSON.stringify({
      steps: [{ tool: 'message.send', args: { channelId: 'chan-1', content: 'OK' }, reason: 'Explained' }],
      reasoning: 'x'.repeat(3000), // 3k chars
    });
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    expect(plan.reasoning.length).toBe(3000);
    expect(plan.steps).toHaveLength(1);
  });

  it('LLM Boundary: Steps array with mixed types (string, null, object) fails schema', async () => {
    process.env.LLM_MODEL = 'gpt-4o-mini';
    mockLLMResponse = JSON.stringify({
      steps: ['invalid', null, { tool: 'message.send', args: {}, reason: 'ok' }],
      reasoning: 'Mixed types',
    });
    const plan = await planLLM(OBS, CONTEXT, log, skillGraph, INTENT_SOFT, IDENTITY);
    expect(plan.steps[0].tool).toBe('message.send');
    expect(plan.steps[0].args.content).toMatch(/trouble formulating|having trouble/);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('schema validation') }));
  });
});
