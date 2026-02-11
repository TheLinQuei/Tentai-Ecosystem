import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { Planner } from '../../src/brain/planner.js';
import { ToolRunner } from '../../src/tools/runner.js';
import type { FastifyInstance } from 'fastify';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

const EXPECTED_PROMPT = 'Better/worse than what? Can you specify what you\'re comparing?';

type SSEEvent = { event: string; data: any; raw: string };

const parseSse = (body: string): SSEEvent[] => {
  const blocks = body.split('\n\n').filter((b) => b.trim().length > 0);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    const event = eventLine ? eventLine.slice(7).trim() : '';
    let data: any = dataLine ? dataLine.slice(6) : undefined;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // leave as string
      }
    }
    return { event, data, raw: block };
  });
};

describe('AmbiguityGate /v1/chat/stream short-circuit', () => {
  let pool: Pool;
  let app: FastifyInstance;

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
      'TRUNCATE tool_execution_log, user_credits, memory_vectors, messages, conversations, run_records, sessions, users CASCADE'
    );

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const userRepo = new UserRepository(pool);
    const sessionRepo = new SessionRepository(pool);

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

  it('streams only a clarification response and closes', async () => {
    const planSpy = vi.spyOn(Planner.prototype, 'generatePlan');
    const toolSpy = vi.spyOn(ToolRunner.prototype, 'execute');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/stream',
      payload: {
        message: 'that was better',
      },
    });

    expect(response.statusCode).toBe(200);

    const events = parseSse(response.body);
    const responseEvents = events.filter((evt) => evt.event === 'response');

    expect(response.body).toContain('event: done');
    expect(responseEvents).toHaveLength(1);
    expect(responseEvents[0].data?.output).toBe(EXPECTED_PROMPT);

    const forbiddenStages = new Set(['intent', 'plan', 'execution', 'reflection']);
    const hasForbidden = events.some((evt) => forbiddenStages.has(evt.event));
    expect(hasForbidden).toBe(false);

    expect(planSpy).not.toHaveBeenCalled();
    expect(toolSpy).not.toHaveBeenCalled();

    planSpy.mockRestore();
    toolSpy.mockRestore();
  });
});
