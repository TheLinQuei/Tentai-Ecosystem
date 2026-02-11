import { AutonomyEvent, EventBus } from './eventBus.js';
import { AutonomyDecision } from './autonomyPolicyEngine.js';
import { RelevanceScore } from './relevanceScorer.js';

export interface ChimeConfig {
  minIntervalMs?: number;
  maxPerMinute?: number;
}

const DEFAULT_MIN_INTERVAL = 30_000;
const DEFAULT_MAX_PER_MINUTE = 2;

/**
 * ChimeManager emits gentle interruptions/reminders when autonomy policy allows.
 */
export class ChimeManager {
  private lastChimeAt = 0;
  private windowCount = 0;
  private windowStart = Date.now();

  constructor(private bus: EventBus, private config: ChimeConfig = {}) {}

  async maybeChime(event: AutonomyEvent, score: RelevanceScore, decision: AutonomyDecision): Promise<void> {
    if (!decision.allow) return;

    const now = Date.now();
    const minInterval = this.config.minIntervalMs ?? DEFAULT_MIN_INTERVAL;
    const maxPerMinute = this.config.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE;

    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.windowCount = 0;
    }

    if (now - this.lastChimeAt < minInterval) return;
    if (this.windowCount >= maxPerMinute) return;

    this.lastChimeAt = now;
    this.windowCount += 1;

    await this.bus.emit({
      id: `chime-${event.id}`,
      type: 'chime',
      timestamp: new Date(now).toISOString(),
      payload: {
        sourceEvent: event,
        score: score.score,
        reason: decision.reason,
      },
    });
  }
}
