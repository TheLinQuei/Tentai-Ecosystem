import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { StubEmbeddingService } from '../../src/brain/memory/embeddings.js';
import { PostgresMemoryStore } from '../../src/brain/memory/MemoryStore.js';
import { MemoryConsolidationService } from '../../src/memory/consolidation/service.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Memory Consolidation', () => {
  let pool: Pool;
  let userRepo: UserRepository;
  let userId: string;
  let memoryStore: PostgresMemoryStore;
  let consolidation: MemoryConsolidationService;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';

    const config = loadConfig();
    initializeLogger('error');
    initializeTelemetry('./test-telemetry', false);

    pool = createPool(config);
    await runMigrations(pool);

    // Clean up test data (truncate with CASCADE to handle foreign keys)
    await pool.query(
      'TRUNCATE tool_execution_log, user_credits, memory_vectors, messages, conversations, run_records, sessions, users CASCADE'
    );

    userRepo = new UserRepository(pool);

    // Seed deterministic user
    userId = '00000000-0000-0000-0000-000000000020';
    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       ON CONFLICT (id) DO NOTHING`,
      [
        userId,
        'mb-test@example.com',
        'mbuser',
        'Passw0rd!123',
        'MB Test User',
      ]
    );

    const embeddingService = new StubEmbeddingService();
    memoryStore = new PostgresMemoryStore(pool, embeddingService);
    consolidation = new MemoryConsolidationService(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('dedupes exact text and prunes old memories', async () => {
    // Insert two duplicates and one old memory
    const dupText = 'Project kickoff meeting notes';
    const id1 = await memoryStore.store({
      userId,
      type: 'episodic',
      subtype: 'meeting',
      text: dupText,
    });
    const id2 = await memoryStore.store({
      userId,
      type: 'episodic',
      subtype: 'meeting',
      text: dupText,
    });

    const oldText = 'Old memory to be pruned';
    const id3 = await memoryStore.store({
      userId,
      type: 'semantic',
      subtype: 'note',
      text: oldText,
    });

    // Set id3 created_at to 45 days ago
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    await pool.query('UPDATE memory_vectors SET created_at = $1 WHERE id = $2', [
      fortyFiveDaysAgo,
      id3,
    ]);

    // Sanity check counts
    const pre = await pool.query('SELECT COUNT(*)::int AS c FROM memory_vectors WHERE user_id = $1', [userId]);
    expect(pre.rows[0].c).toBe(3);

    // Run consolidation
    const stats = await consolidation.run(userId, 30);

    // Verify: one duplicate removed, old memory removed
    expect(stats.removedDuplicatesCount).toBe(1);
    expect(stats.removedOldCount).toBe(1);

    const post = await pool.query('SELECT id, text, created_at FROM memory_vectors WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    expect(post.rows.length).toBe(1);
    expect(post.rows[0].text).toBe(dupText);
    expect(post.rows[0].id === id1 || post.rows[0].id === id2).toBe(true);
  });
});
