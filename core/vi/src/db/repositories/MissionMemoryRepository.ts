/**
 * C5: Mission Memory Repository
 *
 * Handles persistence of multi-step task execution state across sessions.
 * Enables resume-from-checkpoint pattern for long-running missions.
 */

import { Pool } from 'pg';
import { z } from 'zod';

// Zod schemas for validation (flexible to accept various formats)
const MetadataSchema = z.record(z.any()).refine(
  (data) => {
    const jsonStr = JSON.stringify(data);
    return jsonStr.length <= 10240; // 10KB max
  },
  { message: 'Metadata too large (max 10KB)' }
);

const VerificationLogEntrySchema = z.object({
  step: z.union([z.number(), z.string()]).optional(),
  status: z.enum(['pending', 'verified', 'failed']).optional(),
  timestamp: z.string().optional(),
  details: z.string().max(1000).optional(),
}).passthrough(); // Allow additional fields

const VerificationLogSchema = z.array(VerificationLogEntrySchema).max(100); // Max 100 entries

const StepSchema = z.any(); // Accept any step format for backward compatibility

const StepsSchema = z.array(StepSchema).max(50); // Max 50 steps per mission

/**
 * Redact sensitive data from metadata and verification logs
 */
function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'auth', 'api_key'];
  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
  
  for (const key in redacted) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }
  
  return redacted;
}

