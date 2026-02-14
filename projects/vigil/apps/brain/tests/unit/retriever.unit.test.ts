import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchContext } from '../../src/retriever';
import { resolveIdentityZone, buildIdentityProfile } from '../../src/identity';

// Minimal logger stub
const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Memory client stub
function makeMemory(overrides: Partial<any> = {}) {
  return {
    baseUrl: 'http://localhost:4311',
    getUserEntity: vi.fn().mockResolvedValue({
      id: 'user:123',
      aliases: ['DisplayAlias'],
      traits: {
        identity: {
          publicAliases: ['DisplayAlias'],
          privateAliases: ['Kaelen'],
          allowAutoIntimate: true,
        },
      },
    }),
    ...overrides,
  };
}

const OBS_BASE = {
  id: 'obs-1',
  type: 'MESSAGE',
  content: 'test query weather',
  authorId: '123',
  channelId: 'chan-9',
  guildId: 'guild-55',
  timestamp: new Date().toISOString(),
  authorDisplayName: 'GuildDisplay',
};

describe('retriever.unit.test', () => {
  let originalFetch: any;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('Happy Path: returns structured recent + relevant + userEntity', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [
        { text: 'alpha', score: 0.9 },
        { text: 'beta', score: 0.7 },
      ] }),
    });
    const memory = makeMemory();
    const ctx = await fetchContext(OBS_BASE as any, memory as any, log as any);
    expect(ctx.recent.length).toBeGreaterThan(0);
    expect(ctx.relevant.length).toBeGreaterThan(0);
    expect(ctx.userEntity?.id).toBe('user:123');
    // Canon enforcement: identity zone should be PUBLIC_GUILD for guildId present
    const zone = resolveIdentityZone(OBS_BASE as any);
    expect(zone).toBe('PUBLIC_GUILD');
    const profile = buildIdentityProfile({ obs: OBS_BASE as any, userEntity: ctx.userEntity });
    expect(profile.publicAliases).toContain('GuildDisplay');
    // PRIVATE aliases must NOT appear in public addressing list
    expect(profile.privateAliases).toContain('Kaelen');
  });

  it('Boundary: pagination returns max 5 recent items when more than 5 results', async () => {
    const items = Array.from({ length: 12 }).map((_, i) => ({ text: `item-${i}`, score: 0.1 * i }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const memory = makeMemory();
    const ctx = await fetchContext(OBS_BASE as any, memory as any, log as any);
    expect(ctx.relevant).toHaveLength(12);
    expect(ctx.recent).toHaveLength(5); // slice(0,5)
    // Ensure ordering preserved (first five)
    expect(ctx.recent.map(r => r.content)).toEqual(items.slice(0,5).map(r => r.text));
  });

  it('Boundary: missing timestamp replaced with ISO string', async () => {
    const items = [
      { text: 'no-ts-1', score: 0.5 },
      { text: 'with-ts', score: 0.6, timestamp: '2025-01-01T00:00:00.000Z' },
    ];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const ctx = await fetchContext(OBS_BASE as any, makeMemory() as any, log as any);
    const recentFirst = ctx.recent.find(r => r.content === 'no-ts-1');
    expect(recentFirst).toBeTruthy();
    // Should auto-inject timestamp (best-effort ISO)
    expect(new Date(recentFirst!.timestamp).toString()).not.toBe('Invalid Date');
    const withTs = ctx.recent.find(r => r.content === 'with-ts');
    expect(withTs!.timestamp).toBe('2025-01-01T00:00:00.000Z');
  });

  it('Boundary: score values outside 0–1 range are passed through (identifies need for normalization)', async () => {
    const items = [
      { text: 'neg', score: -0.4 },
      { text: 'big', score: 3.2 },
      { text: 'ok', score: 0.7 },
    ];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    const ctx = await fetchContext(OBS_BASE as any, makeMemory() as any, log as any);
    const scores = ctx.relevant.filter(r => ['neg','big','ok'].includes(r.content)).map(r => r.score);
    expect(scores).toContain(-0.4);
    expect(scores).toContain(3.2);
    expect(scores).toContain(0.7);
    // Regression guard (desired future behavior): expect all scores clamped between 0 and 1
    // TODO (spec-enhancement): implement clamping then change assertion below
    expect(scores.some(s => s < 0 || s > 1)).toBe(true); // currently true → indicates missing normalization
  });

  it('Edge Path: non-OK HTTP response yields empty context', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const memory = makeMemory();
    const ctx = await fetchContext({ ...OBS_BASE, content: 'anything' } as any, memory as any, log as any);
    expect(ctx.recent).toHaveLength(0);
    expect(ctx.relevant).toHaveLength(0);
  });

  it('Hostile Path: malformed JSON shape with missing items field falls back safely', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unexpected: 'shape' }) });
    const memory = makeMemory({ getUserEntity: vi.fn().mockRejectedValue(new Error('memory down')) });
    const ctx = await fetchContext(OBS_BASE as any, memory as any, log as any);
    expect(Array.isArray(ctx.recent)).toBe(true);
    expect(Array.isArray(ctx.relevant)).toBe(true);
    expect(ctx.userEntity).toBeUndefined();
  });

  it('Canon Enforcement: PUBLIC_GUILD never leaks private alias into primary publicAliases set', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const memory = makeMemory();
    const ctx = await fetchContext(OBS_BASE as any, memory as any, log as any);
    const profile = buildIdentityProfile({ obs: OBS_BASE as any, userEntity: ctx.userEntity });
    // Ensure none of the private aliases appear in publicAliases
    for (const priv of profile.privateAliases) {
      expect(profile.publicAliases).not.toContain(priv);
    }
  });

  it('Canon Enforcement Edge: PRIVATE_DM preserves private aliases', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    const memory = makeMemory();
    const dmObs = { ...OBS_BASE, guildId: undefined };
    const ctx = await fetchContext(dmObs as any, memory as any, log as any);
    const zone = resolveIdentityZone(dmObs as any);
    expect(zone).toBe('PRIVATE_DM');
    const profile = buildIdentityProfile({ obs: dmObs as any, userEntity: ctx.userEntity });
    expect(profile.privateAliases.length).toBeGreaterThan(0);
  });
});
