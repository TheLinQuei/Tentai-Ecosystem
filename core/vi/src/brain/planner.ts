/**
 * Planner: generates plans from intents
 * M8: supports both LLM-driven and rule-based planning
 */

import { randomUUID } from 'crypto';
import type { Intent, Plan, PlanStep } from './types.js';
import { validatePlan } from './planning/planSchema.js';
import type { LLMGateway } from './interfaces.js';
import { ToolSelector } from '../tools/selector.js';
import { initializeBuiltinTools } from '../tools/builtins/index.js';
import { getToolRegistry } from '../tools/registry.js';
import { getLogger } from '../telemetry/logger.js';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

let builtinsInitialized = false;
function ensureBuiltins(): void {
  const registry = getToolRegistry();
  if (registry.count() === 0) {
    initializeBuiltinTools();
    builtinsInitialized = true;
    return;
  }

  if (!builtinsInitialized) {
    builtinsInitialized = true;
  }
}

export class Planner {
  constructor(private llmGateway?: LLMGateway) {}

  private getLoggerSafe() {
    try {
      return getLogger();
    } catch {
      return null;
    }
  }

  /**
   * Generate a plan from a classified intent
   * M8: attempts LLM planning first, falls back to rule-based on error
   */
  async generatePlan(intent: Intent, context?: Record<string, unknown>): Promise<Plan> {
    ensureBuiltins();

    const lockedFacts = this.extractLockedFacts(context);

    // Try LLM planning if gateway is available
    if (this.llmGateway) {
      try {
        const llmPlan = await this.llmGateway.generatePlan(intent, context);
        // Optional strict validation of LLM-generated plans
        const strict = process.env.PLAN_VALIDATION_STRICT === 'true';
        if (strict) {
          const res = validatePlan(llmPlan);
          if (!res.valid) {
            const logger = this.getLoggerSafe();
            const log = logger
              ? (isTest ? logger.debug.bind(logger) : logger.warn.bind(logger))
              : () => {};
            log({ errors: res.errors, intent }, 'Invalid LLM plan, falling back to rule-based');
            return this.generateRuleBasedPlan(intent);
          }
        }
        return this.enforceLockedFacts(llmPlan, intent, lockedFacts);
      } catch (error) {
        const logger = this.getLoggerSafe();
        const log = logger
          ? (isTest ? logger.debug.bind(logger) : logger.warn.bind(logger))
          : () => {};
        log({ error, intent }, 'LLM planning failed, falling back to rule-based');
        // Fall through to rule-based planning
      }
    }

    // Rule-based fallback
    const plan = this.generateRuleBasedPlan(intent);
    return this.enforceLockedFacts(plan, intent, lockedFacts);
  }

  private extractLockedFacts(context?: Record<string, unknown>): Array<{ fact_key?: string; value?: any }> {
    const pack = (context as any)?.continuityPack;
    const locked = Array.isArray(pack?.locked_facts) ? pack.locked_facts : [];
    return locked.map((fact: any) => ({ fact_key: fact.fact_key, value: fact.value }));
  }

  private hasLockedRule(lockedFacts: Array<{ fact_key?: string; value?: any }>, ruleKey: string): boolean {
    const normalized = ruleKey.toLowerCase();
    return lockedFacts.some((fact) => {
      const key = typeof fact.fact_key === 'string' ? fact.fact_key.toLowerCase() : '';
      if (key === normalized) return true;
      if (typeof fact.value === 'string') return fact.value.toLowerCase().includes(normalized);
      if (fact.value && typeof fact.value === 'object') {
        const val = JSON.stringify(fact.value).toLowerCase();
        return val.includes(normalized);
      }
      return false;
    });
  }

  private planHasGroundingTool(plan: Plan): boolean {
    return plan.steps.some((step) => step.type === 'tool_call' && step.toolName && step.toolName !== 'list_tools');
  }

  private ensurePolicyCheckStep(plan: Plan, policyKey: string): Plan {
    const hasPolicyCheck = plan.steps.some((step) => step.type === 'policy_check' && step.params?.policy === policyKey);
    if (hasPolicyCheck) return plan;

    const policyStep: PlanStep = {
      id: randomUUID(),
      type: 'policy_check',
      description: `Enforce locked rule: ${policyKey}`,
      params: { policy: policyKey },
    };

    return {
      ...plan,
      steps: [policyStep, ...plan.steps],
      reasoning: `${plan.reasoning} | policy_check:${policyKey}`,
    };
  }

