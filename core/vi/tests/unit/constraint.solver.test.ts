import { describe, it, expect } from 'vitest';
import { ConstraintSolver } from '../../src/brain/planning/constraintSolver.js';
import type { Plan } from '../../src/brain/types.js';

describe('ConstraintSolver', () => {
  const solver = new ConstraintSolver({ requireRegisteredTools: false });

  it('detects missing dependencies', () => {
    const plan: Plan = {
      steps: [
        {
          id: 'respond-step',
          type: 'respond',
          description: 'Respond to user',
          dependencies: ['missing-step'],
        },
      ],
      reasoning: 'Plan with missing dependency',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };

    const analysis = solver.analyze(plan);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((i) => i.type === 'dependency')).toBe(true);
  });

  it('detects cyclic dependencies', () => {
    const plan: Plan = {
      steps: [
        {
          id: 'a',
          type: 'respond',
          description: 'A',
          dependencies: ['b'],
        },
        {
          id: 'b',
          type: 'respond',
          description: 'B',
          dependencies: ['a'],
        },
      ],
      reasoning: 'Plan with cycle',
      estimatedComplexity: 'moderate',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };

    const analysis = solver.analyze(plan);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.some((i) => i.type === 'cycle')).toBe(true);
  });
});
