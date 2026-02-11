/**
 * Verification Event Repository
 * 
 * Manages verification event audit trail
 */

import { Pool } from 'pg';
import { VerificationEvent } from '../../domain/verification';

export interface CreateVerificationEventInput {
  taskId: string;
  stepIndex: number;
  eventType: string;
  verifierName: string;
  expected?: unknown;
  result?: unknown;
  verificationResult?: unknown;
  error?: string;
  durationMs?: number;
}

export class VerificationEventRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateVerificationEventInput): Promise<VerificationEvent> {
    const query = `
      INSERT INTO verification_events (
        task_id, step_index, event_type, verifier_name, expected, result,
        verification_result, error, duration_ms, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      RETURNING id, task_id, step_index, event_type, verifier_name, expected, 
                result, verification_result, error, duration_ms, created_at
    `;

    const result = await this.pool.query<any>(query, [
      input.taskId,
      input.stepIndex,
      input.eventType,
      input.verifierName,
      input.expected ? JSON.stringify(input.expected) : null,
      input.result ? JSON.stringify(input.result) : null,
      input.verificationResult ? JSON.stringify(input.verificationResult) : null,
      input.error,
      input.durationMs,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create verification event');
    }

    return this.mapRow(result.rows[0]);
  }

  async listByTask(taskId: string): Promise<VerificationEvent[]> {
    const query = `
      SELECT id, task_id, step_index, event_type, verifier_name, expected,
             result, verification_result, error, duration_ms, created_at
      FROM verification_events
      WHERE task_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<any>(query, [taskId]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listByTaskAndStep(taskId: string, stepIndex: number): Promise<VerificationEvent[]> {
    const query = `
      SELECT id, task_id, step_index, event_type, verifier_name, expected,
             result, verification_result, error, duration_ms, created_at
      FROM verification_events
      WHERE task_id = $1 AND step_index = $2
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<any>(query, [taskId, stepIndex]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listByEventType(eventType: string): Promise<VerificationEvent[]> {
    const query = `
      SELECT id, task_id, step_index, event_type, verifier_name, expected,
             result, verification_result, error, duration_ms, created_at
      FROM verification_events
      WHERE event_type = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<any>(query, [eventType]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async listByVerifier(verifierName: string): Promise<VerificationEvent[]> {
    const query = `
      SELECT id, task_id, step_index, event_type, verifier_name, expected,
             result, verification_result, error, duration_ms, created_at
      FROM verification_events
      WHERE verifier_name = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<any>(query, [verifierName]);
    return result.rows.map((row) => this.mapRow(row));
  }

  async getLastVerificationForStep(
    taskId: string,
    stepIndex: number
  ): Promise<VerificationEvent | null> {
    const query = `
      SELECT id, task_id, step_index, event_type, verifier_name, expected,
             result, verification_result, error, duration_ms, created_at
      FROM verification_events
      WHERE task_id = $1 AND step_index = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query<any>(query, [taskId, stepIndex]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: any): VerificationEvent {
    const parseJsonField = (field: any) => {
      if (!field) return undefined;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch {
          return field;
        }
      }
      return field;
    };

    return {
      taskId: row.task_id,
      stepIndex: row.step_index,
      eventType: row.event_type,
      verifierName: row.verifier_name,
      payload: {
        expected: parseJsonField(row.expected),
        result: parseJsonField(row.result),
        verificationResult: parseJsonField(row.verification_result),
        error: row.error,
        durationMs: row.duration_ms,
      },
      createdAt: row.created_at,
    };
  }
}
