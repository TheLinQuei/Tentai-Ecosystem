/**
 * Phase 1.2 Test Suite: User and Session Admin Endpoints
 * Tests /v1/admin/users and /v1/admin/sessions for God Console integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createServer } from '../../src/runtime/server.js';
import { loadConfig } from '../../src/config/config.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { SessionRepository } from '../../src/db/repositories/SessionRepository.js';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';
import { FastifyInstance } from 'fastify';
import { loadSelfModelFromFile } from '../../src/config/selfModel.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Phase 1.2: User and Session Admin Endpoints', () => {
  let pool: Pool;
  let server: FastifyInstance;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let testUserIds: string[] = [];

  beforeAll(async () => {
    initializeLogger('silent' as any);
    initializeTelemetry({ enableConsoleLogging: false, enableFileLogging: false });

    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    userRepo = new UserRepository(pool);
    sessionRepo = new SessionRepository(pool);

    const config = await loadConfig();
    config.auth.enabled = false;

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const selfModel = loadSelfModelFromFile();

    server = await createServer({
      config,
      pool,
      conversationRepo,
      messageRepo,
      userRepo,
      sessionRepo,
      selfModel,
    } as any);

    await server.listen({ port: 0, host: '127.0.0.1' });

    // Create test users
    for (let i = 0; i < 5; i++) {
      const user = await userRepo.create({
        email: `test${i}@example.com`,
        username: `testuser${i}`,
        passwordHash: 'hash',
        displayName: `Test User ${i}`,
      });
      testUserIds.push(user.id);
    }

    // Create test sessions (only for users that were successfully created)
    for (let i = 0; i < Math.min(3, testUserIds.length); i++) {
      const userId = testUserIds[i];
      await sessionRepo.create({
        userId,
        refreshToken: randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      });
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    // Clean up test data
    await pool.query('DELETE FROM sessions WHERE user_id = ANY($1)', [testUserIds]);
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['test%@example.com']);
    await pool.end();
  });

  describe('User List Endpoint', () => {
    it('should require VI_DEBUG_MODE=true', async () => {
      const originalDebugMode = process.env.VI_DEBUG_MODE;
      delete process.env.VI_DEBUG_MODE;

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/users',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toContain('Debug endpoints disabled');

      process.env.VI_DEBUG_MODE = originalDebugMode;
    });

    it('should list all users with displayName', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/users',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.users).toBeInstanceOf(Array);
      expect(body.count).toBeGreaterThan(0);

      // Verify user structure
      const user = body.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('displayName');
      expect(user).not.toHaveProperty('passwordHash'); // Security check
    });

    it('should support pagination', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const page1 = await server.inject({
        method: 'GET',
        url: '/v1/admin/users?limit=2&offset=0',
      });

      const page2 = await server.inject({
        method: 'GET',
        url: '/v1/admin/users?limit=2&offset=2',
      });

      expect(page1.statusCode).toBe(200);
      expect(page2.statusCode).toBe(200);

      const body1 = page1.json();
      const body2 = page2.json();

      expect(body1.users.length).toBeLessThanOrEqual(2);
      expect(body1.limit).toBe(2);
      expect(body1.offset).toBe(0);

      expect(body2.limit).toBe(2);
      expect(body2.offset).toBe(2);

      // Different pages should have different users (if enough data)
      if (body1.users.length > 0 && body2.users.length > 0) {
        expect(body1.users[0].id).not.toBe(body2.users[0].id);
      }
    });

    it('should return users ordered by creation date desc', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/users',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      if (body.users.length > 1) {
        const dates = body.users.map((u: any) => new Date(u.createdAt).getTime());
        for (let i = 0; i < dates.length - 1; i++) {
          expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
        }
      }
    });
  });

  describe('Session Browser Endpoint', () => {
    it('should require VI_DEBUG_MODE=true', async () => {
      const originalDebugMode = process.env.VI_DEBUG_MODE;
      delete process.env.VI_DEBUG_MODE;

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toContain('Debug endpoints disabled');

      process.env.VI_DEBUG_MODE = originalDebugMode;
    });

    it('should list active sessions with user display names', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessions).toBeInstanceOf(Array);

      if (body.sessions.length > 0) {
        const session = body.sessions[0];
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('userId');
        expect(session).toHaveProperty('userDisplayName');
        expect(session).toHaveProperty('userEmail');
        expect(session).toHaveProperty('createdAt');
        expect(session).toHaveProperty('lastActivityAt');
      }
    });

    it('should support pagination', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const page1 = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions?limit=1&offset=0',
      });

      const page2 = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions?limit=1&offset=1',
      });

      expect(page1.statusCode).toBe(200);
      expect(page2.statusCode).toBe(200);

      const body1 = page1.json();
      const body2 = page2.json();

      expect(body1.sessions.length).toBeLessThanOrEqual(1);
      expect(body1.limit).toBe(1);
      expect(body1.offset).toBe(0);

      expect(body2.limit).toBe(1);
      expect(body2.offset).toBe(1);
    });

    it('should enrich sessions with user metadata', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      if (body.sessions.length > 0) {
        const session = body.sessions[0];
        
        // Fetch the user to verify enrichment
        const user = await userRepo.getById(session.userId);
        
        if (user) {
          expect(session.userDisplayName).toBe(user.displayName || user.username);
          expect(session.userEmail).toBe(user.email);
        }
      }
    });

    it('should only return active (non-revoked, non-expired) sessions', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // All sessions should be active
      body.sessions.forEach((session: any) => {
        expect(session.revokedAt).toBeNull();
        expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
      });
    });

    it('should order sessions by last activity desc', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      if (body.sessions.length > 1) {
        const activityTimes = body.sessions.map((s: any) => new Date(s.lastActivityAt).getTime());
        for (let i = 0; i < activityTimes.length - 1; i++) {
          expect(activityTimes[i]).toBeGreaterThanOrEqual(activityTimes[i + 1]);
        }
      }
    });
  });

  describe('Data Integrity', () => {
    it('should never expose password hashes in user list', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/users',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      body.users.forEach((user: any) => {
        expect(user).not.toHaveProperty('passwordHash');
        expect(user).not.toHaveProperty('password_hash');
        expect(user).not.toHaveProperty('password');
      });
    });

    it('should handle users without display names gracefully', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      // Create user without display name
      const userId = randomUUID();
      await userRepo.create({
        email: 'nodisplay@example.com',
        username: 'nodisplayuser',
        passwordHash: 'hash',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/users',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const userWithoutDisplay = body.users.find((u: any) => u.email === 'nodisplay@example.com');
      expect(userWithoutDisplay).toBeDefined();
      expect(userWithoutDisplay.displayName).toBeNull();
      expect(userWithoutDisplay.username).toBe('nodisplayuser');

      // Cleanup
      await pool.query('DELETE FROM users WHERE email = $1', ['nodisplay@example.com']);
    });

    it('should handle sessions for deleted users gracefully', async () => {
      process.env.VI_DEBUG_MODE = 'true';

      const response = await server.inject({
        method: 'GET',
        url: '/v1/admin/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // All sessions should have user metadata
      body.sessions.forEach((session: any) => {
        expect(session.userDisplayName).toBeDefined();
        expect(session.userEmail).toBeDefined();
      });
    });
  });
});
