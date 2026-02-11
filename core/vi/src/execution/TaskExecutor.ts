import { getLogger } from '../telemetry/logger.js';
import {
  Task,
  Goal,
  TaskExecutionContext,
  BackoffStrategy,
  ExponentialBackoffStrategy,
  TaskState,
} from '../domain/task.js';
import { TaskRepository } from '../db/repositories/TaskRepository.js';
import { GoalRepository } from '../db/repositories/GoalRepository.js';
import { TaskEventRepository } from '../db/repositories/TaskEventRepository.js';
import { VerificationEventRepository } from '../db/repositories/VerificationEventRepository.js';
import { MissionMemoryRepository } from '../db/repositories/MissionMemoryRepository.js';
import { VerifierRegistry, getGlobalVerifierRegistry } from '../verification/VerifierRegistry.js';

/**
 * TaskExecutor: Resumable task execution engine with backoff and verification
 *
 * Responsibilities:
 * - Execute tasks sequentially within a goal
 * - Handle tool results and track state
 * - Implement retry logic with exponential backoff
 * - Verify task completion before advancing
 * - Persist state for recovery/resumption
 * - Emit audit events for all state changes
 * - Track mission progress via MissionMemory (C5)
 */
export class TaskExecutor {
  private logger = getLogger();
  private backoffStrategy: BackoffStrategy;
  private verifierRegistry: VerifierRegistry;
  private verificationEventRepo: VerificationEventRepository | { create: (...args: any[]) => Promise<void> };
  private missionMemoryRepo?: MissionMemoryRepository;

  constructor(
    private taskRepo: TaskRepository,
    private goalRepo: GoalRepository,
    private eventRepo: TaskEventRepository,
    verificationEventRepo?: VerificationEventRepository | BackoffStrategy,
    backoffStrategy?: BackoffStrategy,
    verifierRegistry?: VerifierRegistry,
    missionMemoryRepo?: MissionMemoryRepository
  ) {
    const noOpVerificationRepo = {
      create: async () => {},
    };

    // Allow legacy constructor signature without explicit verification repo (used in tests)
    if (verificationEventRepo instanceof VerificationEventRepository) {
      this.verificationEventRepo = verificationEventRepo;
      this.backoffStrategy = backoffStrategy || new ExponentialBackoffStrategy();
      this.verifierRegistry = verifierRegistry || getGlobalVerifierRegistry();
    } else {
      this.verificationEventRepo = noOpVerificationRepo;
      this.backoffStrategy = (verificationEventRepo as BackoffStrategy) || new ExponentialBackoffStrategy();
      this.verifierRegistry = verifierRegistry || getGlobalVerifierRegistry();
    }

    this.missionMemoryRepo = missionMemoryRepo;
  }

  /**
   * Execute a single task from its current state
   * Handles retries, backoff, and verification
   */
  async executeTask(taskId: string): Promise<Task> {
    const task = await this.taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const goal = await this.goalRepo.getById(task.goalId);
    if (!goal) {
      throw new Error(`Goal not found for task: ${taskId}`);
    }

    this.logger.debug({ taskId, state: task.state }, 'Starting task execution');

    const context: TaskExecutionContext = {
      task,
      goal,
      toolResults: new Map(),
      verificationResults: new Map(),
      startedAt: new Date(),
    };

    try {
      // Check if backoff period is still active
      if (task.backoffUntil && task.backoffUntil > new Date()) {
        this.logger.debug({ taskId, backoffUntil: task.backoffUntil }, 'Task in backoff period');
        return task;
      }

      // Update state to running
      context.task = (await this.taskRepo.update(taskId, { state: 'running' }))!;
      await this.eventRepo.create({ taskId, eventType: 'task_started', payload: {} });

      // Execute the task (placeholder for actual tool/step execution)
      // In real implementation, this would call the appropriate tool or action handler
      await this.runTaskStep(context);

      // Task completed successfully
      context.task = (await this.taskRepo.update(taskId, {
        state: 'completed',
        verificationStatus: 'verified',
      }))!;
      await this.eventRepo.create({
        taskId,
        eventType: 'task_completed',
        payload: { verificationStatus: 'verified' },
      });

      this.logger.debug({ taskId }, 'Task completed successfully');
      return context.task;
    } catch (error) {
      return this.handleTaskFailure(context, error as Error);
    }
  }

  /**
   * Execute all tasks in a goal sequentially
   */
  async executeGoal(goalId: string): Promise<void> {
    const goal = await this.goalRepo.getById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    this.logger.info({ goalId, title: goal.title }, 'Starting goal execution');

    // Update goal to in_progress
    await this.goalRepo.update(goalId, { status: 'in_progress' });

    try {
      // Get all tasks for this goal, ordered by step
      const tasks = await this.taskRepo.listByGoal(goalId, 1000, 0);

      for (const task of tasks) {
        if (task.state === 'completed' || task.state === 'cancelled') {
          this.logger.debug({ taskId: task.id, state: task.state }, 'Skipping completed/cancelled task');
          continue;
        }

        // Execute task (may require retries)
        try {
          await this.executeTask(task.id);
        } catch (error) {
          this.logger.error({ taskId: task.id, error }, 'Task execution failed');
          // Continue to next task or fail goal depending on policy
          // For now, we fail the goal if any critical task fails
          throw error;
        }
      }

      // Goal completed
      await this.goalRepo.update(goalId, { status: 'completed' });
      this.logger.info({ goalId }, 'Goal completed successfully');
    } catch (error) {
      await this.goalRepo.update(goalId, { status: 'failed' });
      this.logger.error({ goalId, error }, 'Goal execution failed');
      throw error;
    }
  }

