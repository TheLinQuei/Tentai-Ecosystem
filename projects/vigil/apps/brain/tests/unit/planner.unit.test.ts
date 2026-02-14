import { describe, it, expect } from 'vitest';
import { planResponse, normalizeArgs, PlanSchema } from '../../src/planner';

const OBS_BASE: any = {
  id: 'plan-1',
  type: 'MESSAGE',
  content: 'Echo this please',
  authorId: 'user-1',
  channelId: 'chan-1',
  guildId: 'guild-7',
  timestamp: new Date().toISOString(),
};

const CTX: any = { recent: [], relevant: [] };

describe('planner.unit.test', () => {
  it('Happy Path: planResponse returns fallback echo plan matching schema', async () => {
    const plan = await planResponse(OBS_BASE, CTX as any, { info: () => {} } as any);
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].tool).toBe('message.send');
    expect(typeof plan.steps[0].args.channelId).toBe('string');
    expect(plan.reasoning.length).toBeGreaterThan(0);
    expect(() => PlanSchema.parse(plan)).not.toThrow();
  });

  it('Edge Path: empty content still yields a plan with message.send', async () => {
    const obs = { ...OBS_BASE, content: '' };
    const plan = await planResponse(obs, CTX as any, { info: () => {} } as any);
    expect(plan.steps[0].tool).toBe('message.send');
    // Content may be empty echo; ensure arg structure exists
    expect(plan.steps[0].args.channelId).toBeDefined();
  });

  it('Hostile Path: normalizeArgs drops undefined & function values recursively', () => {
    const input = {
      a: 1,
      b: undefined,
      c: () => 'fn',
      d: { x: undefined, y: 5, z: () => {} },
    };
    const normalized = normalizeArgs(input);
    expect(normalized).toEqual({ a: 1, d: { y: 5 } });
  });

  it('Canon Enforcement: PUBLIC_GUILD plan source marked fallback; no private alias injection', async () => {
    const plan = await planResponse(OBS_BASE, CTX as any, { info: () => {} } as any);
    expect(plan.source).toBe('fallback');
    const content: string = plan.steps[0].args.content;
    // Ensure plan content does not contain sensitive alias token
    for (const forbidden of ['Kaelen','Forsa','baby']) {
      expect(content.includes(forbidden)).toBe(false);
    }
  });

  it('Canon Enforcement Edge: plan confidence remains within [0,1]', async () => {
    const plan = await planResponse(OBS_BASE, CTX as any, { info: () => {} } as any);
    if (typeof plan.confidence === 'number') {
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(1);
    }
  });
});
