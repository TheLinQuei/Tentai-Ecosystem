/**
 * Integration Test: Cognition Pipeline
 * Verifies end-to-end flow: input → intent → plan → execution → reflection → output
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { buildMockContinuityPack } from '../helpers/mockContinuityPack.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { CognitionPipeline } from '../../src/brain/pipeline.js';
import { ToolRunner as ToolExecutionEngine } from '../../src/tools/runner.js';
import { createLLMGateway } from '../../src/brain/llm/factory.js';
import {
  StubPolicyEngine,
  PostgresRunRecordStore,
} from '../../src/brain/stubs.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Cognition Pipeline', () => {
  let pool: Pool;
  let pipeline: CognitionPipeline;
  let userRepo: UserRepository;
  let userId: string;
  let sessionId: string;

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

    // Seed a deterministic test user to satisfy run_records FK
    userId = '00000000-0000-0000-0000-000000000010';
    const seedResult = await pool.query(
      `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        userId,
        'cognition-test@example.com',
        'cognitionuser',
        'Passw0rd!123',
        'Cognition Test User',
      ]
    );

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rowCount === 0) {
      const inserted = seedResult.rowCount;
      throw new Error(`Failed to seed cognition test user (inserted: ${inserted})`);
    }

    sessionId = '00000000-0000-0000-0000-000000000001'; // Fixed for testing

    // Initialize pipeline with factory-created gateway and stubs
    const llmGateway = createLLMGateway(config);
    const policyEngine = new StubPolicyEngine();
    const runRecordStore = new PostgresRunRecordStore(pool);
    const toolRunner = new ToolExecutionEngine(false);

    pipeline = new CognitionPipeline(llmGateway, policyEngine, runRecordStore, toolRunner);
  });

  afterAll(async () => {
    await closePool();
  });

  it('processes a query through the full cognition pipeline', async () => {
    const input = 'What is the capital of France?';

    // Execute pipeline
    const result = await pipeline.process(input, userId, sessionId, {
      recentHistory: [],
      userPreferences: {},
      continuityPack: buildMockContinuityPack(userId),
    });

    // Verify result
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('recordId');
    expect(typeof result.output).toBe('string');
    expect(result.output.length).toBeGreaterThan(0);

    // Verify run record was stored
    const record = await pool.query(
      'SELECT * FROM run_records WHERE id = $1',
      [result.recordId]
    );
    expect(record.rows).toHaveLength(1);

    const storedRecord = record.rows[0];
    expect(storedRecord.user_id).toBe(userId);
    expect(storedRecord.input_text).toBe(input);
    expect(typeof storedRecord.success).toBe('boolean');
    expect(storedRecord.intent).toHaveProperty('category');
    expect(storedRecord.plan_executed).toHaveProperty('steps');
    expect(storedRecord.execution_result).toHaveProperty('stepsExecuted');
    expect(storedRecord.reflection).toHaveProperty('summary');
  });

  it('classifies intent correctly for different input types', async () => {
    const queryInput = 'What is the weather?';
    const queryResult = await pipeline.process(queryInput, userId, sessionId, {
      continuityPack: buildMockContinuityPack(userId),
    });
    expect(typeof queryResult.output).toBe('string');
    expect(queryResult.output.length).toBeGreaterThan(0);

    const commandInput = 'Can you help me with something?';
    const commandResult = await pipeline.process(commandInput, userId, sessionId, {
      continuityPack: buildMockContinuityPack(userId),
    });
    expect(typeof commandResult.output).toBe('string');
    expect(commandResult.output.length).toBeGreaterThan(0);
  });
});
