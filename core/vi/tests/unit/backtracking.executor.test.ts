import { describe, it, expect } from 'vitest';
import { BacktrackingExecutor } from '../../src/brain/backtrackingExecutor.js';
import type { Execution, Plan } from '../../src/brain/types.js';

class SequenceExecutor {
  private calls = 0;
  constructor(private readonly responses: Execution[]) {}

  async executePlan(): Promise<Execution> {
    const res = this.responses[this.calls] ?? this.responses[this.responses.length - 1];
    this.calls += 1;
    return res;
  }
}

const basePlan: Plan = {
  steps: [
    {
      id: 's1',
      type: 'respond',
      description: 'Respond',
    },
  ],
  reasoning: 'Base plan',
  estimatedComplexity: 'simple',
  toolsNeeded: [],
  memoryAccessNeeded: false,
};

describe('BacktrackingExecutor', () => {
  it('returns primary execution when successful', async () => {
    const successExec: Execution = {
      stepsExecuted: [],
      success: true,
      output: 'ok',
    };

    const executor = new SequenceExecutor([successExec]);
    const backtracking = new BacktrackingExecutor(executor as any);

    const result = await backtracking.execute(basePlan, 'u1', 's1');

    expect(result.execution.success).toBe(true);
    expect(result.reflectionDelta?.attempts).toBe(1);
    expect(result.reflectionDelta?.recovered).toBe(false);
  });

  it('applies fallback respond plan when primary fails', async () => {
    const failureExec: Execution = {
      stepsExecuted: [],
      success: false,
      output: 'fail',
      errors: ['boom'],
    };

    const fallbackExec: Execution = {
      stepsExecuted: [],
      success: true,
      output: 'fallback',
    };

    const executor = new SequenceExecutor([failureExec, fallbackExec]);
    const backtracking = new BacktrackingExecutor(executor as any);

    const result = await backtracking.execute(basePlan, 'u1', 's1');

    expect(result.execution.output).toBe('fallback');
    expect(result.reflectionDelta?.recovered).toBe(true);
    expect(result.reflectionDelta?.originalErrors).toContain('boom');
    expect(result.reflectionDelta?.attempts).toBe(2);
    expect(result.reflectionDelta?.fallbackPlanApplied).toBe(true);
  });
});
