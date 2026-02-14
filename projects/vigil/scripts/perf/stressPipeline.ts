/*
 * Pipeline Stress Harness
 * -----------------------
 * Drives synthetic observations through (Planner -> Executor -> Reflector) under
 * configurable rates & fault modes. Targets measurement of latency, retries,
 * fallback behavior, reflection writes, and validation errors.
 *
 * Environment Variables (PowerShell examples):
 *   $env:OBS_RPS=30                # Observations per second (default 10)
 *   $env:DURATION_SEC=60           # Total duration seconds (default 30)
 *   $env:CONCURRENCY=8             # Max in-flight planning/execution (default RPS)
 *   $env:LARGE_MSG=1               # Generate near-limit content (~1950 chars)
 *   $env:REFLECT_SPAM=1            # Include 'reflect' keyword every message
 *   $env:ALIAS_FLOOD=1             # Periodically generate identity preference messages
 *   $env:FAULT_FORCE_VALIDATION_FAIL=1  # First attempt schema invalid (see faultInject)
 *   $env:FAULT_ARTIFICIAL_LATENCY_MS=250 # Add artificial latency to tool calls
 *   $env:FAULT_FORCE_FALLBACK_JSON=1     # Force planner fallback (non-JSON)
 *   $env:STRESS_DRY_RUN=1          # Bypass side-effectful tools (e.g. message.send)
 *   $env:LLM_MODEL=mock            # Deterministic planner mode
 *
 * Run:
 *   pnpm exec tsx scripts/perf/stressPipeline.ts
 */

import { executePlan } from '../../apps/brain/src/executor';
import { planLLM } from '../../apps/brain/src/planner.llm';
import { reflectResult } from '../../apps/brain/src/reflector';
import type { Observation } from '../../apps/brain/src/observer';
import type { RetrievedContext } from '../../apps/brain/src/retriever';
import type { IntentDecision } from '../../apps/brain/src/intents/types';
import { applyFaultInjection } from '../../apps/brain/src/utils/faultInject';
import { prepareLog } from '../../apps/brain/src/utils/logContract';
import type { Plan } from '../../apps/brain/src/planner';
import { PlanSchema } from '../../apps/brain/src/planner';




// Logger stub implementing FastifyBaseLogger subset
const log = {
  info: (o: any) => console.log(JSON.stringify(o)),
  warn: (o: any) => console.warn(JSON.stringify(o)),
  error: (o: any) => console.error(JSON.stringify(o)),
  debug: (o: any) => process.env.BRAIN_LOG_RAW === 'true' && console.log(JSON.stringify(o)),
} as any;

// SkillGraph stub (avoid heavy dependencies for harness)
const skillGraph = {
  shouldUseSkill: async (_content: string) => null,
} as any;

// Fault injection auto-applied on import, but call explicitly for clarity
applyFaultInjection();

// Config
const RPS = Number(process.env.OBS_RPS || 10);
const DURATION = Number(process.env.DURATION_SEC || 30);
const TOTAL = RPS * DURATION;
const CONCURRENCY = Number(process.env.CONCURRENCY || RPS);
const LARGE_MSG = process.env.LARGE_MSG === '1';
const REFLECT_SPAM = process.env.REFLECT_SPAM === '1';
const ALIAS_FLOOD = process.env.ALIAS_FLOOD === '1';

// Metrics accumulators
let sent = 0;
let completed = 0;
let planFallbacks = 0;
let validationRetries = 0;
let stepErrors = 0;
let reflectWrites = 0;
let aliasUpdates = 0;
let totalLatencyMs: number[] = [];
let toolLatencyMs: number[] = [];

