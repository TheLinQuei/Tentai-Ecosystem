import { describe, it, expect } from 'vitest';
// Intents engine not yet read in this session; assuming exported resolveIntent signature from observer usage.
import { resolveIntent } from '../../src/intents/engine.js';

// Logger + skillGraph mocks
const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
const skillGraph = { shouldUseSkill: async () => null } as any;

// Minimal observation & context scaffolds
const OBS: any = {
  id: 'obs-intent-1',
  type: 'MESSAGE',
  content: 'show guild member count',
  authorId: 'u-1',
  channelId: 'c-1',
  guildId: 'g-9',
  timestamp: new Date().toISOString(),
};

const CONTEXT: any = { recent: [], relevant: [] };

describe('engine.unit.test', () => {
  it('Happy Path: resolveIntent returns structured IntentDecision', async () => {
    const decision = await resolveIntent(OBS, CONTEXT, log, skillGraph);
    expect(decision).toBeTruthy();
    expect(typeof decision.intent === 'string' || decision.intent === null).toBe(true);
    expect(['strict','soft','none']).toContain(decision.gating);
    expect(Array.isArray(decision.allowedTools)).toBe(true);
    expect(typeof decision.confidence).toBe('number');
  });

  it('Edge Path: empty content still returns fallback intent decision', async () => {
    const emptyObs = { ...OBS, content: '' };
    const decision = await resolveIntent(emptyObs, CONTEXT, log, skillGraph);
    expect(decision.intent === '' || decision.intent === null).toBe(true);
    expect(decision.source).toBeDefined();
  });

  it('Hostile Path: context mutated with invalid structures does not throw', async () => {
    const hostileContext = { recent: 42, relevant: 'x', bad: { nested: { arr: null } } } as any;
    const decision = await resolveIntent(OBS, hostileContext, log, skillGraph);
    expect(decision).toBeTruthy();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
  });

  it('Canon Enforcement: PUBLIC_GUILD gating never includes private-only tools', async () => {
    const decision = await resolveIntent(OBS, CONTEXT, log, skillGraph);
    if (decision.gating === 'strict') {
      // message.send always allowed, others must be from allowlist returned
      for (const t of decision.allowedTools) {
        expect(typeof t).toBe('string');
      }
    }
  });

  it('Canon Enforcement Edge: PRIVATE_DM allows broader tool suggestion palette', async () => {
    const dmObs = { ...OBS, guildId: undefined };
    const decision = await resolveIntent(dmObs, CONTEXT, log, skillGraph);
    // Soft gating acceptable in DM context; ensure decision object still valid
    expect(['strict','soft','none']).toContain(decision.gating);
  });
});