export interface MissionMemory {
  id: string;
  user_id: string;
  session_id?: string;
  mission_id: string;
  task: string;
  steps: any[];
  current_step: number;
  completed_steps: any[];
  failed_steps: any[];
  verification_log: any[];
  status: 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMissionMemoryInput {
  user_id: string;
  session_id?: string;
  mission_id: string;
  task: string;
  steps: any[];
  metadata?: Record<string, any>;
}

export interface UpdateMissionMemoryInput {
  current_step?: number;
  completed_steps?: any[];
  failed_steps?: any[];
  verification_log?: any[];
  status?: 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled';
  metadata?: Record<string, any>;
}

export class MissionMemoryRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new mission memory record
   */
  async create(input: CreateMissionMemoryInput): Promise<MissionMemory> {
    const { user_id, session_id, mission_id, task, steps, metadata } = input;

    // Validate inputs
    StepsSchema.parse(steps);
    if (metadata) {
      MetadataSchema.parse(metadata);
    }

    // Redact sensitive data before storage
    const sanitizedMetadata = metadata ? redactSensitiveData(metadata) : {};

    const result = await this.pool.query<MissionMemory>(
      `INSERT INTO mission_memory 
        (user_id, session_id, mission_id, task, steps, metadata, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, session_id, mission_id, task, steps, current_step, 
                 completed_steps, failed_steps, verification_log, status, metadata,
                 created_at, updated_at`,
      [
        user_id,
        session_id || null,
        mission_id,
        task,
        JSON.stringify(steps),
        JSON.stringify(sanitizedMetadata),
        'in_progress',
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get mission memory by ID
   */
  async getById(id: string): Promise<MissionMemory | null> {
    const result = await this.pool.query<MissionMemory>(
      `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
              completed_steps, failed_steps, verification_log, status, metadata,
              created_at, updated_at
       FROM mission_memory
       WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get all mission memories for a user (optionally filtered by status)
   */
  async getByUser(
    userId: string,
    status?: 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled',
    limit = 100,
    offset = 0
  ): Promise<MissionMemory[]> {
    const query =
      status === undefined
        ? `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
                  completed_steps, failed_steps, verification_log, status, metadata,
                  created_at, updated_at
           FROM mission_memory
           WHERE user_id = $1
           ORDER BY updated_at DESC
           LIMIT $2 OFFSET $3`
        : `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
                  completed_steps, failed_steps, verification_log, status, metadata,
                  created_at, updated_at
           FROM mission_memory
           WHERE user_id = $1 AND status = $2
           ORDER BY updated_at DESC
           LIMIT $3 OFFSET $4`;

    const params = status === undefined ? [userId, limit, offset] : [userId, status, limit, offset];

    const result = await this.pool.query<MissionMemory>(query, params);

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get in-progress mission memory for resumption
   * Returns the latest in_progress mission for checkpoint resume
   */
  async getLatestInProgress(userId: string): Promise<MissionMemory | null> {
    const result = await this.pool.query<MissionMemory>(
      `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
              completed_steps, failed_steps, verification_log, status, metadata,
              created_at, updated_at
       FROM mission_memory
       WHERE user_id = $1 AND status = 'in_progress'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get mission memory by mission_id
   * Useful for checking if a mission already exists
   */
  async getByMissionId(
    userId: string,
    missionId: string
  ): Promise<MissionMemory | null> {
    const result = await this.pool.query<MissionMemory>(
      `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
              completed_steps, failed_steps, verification_log, status, metadata,
              created_at, updated_at
       FROM mission_memory
       WHERE user_id = $1 AND mission_id = $2`,
      [userId, missionId]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update mission memory (track progress)
   */
  async update(id: string, input: UpdateMissionMemoryInput): Promise<MissionMemory> {
    // Validate verification_log if provided
    if (input.verification_log !== undefined) {
      VerificationLogSchema.parse(input.verification_log);
    }

    // Validate metadata if provided
    if (input.metadata !== undefined) {
      MetadataSchema.parse(input.metadata);
    }

    // Redact sensitive data
    const sanitizedInput = {
      ...input,
      verification_log: input.verification_log ? redactSensitiveData(input.verification_log) : undefined,
      metadata: input.metadata ? redactSensitiveData(input.metadata) : undefined,
    };

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (sanitizedInput.current_step !== undefined) {
      fields.push(`current_step = $${paramIndex++}`);
      values.push(sanitizedInput.current_step);
    }

    if (sanitizedInput.completed_steps !== undefined) {
      fields.push(`completed_steps = $${paramIndex++}`);
      values.push(JSON.stringify(sanitizedInput.completed_steps));
    }

    if (sanitizedInput.failed_steps !== undefined) {
      fields.push(`failed_steps = $${paramIndex++}`);
      values.push(JSON.stringify(sanitizedInput.failed_steps));
    }

    if (sanitizedInput.verification_log !== undefined) {
      fields.push(`verification_log = $${paramIndex++}`);
      values.push(JSON.stringify(sanitizedInput.verification_log));
    }

    if (sanitizedInput.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(sanitizedInput.status);
    }

    if (sanitizedInput.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(sanitizedInput.metadata));
    }

    fields.push(`updated_at = now()`);

    values.push(id);

    const result = await this.pool.query<MissionMemory>(
      `UPDATE mission_memory
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, user_id, session_id, mission_id, task, steps, current_step,
                 completed_steps, failed_steps, verification_log, status, metadata,
                 created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`Mission memory not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Mark mission as completed/failed
   */
  async finish(
    id: string,
    status: 'completed' | 'failed',
    metadata?: Record<string, any>
  ): Promise<MissionMemory> {
    return this.update(id, {
      status,
      metadata: metadata || {},
    });
  }

  /**
   * Delete a mission memory record
   */
  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM mission_memory WHERE id = $1', [id]);
  }

  /**
   * Get all missions in a specific status
   */
  async getByStatus(
    status: 'in_progress' | 'completed' | 'failed' | 'paused' | 'cancelled',
    limit = 100,
    offset = 0
  ): Promise<MissionMemory[]> {
    const result = await this.pool.query<MissionMemory>(
      `SELECT id, user_id, session_id, mission_id, task, steps, current_step,
              completed_steps, failed_steps, verification_log, status, metadata,
              created_at, updated_at
       FROM mission_memory
       WHERE status = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Map database row to MissionMemory type (parse JSON fields)
   */
  private mapRow(row: any): MissionMemory {
    return {
      id: row.id,
      user_id: row.user_id,
      session_id: row.session_id,
      mission_id: row.mission_id,
      task: row.task,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      current_step: row.current_step,
      completed_steps:
        typeof row.completed_steps === 'string'
          ? JSON.parse(row.completed_steps)
          : row.completed_steps,
      failed_steps:
        typeof row.failed_steps === 'string'
          ? JSON.parse(row.failed_steps)
          : row.failed_steps,
      verification_log:
        typeof row.verification_log === 'string'
          ? JSON.parse(row.verification_log)
          : row.verification_log,
      status: row.status,
      metadata:
        typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
