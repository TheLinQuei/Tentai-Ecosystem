import { describe, it, expect } from 'vitest';
import { BranchingPlanner } from '../../src/brain/planning/branchingPlanner.js';
import { ConstraintSolver } from '../../src/brain/planning/constraintSolver.js';
import type { Intent, Plan } from '../../src/brain/types.js';

class StubPlanner {
  constructor(private readonly plan: Plan) {}
  async generatePlan(): Promise<Plan> {
    return this.plan;
  }
}

describe('BranchingPlanner', () => {
  it('generates multiple candidates and keeps tooling for tool-driven intents', async () => {
    const plan: Plan = {
      steps: [
        {
          id: 'tool-step',
          type: 'tool_call',
          description: 'Execute primary tool',
          toolName: 'demo_tool',
        },
        {
          id: 'respond-step',
          type: 'respond',
          description: 'Return response',
          dependencies: ['tool-step'],
        },
      ],
      reasoning: 'Base plan with tooling',
      estimatedComplexity: 'moderate',
      toolsNeeded: ['demo_tool'],
      memoryAccessNeeded: false,
    };

    const intent: Intent = {
      category: 'command',
      confidence: 0.9,
      requiresTooling: true,
      requiresMemory: false,
    };

    const planner = new BranchingPlanner(new StubPlanner(plan) as any, {
      requireRegisteredTools: false,
      maxCandidates: 3,
    });

    const result = await planner.generate(intent);

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.plan.steps.some((s) => s.type === 'tool_call')).toBe(true);

    const guarded = result.candidates.find((c) => c.label === 'policy_guard');
    expect(guarded?.plan.steps[0].type).toBe('policy_check');
  });

  it('falls back to respond-only when tooling is unavailable', async () => {
    const plan: Plan = {
      steps: [
        {
          id: 'respond-only',
          type: 'respond',
          description: 'Simple respond',
        },
      ],
      reasoning: 'Minimal plan',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };

    const intent: Intent = {
      category: 'clarification',
      confidence: 0.6,
      requiresTooling: false,
      requiresMemory: false,
    };

    const planner = new BranchingPlanner(new StubPlanner(plan) as any, {
      requireRegisteredTools: false,
      maxCandidates: 3,
    });

    const result = await planner.generate(intent);

    expect(result.candidates.some((c) => c.label === 'respond_only')).toBe(true);
    expect(result.plan.steps.length).toBeGreaterThan(0);
  });
});
