import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrations.js';
import { GoalRepository } from '../../src/db/repositories/GoalRepository.js';
import { TaskRepository } from '../../src/db/repositories/TaskRepository.js';
import { TaskEventRepository } from '../../src/db/repositories/TaskEventRepository.js';
import { TaskExecutor } from '../../src/execution/TaskExecutor.js';
import { ExponentialBackoffStrategy } from '../../src/domain/task.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Phase 2.1: Persistent Task Queue + Execution Engine', () => {
  let pool: Pool;
  let goalRepo: GoalRepository;
  let taskRepo: TaskRepository;
  let eventRepo: TaskEventRepository;
  let executor: TaskExecutor;
  let userId: string;

  beforeAll(async () => {
    initializeLogger('silent' as any);
    initializeTelemetry({ enableConsoleLogging: false, enableFileLogging: false });

    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await runMigrations(pool);

    goalRepo = new GoalRepository(pool);
    taskRepo = new TaskRepository(pool);
    eventRepo = new TaskEventRepository(pool);
    executor = new TaskExecutor(
      taskRepo,
      goalRepo,
      eventRepo,
      new ExponentialBackoffStrategy(100) // Fast backoff for testing
    );

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`phase2.1.test@example.com`, `phase2_1_user_${randomUUID()}`, 'hash']
    );
    userId = userResult.rows[0].id;
  });

  afterAll(async () => {
    if (userId) {
      await pool.query('DELETE FROM goals WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  describe('Goal Repository', () => {
    it('should create a goal', async () => {
      const goal = await goalRepo.create({
        userId,
        title: 'Complete unit tests',
        description: 'Write and pass all tests',
        priority: 1,
      });

      expect(goal).toBeDefined();
      expect(goal.title).toBe('Complete unit tests');
      expect(goal.status).toBe('open');
      expect(goal.priority).toBe(1);
    });

    it('should retrieve goal by ID', async () => {
      const created = await goalRepo.create({
        userId,
        title: 'Test retrieval',
      });

      const retrieved = await goalRepo.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Test retrieval');
    });

    it('should list goals by user', async () => {
      const goal1 = await goalRepo.create({ userId, title: 'Goal 1' });
      const goal2 = await goalRepo.create({ userId, title: 'Goal 2' });

      const goals = await goalRepo.listByUser(userId);
      expect(goals.length).toBeGreaterThanOrEqual(2);
      expect(goals.find((g) => g.id === goal1.id)).toBeDefined();
      expect(goals.find((g) => g.id === goal2.id)).toBeDefined();
    });

    it('should filter goals by status', async () => {
      const goal = await goalRepo.create({
        userId,
        title: 'Completed goal',
      });
      await goalRepo.update(goal.id, { status: 'completed' });

      const completed = await goalRepo.listByUser(userId, 'completed');
      expect(completed.find((g) => g.id === goal.id)).toBeDefined();
    });

    it('should update goal', async () => {
      const goal = await goalRepo.create({
        userId,
        title: 'Original title',
        priority: 0,
      });

      const updated = await goalRepo.update(goal.id, {
        title: 'Updated title',
        status: 'in_progress',
        priority: 5,
      });

      expect(updated?.title).toBe('Updated title');
      expect(updated?.status).toBe('in_progress');
      expect(updated?.priority).toBe(5);
    });

    it('should delete goal', async () => {
      const goal = await goalRepo.create({ userId, title: 'To delete' });
      const deleted = await goalRepo.delete(goal.id);
      expect(deleted).toBe(true);

      const retrieved = await goalRepo.getById(goal.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Task Repository', () => {
    it('should create task', async () => {
      const goal = await goalRepo.create({ userId, title: 'Task test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'First task',
        maxRetries: 3,
      });

      expect(task).toBeDefined();
      expect(task.goalId).toBe(goal.id);
      expect(task.state).toBe('pending');
      expect(task.retries).toBe(0);
      expect(task.maxRetries).toBe(3);
    });

    it('should retrieve task by ID', async () => {
      const goal = await goalRepo.create({ userId, title: 'Task retrieval goal' });
      const created = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Test task',
      });

      const retrieved = await taskRepo.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Test task');
    });

    it('should list tasks by goal', async () => {
      const goal = await goalRepo.create({ userId, title: 'Multi-task goal' });
      const task1 = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Task 1',
      });
      const task2 = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 1,
        title: 'Task 2',
      });

      const tasks = await taskRepo.listByGoal(goal.id);
      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks.find((t) => t.id === task1.id)).toBeDefined();
      expect(tasks.find((t) => t.id === task2.id)).toBeDefined();
    });

    it('should update task state', async () => {
      const goal = await goalRepo.create({ userId, title: 'Update test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Task to update',
      });

      const updated = await taskRepo.update(task.id, {
        state: 'running',
        verificationStatus: 'verified',
      });

      expect(updated?.state).toBe('running');
      expect(updated?.verificationStatus).toBe('verified');
    });

    it('should list tasks by state', async () => {
      const goal = await goalRepo.create({ userId, title: 'State filter goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Failed task',
      });
      await taskRepo.update(task.id, { state: 'failed' });

      const failed = await taskRepo.listByState('failed', 100, 0);
      expect(failed.find((t) => t.id === task.id)).toBeDefined();
    });

    it('should list tasks ready to retry', async () => {
      const goal = await goalRepo.create({ userId, title: 'Retry goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Retry candidate',
        maxRetries: 3,
      });

      // Mark as failed with backoff in the past
      const updated = await taskRepo.update(task.id, {
        state: 'failed',
        retries: 1,
        backoffUntil: new Date(Date.now() - 1000), // Backoff expired
      });

      // Verify update succeeded
      expect(updated).toBeDefined();
      expect(updated?.state).toBe('failed');
      expect(updated?.retries).toBe(1);

      const ready = await taskRepo.listReadyToRetry(100);
      const foundTask = ready.find((t) => t.id === task.id);
      expect(foundTask).toBeDefined();
      expect(foundTask?.id).toBe(task.id);
    });
  });

  describe('Task Event Repository', () => {
    it('should create task event', async () => {
      const goal = await goalRepo.create({ userId, title: 'Event test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Event task',
      });

      const event = await eventRepo.create({
        taskId: task.id,
        eventType: 'task_started',
        payload: { timestamp: new Date().toISOString() },
      });

      expect(event).toBeDefined();
      expect(event.eventType).toBe('task_started');
      expect(event.payload).toBeDefined();
    });

    it('should list events by task', async () => {
      const goal = await goalRepo.create({ userId, title: 'Event list goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Event task',
      });

      await eventRepo.create({ taskId: task.id, eventType: 'event_1' });
      await eventRepo.create({ taskId: task.id, eventType: 'event_2' });

      const events = await eventRepo.listByTask(task.id);
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should list events by type', async () => {
      const goal = await goalRepo.create({ userId, title: 'Event type goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Event task',
      });

      await eventRepo.create({ taskId: task.id, eventType: 'test_event' });

      const events = await eventRepo.listByType('test_event');
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Task Executor', () => {
    it('should execute single task successfully', async () => {
      const goal = await goalRepo.create({ userId, title: 'Executor test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Executor task',
      });

      const executed = await executor.executeTask(task.id);

      expect(executed.state).toBe('completed');
      expect(executed.verificationStatus).toBe('verified');
    });

    it('should track task events during execution', async () => {
      const goal = await goalRepo.create({ userId, title: 'Event tracking goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Event tracking task',
      });

      await executor.executeTask(task.id);

      const events = await eventRepo.listByTask(task.id);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.eventType === 'task_started')).toBe(true);
      expect(events.some((e) => e.eventType === 'task_completed')).toBe(true);
    });

    it('should skip tasks in backoff period', async () => {
      const goal = await goalRepo.create({ userId, title: 'Backoff test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Backoff task',
      });

      // Simulate backoff
      await taskRepo.update(task.id, {
        state: 'failed',
        backoffUntil: new Date(Date.now() + 10000), // 10 seconds in future
      });

      const result = await executor.executeTask(task.id);

      // Task should still be in failed state with backoff set
      expect(result.backoffUntil).toBeDefined();
      expect(result.backoffUntil! > new Date()).toBe(true);
    });

    it('should implement exponential backoff on retry', async () => {
      const strategy = new ExponentialBackoffStrategy(100, 5000);

      const retry0 = strategy.calculateNextRetryTime(0);
      const retry1 = strategy.calculateNextRetryTime(1);
      const retry2 = strategy.calculateNextRetryTime(2);

      expect(retry1.getTime() > retry0.getTime()).toBe(true);
      expect(retry2.getTime() > retry1.getTime()).toBe(true);
    });

    it('should execute goal with multiple tasks sequentially', async () => {
      const goal = await goalRepo.create({ userId, title: 'Multi-task execution goal' });

      await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Step 1',
      });
      await taskRepo.create({
        goalId: goal.id,
        stepIndex: 1,
        title: 'Step 2',
      });
      await taskRepo.create({
        goalId: goal.id,
        stepIndex: 2,
        title: 'Step 3',
      });

      await executor.executeGoal(goal.id);

      const updated = await goalRepo.getById(goal.id);
      expect(updated?.status).toBe('completed');

      const tasks = await taskRepo.listByGoal(goal.id);
      expect(tasks.every((t) => t.state === 'completed')).toBe(true);
    });

    it('should resume goal from checkpoint', async () => {
      const goal = await goalRepo.create({ userId, title: 'Resume test goal' });

      const task1 = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Task 1',
      });
      const task2 = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 1,
        title: 'Task 2',
      });

      // Mark first task as completed
      await taskRepo.update(task1.id, { state: 'completed' });

      // Resume from incomplete task
      await executor.resumeGoal(goal.id);

      const updated = await goalRepo.getById(goal.id);
      expect(updated?.status).toBe('completed');
    });

    it('should get failed tasks ready for retry', async () => {
      const goal = await goalRepo.create({ userId, title: 'Retry pool goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Retry candidate',
        maxRetries: 3,
      });

      // Mark as failed with expired backoff
      const updated = await taskRepo.update(task.id, {
        state: 'failed',
        retries: 1,
        backoffUntil: new Date(Date.now() - 1000),
      });

      // Verify update succeeded
      expect(updated).toBeDefined();
      expect(updated?.state).toBe('failed');
      expect(updated?.retries).toBe(1);

      const ready = await executor.getFailedTasksReadyForRetry();
      const foundTask = ready.find((t) => t.id === task.id);
      expect(foundTask).toBeDefined();
      expect(foundTask?.id).toBe(task.id);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain task metadata through updates', async () => {
      const goal = await goalRepo.create({ userId, title: 'Metadata test goal' });
      const metadata = { toolName: 'test_tool', params: { key: 'value' } };

      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Metadata task',
        metadata,
      });

      const retrieved = await taskRepo.getById(task.id);
      expect(retrieved?.metadata).toEqual(metadata);
    });

    it('should preserve goal user association', async () => {
      const goal = await goalRepo.create({ userId, title: 'User association test' });

      const retrieved = await goalRepo.getById(goal.id);
      expect(retrieved?.userId).toBe(userId);
    });

    it('should maintain referential integrity', async () => {
      const goal = await goalRepo.create({ userId, title: 'Integrity test goal' });
      const task = await taskRepo.create({
        goalId: goal.id,
        stepIndex: 0,
        title: 'Integrity task',
      });

      // Deleting goal should cascade
      await goalRepo.delete(goal.id);

      const deletedTask = await taskRepo.getById(task.id);
      expect(deletedTask).toBeNull();
    });
  });
});
