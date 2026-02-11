import { z } from 'zod';
import { Plan } from '../types.js';

// Zod schema for plan validation (not wired by default)
export const PlanStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['respond', 'tool_call', 'memory_access', 'policy_check']),
  description: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  toolName: z.string().optional(),
  toolParams: z.record(z.unknown()).optional(),
  toolReasoning: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  fallback: z.any().optional(),
});

export const PlanSchema = z.object({
  steps: z.array(PlanStepSchema).min(1),
  reasoning: z.string().min(1),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
  toolsNeeded: z.array(z.string()),
  memoryAccessNeeded: z.boolean(),
});

export type PlanValidationResult = { valid: boolean; errors: string[] };

export function validatePlan(plan: Plan): PlanValidationResult {
  const result = PlanSchema.safeParse(plan);
  if (result.success) return { valid: true, errors: [] };
  const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
  return { valid: false, errors };
}
