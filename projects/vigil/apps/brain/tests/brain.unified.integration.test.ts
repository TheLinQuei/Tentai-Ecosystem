import { describe, it, expect, beforeEach, vi } from 'vitest';

// Real pipeline entry (observer handles full flow)
import { handleObservation } from '../src/observer';

// Planner schema for constructing synthetic plans in overrides
import { PlanSchema } from '../src/planner';

// Modules to spy/mutate
import * as retrieverMod from '../src/retriever';
import * as engineMod from '../src/intents/engine';
import * as plannerLLMMod from '../src/planner.llm';
import * as executorMod from '../src/executor';
import * as reflectorMod from '../src/reflector';
import * as identityMod from '../src/identity';
import * as metricsMod from '../src/metrics';

// Tool registry (actual executor uses tools/registry)
import { ToolRegistry } from '../src/tools/registry';

// ---------------- Helpers ----------------
interface TestObservationOverrides { [k: string]: any }
const mkObs = (overrides: Partial<TestObservationOverrides> = {}) => ({
  id: overrides.id ?? `obs-${Math.random().toString(36).slice(2)}`,
  type: 'message',
  authorId: overrides.authorId ?? 'user-123',
  authorDisplayName: overrides.authorDisplayName ?? 'Kaelen',
  channelId: overrides.channelId ?? 'chan-1',
  guildId: 'guildId' in overrides ? overrides.guildId : 'guild-1',
  content: overrides.content ?? 'Vi, hey baby show me the weather',
  timestamp: overrides.timestamp ?? new Date().toISOString(),
});

const mkMemory = () => ({
  searchHybrid: vi.fn().mockResolvedValue([]),
  upsert: vi.fn().mockResolvedValue({ ok: true }),
  getUserEntity: vi.fn().mockResolvedValue({
    id: 'user-123',
    display: 'Kaelen',
    aliases: ['Kaelen', 'Forsa', 'K.', 'baby', 'TheLinQuei'],
    traits: {
      identity: {
        publicAliases: ['TheLinQuei'],
        privateAliases: ['Kaelen', 'Forsa', 'K.', 'baby'],
        allowAutoIntimate: true,
      },
    },
  }),
  upsertUserEntity: vi.fn().mockResolvedValue({ ok: true }),
});

const mkSkillGraph = () => ({
  shouldUseSkill: vi.fn().mockResolvedValue(null),
  recordExecution: vi.fn().mockResolvedValue(undefined),
});

const mkLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

let memory: any; let skillGraph: any; let log: any;

beforeEach(() => {
  memory = mkMemory();
  skillGraph = mkSkillGraph();
  log = mkLog();
  vi.restoreAllMocks();
});

// Minimal tool set for executor flows
ToolRegistry['message.send'] = vi.fn(async (args: any) => ({ ok: true, status: 200 }));
ToolRegistry['debug.echo'] = vi.fn(async (args: any) => ({ ok: true, echo: args }));
ToolRegistry['memory.query'] = vi.fn(async (args: any) => ({ ok: true, items: [], results: [] }));
ToolRegistry['system.reflect'] = vi.fn(async () => ({ ok: true }));
ToolRegistry['identity.update'] = vi.fn(async () => ({ ok: true }));

