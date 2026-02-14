import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from '../observer.js';
import type { RetrievedContext } from '../retriever.js';
import type { SkillGraph } from '../skillGraph.js';
import { resolveGuildIntent } from './guild.js';
import type { IntentDecision, IntentSignal, GatingMode } from './types.js';
import { prepareLog } from '../utils/logContract.js';

function baseSignal(): IntentSignal {
  return {
    source: 'fallback',
    intent: null,
    confidence: 0,
    gating: 'none',
    allowedTools: [],
    meta: {},
  };
}

// Decide gating mode for a given tool name
function inferGatingForTool(tool: string): GatingMode {
  if (
    tool.startsWith('guild.') ||
    tool.startsWith('identity.') ||
    tool.startsWith('user.remind') ||
    tool.startsWith('system.')
  ) {
    return 'strict';
  }
  return 'soft';
}

export async function resolveIntent(
  obs: Observation,
  context: RetrievedContext,
  log: FastifyBaseLogger,
  skillGraph: SkillGraph
): Promise<IntentDecision> {
  const signals: IntentSignal[] = [];
  const content = (obs.content || '').trim();
  const lowerContent = content.toLowerCase();

  // 0) Phase D.4: Identity preference command detection (strict gating)
  const identityPatterns = {
    addPublicAlias: /(?:call me|my name is)\s+(.+?)(?:\s+(?:in public|publicly|always))?$/i,
    addPrivateAlias: /(?:call me|my name is)\s+(.+?)\s+(?:in private|privately|in dms?|when alone)/i,
    disableIntimate: /don'?t\s+(?:use|call me by)\s+(?:intimate|private)\s+(?:names?|aliases?)/i,
    enableIntimate: /(?:you can|please)\s+use\s+(?:intimate|private)\s+(?:names?|aliases?)/i,
  };

  let identityIntent: IntentSignal | null = null;

  // Check for "call me X in private"
  const privateMatch = lowerContent.match(identityPatterns.addPrivateAlias);
  if (privateMatch) {
    const alias = privateMatch[1].trim();
    identityIntent = {
      ...baseSignal(),
      source: 'guild-intent',
      intent: 'identity.pref.update',
      confidence: 0.95,
      gating: 'strict',
      allowedTools: ['identity.update', 'message.send'],
      meta: {
        aliases: [alias],
        scope: 'private',
      },
    };
  }

  // Check for "call me X" (public)
  if (!identityIntent) {
    const publicMatch = lowerContent.match(identityPatterns.addPublicAlias);
    if (publicMatch) {
      const alias = publicMatch[1].trim();
      identityIntent = {
        ...baseSignal(),
        source: 'guild-intent',
        intent: 'identity.pref.update',
        confidence: 0.95,
        gating: 'strict',
        allowedTools: ['identity.update', 'message.send'],
        meta: {
          aliases: [alias],
          scope: 'public',
        },
      };
    }
  }

  // Check for "don't use intimate names"
  if (!identityIntent && identityPatterns.disableIntimate.test(lowerContent)) {
    identityIntent = {
      ...baseSignal(),
      source: 'guild-intent',
      intent: 'identity.pref.update',
      confidence: 0.95,
      gating: 'strict',
      allowedTools: ['identity.update', 'message.send'],
      meta: {
        toggleIntimacy: false,
      },
    };
  }

  // Check for "you can use intimate names"
  if (!identityIntent && identityPatterns.enableIntimate.test(lowerContent)) {
    identityIntent = {
      ...baseSignal(),
      source: 'guild-intent',
      intent: 'identity.pref.update',
      confidence: 0.95,
      gating: 'strict',
      allowedTools: ['identity.update', 'message.send'],
      meta: {
        toggleIntimacy: true,
      },
    };
  }

  if (identityIntent) {
    signals.push(identityIntent);
  }

  // 1) Guild intent mapping (strict gating)
  const guildTool = resolveGuildIntent(content);
  if (guildTool) {
    const gating = inferGatingForTool(guildTool);
    signals.push({
      ...baseSignal(),
      source: 'guild-intent',
      intent: content.toLowerCase(),
      confidence: 0.95,
      gating,
      allowedTools: [guildTool, 'message.send'],
      meta: { guildTool },
    });
  }

  // 2) Skill match (soft gating)
  let skillMatch = null;
  try {
    skillMatch = await skillGraph.shouldUseSkill(content);
    if (skillMatch) {
      const toolsFromSkill: string[] = Array.from(
        new Set(
          (skillMatch as any).skill?.actions?.map((a: any) => String(a.tool)).filter(Boolean) ?? []
        )
      );

      signals.push({
        ...baseSignal(),
        source: 'skill',
        intent: (skillMatch as any).skill?.intent ?? content,
        confidence: skillMatch.similarity ?? 0.85,
        gating: 'soft',
        allowedTools: toolsFromSkill,
        meta: { skillId: (skillMatch as any).skill?.id, similarity: skillMatch.similarity },
      });
    }
  } catch (err) {
    log.error(prepareLog('IntentEngine', {
      err,
      observationId: obs.id,
      reason: 'skillGraph.shouldUseSkill failed'
    }));
  }

  // 3) Fallback / LLM signal baseline
  if (signals.length === 0) {
    signals.push({
      ...baseSignal(),
      source: 'fallback',
      intent: content || null,
      confidence: 0.5,
      gating: 'soft',
      allowedTools: [], // planner free to choose
      meta: {},
    });
  }

  // Merge: pick highest confidence, with tie-breaker preferring guild > skill > fallback
  const priority = { 'guild-intent': 3, skill: 2, llm: 1, fallback: 0 } as const;
  const sorted = [...signals].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (priority[b.source as keyof typeof priority] ?? 0) -
           (priority[a.source as keyof typeof priority] ?? 0);
  });

  const primary = sorted[0];

  const decision: IntentDecision = {
    ...primary,
    contributingSignals: signals,
    resolvedAt: new Date().toISOString(),
    skillMatch: skillMatch ?? null,
  };

  log.info(
    prepareLog('IntentEngine', {
      observationId: obs.id,
      intentSource: decision.source,
      intent: decision.intent,
      confidence: decision.confidence,
      gating: decision.gating,
      allowedTools: decision.allowedTools,
      resolvedTool: decision.meta?.guildTool || decision.meta?.skillId,
      reason: 'Intent resolved',
      zone: (obs as any).zone,
      message: '🧭 IntentEngine: Intent resolved'
    })
  );

  return decision;
}
