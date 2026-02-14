import type { Observation } from './observer.js';
import type { Plan } from './planner.js';
import type { FastifyBaseLogger } from 'fastify';
import { prepareLog } from './utils/logContract.js';

/**
 * Multi-level fallback strategy ladder (Phase A foundation)
 * 
 * Levels:
 * 1. Primary tool (LLM/intent-map planned)
 * 2. Skill graph match (procedural memory)
 * 3. Intent map match (deterministic routing)
 * 4. Keyword heuristic (basic pattern matching)
 * 5. Echo/acknowledge (safe fallback)
 * 6. Silent fail (log only, no response)
 */

export enum FallbackLevel {
  PRIMARY = 1,
  SKILL_GRAPH = 2,
  INTENT_MAP = 3,
  KEYWORD = 4,
  ECHO = 5,
  SILENT = 6,
}

export interface FallbackResult {
  level: FallbackLevel;
  plan: Plan;
  confidence: number;
  reason: string;
}

/**
 * Attempt to generate a plan using multi-level fallback
 */
export async function attemptPlanWithFallback(
  obs: Observation,
  log: FastifyBaseLogger,
  options?: {
    maxLevel?: FallbackLevel;
    primaryPlan?: Plan | null;
    skillGraphPlan?: Plan | null;
    intentMapPlan?: Plan | null;
  }
): Promise<FallbackResult> {
  const maxLevel = options?.maxLevel ?? FallbackLevel.ECHO;
  
  // Level 1: Primary (LLM/intent-map)
  if (options?.primaryPlan) {
    log.info({ level: FallbackLevel.PRIMARY }, 'Using primary plan');
    return {
      level: FallbackLevel.PRIMARY,
      plan: options.primaryPlan,
      confidence: options.primaryPlan.confidence ?? 0.9,
      reason: 'Primary plan available',
    };
  }
  
  // Level 2: Skill graph
  if (maxLevel >= FallbackLevel.SKILL_GRAPH && options?.skillGraphPlan) {
    log.info({ level: FallbackLevel.SKILL_GRAPH }, 'Falling back to skill graph');
    return {
      level: FallbackLevel.SKILL_GRAPH,
      plan: options.skillGraphPlan,
      confidence: options.skillGraphPlan.confidence ?? 0.7,
      reason: 'Primary plan failed, using skill graph',
    };
  }
  
  // Level 3: Intent map
  if (maxLevel >= FallbackLevel.INTENT_MAP && options?.intentMapPlan) {
    log.info({ level: FallbackLevel.INTENT_MAP }, 'Falling back to intent map');
    return {
      level: FallbackLevel.INTENT_MAP,
      plan: options.intentMapPlan,
      confidence: options.intentMapPlan.confidence ?? 0.6,
      reason: 'Primary and skill graph failed, using intent map',
    };
  }
  
  // Level 4: Keyword heuristic
  if (maxLevel >= FallbackLevel.KEYWORD) {
    const keywordPlan = attemptKeywordHeuristic(obs);
    if (keywordPlan) {
      log.info({ level: FallbackLevel.KEYWORD }, 'Falling back to keyword heuristic');
      return {
        level: FallbackLevel.KEYWORD,
        plan: keywordPlan,
        confidence: 0.4,
        reason: 'All structured planners failed, using keyword heuristic',
      };
    }
  }
  
  // Level 5: Echo
  if (maxLevel >= FallbackLevel.ECHO) {
    log.warn({ level: FallbackLevel.ECHO }, 'Falling back to echo');
    return {
      level: FallbackLevel.ECHO,
      plan: {
        steps: [
          {
            tool: 'message.send',
            args: {
              channelId: obs.channelId,
              content: `I heard you: "${obs.content}"`,
            },
            reason: 'Echo fallback',
            confidence: 0.1,
          },
        ],
        reasoning: 'All planners failed, echoing message',
        confidence: 0.1,
        source: 'fallback',
      },
      confidence: 0.1,
      reason: 'All planners failed, using echo',
    };
  }
  
  // Level 6: Silent fail
  log.error({ level: FallbackLevel.SILENT }, 'All fallback levels exhausted, silent fail');
  return {
    level: FallbackLevel.SILENT,
    plan: {
      steps: [],
      reasoning: 'Silent fail - no response',
      confidence: 0,
      source: 'fallback',
    },
    confidence: 0,
    reason: 'All fallback levels exhausted',
  };
}

/**
 * Attempt basic keyword pattern matching
 */
function attemptKeywordHeuristic(obs: Observation): Plan | null {
  const content = obs.content.toLowerCase();
  
  // Pattern: greeting
  if (/^(hi|hello|hey|sup|yo)\b/i.test(content)) {
    return {
      steps: [
        {
          tool: 'message.send',
          args: {
            channelId: obs.channelId,
            content: 'Hey there! 👋',
          },
          reason: 'Greeting pattern detected',
          confidence: 0.5,
        },
      ],
      reasoning: 'Keyword heuristic: greeting',
      confidence: 0.5,
      source: 'fallback',
    };
  }
  
  // Pattern: thanks
  if (/\b(thanks|thank you|ty|thx)\b/i.test(content)) {
    return {
      steps: [
        {
          tool: 'message.send',
          args: {
            channelId: obs.channelId,
            content: 'You\'re welcome! 😊',
          },
          reason: 'Thanks pattern detected',
          confidence: 0.5,
        },
      ],
      reasoning: 'Keyword heuristic: thanks',
      confidence: 0.5,
      source: 'fallback',
    };
  }
  
  // Pattern: help
  if (/\b(help|assist|support)\b/i.test(content)) {
    return {
      steps: [
        {
          tool: 'system.capabilities',
          args: {},
          reason: 'Help pattern detected',
          confidence: 0.5,
        },
      ],
      reasoning: 'Keyword heuristic: help',
      confidence: 0.5,
      source: 'fallback',
    };
  }
  
  return null;
}

/**
 * Record fallback event to metrics
 */
export function recordFallbackEvent(level: FallbackLevel, reason: string) {
  // Import metrics and record
  // This will be wired up when metrics module is integrated
  const log = (globalThis as any).__brainLogger;
  if (log) {
    log.debug(prepareLog('Fallback', {
      level,
      reason,
      message: `[fallback] Level ${level}: ${reason}`
    }));
  }
}
