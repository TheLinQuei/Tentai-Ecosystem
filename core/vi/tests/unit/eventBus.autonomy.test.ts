import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/brain/autonomy/eventBus.js';
import { scoreEvent } from '../../src/brain/autonomy/relevanceScorer.js';
import { AutonomyPolicyEngine } from '../../src/brain/autonomy/autonomyPolicyEngine.js';
import { ChimeManager } from '../../src/brain/autonomy/chimeManager.js';

const now = new Date().toISOString();

describe('Autonomy event bus + chime', () => {
  it('emits to subscribers', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('test', handler);
    await bus.emit({ id: '1', type: 'test', timestamp: now, payload: {} });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('chimes when score passes policy', async () => {
    const bus = new EventBus();
    const chimeHandler = vi.fn();
    bus.subscribe('chime', chimeHandler);
    const scorerEvent = { id: '2', type: 'policy_violation', timestamp: now, payload: { urgency: 1, importance: 1 } };
    const score = scoreEvent(scorerEvent as any);
    const decision = new AutonomyPolicyEngine(0.3).decide(scorerEvent as any, score);
    const chimes = new ChimeManager(bus, { minIntervalMs: 0, maxPerMinute: 5 });
    await chimes.maybeChime(scorerEvent as any, score, decision);
    expect(chimeHandler).toHaveBeenCalledTimes(1);
  });

  it('enforces min interval and window cap', async () => {
    const bus = new EventBus();
    const chimeHandler = vi.fn();
    bus.subscribe('chime', chimeHandler);
    const scorerEvent = { id: '3', type: 'policy_violation', timestamp: now, payload: { urgency: 1, importance: 1 } };
    const score = scoreEvent(scorerEvent as any);
    const decision = new AutonomyPolicyEngine(0.1).decide(scorerEvent as any, score);
    const chimes = new ChimeManager(bus, { minIntervalMs: 100, maxPerMinute: 2 });

    await chimes.maybeChime(scorerEvent as any, score, decision); // first chime
    await chimes.maybeChime(scorerEvent as any, score, decision); // blocked by minInterval
    await new Promise((resolve) => setTimeout(resolve, 120));
    await chimes.maybeChime(scorerEvent as any, score, decision); // allowed second
    await chimes.maybeChime(scorerEvent as any, score, decision); // blocked by maxPerMinute

    expect(chimeHandler).toHaveBeenCalledTimes(2);
  });
});
