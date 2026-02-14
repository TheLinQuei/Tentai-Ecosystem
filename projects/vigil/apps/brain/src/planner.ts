import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from './observer.js';
import type { RetrievedContext } from './retriever.js';
import { prepareLog } from './utils/logContract.js';

// Schema for individual steps
export const StepSchema = z.object({
  tool: z.string(),
  args: z.record(z.any()),
  reason: z.string(),
  confidence: z.number().min(0).max(1).optional(), // Phase A: Confidence scoring
});

export type Step = z.infer<typeof StepSchema>;

// Schema for the full plan
export const PlanSchema = z.object({
  steps: z.array(StepSchema),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1).optional(), // Overall plan confidence
  source: z.enum(['intent-map', 'skill-graph', 'llm', 'fallback']).optional(), // Selection source
});

export type Plan = z.infer<typeof PlanSchema>;

export async function planResponse(
  obs: Observation,
  context: RetrievedContext,
  log: FastifyBaseLogger
): Promise<Plan> {
  const start = Date.now();

  // For Phase 3 v1: Simple fallback response
  // In future: Call LLM with observation + context to generate intelligent plans
  
  const plan: Plan = {
    steps: [
      {
        tool: 'message.send',
        args: normalizeArgs({
          channelId: obs.channelId,
          content: "I'm listening! How can I help you?",
        }),
        reason: 'Fallback response to validate pipeline',
        confidence: 0.9, // High confidence for simple response
      },
    ],
    reasoning: 'Fallback plan: Basic response to validate pipeline flow',
    confidence: 0.9, // Overall plan confidence
    source: 'fallback', // Indicate this is a fallback plan
  };

  const elapsed = Date.now() - start;
  log.info(
    prepareLog('Planner', {
      observationId: obs.id,
      stepCount: plan.steps.length,
      elapsed,
      message: `🧠 Planner: Generated plan (${elapsed}ms)`
    })
  );

  // Validate plan with Zod
  const validated = PlanSchema.parse(plan);
  return validated;
}

function normalizeArgs(args: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (v === undefined) continue;
    if (typeof v === 'function') continue;
    if (typeof v === 'object' && v !== null) {
      out[k] = normalizeArgs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export { normalizeArgs };
