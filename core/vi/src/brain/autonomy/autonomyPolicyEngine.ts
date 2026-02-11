import { AutonomyEvent } from './eventBus.js';
import { RelevanceScore } from './relevanceScorer.js';

export interface AutonomyDecision {
  allow: boolean;
  reason: string;
  minimumScore: number;
}

const DEFAULT_THRESHOLD = 0.45;

/**
 * Autonomy policy: guards autonomous triggers before execution.
 */
export class AutonomyPolicyEngine {
  constructor(private threshold: number = DEFAULT_THRESHOLD) {}

  decide(event: AutonomyEvent, score: RelevanceScore): AutonomyDecision {
    const allow = score.score >= this.threshold;
    const reason = allow
      ? `score ${score.score.toFixed(2)} >= threshold ${this.threshold}`
      : `score ${score.score.toFixed(2)} < threshold ${this.threshold}`;
    return {
      allow,
      reason,
      minimumScore: this.threshold,
    };
  }
}
