
import type { FastifyBaseLogger } from 'fastify';
import type { Plan } from './planner.js';
import type { Observation } from './observer.js';
import { ToolRegistry } from './tools/registry.js';
import { interpolatePlaceholders } from './utils/placeholders.js';
import { z } from 'zod';
import { prepareLog } from './utils/logContract.js';
import { recordToolExecution } from './metrics.js';


// Canonical ToolResultEnvelope
export interface ToolResultEnvelope {
  traceId: string;
  tool: string;
  ok: boolean;
  error?: string;
  ms: number;
  input: any;
  output: any;
}

export interface ExecutionResult {
  success: boolean;
  outputs: Array<{ step: number; envelope: ToolResultEnvelope }>;
}


// Zod schemas for tool outputs (expand as needed)
const toolSchemas: Record<string, z.ZodTypeAny> = {
  'message.send': z.object({ ok: z.boolean(), status: z.number().optional(), rateLimit: z.any().optional() }),
  'memory.query': z.object({
    ok: z.boolean(),
    items: z.array(z.any()).optional(),
    results: z.array(z.any()).optional(),
    answer: z.string().optional(),
    error: z.string().optional(),
  }),
  'user.remind': z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    message: z.string().optional(),
    delaySec: z.number().optional(),
    reminderId: z.string().optional(),
  }),
  'info.search': z.object({ ok: z.boolean(), results: z.any().optional(), error: z.string().optional() }),
  'weather.get': z.object({ ok: z.boolean(), where: z.string().optional(), line: z.string().optional(), error: z.string().optional() }),
  'identity.lookup': z.object({ ok: z.boolean(), id: z.string().optional(), display: z.string().optional(), error: z.string().optional() }),
  'identity.user.self': z.object({ ok: z.boolean(), id: z.string().optional(), aliases: z.any().optional() }),
  'identity.creator': z.object({ ok: z.boolean(), creator: z.string().optional() }),
  'guardian.notifyOwner': z.object({ ok: z.boolean(), dmChannelId: z.string().optional(), ownerId: z.string().optional() }),

  'guild.members.search': z.object({ ok: z.boolean(), members: z.any().optional(), count: z.number().optional(), error: z.string().optional() }),
  'guild.roles.list': z.object({ ok: z.boolean(), roles: z.any().optional() }),
  'member.get': z.object({ ok: z.boolean(), member: z.any().optional(), error: z.string().optional() }),
  'user.ping': z.object({ ok: z.boolean(), userId: z.string().optional(), error: z.string().optional() }),

  // Require 'tools' field to enforce retry path when missing
  'system.capabilities': z.object({ tools: z.any(), skillsCount: z.number().optional() }).required().passthrough(),
  'code.read': z.object({ ok: z.boolean(), bytes: z.number().optional(), data: z.string().optional(), error: z.string().optional() }),
  'system.reflect': z.object({ ok: z.boolean(), error: z.string().optional() }),
  // Extended tools for unified crucible
  'identity.update': z.object({ ok: z.boolean(), error: z.string().optional() }),
  'poll.create': z.object({ ok: z.boolean(), pollId: z.string().optional(), error: z.string().optional() }),
  'debug.echo': z.object({ ok: z.boolean(), echo: z.any().optional() }),
  'debug.throw': z.object({ ok: z.boolean().optional(), error: z.string().optional() }),
  'debug.flaky': z.object({ ok: z.boolean().optional(), fixed: z.boolean().optional(), error: z.string().optional() }),

  'guild.member.count': z.object({ ok: z.boolean(), count: z.number().optional() }),
  'guild.owner': z.object({ ok: z.boolean(), owner: z.string().optional(), error: z.string().optional() }),
  'guild.member.roles': z.object({ ok: z.boolean(), roles: z.any().optional(), error: z.string().optional() }),
  'guild.info': z.object({ ok: z.boolean(), id: z.string().optional(), name: z.string().optional() }),
  'guild.roles.admins': z.object({ ok: z.boolean(), admins: z.any().optional() }),

  'member.info': z.object({ ok: z.boolean(), userId: z.string().optional(), roles: z.number().optional() }),
  'guild.stats.overview': z.object({ ok: z.boolean(), memberCount: z.number().optional() }),
  'guild.audit.latest': z.object({ ok: z.boolean(), entries: z.any().optional() }),
  'guild.uptime': z.object({ ok: z.boolean(), uptimeMs: z.number().optional() }),
  'guild.icon': z.object({ ok: z.boolean(), url: z.string().nullable().optional() }),
  'guild.features': z.object({ ok: z.boolean(), features: z.any().optional() }),
  'guild.channels.list': z.object({ ok: z.boolean(), text: z.any().optional() }),
  'guild.member.permissions': z.object({ ok: z.boolean(), permissions: z.any().optional() }),
  'guild.member.joinedAt': z.object({ ok: z.boolean(), joinedAt: z.string().nullable().optional() }),
  'guild.roles.highest': z.object({ ok: z.boolean(), name: z.string().optional() }),
  'guild.boost.stats': z.object({ ok: z.boolean(), boosts: z.number().optional() }),
  'guild.latency': z.object({ ok: z.boolean(), apiLatencyMs: z.number().optional() }),
  'guild.health': z.object({ ok: z.boolean(), healthy: z.boolean().optional(), services: z.any().optional() }),
  'guild.commands.sync': z.object({ ok: z.boolean(), syncedCount: z.number().optional() }),
  'guild.moderation.stats': z.object({ ok: z.boolean(), stats: z.any().optional() }),
  'guild.invites.list': z.object({ ok: z.boolean(), invites: z.any().optional() }),
  'guild.webhooks.list': z.object({ ok: z.boolean(), webhooks: z.any().optional() }),
  'guild.bot.role': z.object({ ok: z.boolean(), roles: z.any().optional() }),
  'system.diagnostics.selftest': z.object({ ok: z.boolean(), summary: z.string().optional(), results: z.any().optional() }),
  // ...add schemas for other tools as needed
};

