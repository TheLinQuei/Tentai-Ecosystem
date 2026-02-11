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

describe('Auth API', () => {
  const telemetryPath = './test-telemetry';
  let poolCleanup: (() => Promise<void>) | null = null;
  let serverCleanup: (() => Promise<void>) | null = null;
  let server: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';
    process.env.NODE_ENV = 'test';
    process.env.VI_AUTH_ENABLED = 'true';
    process.env.VI_JWT_SECRET = 'test-secret';

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

  it('registers, logs in, accesses protected routes, refreshes and logs out', async () => {
    // Register
    const registerResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'user@example.com',
        username: 'testuser',
        password: 'Passw0rd!123',
        displayName: 'Test User',
      },
    });

    if (registerResponse.statusCode !== 201) {
      // Helpful debugging output
      // eslint-disable-next-line no-console
      console.error('Register failed:', registerResponse.statusCode, registerResponse.body);
    }
    expect(registerResponse.statusCode).toBe(201);
    const registerBody = registerResponse.json();
    expect(registerBody.success).toBe(true);
    expect(registerBody.data.accessToken).toBeTruthy();
    expect(registerBody.data.refreshToken).toBeTruthy();

    const accessToken = registerBody.data.accessToken as string;
    const refreshToken = registerBody.data.refreshToken as string;

    // Login
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'user@example.com',
        password: 'Passw0rd!123',
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json();
    expect(loginBody.success).toBe(true);
    expect(loginBody.data.accessToken).toBeTruthy();
    expect(loginBody.data.refreshToken).toBeTruthy();

    const authHeader = { Authorization: `Bearer ${loginBody.data.accessToken}` };

    // Protected endpoint: create conversation
    const createConv = await server.inject({
      method: 'POST',
      url: '/v1/conversations',
      payload: { title: 'Auth Conversation' },
      headers: authHeader,
    });
    expect(createConv.statusCode).toBe(201);
    const conversation = createConv.json();

    // Protected endpoint: add message
    const addMsg = await server.inject({
      method: 'POST',
      url: `/v1/conversations/${conversation.id}/messages`,
      payload: { role: 'user', content: 'Hello from auth' },
      headers: authHeader,
    });
    expect(addMsg.statusCode).toBe(201);

    // Protected endpoint: list messages
    const listMsg = await server.inject({
      method: 'GET',
      url: `/v1/conversations/${conversation.id}/messages`,
      headers: authHeader,
    });
    expect(listMsg.statusCode).toBe(200);
    const listBody = listMsg.json();
    expect(listBody.messages.length).toBe(1);

    // Refresh token
    const refreshResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(200);
    const refreshBody = refreshResponse.json();
    expect(refreshBody.success).toBe(true);
    expect(refreshBody.data.accessToken).toBeTruthy();

    // Logout
    const logoutResponse = await server.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(200);

    // Using revoked refresh token should fail
    const refreshAgain = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshAgain.statusCode).toBe(401);
  });
});
