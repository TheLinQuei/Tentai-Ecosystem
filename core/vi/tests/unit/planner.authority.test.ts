import { describe, it, expect } from 'vitest';
import { Planner } from '../../src/brain/planner.js';
import type { Intent } from '../../src/brain/types.js';

const lockedFactsContext = (fact_key: string) => ({
  continuityPack: {
    locked_facts: [
      {
        fact_key,
        value: { rule: fact_key },
      },
    ],
  },
});

describe('Planner authority enforcement', () => {
  it('rejects tool-less query plans when never_guess is locked', async () => {
    const planner = new Planner();
    const intent: Intent = {
      category: 'query',
      confidence: 0.9,
      requiresMemory: false,
      requiresTooling: false,
      description: 'Tell me about Akima vs Goku',
    };

    const plan = await planner.generatePlan(intent, lockedFactsContext('never_guess'));
    expect(plan.steps[0].type).toBe('respond');
    expect(plan.steps[0].params?.policy_refusal).toBe('never_guess');
  });

  it('inserts policy check when do_not_repeat is locked', async () => {
    const planner = new Planner();
    const intent: Intent = {
      category: 'conversation',
      confidence: 0.7,
      requiresMemory: false,
      requiresTooling: false,
      description: 'Continue',
    };

    const plan = await planner.generatePlan(intent, lockedFactsContext('do_not_repeat'));
    expect(plan.steps[0].type).toBe('policy_check');
    expect(plan.steps[0].params?.policy).toBe('do_not_repeat');
  });
});