function validateToolOutput(tool: string, output: any): { valid: boolean; error?: string } {
  const schema = toolSchemas[tool];
  if (!schema) return { valid: true };
  const res = schema.safeParse(output);
  if (res.success) return { valid: true };
  return { valid: false, error: res.error?.message };
}

function safeInterpolate(obj: any, context: any) {
  try {
    return interpolatePlaceholders(obj, context);
  } catch (err) {
    return obj; // fall back to raw args on interpolation failure
  }
}

export async function executePlan(
  plan: Plan,
  obs: Observation,
  log: FastifyBaseLogger
): Promise<ExecutionResult> {
  const start = Date.now();
  const outputs: ExecutionResult['outputs'] = [];

  log.info(prepareLog('Executor', {
    observationId: obs.id,
    stepCount: plan.steps.length,
    planSource: plan.source,
    intent: (plan as any).intent,
    zone: (obs as any).zone,
    inputSize: JSON.stringify(plan).length,
    message: '⚙️ Executor: Starting execution (plan details logged)'
  }));
  if (process.env.BRAIN_LOG_RAW === 'true') {
    log.debug(prepareLog('RAW', { rawPlan: plan, observationId: obs.id }));
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    log.info(prepareLog('Executor', {
      observationId: obs.id,
      step: i,
      tool: step.tool,
      args: step.args,
      intent: (plan as any).intent,
      zone: (obs as any).zone,
      planSource: plan.source,
      message: 'Executor: Executing step'
    }));
    const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let envelope: ToolResultEnvelope = {
      traceId,
      tool: step.tool,
      ok: false,
      ms: 0,
      input: null,
      output: null,
    };
    
    const stepStart = Date.now();
    
    try {
      const tool = ToolRegistry[step.tool];
      if (!tool) {
        envelope.ok = false;
        envelope.error = `Tool not found: ${step.tool}`;
        envelope.ms = Date.now() - stepStart;
        log.error(prepareLog('Executor', {
          traceId,
          tool: step.tool,
          error: envelope.error,
          message: 'Executor: Step failed - tool not found, aborting plan'
        }));
        outputs.push({ step: i, envelope });
        break; // Abort remaining steps
      }
      
      if (!toolSchemas[step.tool]) {
        log.error(prepareLog('Executor', {
          tool: step.tool,
          message: 'Executor: No schema defined for tool'
        }));
        envelope.ok = false;
        envelope.error = `No tool schema for: ${step.tool}`;
        envelope.ms = Date.now() - stepStart;
        outputs.push({ step: i, envelope });
        break; // Abort remaining steps
      }
      
      const enrichedArgs = {
        ...step.args,
        channelId: step.args.channelId ?? obs.channelId,
        userId: step.args.userId ?? obs.authorId,
        username: step.args.username ?? obs.authorId,
        guildId: (step.args as any).guildId ?? (obs as any).guildId,
        originalContent: (step.args as any).originalContent ?? obs.content,
      };
      const resolvedArgs = safeInterpolate(enrichedArgs, enrichedArgs);
      // KiingKat meow preference
      if (step.tool === 'message.send' && (resolvedArgs as any).content) {
        if (obs.authorId === '732416041992454195') {
          const content = String((resolvedArgs as any).content);
          if (!content.toLowerCase().includes('meow')) {
            (resolvedArgs as any).content = content + ' meow';
          }
        }
      }
      envelope.input = resolvedArgs;
      
      // Execute with retry loop
      let result: any = null;
      let attemptCount = 0;
      
      for (attemptCount = 0; attemptCount < 2; attemptCount++) {
        const attemptStart = Date.now();
        result = await tool(resolvedArgs);
        const attemptMs = Date.now() - attemptStart;
        
        // Zod validation
        const validation = validateToolOutput(step.tool, result);
        if (validation.valid) {
          envelope.output = result;
          envelope.ok = true;
          break;
        }
        
        if (attemptCount === 0) {
          log.warn(prepareLog('Executor', {
            traceId,
            tool: step.tool,
            error: validation.error,
            attemptMs,
            retryCount: attemptCount + 1,
            message: 'Tool output failed validation, retrying once'
          }));
        } else {
          envelope.ok = false;
          envelope.error = `Validation failed: ${validation.error}`;
          envelope.output = result;
          log.error(prepareLog('Executor', {
            traceId,
            tool: step.tool,
            error: validation.error,
            attemptMs,
            retryCount: attemptCount + 1,
            message: 'Tool output validation failed after retry'
          }));
        }
      }
      
      envelope.ms = Date.now() - stepStart;
      log.info(prepareLog('Executor', {
        traceId,
        tool: step.tool,
        envelope,
        outputSize: JSON.stringify(envelope.output).length,
        ms: envelope.ms,
        retryCount: attemptCount,
        message: 'Executor: Step executed (envelope logged)'
      }));
      
      // Record Prometheus metrics for this tool execution
      recordToolExecution(step.tool, envelope.ms, envelope.ok);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      envelope.ok = false;
      envelope.error = message;
      envelope.ms = Date.now() - stepStart;
      log.error(prepareLog('Executor', {
        traceId,
        tool: step.tool,
        err: message,
        ms: envelope.ms,
        message: 'Executor: Step failed'
      }));
    }

    outputs.push({ step: i, envelope });
  }

  const elapsed = Date.now() - start;
  const success = outputs.every((o) => o.envelope.ok);
  log.info(
    prepareLog('Executor', {
      observationId: obs.id,
      success,
      elapsed,
      outputSize: JSON.stringify(outputs).length,
      outputs,
      message: `⚙️ Executor: Execution complete (${elapsed}ms)`
    })
  );
  return { success, outputs };
}
