/**
 * Task Domain Models
 * Represents atomic work units and persistent goals within the task execution engine.
 */

export type GoalStatus = 'open' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
export type VerificationStatus = 'unverified' | 'verified' | 'failed';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: GoalStatus;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  goalId: string;
  stepIndex: number;
  title: string;
  description?: string;
  state: TaskState;
  retries: number;
  maxRetries: number;
  backoffUntil?: Date;
  lastError?: string;
  verificationStatus: VerificationStatus;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateGoalInput {
  userId: string;
  title: string;
  description?: string;
  priority?: number;
}

export interface UpdateGoalInput {
  status?: GoalStatus;
  title?: string;
  description?: string;
  priority?: number;
}

export interface CreateTaskInput {
  goalId: string;
  stepIndex: number;
  title: string;
  description?: string;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  state?: TaskState;
  retries?: number;
  backoffUntil?: Date;
  lastError?: string;
  verificationStatus?: VerificationStatus;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskEventInput {
  taskId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

/**
 * TaskExecutionContext tracks the state of a task during execution
 */
export interface TaskExecutionContext {
  task: Task;
  goal: Goal;
  toolResults: Map<string, unknown>;
  verificationResults: Map<string, unknown>;
  startedAt: Date;
  lastCheckpoint?: Date;
}

/**
 * Backoff strategy for retrying failed tasks
 */
export interface BackoffStrategy {
  calculateNextRetryTime(retries: number): Date;
}

/**
 * ExponentialBackoffStrategy: 2^retries * baseDelayMs
 */
export class ExponentialBackoffStrategy implements BackoffStrategy {
  constructor(private baseDelayMs: number = 1000, private maxDelayMs: number = 3600000) {}

  calculateNextRetryTime(retries: number): Date {
    const delayMs = Math.min(Math.pow(2, retries) * this.baseDelayMs, this.maxDelayMs);
    return new Date(Date.now() + delayMs);
  }
}
