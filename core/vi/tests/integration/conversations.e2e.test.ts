import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { SessionRepository } from '../../src/db/repositories/SessionRepository.js';
import { createServer } from '../../src/runtime/server.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Conversations API', () => {
  const telemetryPath = './test-telemetry';
  let poolCleanup: (() => Promise<void>) | null = null;
  let serverCleanup: (() => Promise<void>) | null = null;
  let server: FastifyInstance;
  let authHeader: Record<string, string> | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';

    const config = loadConfig();
    initializeLogger('error');
    initializeTelemetry(telemetryPath, false);

    const pool = createPool(config);
    await runMigrations(pool);
    await pool.query('TRUNCATE tool_execution_log, user_credits, memory_vectors, messages, conversations, run_records, sessions, users CASCADE');

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const userRepo = new UserRepository(pool);
    const sessionRepo = new SessionRepository(pool);

    server = await createServer({
      config,
      pool,
      conversationRepo,
      messageRepo,
      userRepo,
      sessionRepo,
    });

    await server.ready();
    // If auth is enabled, register and log in a user to obtain a token
    if (config.auth.enabled) {
      const registerResponse = await server.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          email: 'conv-user@example.com',
          username: 'convuser',
          password: 'Passw0rd!123',
          displayName: 'Conv User',
        },
      });

      expect(registerResponse.statusCode).toBe(201);

      const loginResponse = await server.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'conv-user@example.com',
          password: 'Passw0rd!123',
        },
      });
      expect(loginResponse.statusCode).toBe(200);
      const loginBody = loginResponse.json();
      authHeader = { Authorization: `Bearer ${loginBody.data.accessToken}` };
    }

    serverCleanup = async () => {
      await server.close();
    };

    poolCleanup = async () => {
      await closePool();
    };
  });

  afterAll(async () => {
    if (serverCleanup) {
      await serverCleanup();
    }
    if (poolCleanup) {
      await poolCleanup();
    }
  });

  it('creates a conversation and messages', async () => {
    const createResponse = await server.inject({
      method: 'POST',
      url: '/v1/conversations',
      payload: { title: 'Test Conversation' },
      headers: authHeader,
    });

    expect(createResponse.statusCode).toBe(201);
    const conversation = createResponse.json();
    expect(conversation.title).toBe('Test Conversation');

    const messageResponse = await server.inject({
      method: 'POST',
      url: `/v1/conversations/${conversation.id}/messages`,
      payload: { role: 'user', content: 'Hello world' },
      headers: authHeader,
    });

    expect(messageResponse.statusCode).toBe(201);
    const message = messageResponse.json();
    expect(message.role).toBe('user');
    expect(message.content).toBe('Hello world');

    const listResponse = await server.inject({
      method: 'GET',
      url: `/v1/conversations/${conversation.id}/messages`,
      headers: authHeader,
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.messages.length).toBe(1);
    expect(listBody.messages[0].id).toBe(message.id);
  });
});