  private buildRefusalPlan(intent: Intent, reason: string): Plan {
    return {
      steps: [
        {
          id: randomUUID(),
          type: 'respond',
          description: 'Refuse or request tools due to locked rule violation',
          params: { intent_category: intent.category, policy_refusal: reason },
        },
      ],
      reasoning: `Locked rule enforcement: ${reason}`,
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: intent.requiresMemory || false,
    };
  }

  private enforceLockedFacts(plan: Plan, intent: Intent, lockedFacts: Array<{ fact_key?: string; value?: any }>): Plan {
    if (!lockedFacts.length) return plan;

    let updatedPlan = plan;

    const neverGuess = this.hasLockedRule(lockedFacts, 'never_guess');
    const doNotRepeat = this.hasLockedRule(lockedFacts, 'do_not_repeat');

    if (doNotRepeat) {
      updatedPlan = this.ensurePolicyCheckStep(updatedPlan, 'do_not_repeat');
    }

    if (neverGuess && intent.category === 'query' && !this.planHasGroundingTool(updatedPlan)) {
      const refusalPlan = this.buildRefusalPlan(intent, 'never_guess');
      this.emitAuthorityAudit('planner_locked_rule_violation', {
        rule: 'never_guess',
        intent: intent.category,
        action: 'plan_replaced',
      });
      return refusalPlan;
    }

    return updatedPlan;
  }

  private emitAuthorityAudit(eventType: string, data: Record<string, unknown>): void {
    try {
      import('../telemetry/telemetry.js').then(({ getTelemetry }) => {
        getTelemetry().recordEvent({
          timestamp: new Date().toISOString(),
          level: 'warn',
          type: eventType,
          data,
        }).catch(() => {});
      }).catch(() => {});
    } catch {
      // no-op
    }
  }

  /**
   * Rule-based planning (M7 implementation)
   */
  private generateRuleBasedPlan(intent: Intent): Plan {
    const steps: PlanStep[] = [];
    const toolsNeeded: string[] = [];
    const selection = ToolSelector.selectForIntent(intent);

    if (selection) {
      toolsNeeded.push(selection.toolName);
    }

    if (intent.category === 'query') {
      if (selection) {
        const toolStep: PlanStep = {
          id: randomUUID(),
          type: 'tool_call',
          description: `Execute tool ${selection.toolName} for query`,
          params: selection.parameters,
          toolName: selection.toolName,
          toolParams: selection.parameters,
          toolReasoning: selection.reasoning,
        };
        steps.push(toolStep);
        steps.push({
          id: randomUUID(),
          type: 'respond',
          description: 'Generate response using tool result',
          params: { intent_category: intent.category },
          dependencies: [toolStep.id],
        });
      } else {
        steps.push({
          id: randomUUID(),
          type: 'respond',
          description: 'Generate response to query',
          params: { intent_category: intent.category },
        });
      }
    } else if (intent.category === 'command') {
      steps.push({
        id: randomUUID(),
        type: 'policy_check',
        description: 'Check authorization for command',
        params: { intent_category: intent.category },
      });

      if (selection) {
        const toolStep: PlanStep = {
          id: randomUUID(),
          type: 'tool_call',
          description: `Execute tool ${selection.toolName} for command`,
          params: selection.parameters,
          toolName: selection.toolName,
          toolParams: selection.parameters,
          toolReasoning: selection.reasoning,
          dependencies: [steps[0].id],
        };
        steps.push(toolStep);
        steps.push({
          id: randomUUID(),
          type: 'respond',
          description: 'Execute command and respond',
          params: { intent_category: intent.category },
          dependencies: [toolStep.id],
        });
      } else {
        steps.push({
          id: randomUUID(),
          type: 'respond',
          description: 'Execute command and respond',
          params: { intent_category: intent.category },
          dependencies: [steps[0].id],
        });
      }
    } else {
      steps.push({
        id: randomUUID(),
        type: 'respond',
        description: 'Ask for clarification',
        params: { intent_category: intent.category },
      });
    }

    const plan: Plan = {
      steps,
      reasoning: `Rule-based plan for ${intent.category} intent`,
      estimatedComplexity: 'simple' as const,
      toolsNeeded,
      memoryAccessNeeded: intent.requiresMemory || false,
    };

    // Optional validation; rule-based generator should produce valid plans
    const strict = process.env.PLAN_VALIDATION_STRICT === 'true';
    if (strict) {
      const res = validatePlan(plan);
      if (!res.valid) {
        console.warn('Rule-based plan failed validation. Returning original plan.', res.errors);
      }
    }
    return plan;
  }
}
