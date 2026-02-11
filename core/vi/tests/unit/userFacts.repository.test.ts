import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { UserFactRepository } from '../../src/db/repositories/UserFactRepository.js';

const makeRow = (overrides: Partial<any> = {}) => ({
  fact_id: 'fact-1',
  vi_user_id: 'user-1',
  fact_key: 'never_guess',
  fact_type: 'rule',
  authority: 'locked',
  scope: 'global',
  value: { rule: 'never_guess' },
  confidence: 1.0,
  source: 'user',
  created_at: new Date(),
  updated_at: new Date(),
  expires_at: null,
  ...overrides,
});

describe('UserFactRepository', () => {
  let mockPool: Pool;
  let repo: UserFactRepository;

  beforeEach(() => {
    mockPool = {
      query: async () => ({ rows: [] }),
    } as unknown as Pool;
    repo = new UserFactRepository(mockPool);
  });

  it('lists locked facts', async () => {
    mockPool.query = async () => ({ rows: [makeRow()] }) as any;
    const results = await repo.listLockedFacts('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].authority).toBe('locked');
  });

  it('orders facts by authority then updated_at', async () => {
    mockPool.query = async () => ({
      rows: [
        makeRow({ authority: 'locked', fact_key: 'never_guess' }),
        makeRow({ authority: 'explicit', fact_key: 'do_not_repeat', fact_id: 'fact-2' }),
      ],
    }) as any;

    const results = await repo.listFactsOrdered('user-1');
    expect(results[0].authority).toBe('locked');
    expect(results[1].authority).toBe('explicit');
  });

  it('rejects overriding locked facts', async () => {
    let call = 0;
    mockPool.query = async () => {
      call += 1;
      if (call === 1) {
        return { rows: [{ fact_id: 'fact-1', authority: 'locked' }] } as any;
      }
      return { rows: [makeRow({ authority: 'explicit' })] } as any;
    };

    await expect(
      repo.upsertFact({
        vi_user_id: 'user-1',
        fact_key: 'never_guess',
        fact_type: 'rule',
        authority: 'explicit',
        scope: 'global',
        value: { rule: 'never_guess' },
        confidence: 1.0,
        source: 'user',
        expires_at: null,
      })
    ).rejects.toThrow('Locked fact cannot be overridden');
  });
});
