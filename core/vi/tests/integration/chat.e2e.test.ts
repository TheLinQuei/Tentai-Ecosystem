/**
 * Integration Test: /v1/chat endpoint
 * Verifies end-to-end chat flow: HTTP POST → CognitionPipeline → response
 */

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
import type { FastifyInstance } from 'fastify';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('/v1/chat Endpoint', () => {
  let pool: Pool;
  let app: FastifyInstance;
  let userRepo: UserRepository;
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';
    process.env.VI_AUTH_ENABLED = 'false'; // Disable auth for simpler testing
    process.env.VI_TOOLS_RATE_LIMIT_DEFAULT = '1000'; // Relax rate limiting for integration tests
    process.env.VI_TEST_MODE = 'true'; // Use stub LLM + policy for tests

    const config = loadConfig();
    initializeLogger('error');
    initializeTelemetry('./test-telemetry', false);

    pool = createPool(config);
    await runMigrations(pool);

    // Clean up test data
    await pool.query(
      'TRUNCATE tool_execution_log, user_credits, memory_vectors, messages, conversations, run_records, sessions, users CASCADE'
    );

    userRepo = new UserRepository(pool);
    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const sessionRepo = new SessionRepository(pool);

    // Seed test user (optional when auth disabled)
    userId = '00000000-0000-0000-0000-000000000011';
    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       ON CONFLICT (id) DO NOTHING`,
      [userId, 'chat-test@example.com', 'chatuser', 'Passw0rd!123', 'Chat Test User']
    );

    // Create server
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

  it('should handle chat request and return response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'What is the capital of France?',
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('output');
    expect(body).toHaveProperty('recordId');
    expect(body).toHaveProperty('sessionId');
    expect(typeof body.output).toBe('string');
    expect(body.output.length).toBeGreaterThan(0);

    // Verify run record was created
    const record = await pool.query(
      'SELECT * FROM run_records WHERE id = $1',
      [body.recordId]
    );
    expect(record.rows).toHaveLength(1);
    expect(record.rows[0].input_text).toBe('What is the capital of France?');
    expect(typeof record.rows[0].success).toBe('boolean');
  });

  it('should accept sessionId and resume session', async () => {
    // First request
    const response1 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'Hello',
      },
    });

    const body1 = JSON.parse(response1.body);
    const sessionId = body1.sessionId;

    // Second request with same sessionId
    const response2 = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'How are you?',
        sessionId,
      },
    });

    const body2 = JSON.parse(response2.body);
    expect(body2.sessionId).toBe(sessionId);
  });

  it('should include trace when requested', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'Test trace',
        includeTrace: true,
      },
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('trace');
    expect(body.trace).toHaveProperty('intent');
    expect(body.trace).toHaveProperty('plan');
    expect(body.trace).toHaveProperty('execution');
    expect(body.trace).toHaveProperty('reflection');
  });

  it('should return 400 for missing message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('error');
  });

  it('should return 400 for empty message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: '',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should accept context with recentHistory', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'Continue our conversation',
        context: {
          recentHistory: ['User asked about weather', 'Vi responded with forecast'],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('output');
  });

  it('should accept context with userPreferences', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: {
        message: 'Help me',
        context: {
          userPreferences: { theme: 'dark', language: 'en' },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('output');
  });
});
