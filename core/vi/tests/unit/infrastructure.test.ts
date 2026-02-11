import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createServer } from '../../src/runtime/server.js';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';
import { Pool } from 'pg';

describe('Milestone 1: Infrastructure', () => {
  beforeAll(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.VI_LOG_LEVEL = 'error';
    process.env.VI_TELEMETRY_ENABLED = 'false';
  });

  describe('Config System', () => {
    it('should load config from environment', () => {
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.server.port).toBe(3000);
      expect(config.node.env).toBe('test');
    });

    it('should have all required fields', () => {
      const config = loadConfig();
      expect(config.server).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.database).toBeDefined();
      expect(config.telemetry).toBeDefined();
    });

    it('should override defaults with env vars', () => {
      process.env.VI_PORT = '4000';
      const config = loadConfig();
      expect(config.server.port).toBe(4000);
      delete process.env.VI_PORT;
    });
  });

  describe('Logger', () => {
    it('should initialize logger', () => {
      const logger = initializeLogger('error');
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });

    it('should log messages', () => {
      const logger = initializeLogger('error');
      expect(() => {
        logger.info({ test: true }, 'Test message');
      }).not.toThrow();
    });
  });

  describe('Telemetry', () => {
    it('should initialize telemetry', () => {
      const telemetry = initializeTelemetry('./test-telemetry', false);
      expect(telemetry).toBeDefined();
    });

    it('should handle disabled telemetry gracefully', async () => {
      const telemetry = initializeTelemetry('./test-telemetry', false);
      await telemetry.recordEvent({
        timestamp: new Date().toISOString(),
        level: 'info',
        type: 'test',
        data: {},
      });
      expect(true).toBe(true); // Should not throw
    });
  });

  describe('Server', () => {
    // Minimal fake pool that satisfies query/end calls used during server bootstrap
    const fakePool = {
      query: async () => ({ rows: [], rowCount: 0 }),
      end: async () => undefined,
    } as unknown as Pool;

    const fakeConversationRepo = {
      create: async (title: string) => ({ id: 'conv-1', title, createdAt: new Date().toISOString() }),
      getById: async (_id: string) => ({ id: 'conv-1', title: 'stub', createdAt: new Date().toISOString() }),
    } as unknown as ConversationRepository;

    const fakeMessageRepo = {
      create: async () => ({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user' as const,
        content: 'hello',
        createdAt: new Date().toISOString(),
      }),
      listByConversation: async () => [],
    } as unknown as MessageRepository;

    it('should create server without errors', async () => {
      const config = loadConfig();
      initializeLogger(config.logging.level);
      initializeTelemetry(config.telemetry.path, config.telemetry.enabled);

      const server = await createServer({
        config,
        pool: fakePool,
        conversationRepo: fakeConversationRepo,
        messageRepo: fakeMessageRepo,
      });
      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');
      await server.close();
    });

    it('should respond to health check', async () => {
      const config = loadConfig();
      initializeLogger(config.logging.level);
      initializeTelemetry(config.telemetry.path, config.telemetry.enabled);

      const server = await createServer({
        config,
        pool: fakePool,
        conversationRepo: fakeConversationRepo,
        messageRepo: fakeMessageRepo,
      });
      const response = await server.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.version).toBe('0.1.0');

      await server.close();
    });

    it('should handle 404 correctly', async () => {
      const config = loadConfig();
      initializeLogger(config.logging.level);
      initializeTelemetry(config.telemetry.path, config.telemetry.enabled);

      const server = await createServer({
        config,
        pool: fakePool,
        conversationRepo: fakeConversationRepo,
        messageRepo: fakeMessageRepo,
      });
      const response = await server.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      await server.close();
    });
  });
});