// Track envelopes for retry analysis
function analyzeExecution(result: any) {
  for (const o of result.outputs) {
    if (o.envelope.retryCount && o.envelope.retryCount > 0) {
      validationRetries += 1;
    }
    if (!o.envelope.ok) stepErrors += 1;
    toolLatencyMs.push(o.envelope.ms);
    if (o.envelope.tool === 'system.reflect' && o.envelope.ok) reflectWrites += 1;
    if (o.envelope.tool === 'identity.update' && o.envelope.ok) aliasUpdates += 1;
  }
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function makeContent(i: number): string {
  const base = REFLECT_SPAM ? `reflect ` : '';
  const aliasPhrase = ALIAS_FLOOD && i % 25 === 0 ? `Vi call me Alias${i} in private` : '';
  let msg = `${base}stress test message ${i}. ${aliasPhrase}`.trim();
  if (LARGE_MSG) {
    const filler = 'X'.repeat(Math.max(0, 1950 - msg.length));
    msg += filler;
  }
  return msg;
}

async function generatePlan(obs: Observation): Promise<Plan> {
  const intent: IntentDecision = {
    source: 'fallback',
    intent: 'chat',
    confidence: 0.9,
    gating: 'none',
    allowedTools: [],
    contributingSignals: [],
    resolvedAt: new Date().toISOString(),
    skillMatch: null,
    meta: {}
  };
  const context: RetrievedContext = { recent: [], relevant: [] };
  try {
    const plan = await planLLM(obs, context, log, skillGraph, intent, undefined);
    // Detect fallback: single message.send with reasoning containing 'Fallback' or direct non-JSON path
    if (plan.reasoning?.toLowerCase().includes('fallback') || plan.steps.length === 1 && plan.steps[0].tool === 'message.send' && plan.reasoning?.includes('non-JSON')) {
      planFallbacks += 1;
    }
    return plan;
  } catch (err) {
    // Hard fallback
    planFallbacks += 1;
    return {
      steps: [
        { tool: 'message.send', args: { channelId: obs.channelId, content: 'Planner failure fallback.' }, reason: 'Planner failed' }
      ],
      reasoning: 'Planner exception fallback'
    };
  }
}

async function runObservation(i: number) {
  const obs: Observation = {
    id: `obs-${i}`,
    type: 'message',
    content: makeContent(i),
    authorId: `user-${i % 10}`,
    channelId: 'stress-channel',
    guildId: 'stress-guild',
    timestamp: new Date().toISOString(),
  };
  const t0 = performance.now();
  const plan = await generatePlan(obs);
  // Validate plan schema defensively
  let validated: Plan;
  try { validated = PlanSchema.parse(plan); } catch { validated = plan; }
  const execResult = await executePlan(validated, obs as any, log);
  const t1 = performance.now();
  totalLatencyMs.push(t1 - t0);
  analyzeExecution(execResult);
  // Reflection phase (post-execution)
  try {
    await reflectResult(obs as any, validated as any, execResult as any, { upsert: async () => ({ ok: true }) } as any, log);
  } catch {/* ignore reflection errors */}
  completed += 1;
}

async function run() {
  console.log(`[HARNESS] Starting stress run: RPS=${RPS} DURATION=${DURATION}s TOTAL=${TOTAL} CONCURRENCY=${CONCURRENCY}`);
  const start = Date.now();
  let inFlight = 0;
  let i = 0;
  const intervalMs = 1000 / RPS;
  await new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      while (inFlight < CONCURRENCY && sent < TOTAL) {
        sent += 1;
        inFlight += 1;
        const idx = i++;
        runObservation(idx).finally(() => { inFlight -= 1; });
      }
      if (sent >= TOTAL && inFlight === 0) {
        clearInterval(interval);
        resolve();
      }
    }, intervalMs);
  });
  const elapsed = Date.now() - start;

  // Summaries
  const p50 = quantile(totalLatencyMs, 0.5);
  const p95 = quantile(totalLatencyMs, 0.95);
  const toolP95 = quantile(toolLatencyMs, 0.95);
  const fallbackPct = sent ? (planFallbacks / sent) * 100 : 0;
  const retryPct = sent ? (validationRetries / sent) * 100 : 0;

  const summary = {
    timestamp: new Date().toISOString(),
    config: { RPS, DURATION, TOTAL, CONCURRENCY, LARGE_MSG, REFLECT_SPAM, ALIAS_FLOOD },
    counts: { sent, completed, planFallbacks, validationRetries, stepErrors, reflectWrites, aliasUpdates },
    latency: { p50: Number(p50.toFixed(2)), p95: Number(p95.toFixed(2)), toolP95: Number(toolP95.toFixed(2)), max: Number(Math.max(...totalLatencyMs).toFixed(2)) },
    percentages: { fallbackPct: Number(fallbackPct.toFixed(2)), retryPct: Number(retryPct.toFixed(2)) },
  };

  console.log('\n[HARNESS] JSON Summary');
  console.log(JSON.stringify(summary, null, 2));
}

run().catch(err => {
  console.error('[HARNESS] Fatal error', err);
  process.exit(1);
});
