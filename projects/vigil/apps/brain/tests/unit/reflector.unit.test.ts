import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reflectResult } from '../../src/reflector';

// Memory client mock
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
    upsertUserEntity: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

const log: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const OBS: any = {
  id: 'obs-refl-1',
  type: 'MESSAGE',
  content: 'test reflection',
  authorId: 'user-123',
  channelId: 'chan-1',
  guildId: 'guild-1',
  timestamp: new Date().toISOString(),
};

const PLAN: any = {
  steps: [{ tool: 'message.send', args: { channelId: 'chan-1', content: 'Echo' }, reason: 'echo' }],
  reasoning: 'test plan',
};

const RESULT: any = {
  success: true,
  outputs: [{ step: 0, envelope: { traceId: 'trace-1', tool: 'message.send', ok: true, ms: 10, input: {}, output: {} } }],
};

describe('reflector.unit.test', () => {
  let originalFetch: any;
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('Happy Path: reflectResult upserts reflection to Memory API and syncs identity traits', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const memory = makeMemory();
    await reflectResult(OBS, PLAN, RESULT, memory as any, log);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/mem/upsert'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(memory.getUserEntity).toHaveBeenCalledWith('user-123');
    expect(memory.upsertUserEntity).toHaveBeenCalledWith('user-123', expect.any(Object));
  });

  it('Edge Path: Memory API upsert fails (non-OK) but does not throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Error' });
    const memory = makeMemory();
    await expect(reflectResult(OBS, PLAN, RESULT, memory as any, log)).resolves.not.toThrow();
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(String) }));
  });

  it('Hostile Path: getUserEntity throws but reflector continues and logs warning', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const memory = makeMemory({ getUserEntity: vi.fn().mockRejectedValue(new Error('entity service down')) });
    await expect(reflectResult(OBS, PLAN, RESULT, memory as any, log)).resolves.not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('entity service down') }));
  });

  it('Canon Enforcement: PUBLIC_GUILD reflection payload includes correct scopeId (channelId)', async () => {
    let capturedPayload: any = null;
    global.fetch = vi.fn().mockImplementation(async (url, opts: any) => {
      if (url.includes('/v1/mem/upsert')) {
        capturedPayload = JSON.parse(opts.body);
      }
      return { ok: true, json: async () => ({}) };
    });
    const memory = makeMemory();
    await reflectResult(OBS, PLAN, RESULT, memory as any, log);
    expect(capturedPayload).toBeTruthy();
    expect(capturedPayload.scope).toBe('channel');
    expect(capturedPayload.scopeId).toBe(OBS.channelId);
    expect(capturedPayload.meta.observationId).toBe(OBS.id);
  });

  it('Canon Enforcement Edge: identity traits merge preserves existing privateAliases when adding new public', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const memory = makeMemory({
      getUserEntity: vi.fn().mockResolvedValue({
        id: 'user:123',
        aliases: ['OldAlias'],
        traits: {
          identity: {
            publicAliases: ['OldAlias'],
            privateAliases: ['Forsa', 'K'],
            allowAutoIntimate: false,
          },
        },
      }),
    });
    await reflectResult({ ...OBS, authorDisplayName: 'NewPublicName' } as any, PLAN, RESULT, memory as any, log);
    expect(memory.upsertUserEntity).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        traits: expect.objectContaining({
          identity: expect.objectContaining({
            privateAliases: ['Forsa', 'K'], // preserved
            publicAliases: expect.arrayContaining(['OldAlias', 'NewPublicName']),
          }),
        }),
      })
    );
  });
});