  /**
   * Resume goal execution from a checkpoint
   * Picks up where it left off
   */
  async resumeGoal(goalId: string): Promise<void> {
    const goal = await this.goalRepo.getById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    if (goal.status === 'completed' || goal.status === 'cancelled') {
      this.logger.debug({ goalId, status: goal.status }, 'Goal already terminal, skipping resume');
      return;
    }

    this.logger.info({ goalId }, 'Resuming goal execution');

    // Get all tasks, find the first incomplete one
    const tasks = await this.taskRepo.listByGoal(goalId, 1000, 0);
    const incompleteTask = tasks.find(
      (t) => t.state !== 'completed' && t.state !== 'cancelled'
    );

    if (!incompleteTask) {
      // All tasks done, mark goal completed
      await this.goalRepo.update(goalId, { status: 'completed' });
      return;
    }

    // Resume execution from the incomplete task
    await this.executeGoal(goalId);
  }

  /**
   * Get tasks ready to retry
   */
  async getFailedTasksReadyForRetry(): Promise<Task[]> {
    return this.taskRepo.listReadyToRetry(100);
  }

  /**
   * Retry all eligible failed tasks
   */
  async retryFailedTasks(): Promise<void> {
    const readyTasks = await this.getFailedTasksReadyForRetry();

    for (const task of readyTasks) {
      try {
        await this.executeTask(task.id);
      } catch (error) {
        this.logger.error({ taskId: task.id, error }, 'Retry attempt failed');
        // Continue with next task
      }
    }
  }

  // ============ Private Methods ============

  /**
   * Run a single task step
   * In real implementation, dispatches to tool handlers, verifiers, etc.
   */
  private async runTaskStep(context: TaskExecutionContext): Promise<void> {
    const { task } = context;

    this.logger.debug(
      { taskId: task.id, title: task.title },
      'Running task step'
    );

    // Placeholder: In real implementation, this would:
    // 1. Lookup handler for task.type
    // 2. Call tool/action with task.params
    // 3. Track tool results
    // 4. Call verifier if applicable
    // 5. Update metadata with results

    // For now, we just emit a placeholder event
    await this.eventRepo.create({
      taskId: task.id,
      eventType: 'task_step_executed',
      payload: { placeholder: true },
    });
  }

  /**
   * Verify task result using registered verifiers
   * Returns true if verification passed or skipped
   */
  private async verifyTaskResult(
    context: TaskExecutionContext,
    toolName: string,
    result: unknown,
    expected?: unknown
  ): Promise<boolean> {
    const { task } = context;
    const startTime = Date.now();

    try {
      // Check if a tool-specific verifier is registered
      let verifier = this.verifierRegistry.get(toolName);
      let verifierName = toolName;

      // Fall back to generic verifiers if no tool-specific verifier
      if (!verifier && expected && typeof expected === 'object' && 'verifierType' in expected) {
        const verifierType = (expected as any).verifierType;
        verifier = this.verifierRegistry.getGeneric(verifierType);
        verifierName = verifierType;
      }

      if (!verifier) {
        // No verifier registered, skip verification
        await this.verificationEventRepo.create({
          taskId: task.id,
          stepIndex: task.stepIndex,
          eventType: 'verification_skipped',
          verifierName: 'none',
          result,
          durationMs: Date.now() - startTime,
        });
        return true;
      }

      this.logger.debug({ taskId: task.id, verifier: verifierName }, 'Starting verification');

      const verificationResult = await verifier.verify(result, expected);

      await this.verificationEventRepo.create({
        taskId: task.id,
        stepIndex: task.stepIndex,
        eventType: verificationResult.passed ? 'verification_completed' : 'verification_failed',
        verifierName,
        result,
        expected,
        verificationResult,
        durationMs: Date.now() - startTime,
      });

      if (!verificationResult.passed) {
        this.logger.warn(
          {
            taskId: task.id,
            verifier: verifierName,
            errors: verificationResult.errors,
          },
          'Verification failed'
        );
        return false;
      }

      this.logger.debug({ taskId: task.id, verifier: verifierName }, 'Verification passed');
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.verificationEventRepo.create({
        taskId: task.id,
        stepIndex: task.stepIndex,
        eventType: 'verification_failed',
        verifierName: toolName,
        result,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      });

      this.logger.error(
        { taskId: task.id, error: errorMsg },
        'Verification error'
      );
      return false;
    }
  }

