import { AutonomyEvent } from './eventBus.js';

export interface RelevanceScore {
  score: number; // 0-1
  factors: Record<string, number>;
}

/**
 * Simple heuristic scorer for autonomy triggers.
 */
export function scoreEvent(event: AutonomyEvent): RelevanceScore {
  const factors: Record<string, number> = {};
  const now = Date.now();
  const ageMs = Math.max(0, now - Date.parse(event.timestamp));
  const freshness = Math.max(0, 1 - ageMs / 60000); // fade after 1 minute
  factors.freshness = freshness;

  const typeBoost = event.type === 'chat_message' ? 0.15 : event.type === 'policy_violation' ? 0.35 : 0.05;
  factors.type = typeBoost;

  const urgency = typeof event.payload?.urgency === 'number' ? Math.min(1, Math.max(0, event.payload.urgency)) : 0;
  factors.urgency = urgency;

  const importance = typeof event.payload?.importance === 'number' ? Math.min(1, Math.max(0, event.payload.importance)) : 0.1;
  factors.importance = importance;

  const score = Math.min(1, Math.max(0, freshness * 0.4 + typeBoost + urgency * 0.3 + importance * 0.2));
  return { score, factors };
}
