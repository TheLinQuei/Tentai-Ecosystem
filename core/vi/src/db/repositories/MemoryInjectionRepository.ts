/**
 * Memory Injection Repository
 * Stores user-provided memory blobs for tracing + evidence
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface MemoryInjection {
  id: string;
  userId: string;
  sessionId: string;
  dimension: 'episodic' | 'semantic' | 'relational' | 'commitment' | 'working';
  text: string;
  label?: string;
  injectionLabel?: string; // Where it came from (e.g., "console.inject", "api.test")
  ttl?: number; // seconds; null = permanent
  expiresAt?: Date;
  createdAt: Date;
  createdBy: string; // 'system' | userId
}

export class MemoryInjectionRepository {
  constructor(private pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memory_injections (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        session_id UUID NOT NULL,
        dimension TEXT NOT NULL CHECK (dimension IN ('episodic', 'semantic', 'relational', 'commitment', 'working')),
        text TEXT NOT NULL,
        label TEXT,
        injection_label TEXT,
        ttl_seconds INT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by TEXT NOT NULL,
        CONSTRAINT valid_ttl CHECK (ttl_seconds IS NULL OR ttl_seconds > 0),
        CONSTRAINT expires_after_created CHECK (expires_at IS NULL OR expires_at > created_at)
      );

      CREATE INDEX IF NOT EXISTS idx_memory_injections_user_session 
        ON memory_injections(user_id, session_id);
      CREATE INDEX IF NOT EXISTS idx_memory_injections_expires_at 
        ON memory_injections(expires_at);
      CREATE INDEX IF NOT EXISTS idx_memory_injections_dimension 
        ON memory_injections(dimension);
    `);
  }

  async inject(injection: Omit<MemoryInjection, 'id' | 'createdAt'>): Promise<MemoryInjection> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = injection.ttl ? new Date(now.getTime() + injection.ttl * 1000) : null;

    await this.pool.query(
      `INSERT INTO memory_injections 
       (id, user_id, session_id, dimension, text, label, injection_label, ttl_seconds, expires_at, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        injection.userId,
        injection.sessionId,
        injection.dimension,
        injection.text,
        injection.label || null,
        injection.injectionLabel || null,
        injection.ttl || null,
        expiresAt,
        now,
        injection.createdBy,
      ]
    );

    return {
      ...injection,
      id,
      createdAt: now,
      expiresAt,
    };
  }

  async listForSession(userId: string, sessionId: string): Promise<MemoryInjection[]> {
    // Clean up expired records first (prevents zombie memory)
    await this.deleteExpired();

    // Exclude expired injections (CURRENT_TIMESTAMP is statement-time, more predictable than NOW())
    const res = await this.pool.query(
      `SELECT id, user_id, session_id, dimension, text, label, injection_label, ttl_seconds, expires_at, created_at, created_by
       FROM memory_injections
       WHERE user_id = $1 AND session_id = $2 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY created_at DESC`,
      [userId, sessionId]
    );

    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      sessionId: r.session_id,
      dimension: r.dimension,
      text: r.text,
      label: r.label,
      injectionLabel: r.injection_label,
      ttl: r.ttl_seconds,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  async deleteExpired(): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM memory_injections WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
    );
    return res.rowCount || 0;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM memory_injections WHERE id = $1`,
      [id]
    );
    return (res.rowCount || 0) > 0;
  }
}
