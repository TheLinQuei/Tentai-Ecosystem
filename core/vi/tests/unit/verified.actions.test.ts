import { describe, it, expect, vi } from 'vitest';
import { Executor } from '../../src/brain/executor.js';
import type { Plan } from '../../src/brain/types.js';
import { DefaultVerifierRegistry } from '../../src/verification/VerifierRegistry.js';

describe('Executor tool verification (Phase 5)', () => {
  const policyStub = {
    authorize: vi.fn(async () => true),
    recordDecision: vi.fn(async () => {}),
  } as any;

  const makePlan = (toolName: string): Plan => ({
    steps: [
      {
        id: 'step-1',
        type: 'tool_call',
        description: 'call tool',
        toolName,
        toolParams: {},
      },
    ],
    reasoning: 'verify tool',
    estimatedComplexity: 'simple',
    toolsNeeded: [toolName],
    memoryAccessNeeded: false,
  });

  it('marks tool result verified when verifier passes', async () => {
    const toolRunner = {
      execute: vi.fn(async () => ({ success: true, data: { ok: true }, status: 'success' })),
    } as any;

    const registry = new DefaultVerifierRegistry();
    registry.register('dummy', {
      name: 'dummy-verifier',
      verify: async (result: any) => ({ passed: !!result.ok }),
    });

    const executor = new Executor(policyStub, toolRunner, registry);
    const execution = await executor.executePlan(makePlan('dummy'), 'user-1');

    expect(toolRunner.execute).toHaveBeenCalled();
    expect(execution.toolResults?.[0].verification?.status).toBe('verified');
    expect(execution.verificationSummary?.verified).toBe(1);
    expect(execution.success).toBe(true);
  });

  it('fails execution when verification fails and required', async () => {
    const toolRunner = {
      execute: vi.fn(async () => ({ success: true, data: { ok: false }, status: 'success' })),
    } as any;

    const registry = new DefaultVerifierRegistry();
    registry.register('dummy', {
      name: 'dummy-verifier',
      verify: async (result: any) => ({ passed: !!result.ok, errors: ['not ok'] }),
    });

    const plan = makePlan('dummy');
    plan.steps[0].verification = { required: true };

    const executor = new Executor(policyStub, toolRunner, registry);
    const execution = await executor.executePlan(plan, 'user-1');

    expect(execution.toolResults?.[0].verification?.status).toBe('failed');
    expect(execution.verificationSummary?.failed).toBe(1);
    expect(execution.success).toBe(false);
  });
});
