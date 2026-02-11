import { randomUUID } from 'crypto';
import { Planner } from '../planner.js';
import type { Intent, Plan, PlanStep } from '../types.js';
import { ConstraintSolver, ConstraintIssue, ConstraintAnalysis } from './constraintSolver.js';

export interface PlanCandidate {
  id: string;
  label: string;
  plan: Plan;
  issues: ConstraintIssue[];
  analysis: ConstraintAnalysis;
  score: number;
}

export interface BranchingPlannerOptions {
  maxCandidates?: number;
  requireRegisteredTools?: boolean;
}

export interface PlanningResult {
  plan: Plan;
  candidates: PlanCandidate[];
}

export class BranchingPlanner {
  private readonly constraintSolver: ConstraintSolver;
  private readonly maxCandidates: number;

  constructor(private readonly planner: Planner, options?: BranchingPlannerOptions) {
    this.constraintSolver = new ConstraintSolver({ requireRegisteredTools: options?.requireRegisteredTools });
    this.maxCandidates = options?.maxCandidates ?? 3;
  }

  async generate(intent: Intent, context?: Record<string, unknown>): Promise<PlanningResult> {
    const candidates: PlanCandidate[] = [];

    const primaryPlan = await this.planner.generatePlan(intent, context);
    candidates.push(this.evaluateCandidate(primaryPlan, 'primary', intent));

    if (candidates.length < this.maxCandidates) {
      const guarded = this.wrapWithPolicy(primaryPlan, intent);
      candidates.push(this.evaluateCandidate(guarded, 'policy_guard', intent));
    }

    if (candidates.length < this.maxCandidates) {
      const fallback = this.respondOnly(intent);
      candidates.push(this.evaluateCandidate(fallback, 'respond_only', intent));
    }

    const ranked = candidates
      .slice(0, this.maxCandidates)
      .sort((a, b) => b.score - a.score);

    return { plan: ranked[0].plan, candidates: ranked };
  }

  private evaluateCandidate(plan: Plan, label: string, intent: Intent): PlanCandidate {
    const analysis = this.constraintSolver.analyze(plan);
    const score = this.score(plan, analysis, intent);
    return {
      id: randomUUID(),
      label,
      plan,
      issues: analysis.issues,
      analysis,
      score,
    };
  }

  private score(plan: Plan, analysis: ConstraintAnalysis, intent: Intent): number {
    const base = 1 - Math.min(0.75, analysis.issues.length * 0.12);
    const cyclePenalty = analysis.issues.some((i) => i.type === 'cycle') ? 0.25 : 0;
    const validationPenalty = analysis.issues.some((i) => i.type === 'validation') ? 0.2 : 0;

    const toolCoveragePenalty = intent.requiresTooling && plan.toolsNeeded.length === 0 ? 0.2 : 0;
    const memoryPenalty = intent.requiresMemory && !plan.memoryAccessNeeded ? 0.05 : 0;

    const complexityPenalty = plan.estimatedComplexity === 'complex' ? 0.05 : 0;

    const raw = base - cyclePenalty - validationPenalty - toolCoveragePenalty - memoryPenalty - complexityPenalty;
    return Math.max(0, Math.min(1, raw));
  }

  private wrapWithPolicy(plan: Plan, intent: Intent): Plan {
    const policyStepId = randomUUID();
    const policyStep: PlanStep = {
      id: policyStepId,
      type: 'policy_check',
      description: 'Phase 3 guardrail: verify authorization before executing plan',
      params: { intent_category: intent.category },
    };

    const guardedSteps = plan.steps.map((step) => {
      if (step.type === 'respond') {
        return { ...step, dependencies: step.dependencies ?? [policyStepId] };
      }
      if (step.type === 'tool_call') {
        const deps = new Set(step.dependencies || []);
        deps.add(policyStepId);
        return { ...step, dependencies: Array.from(deps) };
      }
      return step;
    });

    return {
      steps: [policyStep, ...guardedSteps],
      reasoning: `${plan.reasoning} (guarded)`,
      estimatedComplexity: plan.estimatedComplexity,
      toolsNeeded: plan.toolsNeeded,
      memoryAccessNeeded: plan.memoryAccessNeeded,
    };
  }

  private respondOnly(intent: Intent): Plan {
    const respondStep: PlanStep = {
      id: randomUUID(),
      type: 'respond',
      description: 'Provide a grounded answer without tools (safe fallback)',
      params: { intent_category: intent.category },
    };

    return {
      steps: [respondStep],
      reasoning: 'Safe fallback plan (Phase 3)',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: false,
    };
  }
}
