import type { MemoryClient } from '@vi/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { SkillGraph } from './skillGraph.js';
import { prepareLog } from './utils/logContract.js';
import { fetchContext } from './retriever.js';
import { planLLM as planResponse } from './planner.llm.js';
import { executePlan } from './executor.js';
import { reflectResult } from './reflector.js';
import type { IntentDecision } from './intents/types.js';
import { resolveIntent } from './intents/engine.js';
import { resolveIdentityZone, buildIdentityProfile } from './identity.js';
import { recordObserverMetrics } from './metrics.js';

export interface Observation {
  id: string;
  type: string;
  content: string;
  authorId: string;
  channelId: string;
  guildId?: string;
  timestamp: string;
  authorDisplayName?: string; // Phase D: Discord display name for identity addressing
}

export async function handleObservation(
  obs: Observation,
  memory: MemoryClient,
  log: FastifyBaseLogger,
  skillGraph: SkillGraph
): Promise<void> {
  const start = Date.now();
  
  log.info(prepareLog('Observer', {
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'Observer: Starting pipeline',
    observationId: obs.id
  }));

  // Step 0: Retrieve context from memory (resilient)
  let context: any = { recent: [], relevant: [] };
  try {
    context = await fetchContext(obs, memory, log);
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Failed to fetch context'
    }));
  }

  // Step 0.5: Identity zone + profile
  const identityZone = resolveIdentityZone(obs);
  const identityProfile = buildIdentityProfile({
    obs,
    userEntity: context.userEntity,
  });

  // Step 1: Resolve intent with hybrid gating
  let intent: IntentDecision = {
    source: 'fallback',
    intent: obs.content || null,
    confidence: 0.5,
    gating: 'soft',
    allowedTools: [],
    meta: {},
    contributingSignals: [],
    resolvedAt: new Date().toISOString(),
    skillMatch: null,
  };
  try {
    intent = await resolveIntent(obs, context, log, skillGraph);
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Intent resolution failed – using fallback intent'
    }));
  }

  // Step 2: Plan response based on observation + context + intent + identity
  let plan: any = {
    steps: [
      {
        tool: 'message.send',
        args: { channelId: obs.channelId, content: "I'm here, but I'm having trouble processing that right now. Could you try again?" },
        reason: 'Fallback response due to planner failure',
        confidence: 0.5,
      },
    ],
    reasoning: 'Fallback plan (planner unavailable)',
    confidence: 0.5,
    source: 'fallback' as const,
  };
  try {
    plan = await planResponse(obs, context, log, skillGraph, intent, {
      identityZone,
      identityProfile,
    });
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Planner failed – using fallback echo plan'
    }));
  }

  // Step 2.5: Public guild alias sanitization (enforce privacy even on fallback plans)
  try {
    if (identityZone === 'PUBLIC_GUILD') {
      const privateAliases: string[] = identityProfile.privateAliases || [];
      const privateSet = new Set(privateAliases.map(a => a.toLowerCase()));
      // Find first non-contaminated alias
      let safeName = obs.authorId; // default fallback
      const candidates = [
        identityProfile.lastKnownDisplayName,
        identityProfile.publicAliases[0],
        obs.authorDisplayName
      ];
      for (const candidate of candidates) {
        if (candidate && !privateSet.has(candidate.toLowerCase())) {
          safeName = candidate;
          break;
        }
      }
      
      // Only sanitize message.send content in PUBLIC_GUILD - PRIVATE_DM preserves aliases
      for (const step of plan.steps) {
        if (step.tool === 'message.send' && step.args && typeof step.args.content === 'string') {
          let content = step.args.content;
          for (const alias of privateAliases) {
            if (!alias) continue;
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            content = content.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), safeName);
          }
          // Aggressive greeting normalization to prevent alias leakage in patterns like "Hi baby" or "Hey Kaelen"
          // First pass: remove greeting + name combos that might contain private aliases
          for (const alias of privateAliases) {
            if (!alias) continue;
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match "Hi baby", "Hey Kaelen", etc. and replace entire pattern
            content = content.replace(new RegExp(`\\b(hi|hey|hello|greetings)[,\\s]+${escaped}\\b`, 'gi'), safeName);
          }
          // Second pass: standalone alias removal
          for (const alias of privateAliases) {
            if (!alias) continue;
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            content = content.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), safeName);
          }
          step.args.content = content;
          if (typeof step.args.originalContent !== 'undefined') {
            delete step.args.originalContent;
          }
        }
      }
    }
  } catch (err) {
    log.warn(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Sanitization step failed (non-critical)'
    }));
  }
  
  // Create sanitized observation copy for PUBLIC_GUILD to prevent originalContent leakage
  const sanitizedObs = identityZone === 'PUBLIC_GUILD' && identityProfile.privateAliases?.length > 0
    ? { ...obs, content: (() => {
        let content = obs.content;
        const privateAliases = identityProfile.privateAliases || [];
        // Use same safeName logic as plan sanitization
        let safeName = identityProfile.lastKnownDisplayName || identityProfile.publicAliases[0] || obs.authorDisplayName || obs.authorId;
        // CRITICAL: Check contamination
        if (privateAliases.length > 0 && privateAliases.some(pa => pa.toLowerCase() === safeName.toLowerCase())) {
          safeName = obs.authorId;
        }
        for (const alias of privateAliases) {
          if (!alias) continue;
          const escaped = alias.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
          content = content.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), safeName);
        }
        return content;
      })() }
    : obs;

  log.info(prepareLog('Observer', {
    level: 'info',
    ts: new Date().toISOString(),
    msg: 'Planner: Plan generated',
    observationId: obs.id,
    planStepCount: plan.steps.length,
    planReasoning: plan.reasoning,
    identityZone
  }));

  // Step 2.6: Intent gating enforcement (BEFORE execution to filter disallowed tools)
  try {
    if (intent.gating === 'strict' && intent.allowedTools && intent.allowedTools.length > 0) {
      const filtered = plan.steps.filter((s: any) => intent.allowedTools.includes(s.tool) || s.tool === 'message.send');
      if (filtered.length !== plan.steps.length) {
        plan.steps = filtered;
        log.info(prepareLog('Observer', {
          observationId: obs.id,
          message: 'Observer: Strict gating filtered steps',
          remaining: filtered.length
        }));
      } else {
        // Explicit log even when no filtering occurs (integration test expectation)
        log.info(prepareLog('Observer', {
          observationId: obs.id,
          message: 'Observer: Strict gating evaluated – no steps filtered',
          remaining: filtered.length
        }));
      }
    } else if (intent.gating === 'soft' && intent.allowedTools && intent.allowedTools.length > 0) {
      const outside = plan.steps.map((s: any) => s.tool).filter((t: string) => !intent.allowedTools.includes(t) && t !== 'message.send');
      if (outside.length) {
        log.info(prepareLog('Observer', {
          observationId: obs.id,
          message: 'Observer: soft gating – plan uses tools outside suggested allowlist',
          outsideTools: outside
        }));
      }
    }
  } catch (err) {
    log.warn(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Intent gating enforcement failed (non-critical)'
    }));
  }

  // Step 3: Execute plan with context enrichment and placeholder resolution
  let result: any = { success: false, outputs: [] };
  try {
    result = await executePlan(plan as any, sanitizedObs, log);
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Executor failed – continuing to reflection'
    }));
  }

  // Step 4: Reflect outcome back to memory (use original obs for reflection, not sanitized)
  let reflectionSucceeded = false;
  try {
    await reflectResult(obs, plan as any, result, memory, log);
    reflectionSucceeded = true;
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: Reflection failed – continuing'
    }));
  }

  // Step 4.5: Fallback identity sync if reflection failed (ensures upsertUserEntity called even on degraded runs)
  if (!reflectionSucceeded) {
    try {
      const existing: any = await memory.getUserEntity(obs.authorId);
      await memory.upsertUserEntity(obs.authorId, {
        traits: {
          ...(existing?.traits ?? {}),
        },
      });
      log.debug(prepareLog('Observer', {
        userId: obs.authorId,
        message: 'Observer: Fallback identity sync completed'
      }));
    } catch (e) {
      log.warn(prepareLog('Observer', {
        err: e instanceof Error ? e.message : String(e),
        userId: obs.authorId,
        message: 'Observer: Fallback identity sync failed'
      }));
    }
  }

  // Step 5: Record execution for skill promotion/decay (Phase 5)
  const elapsed = Date.now() - start;
  try {
    await skillGraph.recordExecution({
      intent: intent.intent ?? obs.content,
      actions: (plan.steps || []).map((s: any) => ({ tool: s.tool, input: (s as any).args })),
      success: result.success,
      latencyMs: elapsed,
    });
  } catch (err) {
    log.error(prepareLog('Observer', {
      observationId: obs.id,
      err: err instanceof Error ? err.message : String(err),
      message: 'Observer: SkillGraph recordExecution failed – continuing'
    }));
  }

  // Step 6: Record Prometheus observer/pipeline metrics
  recordObserverMetrics({
    elapsedMs: elapsed,
    intentConfidence: intent.confidence,
    intentCorrect: result.success,
  });

  log.info(prepareLog('Observer', {
    level: 'info',
    ts: new Date().toISOString(),
    msg: `Observer: Pipeline complete (${elapsed}ms)`,
    observationId: obs.id,
    elapsed
  }));
}
