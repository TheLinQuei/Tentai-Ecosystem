import { describe, it, expect } from 'vitest';
import { validatePlan } from '../../src/brain/planning/planSchema.js';
import { Plan } from '../../src/brain/types.js';

describe('Planner schema validation', () => {
  it('validates a correct plan', () => {
    const plan: Plan = {
      steps: [
        {
          id: 's1',
          type: 'respond',
          description: 'Reply to user',
        },
      ],
      reasoning: 'Simple respond',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };
    const res = validatePlan(plan);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('rejects an invalid plan with empty steps', () => {
    const bad = {
      steps: [],
      reasoning: '',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    } as unknown as Plan;
    const res = validatePlan(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
