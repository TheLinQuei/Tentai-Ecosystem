import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { createServer } from '../../src/runtime/server.js';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { SessionRepository } from '../../src/db/repositories/SessionRepository.js';
import { CitationRepository } from '../../src/db/repositories/CitationRepository.js';
import type { FastifyInstance } from 'fastify';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('citations persistence', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let citationRepo: CitationRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';
    process.env.VI_AUTH_ENABLED = 'false';
    process.env.VI_TOOLS_RATE_LIMIT_DEFAULT = '1000';
    process.env.VI_TEST_MODE = 'true';

    const config = loadConfig();
    initializeLogger('error');
    initializeTelemetry('./test-telemetry', false);

    pool = createPool(config);
    await runMigrations(pool);

    await pool.query(
      'TRUNCATE response_citations, tool_execution_log, user_credits, memory_vectors, messages, conversations, run_records, sessions, users CASCADE'
    );

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const userRepo = new UserRepository(pool);
    const sessionRepo = new SessionRepository(pool);
    citationRepo = new CitationRepository(pool);

    app = await createServer({
      config,
      pool,
      conversationRepo,
      messageRepo,
      userRepo,
      sessionRepo,
    });
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it('persists citations to DB and returns them', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'Give me a grounded answer about Paris with citations.',
        context: {},
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.recordId).toBeTruthy();

    // DB proof
    const rows = await citationRepo.listByRunRecordId(body.recordId);
    expect(rows.length).toBeGreaterThan(0);

    // Response proof (citations surfaced)
    expect((body.citations?.length || 0)).toBeGreaterThan(0);
  });
});
