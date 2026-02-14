import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillGraph } from '../../src/skillGraph';

const log: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function makeMemory(overrides: Partial<any> = {}) {
  return {
    baseUrl: 'http://localhost:4311',
    ...overrides,
  };
}

describe('skillGraph.contract.test', () => {
  let originalFetch: any;
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('Malicious Input: Memory API returns corrupted skill object without actions', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          skill: { id: 'corrupt-1', intent: 'broken', actions: null }, // actions should be array
          similarity: 0.9,
          stats: { successRate: 0.8, status: 'active' },
        },
      ],
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    const match = await sg.shouldUseSkill('anything');
    // shouldUseSkill must handle gracefully and skip invalid skill
    expect(match).toBeNull();
  });

  it('Malicious Input: Memory API promotion endpoint rejects with 500 does not crash recordExecution', async () => {
    let promoteAttempted = false;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/promote')) {
        promoteAttempted = true;
        return { ok: false, status: 500, text: async () => 'Internal Error' };
      }
      return { ok: true, json: async () => [] };
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    // Record 3 successes (triggers promotion attempt)
    for (let i = 0; i < 3; i++) {
      await sg.recordExecution({
        intent: 'promote test',
        actions: [{ tool: 'debug.echo', input: {} }],
        success: true,
        latencyMs: 10,
      });
    }
    expect(promoteAttempted).toBe(true);
    // Verify promotion failure was logged but did not throw
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Failed to promote skill') }));
  });

  it('Contract Guarantee: promotion requires minSuccessStreak, minSuccessRate, minExecutions', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    // Record 2 successes (default requires 3)
    await sg.recordExecution({ intent: 'test', actions: [{ tool: 'debug.echo', input: {} }], success: true, latencyMs: 10 });
    await sg.recordExecution({ intent: 'test', actions: [{ tool: 'debug.echo', input: {} }], success: true, latencyMs: 10 });
    const stats = sg.getStats();
    expect(stats.candidateCount).toBeGreaterThan(0);
    // Promotion should not occur yet
    expect(log.info).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('promoted to skill') }));
  });

  it('Contract Guarantee: decay/demote skills when successRate < minSuccessRate threshold', async () => {
    let demoteAttempted = false;
    global.fetch = vi.fn().mockImplementation(async (url: string, options?: any) => {
      // Check if this is a PATCH request to /skills/*/status with status:'demoted' in body
      if (url.includes('/skills/') && url.includes('/status') && options?.method === 'PATCH') {
        try {
          const body = JSON.parse(options.body);
          if (body.status === 'demoted') {
            demoteAttempted = true;
            return { ok: true, json: async () => ({}) };
          }
        } catch {}
      }
      if (url.includes('?status=active,preferred')) {
        return {
          ok: true,
          json: async () => [
            {
              skill: { id: 'skill-failing', intent: 'failing skill', actions: [], lastUsed: new Date().toISOString() },
              stats: { successRate: 0.3, status: 'active' }, // below 0.5 default threshold
            },
          ],
        };
      }
      return { ok: true, json: async () => [] };
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    await sg.decaySkills();
    expect(demoteAttempted).toBe(true);
  });

  it('Contract Guarantee: shouldUseSkill filters by similarity threshold (default 0.8)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          skill: { id: 'low-sim', intent: 'low match', pattern: 'low match', actions: [{ tool: 'message.send', input: {} }] },
          similarity: 0.75, // below 0.8
          stats: { successRate: 0.9, status: 'active' },
        },
      ],
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    const match = await sg.shouldUseSkill('anything');
    expect(match).toBeNull();
  });

  it('Contract Guarantee: concurrency safe history buffer bounded to 1000 entries', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    // Simulate 1100 executions
    for (let i = 0; i < 1100; i++) {
      await sg.recordExecution({
        intent: `test-${i}`,
        actions: [{ tool: 'debug.echo', input: {} }],
        success: true,
        latencyMs: 1,
      });
    }
    const stats = sg.getStats();
    expect(stats.historySize).toBe(1000); // capped
  });
});