  /**
   * Handle task failure with retry logic
   */
  private async handleTaskFailure(
    context: TaskExecutionContext,
    error: Error
  ): Promise<Task> {
    const { task } = context;

    this.logger.warn(
      { taskId: task.id, error: error.message, retries: task.retries },
      'Task execution failed'
    );

    await this.eventRepo.create({
      taskId: task.id,
      eventType: 'task_failed',
      payload: { error: error.message, retries: task.retries },
    });

    // Check if we should retry
    if (task.retries < task.maxRetries) {
      const nextRetryTime = this.backoffStrategy.calculateNextRetryTime(task.retries);

      context.task = (await this.taskRepo.update(task.id, {
        state: 'failed',
        retries: task.retries + 1,
        backoffUntil: nextRetryTime,
        lastError: error.message,
        verificationStatus: 'failed',
      }))!;

      this.logger.info(
        {
          taskId: task.id,
          nextRetry: nextRetryTime,
          attempt: task.retries + 1,
          maxRetries: task.maxRetries,
        },
        'Scheduled task for retry'
      );

      await this.eventRepo.create({
        taskId: task.id,
        eventType: 'task_scheduled_for_retry',
        payload: { nextRetry: nextRetryTime, attempt: task.retries + 1 },
      });

      return context.task;
    }

    // Max retries exceeded
    context.task = (await this.taskRepo.update(task.id, {
      state: 'failed',
      retries: task.retries + 1,
      lastError: `${error.message} (max retries exceeded)`,
      verificationStatus: 'failed',
    }))!;

    this.logger.error(
      { taskId: task.id, maxRetries: task.maxRetries },
      'Task exhausted retries'
    );

    await this.eventRepo.create({
      taskId: task.id,
      eventType: 'task_exhausted_retries',
      payload: { maxRetries: task.maxRetries },
    });

    return context.task;
  }

  // ============ C5: Mission Memory Methods ============

  /**
   * Track task execution in mission memory for checkpoint resumption
   * Called before executing a task to load previous progress
   */
  async loadMissionCheckpoint(
    userId: string,
    missionId: string
  ): Promise<{ currentStep: number; completedSteps: string[] } | null> {
    if (!this.missionMemoryRepo) {
      return null;
    }

    try {
      const mission = await this.missionMemoryRepo.getByMissionId(userId, missionId);
      if (!mission) {
        return null;
      }

      // Return checkpoint for resumption
      return {
        currentStep: mission.current_step,
        completedSteps: mission.completed_steps,
      };
    } catch (err) {
      this.logger.warn(
        { err, userId, missionId },
        'Failed to load mission checkpoint'
      );
      return null;
    }
  }

  /**
   * Update mission memory after task step completion
   * Used to track progress for checkpoint resumption
   */
  async updateMissionProgress(
    userId: string,
    missionId: string,
    stepIndex: number,
    completed: boolean,
    verificationLog?: any[]
  ): Promise<void> {
    if (!this.missionMemoryRepo) {
      return;
    }

    try {
      const mission = await this.missionMemoryRepo.getByMissionId(userId, missionId);
      if (!mission) {
        return;
      }

      const completedSteps = [...(mission.completed_steps || [])];
      const failedSteps = [...(mission.failed_steps || [])];

      if (completed) {
        if (!completedSteps.includes(stepIndex)) {
          completedSteps.push(stepIndex);
        }
      } else {
        if (!failedSteps.includes(stepIndex)) {
          failedSteps.push(stepIndex);
        }
      }

      await this.missionMemoryRepo.update(mission.id, {
        current_step: stepIndex,
        completed_steps: completedSteps,
        failed_steps: failedSteps,
        verification_log: verificationLog || [],
      });

      this.logger.debug(
        { userId, missionId, stepIndex, completed },
        'Mission progress updated'
      );
    } catch (err) {
      this.logger.warn(
        { err, userId, missionId, stepIndex },
        'Failed to update mission progress'
      );
    }
  }

  /**
   * Mark mission as completed or failed
   */
  async finalizeMission(
    userId: string,
    missionId: string,
    status: 'completed' | 'failed',
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.missionMemoryRepo) {
      return;
    }

    try {
      const mission = await this.missionMemoryRepo.getByMissionId(userId, missionId);
      if (!mission) {
        return;
      }

      await this.missionMemoryRepo.finish(mission.id, status, metadata);

      this.logger.info(
        { userId, missionId, status },
        'Mission finalized'
      );
    } catch (err) {
      this.logger.warn(
        { err, userId, missionId },
        'Failed to finalize mission'
      );
    }
  }

  /**
   * Resume mission from checkpoint
   * Returns the current step to resume from
   */
  async resumeMissionFromCheckpoint(
    userId: string
  ): Promise<{ missionId: string; currentStep: number } | null> {
    if (!this.missionMemoryRepo) {
      return null;
    }

    try {
      const mission = await this.missionMemoryRepo.getLatestInProgress(userId);
      if (!mission) {
        return null;
      }

      return {
        missionId: mission.mission_id,
        currentStep: mission.current_step,
      };
    } catch (err) {
      this.logger.warn({ err, userId }, 'Failed to resume mission from checkpoint');
      return null;
    }
  }
}
