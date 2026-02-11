import { Pool } from 'pg';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskState,
  VerificationStatus,
} from '../../domain/task.js';

export class TaskRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateTaskInput): Promise<Task> {
    const { goalId, stepIndex, title, description, maxRetries = 3, metadata } = input;

    const result = await this.pool.query<Task>(
      `INSERT INTO tasks (goal_id, step_index, title, description, state, max_retries, verification_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
                 retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
                 verification_status as "verificationStatus", metadata,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [goalId, stepIndex, title, description || null, 'pending', maxRetries, 'unverified', metadata || null]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<Task | null> {
    const result = await this.pool.query<Task>(
      `SELECT id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
              retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
              verification_status as "verificationStatus", metadata,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM tasks
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async listByGoal(goalId: string, limit = 100, offset = 0): Promise<Task[]> {
    const result = await this.pool.query<Task>(
      `SELECT id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
              retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
              verification_status as "verificationStatus", metadata,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM tasks
       WHERE goal_id = $1
       ORDER BY step_index ASC
       LIMIT $2 OFFSET $3`,
      [goalId, limit, offset]
    );

    return result.rows;
  }

  async listByState(state: TaskState, limit = 100, offset = 0): Promise<Task[]> {
    const result = await this.pool.query<Task>(
      `SELECT id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
              retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
              verification_status as "verificationStatus", metadata,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM tasks
       WHERE state = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [state, limit, offset]
    );

    return result.rows;
  }

  async listReadyToRetry(limit = 100): Promise<Task[]> {
    const result = await this.pool.query<Task>(
      `SELECT id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
              retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
              verification_status as "verificationStatus", metadata,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM tasks
       WHERE state = 'failed'
         AND COALESCE(retries, 0) < max_retries
         AND COALESCE(backoff_until, now() - interval '1 second') <= now()
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.state !== undefined) {
      fields.push(`state = $${paramCount++}`);
      values.push(input.state);
    }
    if (input.retries !== undefined) {
      fields.push(`retries = $${paramCount++}`);
      values.push(input.retries);
    }
    if (input.backoffUntil !== undefined) {
      fields.push(`backoff_until = $${paramCount++}`);
      values.push(input.backoffUntil);
    }
    if (input.lastError !== undefined) {
      fields.push(`last_error = $${paramCount++}`);
      values.push(input.lastError);
    }
    if (input.verificationStatus !== undefined) {
      fields.push(`verification_status = $${paramCount++}`);
      values.push(input.verificationStatus);
    }
    if (input.metadata !== undefined) {
      fields.push(`metadata = $${paramCount++}`);
      values.push(input.metadata);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const query = `
      UPDATE tasks
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, goal_id as "goalId", step_index as "stepIndex", title, description, state,
                retries, max_retries as "maxRetries", backoff_until as "backoffUntil", last_error as "lastError",
                verification_status as "verificationStatus", metadata,
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const result = await this.pool.query<Task>(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}
