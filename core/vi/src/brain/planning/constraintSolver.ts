import { Plan, PlanStep } from '../types.js';
import { validatePlan } from './planSchema.js';
import { getToolRegistry } from '../../tools/registry.js';

export type ConstraintIssueType =
  | 'validation'
  | 'dependency'
  | 'cycle'
  | 'tool'
  | 'structure';

export interface ConstraintIssue {
  type: ConstraintIssueType;
  message: string;
  stepId?: string;
}

export interface ConstraintAnalysis {
  valid: boolean;
  issues: ConstraintIssue[];
}

export interface ConstraintSolverOptions {
  requireRegisteredTools?: boolean;
}

export class ConstraintSolver {
  private readonly requireRegisteredTools: boolean;

  constructor(options?: ConstraintSolverOptions) {
    this.requireRegisteredTools = options?.requireRegisteredTools ?? true;
  }

  analyze(plan: Plan): ConstraintAnalysis {
    const issues: ConstraintIssue[] = [];

    const { valid, errors } = validatePlan(plan);
    if (!valid) {
      issues.push(...errors.map((message) => ({ type: 'validation' as const, message })));
    }

    const stepMap = new Map<string, PlanStep>();
    for (const step of plan.steps) {
      if (stepMap.has(step.id)) {
        issues.push({ type: 'structure', message: `Duplicate step id detected: ${step.id}`, stepId: step.id });
      }
      stepMap.set(step.id, step);
    }

    for (const step of plan.steps) {
      if (!step.dependencies || step.dependencies.length === 0) continue;
      for (const dep of step.dependencies) {
        if (!stepMap.has(dep)) {
          issues.push({ type: 'dependency', message: `Missing dependency ${dep} for step ${step.id}`, stepId: step.id });
        }
      }
    }

    if (this.requireRegisteredTools) {
      const registry = getToolRegistry();
      for (const step of plan.steps) {
        if (step.type === 'tool_call' && step.toolName && !registry.exists(step.toolName)) {
          issues.push({ type: 'tool', message: `Tool not registered: ${step.toolName}`, stepId: step.id });
        }
      }
    }

    const cycleIssue = this.detectCycle(plan.steps);
    if (cycleIssue) {
      issues.push(cycleIssue);
    }

    return { valid: issues.length === 0, issues };
  }

  private detectCycle(steps: PlanStep[]): ConstraintIssue | null {
    const graph = new Map<string, string[]>();
    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }

    const visited = new Set<string>();
    const stack = new Set<string>();

    const visit = (node: string): boolean => {
      if (stack.has(node)) return true; // cycle found
      if (visited.has(node)) return false;

      visited.add(node);
      stack.add(node);

      for (const dep of graph.get(node) || []) {
        if (visit(dep)) return true;
      }

      stack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (visit(node)) {
        return { type: 'cycle', message: 'Cyclic dependency detected in plan', stepId: node };
      }
    }

    return null;
  }
}