// ---------------- Ω Unified Crucible ----------------
describe('Ω Unified Brain Crucible (single-file full pipeline)', () => {
  it('Ω.0 baseline pipeline completes without throw', async () => {
    const obs = mkObs();
    await expect(handleObservation(obs, memory, log as any, skillGraph)).resolves.toBeUndefined();
    // Resilience: skillGraph.recordExecution still invoked
    expect(skillGraph.recordExecution).toHaveBeenCalled();
  });

  it('Ω.1 retriever healthy passes context through (pipeline completion log emitted)', async () => {
    vi.spyOn(retrieverMod, 'fetchContext').mockResolvedValue({
      recent: [{ content: 'recent', timestamp: new Date().toISOString() }],
      relevant: [{ content: 'relevant', score: 0.9 }],
      userEntity: await memory.getUserEntity('user-123'),
    });
    const obs = mkObs();
    await handleObservation(obs, memory, log as any, skillGraph);
  expect(log.info.mock.calls.map((c: any) => JSON.stringify(c)).join('\n')).toContain('Pipeline complete');
  });

  it('Ω.2 retriever hard fail still yields pipeline completion (fallback-first)', async () => {
    vi.spyOn(retrieverMod, 'fetchContext').mockRejectedValue(new Error('mem down'));
    const obs = mkObs();
    await expect(handleObservation(obs, memory, log as any, skillGraph)).resolves.toBeUndefined();
    // When fetchContext throws, observer catches and logs this message
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Failed to fetch context'))).toBeTruthy();
  });

  it('Ω.3 PUBLIC_GUILD sanitizes private/intimate aliases from message.send output', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(
      PlanSchema.parse({
        steps: [{ tool: 'message.send', args: { content: 'hey baby Kaelen' }, reason: 'raw', confidence: 0.9 }],
        reasoning: 'test', source: 'llm'
      })
    );
    const obs = mkObs({ guildId: 'guild-1' });
    await handleObservation(obs, memory, log as any, skillGraph);
    // Planner sanitization logs or executor will contain sanitized content
  const sendCalls = (ToolRegistry['message.send'] as any).mock.calls;
    const lastPayload = JSON.stringify(sendCalls[sendCalls.length - 1]).toLowerCase();
    expect(lastPayload).not.toContain('baby');
    expect(lastPayload).not.toContain('kaelen');
    expect(lastPayload).toContain('thelinquei');
  });

  it('Ω.4 PRIVATE_DM preserves intimate/private aliases', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(
      PlanSchema.parse({
        steps: [{ tool: 'message.send', args: { content: 'hey baby Kaelen' }, reason: 'raw', confidence: 0.9 }],
        reasoning: 'test', source: 'llm'
      })
    );
    const obs = mkObs({ guildId: undefined, channelId: 'dm-1' });
    await handleObservation(obs, memory, log as any, skillGraph);
    const sendCalls = (ToolRegistry['message.send'] as any).mock.calls;
    const lastPayload = JSON.stringify(sendCalls[sendCalls.length - 1]).toLowerCase();
    expect(lastPayload).toContain('baby');
    expect(lastPayload).toContain('kaelen');
  });

  it('Ω.5 TRUSTED zone preserves aliases', async () => {
    vi.spyOn(identityMod, 'resolveIdentityZone').mockReturnValue('TRUSTED');
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(
      PlanSchema.parse({
        steps: [{ tool: 'message.send', args: { content: 'missed you baby' }, reason: 'raw', confidence: 0.9 }],
        reasoning: 'test', source: 'llm'
      })
    );
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    const sendCalls = (ToolRegistry['message.send'] as any).mock.calls;
    expect(JSON.stringify(sendCalls).toLowerCase()).toContain('baby');
  });

  it('Ω.6 guild intent strict gating filters disallowed tools (poll.create executed)', async () => {
    vi.spyOn(engineMod, 'resolveIntent').mockResolvedValue({
      source: 'guild-intent', intent: 'poll.create', confidence: 0.99, gating: 'strict', allowedTools: ['poll.create', 'message.send'], meta: {}, contributingSignals: [], resolvedAt: new Date().toISOString(), skillMatch: null,
    });
    ToolRegistry['poll.create'] = vi.fn(async () => ({ ok: true, pollId: 'p1' }));
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(
      PlanSchema.parse({ steps: [{ tool: 'poll.create', args: { question: 'Q', options: ['A'] }, reason: 'guild path' }], reasoning: 'guild shortcut', source: 'intent-map' })
    );
    await handleObservation(mkObs({ content: 'Vi make a poll' }), memory, log as any, skillGraph);
    expect(ToolRegistry['poll.create']).toHaveBeenCalled();
  });

  it('Ω.7 skill replay path triggers when skillGraph returns skill', async () => {
    skillGraph.shouldUseSkill.mockResolvedValue({
      skill: { id: 'skill-1', intent: 'replay-intent', actions: [{ tool: 'message.send', input: { content: 'replayed' } }] },
      similarity: 0.91,
      stats: { successRate: 0.88 }
    });
    await handleObservation(mkObs({ content: 'do the thing again' }), memory, log as any, skillGraph);
    const calls = (ToolRegistry['message.send'] as any).mock.calls;
    expect(JSON.stringify(calls).toLowerCase()).toContain('replayed');
  });

  it('Ω.8 non-JSON fallback path produces message.send echo', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'message.send', args: { content: 'raw nonjson output' }, reason: 'fallback' }], reasoning: 'fallback natural', source: 'fallback'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    const calls = (ToolRegistry['message.send'] as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it('Ω.9 missing tool does not crash executor (logs error)', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'tool.doesNotExist', args: {}, reason: 'bad' }], reasoning: 'bad plan', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(log.error).toHaveBeenCalled();
  });

  it('Ω.10 tool throws but pipeline finishes & reflects (resilient executor)', async () => {
    ToolRegistry['debug.throw'] = vi.fn(async () => { throw new Error('boom'); });
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'debug.throw', args: {}, reason: 'explode' }], reasoning: 'explode', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Step failed'))).toBeTruthy();
  });

  it('Ω.11 validation retry: first undefined then success (two attempts)', async () => {
    let first = true;
    ToolRegistry['debug.flaky'] = vi.fn(async () => { if (first) { first = false; return undefined; } return { ok: true }; });
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'debug.flaky', args: {}, reason: 'retry' }], reasoning: 'retry path', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(ToolRegistry['debug.flaky']).toHaveBeenCalledTimes(2); // retried once
  });

  it('Ω.12 reflector failure is logged but pipeline completes', async () => {
    vi.spyOn(reflectorMod, 'reflectResult').mockRejectedValue(new Error('reflect down'));
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Reflection failed'))).toBeTruthy();
  });

  it('Ω.13 skillGraph.recordExecution failure is logged but pipeline completes', async () => {
    skillGraph.recordExecution.mockRejectedValueOnce(new Error('graph down'));
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('recordExecution failed'))).toBeTruthy();
  });

  it('Ω.14 strict gating filters out disallowed tools leaving safe message', async () => {
    vi.spyOn(engineMod, 'resolveIntent').mockResolvedValue({
      source: 'guild-intent', intent: 'safe.intent', confidence: 0.99, gating: 'strict', allowedTools: ['message.send'], meta: {}, contributingSignals: [], resolvedAt: new Date().toISOString(), skillMatch: null,
    });
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [
        { tool: 'debug.echo', args: { content: 'blocked' }, reason: 'should filter' },
        { tool: 'message.send', args: { content: 'allowed' }, reason: 'allowed step' },
      ], reasoning: 'strict gating test', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    // After observer-level strict gating, debug.echo should be filtered
    expect((ToolRegistry['debug.echo'] as any).mock.calls.length).toBe(0);
  });

  it('Ω.15 soft gating allows outside tools but logs warning', async () => {
    vi.spyOn(engineMod, 'resolveIntent').mockResolvedValue({
      source: 'guild-intent', intent: 'soft.intent', confidence: 0.7, gating: 'soft', allowedTools: ['message.send'], meta: {}, contributingSignals: [], resolvedAt: new Date().toISOString(), skillMatch: null,
    });
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'debug.echo', args: { content: 'soft allowed' }, reason: 'soft' }], reasoning: 'soft gating', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(ToolRegistry['debug.echo']).toHaveBeenCalled();
  expect(log.info.mock.calls.map((c: any) => JSON.stringify(c)).join('\n')).toContain('soft gating');
  });

  it('Ω.16 error storm: all subsystems throw and pipeline still returns', async () => {
    vi.spyOn(retrieverMod, 'fetchContext').mockRejectedValue(new Error('retriever down'));
    vi.spyOn(engineMod, 'resolveIntent').mockRejectedValue(new Error('intent down'));
    vi.spyOn(plannerLLMMod, 'planLLM').mockRejectedValue(new Error('planner down'));
    vi.spyOn(executorMod, 'executePlan').mockRejectedValue(new Error('executor down'));
    vi.spyOn(reflectorMod, 'reflectResult').mockRejectedValue(new Error('reflect down'));
    skillGraph.recordExecution.mockRejectedValue(new Error('sg down'));
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    // multiple errors acceptable
    expect(log.error.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('Ω.17 concurrency: parallel observations keep separate display names', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockImplementation(async (obs: any) => PlanSchema.parse({
      steps: [{ tool: 'message.send', args: { content: `hey ${obs.authorDisplayName}` }, reason: 'parallel' }], reasoning: 'parallel', source: 'llm'
    }));
    const obsA = mkObs({ id: 'A', authorDisplayName: 'TheLinQuei' });
    const obsB = mkObs({ id: 'B', authorDisplayName: 'PublicName2' });
    await Promise.all([
      handleObservation(obsA, memory, log as any, skillGraph),
      handleObservation(obsB, memory, log as any, skillGraph),
    ]);
    const calls = (ToolRegistry['message.send'] as any).mock.calls.map((c: any[]) => JSON.stringify(c));
    const joined = calls.join('\n').toLowerCase();
    expect(joined).toContain('thelinquei');
    expect(joined).toContain('publicname2');
  });

  it('Ω.18 metrics recorded on normal run', async () => {
    const spy = vi.spyOn(metricsMod, 'recordObserverMetrics');
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(spy).toHaveBeenCalled();
  });

  // ----------- Additional Edge Expansions -----------
  it('Ω.E1 memory timeout / fetchContext rejects early but pipeline survives', async () => {
    vi.spyOn(retrieverMod, 'fetchContext').mockImplementation(async () => { throw new Error('timeout'); });
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    // When fetchContext throws, observer catches and logs this message
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Failed to fetch context'))).toBeTruthy();
  });

  it('Ω.E2 PUBLIC_GUILD sanitizer replaces greeting & aliases (observer layer)', async () => {
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'message.send', args: { content: 'Hello baby, Kaelen' }, reason: 'greet' }], reasoning: 'greet', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    const calls = (ToolRegistry['message.send'] as any).mock.calls;
    const last = JSON.stringify(calls[calls.length - 1]).toLowerCase();
    expect(last).not.toContain('baby');
    expect(last).not.toContain('kaelen');
    expect(last).toContain('thelinquei');
  });

  it('Ω.E3 executor unknown tool emits step failed error', async () => {
    // Provide one valid and one invalid tool schema (invalid because tool not registered with schema list)
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [
        { tool: 'message.send', args: { content: 'first' }, reason: 'first' },
        { tool: 'unknown.schema.tool', args: {}, reason: 'second' }
      ], reasoning: 'mixed plan', source: 'llm'
    }));
    await handleObservation(mkObs(), memory, log as any, skillGraph);
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Step failed'))).toBeTruthy();
  });

  it('Ω.E4 identity preference intent updates memory entity deterministically', async () => {
    vi.spyOn(engineMod, 'resolveIntent').mockResolvedValue({
      source: 'guild-intent', intent: 'identity.pref.update', confidence: 0.95, gating: 'strict', allowedTools: ['identity.update', 'message.send'], meta: { aliases: ['Nova'], scope: 'public' }, contributingSignals: [], resolvedAt: new Date().toISOString(), skillMatch: null,
    });
    vi.spyOn(plannerLLMMod, 'planLLM').mockResolvedValue(PlanSchema.parse({
      steps: [{ tool: 'identity.update', args: { userId: 'user-123', addPublicAliases: ['Nova'] }, reason: 'identity update' }], reasoning: 'identity path', source: 'intent-map'
    }));
    await handleObservation(mkObs({ content: 'Call me Nova' }), memory, log as any, skillGraph);
    expect(ToolRegistry['identity.update']).toHaveBeenCalled();
  });

  it('Ω.E5 reflection identity traits sync attempts even on degraded runs', async () => {
    vi.spyOn(reflectorMod, 'reflectResult').mockImplementation(async () => { throw new Error('reflect fail'); });
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    expect(log.error.mock.calls.some((c: any) => JSON.stringify(c).includes('Reflection failed'))).toBeTruthy();
    expect(memory.upsertUserEntity).toHaveBeenCalled();
  });

  it('Ω.E6 skillGraph.shouldUseSkill throws gracefully (logs and falls back)', async () => {
    skillGraph.shouldUseSkill.mockRejectedValue(new Error('skill graph fail'));
    await expect(handleObservation(mkObs(), memory, log as any, skillGraph)).resolves.toBeUndefined();
    expect(log.error.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
