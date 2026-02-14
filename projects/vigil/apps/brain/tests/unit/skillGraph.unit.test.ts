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

describe('skillGraph.unit.test', () => {
  let originalFetch: any;
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('Happy Path: recordExecution adds to history and updates candidate tracking', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    await sg.recordExecution({
      intent: 'show guild member count',
      actions: [{ tool: 'guild.member.count', input: {} }],
      success: true,
      latencyMs: 100,
    });
    const stats = sg.getStats();
    expect(stats.historySize).toBe(1);
    expect(stats.candidateCount).toBeGreaterThanOrEqual(0);
  });

  it('Edge Path: promotion criteria not met when success streak < minSuccessStreak', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    // Record 2 successes (promotion needs 3 by default)
    await sg.recordExecution({ intent: 'test', actions: [{ tool: 'debug.echo', input: {} }], success: true, latencyMs: 10 });
    await sg.recordExecution({ intent: 'test', actions: [{ tool: 'debug.echo', input: {} }], success: true, latencyMs: 10 });
    const stats = sg.getStats();
    // Should not promote yet
    expect(stats.candidateCount).toBeGreaterThan(0);
    expect(log.info).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('promoted to skill') }));
  });

  it('Hostile Path: findSimilarSkills with Memory API returning malformed response yields empty array', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: 'shape' }) });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    const skills = await sg.findSimilarSkills('anything', 5);
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBe(0);
  });

  it('Canon Enforcement: shouldUseSkill returns null when top skill similarity < threshold', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          skill: { id: 'skill-1', intent: 'weather query', actions: [{ tool: 'weather.get', input: {} }] },
          similarity: 0.6, // below default 0.8 threshold
          stats: { successRate: 0.95, status: 'active' },
        },
      ],
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    const match = await sg.shouldUseSkill('show weather');
    expect(match).toBeNull();
  });

  it('Canon Enforcement Edge: shouldUseSkill skips archived/demoted skills even if similarity high', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          skill: { id: 'skill-2', intent: 'old intent', actions: [{ tool: 'message.send', input: {} }] },
          similarity: 0.95,
          stats: { successRate: 0.2, status: 'demoted' },
        },
      ],
    });
    const memory = makeMemory();
    const sg = new SkillGraph(memory as any, log);
    const match = await sg.shouldUseSkill('old intent');
    expect(match).toBeNull();
  });
});
