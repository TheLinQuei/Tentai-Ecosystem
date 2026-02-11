import { Pool } from 'pg';
import { TaskEvent, CreateTaskEventInput } from '../../domain/task.js';

export class TaskEventRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateTaskEventInput): Promise<TaskEvent> {
    const { taskId, eventType, payload } = input;

    const result = await this.pool.query<TaskEvent>(
      `INSERT INTO task_events (task_id, event_type, payload)
       VALUES ($1, $2, $3)
       RETURNING id, task_id as "taskId", event_type as "eventType", payload, created_at as "createdAt"`,
      [taskId, eventType, payload || null]
    );

    return result.rows[0];
  }

  async listByTask(taskId: string, limit = 1000, offset = 0): Promise<TaskEvent[]> {
    const result = await this.pool.query<TaskEvent>(
      `SELECT id, task_id as "taskId", event_type as "eventType", payload, created_at as "createdAt"
       FROM task_events
       WHERE task_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [taskId, limit, offset]
    );

    return result.rows;
  }

  async listByType(eventType: string, limit = 1000, offset = 0): Promise<TaskEvent[]> {
    const result = await this.pool.query<TaskEvent>(
      `SELECT id, task_id as "taskId", event_type as "eventType", payload, created_at as "createdAt"
       FROM task_events
       WHERE event_type = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [eventType, limit, offset]
    );

    return result.rows;
  }
}
