import { Pool } from 'pg';
import {
  Goal,
  CreateGoalInput,
  UpdateGoalInput,
  GoalStatus,
} from '../../domain/task.js';

export class GoalRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateGoalInput): Promise<Goal> {
    const { userId, title, description, priority = 0 } = input;

    const result = await this.pool.query<Goal>(
      `INSERT INTO goals (user_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id as "userId", title, description, status, priority,
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, title, description || null, 'open', priority]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<Goal | null> {
    const result = await this.pool.query<Goal>(
      `SELECT id, user_id as "userId", title, description, status, priority,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM goals
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async listByUser(
    userId: string,
    status?: GoalStatus,
    limit = 100,
    offset = 0
  ): Promise<Goal[]> {
    let query = `
      SELECT id, user_id as "userId", title, description, status, priority,
             created_at as "createdAt", updated_at as "updatedAt"
      FROM goals
      WHERE user_id = $1
    `;
    const params: unknown[] = [userId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.pool.query<Goal>(query, params);
    return result.rows;
  }

  async update(id: string, input: UpdateGoalInput): Promise<Goal | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(input.status);
    }
    if (input.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(input.description);
    }
    if (input.priority !== undefined) {
      fields.push(`priority = $${paramCount++}`);
      values.push(input.priority);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const query = `
      UPDATE goals
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, user_id as "userId", title, description, status, priority,
                created_at as "createdAt", updated_at as "updatedAt"
    `;

    const result = await this.pool.query<Goal>(query, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM goals WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}
