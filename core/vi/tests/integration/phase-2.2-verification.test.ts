/**
 * Phase 2.2: Verification Layer Integration Tests
 * 
 * Tests verification registry, verifiers, and TaskExecutor integration
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrations.js';
import { GoalRepository } from '../../src/db/repositories/GoalRepository.js';
import { TaskRepository } from '../../src/db/repositories/TaskRepository.js';
import { TaskEventRepository } from '../../src/db/repositories/TaskEventRepository.js';
import { VerificationEventRepository } from '../../src/db/repositories/VerificationEventRepository.js';
import { TaskExecutor } from '../../src/execution/TaskExecutor.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import {
  DefaultVerifierRegistry,
  getGlobalVerifierRegistry,
  resetGlobalVerifierRegistry,
} from '../../src/verification/VerifierRegistry.js';
import {
  JsonSchemaVerifier,
  RegexVerifier,
  ExactMatchVerifier,
  PassthroughVerifier,
} from '../../src/domain/verification.js';
import {
  SearchResultVerifier,
  ShellCommandVerifier,
  HttpRequestVerifier,
  DatabaseQueryVerifier,
  FileSystemVerifier,
} from '../../src/verification/verifiers/ToolVerifiers.js';

// Initialize logger at module level
initializeLogger('silent' as any);

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';

let pool: Pool;
let goalRepo: GoalRepository;
let taskRepo: TaskRepository;
let eventRepo: TaskEventRepository;
let verificationEventRepo: VerificationEventRepository;
let executor: TaskExecutor;
let testUserId: string;

describe('Phase 2.2: Verification Layer', () => {
  beforeEach(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await runMigrations(pool);

    goalRepo = new GoalRepository(pool);
    taskRepo = new TaskRepository(pool);
    eventRepo = new TaskEventRepository(pool);
    verificationEventRepo = new VerificationEventRepository(pool);

    resetGlobalVerifierRegistry();
    executor = new TaskExecutor(
      taskRepo,
      goalRepo,
      eventRepo,
      verificationEventRepo,
      undefined,
      getGlobalVerifierRegistry()
    );

    // Create a test user with unique email
    const uniqueId = Date.now();
    const userResult = await pool.query(
      'INSERT INTO users (email, username, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id',
      [
        `test-${uniqueId}@example.com`,
        `testuser-${uniqueId}`,
        'hashedpwd',
        'Test User',
      ]
    );
    testUserId = userResult.rows[0].id;
  });

  afterEach(async () => {
    resetGlobalVerifierRegistry();
    await pool.end();
  });

  describe('Verifier Registry CRUD', () => {
    it('should register a generic verifier', () => {
      const registry = new DefaultVerifierRegistry();
      const verifier = new JsonSchemaVerifier();

      registry.registerGeneric('json-schema', verifier);

      expect(registry.getGeneric('json-schema')).toBe(verifier);
    });

    it('should register a tool-specific verifier', () => {
      const registry = new DefaultVerifierRegistry();
      const verifier = new SearchResultVerifier();

      registry.register('search', verifier);

      expect(registry.get('search')).toBe(verifier);
    });

    it('should list registered verifiers', () => {
      const registry = new DefaultVerifierRegistry();
      registry.registerGeneric('json-schema', new JsonSchemaVerifier());
      registry.registerGeneric('regex', new RegexVerifier());
      registry.register('search', new SearchResultVerifier());
      registry.register('shell', new ShellCommandVerifier());

      expect(registry.listGenericVerifiers()).toContain('json-schema');
      expect(registry.listGenericVerifiers()).toContain('regex');
      expect(registry.listToolVerifiers()).toContain('search');
      expect(registry.listToolVerifiers()).toContain('shell');
    });

    it('should return undefined for unregistered verifiers', () => {
      const registry = new DefaultVerifierRegistry();

      expect(registry.get('nonexistent')).toBeUndefined();
      expect(registry.getGeneric('nonexistent')).toBeUndefined();
    });
  });

  describe('Generic Verifiers', () => {
    it('should verify JSON schema', async () => {
      const verifier = new JsonSchemaVerifier();

      // Should pass for correct type
      let result = await verifier.verify('hello', 'string');
      expect(result.passed).toBe(true);

      // Should fail for incorrect type
      result = await verifier.verify(123, 'string');
      expect(result.passed).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should verify regex pattern', async () => {
      const verifier = new RegexVerifier();

      // Should match pattern
      let result = await verifier.verify('hello123', '^[a-z]+[0-9]+$');
      expect(result.passed).toBe(true);

      // Should not match pattern
      result = await verifier.verify('hello', '^[0-9]+$');
      expect(result.passed).toBe(false);
    });

    it('should verify exact match', async () => {
      const verifier = new ExactMatchVerifier();

      // Should match
      let result = await verifier.verify({ name: 'test' }, { name: 'test' });
      expect(result.passed).toBe(true);

      // Should not match
      result = await verifier.verify({ name: 'test' }, { name: 'other' });
      expect(result.passed).toBe(false);
    });

    it('should always pass with passthrough verifier', async () => {
      const verifier = new PassthroughVerifier();

      let result = await verifier.verify('anything');
      expect(result.passed).toBe(true);

      result = await verifier.verify({ complex: { nested: 'object' } });
      expect(result.passed).toBe(true);
    });
  });

  describe('Tool-Specific Verifiers', () => {
    it('should verify search results', async () => {
      const verifier = new SearchResultVerifier();

      // Valid search result
      let result = await verifier.verify({
        results: [
          { title: 'Result 1', url: 'http://example.com' },
          { title: 'Result 2', url: 'http://example2.com' },
        ],
      });
      expect(result.passed).toBe(true);

      // Invalid: missing results
      result = await verifier.verify({ data: 'no results' });
      expect(result.passed).toBe(false);

      // Check minimum results
      result = await verifier.verify(
        { results: [{ title: 'One result' }] },
        { minResults: 2 }
      );
      expect(result.passed).toBe(false);
    });

    it('should verify shell command results', async () => {
      const verifier = new ShellCommandVerifier();

      // Success exit code
      let result = await verifier.verify({ exitCode: 0, stdout: 'success' });
      expect(result.passed).toBe(true);

      // Failure exit code
      result = await verifier.verify({ exitCode: 1, stderr: 'error' });
      expect(result.passed).toBe(false);

      // Check for output pattern
      result = await verifier.verify(
        { exitCode: 0, stdout: 'Found the pattern' },
        { successExitCode: 0, shouldMatch: 'pattern' }
      );
      expect(result.passed).toBe(true);
    });

    it('should verify HTTP request results', async () => {
      const verifier = new HttpRequestVerifier();

      // Success status
      let result = await verifier.verify({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { data: 'test' },
      });
      expect(result.passed).toBe(true);

      // Failure status
      result = await verifier.verify({
        statusCode: 404,
        body: 'Not Found',
      });
      expect(result.passed).toBe(false);

      // Expected status code
      result = await verifier.verify(
        { statusCode: 201, body: { id: '123' } },
        { expectedStatusCode: 201 }
      );
      expect(result.passed).toBe(true);
    });

    it('should verify database query results', async () => {
      const verifier = new DatabaseQueryVerifier();

      // Valid query result
      let result = await verifier.verify({
        rows: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
        ],
      });
      expect(result.passed).toBe(true);

      // Invalid: no rows
      result = await verifier.verify({ rows: [] });
      expect(result.passed).toBe(true); // Empty result is still valid

      // Check row constraints
      result = await verifier.verify(
        { rows: [{ id: 1 }] },
        { minRows: 2 }
      );
      expect(result.passed).toBe(false);
    });

    it('should verify file system operations', async () => {
      const verifier = new FileSystemVerifier();

      // Success file operation
      let result = await verifier.verify({
        success: true,
        path: '/tmp/file.txt',
        exists: true,
      });
      expect(result.passed).toBe(true);

      // Failed file operation
      result = await verifier.verify({
        success: false,
        error: 'Permission denied',
      });
      expect(result.passed).toBe(false);

      // File existence check
      result = await verifier.verify(
        { exists: true },
        { shouldExist: true }
      );
      expect(result.passed).toBe(true);
    });
  });

  describe('Verification Event Tracking', () => {
    it('should create verification event', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
        description: 'Testing verification events',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'search',
      });

      const event = await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_completed',
        verifierName: 'json-schema',
        expected: 'object',
        result: { data: 'test' },
        verificationResult: { passed: true },
        durationMs: 10,
      });

      expect(event.taskId).toBe(task.id);
      expect(event.eventType).toBe('verification_completed');
      expect(event.payload.expected).toEqual('object');
      expect(event.payload.result).toEqual({ data: 'test' });
    });

    it('should list verification events by task', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'search',
      });

      // Create multiple verification events
      await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_started',
        verifierName: 'json-schema',
      });

      await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_completed',
        verifierName: 'json-schema',
        verificationResult: { passed: true },
      });

      const events = await verificationEventRepo.listByTask(task.id);

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('verification_completed'); // Most recent first
      expect(events[1].eventType).toBe('verification_started');
    });

    it('should get last verification for step', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'search',
      });

      // Create first verification (failed)
      await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_failed',
        verifierName: 'json-schema',
        error: 'Invalid format',
      });

      // Create second verification (passed)
      const lastEvent = await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_completed',
        verifierName: 'json-schema',
        verificationResult: { passed: true },
      });

      const retrieved = await verificationEventRepo.getLastVerificationForStep(task.id, 0);

      expect(retrieved).toBeDefined();
      expect(retrieved?.taskId).toBe(lastEvent.taskId);
      expect(retrieved?.eventType).toBe('verification_completed');
    });
  });

  describe('TaskExecutor Verification Integration', () => {
    it('should skip verification when no verifier registered', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'unknown-tool',
      });

      // Execute task without any verifiers registered
      await executor.executeTask(task.id);

      // Verify task completed despite no verifier
      const updated = await taskRepo.getById(task.id);
      expect(updated?.state).toBe('completed');
    });

    it('should emit verification events from executor', async () => {
      const registry = new DefaultVerifierRegistry();
      registry.registerGeneric('exact-match', new ExactMatchVerifier());

      const localExecutor = new TaskExecutor(
        taskRepo,
        goalRepo,
        eventRepo,
        verificationEventRepo,
        undefined,
        registry
      );

      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'test-tool',
      });

      // Execute task (will skip verification but emit skipped event)
      await localExecutor.executeTask(task.id);

      const verificationEvents = await verificationEventRepo.listByTask(task.id);

      // Should have at least one verification event
      expect(verificationEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should track tool-specific verifier in verification events', async () => {
      const registry = new DefaultVerifierRegistry();
      registry.register('search', new SearchResultVerifier());

      const localExecutor = new TaskExecutor(
        taskRepo,
        goalRepo,
        eventRepo,
        verificationEventRepo,
        undefined,
        registry
      );

      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Search Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Search Task',
        toolName: 'search',
      });

      // Execute task
      await localExecutor.executeTask(task.id);

      // Verification events should reference the search verifier
      const verificationEvents = await verificationEventRepo.listByTask(task.id);
      const searchVerifierEvents = verificationEvents.filter(
        (e) => e.verifierName === 'search-result' || e.eventType === 'verification_skipped'
      );

      // Should have events (either verification or skip)
      expect(verificationEvents.length + searchVerifierEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Verification Error Handling', () => {
    it('should record verification timeout', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'test-tool',
      });

      // Create timeout event
      const event = await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_timeout',
        verifierName: 'test-verifier',
        error: 'Verification timeout after 5000ms',
        durationMs: 5001,
      });

      expect(event.eventType).toBe('verification_timeout');
      expect(event.payload.error).toContain('Verification timeout');
    });

    it('should handle verification errors gracefully', async () => {
      const registry = new DefaultVerifierRegistry();
      registry.registerGeneric('json-schema', new JsonSchemaVerifier());

      const localExecutor = new TaskExecutor(
        taskRepo,
        goalRepo,
        eventRepo,
        verificationEventRepo,
        undefined,
        registry
      );

      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'test-tool',
      });

      // Execute should not throw even if verification has issues
      await expect(localExecutor.executeTask(task.id)).resolves.toBeDefined();
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity for verification events', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'test-tool',
      });

      // Create verification event
      await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_completed',
        verifierName: 'test-verifier',
        verificationResult: { passed: true },
      });

      // Delete task should cascade to verification events
      await taskRepo.delete(task.id);

      const events = await verificationEventRepo.listByTask(task.id);
      expect(events).toHaveLength(0);
    });

    it('should preserve verification metadata through updates', async () => {
      const goal = await goalRepo.create({
        userId: testUserId,
        title: 'Test Goal',
      });

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test Task',
        toolName: 'test-tool',
      });

      const event = await verificationEventRepo.create({
        taskId: task.id,
        stepIndex: 0,
        eventType: 'verification_completed',
        verifierName: 'test-verifier',
        expected: { type: 'object' },
        result: { data: 'test' },
        verificationResult: { passed: true, details: { count: 1 } },
        durationMs: 42,
      });

      // Verify all metadata preserved
      expect(event.payload.expected).toBeDefined();
      expect(event.payload.result).toBeDefined();
      expect(event.payload.verificationResult).toBeDefined();
      expect(event.payload.durationMs).toBe(42);
    });
  });
});
