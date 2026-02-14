import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executePlan } from '../../src/executor';
import { ToolRegistry } from '../../src/tools/registry';

const log: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const OBS: any = {
  id: 'obs-exec-contract-1',
  type: 'MESSAGE',
  content: 'test execution',
  authorId: 'user-1',
  channelId: 'chan-1',
  guildId: 'guild-1',
  timestamp: new Date().toISOString(),
};

function makePlan(steps: any[]): any {
  return {
    steps,
    reasoning: 'contract test plan',
    source: 'fallback',
  };
}

describe('executor.contract.test', () => {
  let originalTools: any;
  beforeEach(() => {
    originalTools = { ...ToolRegistry };
    vi.clearAllMocks();
  });
  afterEach(() => {
    Object.assign(ToolRegistry, originalTools);
  });

  it('Malicious Input: missing tool schema aborts execution immediately', async () => {
    // Remove schema by temporarily deleting tool
    const tempTool = (ToolRegistry as any)['message.send'];
    delete (ToolRegistry as any)['message.send'];
    const plan = makePlan([{ tool: 'message.send', args: { channelId: 'c1', content: 'Hi' }, reason: 'test' }]);
    const result = await executePlan(plan, OBS, log);
    expect(result.success).toBe(false);
    expect(result.outputs[0].envelope.error).toContain('not found');
    (ToolRegistry as any)['message.send'] = tempTool;
  });

  it('Malicious Input: tool returns malformed output triggers retry then failure', async () => {
    const original = (ToolRegistry as any)['system.capabilities'];
    let callCount = 0;
    (ToolRegistry as any)['system.capabilities'] = vi.fn(async () => {
      callCount++;
      return { broken: 'output' }; // missing tools field
    });
    const plan = makePlan([{ tool: 'system.capabilities', args: {}, reason: 'introspect' }]);
    const result = await executePlan(plan, OBS, log);
    expect(callCount).toBe(2); // retried once
    expect(result.success).toBe(false);
    (ToolRegistry as any)['system.capabilities'] = original;
  });

  it('Malicious Input: tool throws error captured in envelope without propagating', async () => {
    const original = (ToolRegistry as any)['system.capabilities'];
    (ToolRegistry as any)['system.capabilities'] = vi.fn(async () => {
      throw new Error('Tool crash');
    });
    const plan = makePlan([{ tool: 'system.capabilities', args: {}, reason: 'introspect' }]);
    await expect(executePlan(plan, OBS, log)).resolves.toBeTruthy();
    const result = await executePlan(plan, OBS, log);
    expect(result.outputs[0].envelope.ok).toBe(false);
    expect(result.outputs[0].envelope.error).toContain('Tool crash');
    (ToolRegistry as any)['system.capabilities'] = original;
  });

  it('Contract Guarantee: Executor handles retry on validation failure and succeeds on second attempt', async () => {
    const original = (ToolRegistry as any)['message.send'];
    let callCount = 0;
    (ToolRegistry as any)['message.send'] = vi.fn(async (input: any) => {
      callCount++;
      if (callCount === 1) return { missingOk: true }; // invalid first
      return { ok: true, status: 200 }; // valid second
    });
    const plan = makePlan([{ tool: 'message.send', args: { channelId: 'c1', content: 'Retry test' }, reason: 'test' }]);
    const result = await executePlan(plan, OBS, log);
    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
    (ToolRegistry as any)['message.send'] = original;
  });

  it('Contract Guarantee: Executor enriches args with channelId/userId/guildId from observation', async () => {
    const original = (ToolRegistry as any)['system.capabilities'];
    let capturedInput: any = null;
    (ToolRegistry as any)['system.capabilities'] = vi.fn(async (input: any) => {
      capturedInput = input;
      return { tools: [], skillsCount: 0 };
    });
    const plan = makePlan([{ tool: 'system.capabilities', args: {}, reason: 'introspect' }]);
    await executePlan(plan, OBS, log);
    expect(capturedInput.channelId).toBe(OBS.channelId);
    expect(capturedInput.userId).toBe(OBS.authorId);
    expect(capturedInput.guildId).toBe(OBS.guildId);
    (ToolRegistry as any)['system.capabilities'] = original;
  });

  it('Contract Guarantee: Multi-step execution stops after first failure by default', async () => {
    const original = (ToolRegistry as any)['system.capabilities'];
    (ToolRegistry as any)['fake.tool'] = vi.fn(async () => {
      throw new Error('Step 1 fails');
    });
    const plan = makePlan([
      { tool: 'fake.tool', args: {}, reason: 'fail' },
      { tool: 'system.capabilities', args: {}, reason: 'should not run' },
    ]);
    const result = await executePlan(plan, OBS, log);
    expect(result.outputs.length).toBe(1); // only first step attempted
    expect(result.success).toBe(false);
    delete (ToolRegistry as any)['fake.tool'];
  });
});
