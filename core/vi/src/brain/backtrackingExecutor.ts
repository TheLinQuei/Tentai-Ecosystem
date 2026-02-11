import { randomUUID } from 'crypto';
import { Executor } from './executor.js';
import { Execution, Plan, ReflectionDelta } from './types.js';

export interface BacktrackingResult {
  execution: Execution;
  attempts: Execution[];
  reflectionDelta?: ReflectionDelta;
}

export class BacktrackingExecutor {
  constructor(private readonly executor: Executor) {}

  /**
   * Execute the plan; on failure, attempt a self-correction fallback plan.
   */
  async execute(plan: Plan, userId: string, sessionId?: string): Promise<BacktrackingResult> {
    const attempts: Execution[] = [];

    const primary = await this.executor.executePlan(plan, userId, sessionId);
    attempts.push(primary);

    if (primary.success) {
      return {
        execution: primary,
        attempts,
        reflectionDelta: {
          attempts: attempts.length,
          recovered: false,
          originalErrors: primary.errors,
          fallbackPlanApplied: false,
          notes: ['Primary plan succeeded'],
        },
      };
    }

    // Build a minimal respond-only fallback to avoid repeated tool failures
    const fallbackPlan: Plan = {
      steps: [
        {
          id: randomUUID(),
          type: 'respond',
          description: 'Self-correction fallback response',
          params: { intent_category: 'fallback' },
        },
      ],
      reasoning: 'Self-correction fallback plan (Phase 4)',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };

    const fallback = await this.executor.executePlan(fallbackPlan, userId, sessionId);
    attempts.push(fallback);
    const recovered = fallback.success;

    return {
      execution: recovered ? fallback : primary,
      attempts,
      reflectionDelta: {
        attempts: attempts.length,
        recovered,
        originalErrors: primary.errors,
        fallbackPlanApplied: true,
        notes: recovered
          ? ['Recovered via fallback respond plan']
          : ['Fallback failed; returning primary failure'],
      },
    };
  }
}
