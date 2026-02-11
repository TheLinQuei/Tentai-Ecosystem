/**
 * Overseer Audit Log Repository
 * Persistent storage for all control plane actions
 * Phase 2: Operations Hardening
 */

import { Pool } from 'pg';
import { getLogger } from '../../telemetry/logger.js';

export interface OverseerAuditEntry {
  id?: number;
  timestamp: Date;
  action: string;
  endpoint: string;
  userId?: string;
  requestBody?: Record<string, unknown>;
  responseStatus?: number;
  responseBody?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogQuery {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export class OverseerAuditLogRepository {
  constructor(private pool: Pool) {}

  /**
   * Record an audit entry
   */
  async recordAction(entry: OverseerAuditEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO overseer_audit_log (
          timestamp, action, endpoint, user_id, request_body,
          response_status, response_body, ip_address, user_agent,
          duration_ms, error, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.timestamp,
          entry.action,
          entry.endpoint,
          entry.userId,
          entry.requestBody ? JSON.stringify(entry.requestBody) : null,
          entry.responseStatus,
          entry.responseBody ? JSON.stringify(entry.responseBody) : null,
          entry.ipAddress,
          entry.userAgent,
          entry.durationMs,
          entry.error,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        ]
      );

      getLogger().debug({ action: entry.action, endpoint: entry.endpoint }, 'Audit entry recorded');
    } catch (error) {
      getLogger().error({ error, entry }, 'Failed to record audit entry');
      // Don't throw - audit logging should never break the main operation
    }
  }

  /**
   * Query audit log with filters
   */
  async query(filters: AuditLogQuery = {}): Promise<OverseerAuditEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT 
        id, timestamp, action, endpoint, user_id, request_body,
        response_status, response_body, ip_address, user_agent,
        duration_ms, error, metadata, created_at
      FROM overseer_audit_log
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      action: row.action,
      endpoint: row.endpoint,
      userId: row.user_id,
      requestBody: row.request_body,
      responseStatus: row.response_status,
      responseBody: row.response_body,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      durationMs: row.duration_ms,
      error: row.error,
      metadata: row.metadata
    }));
  }

  /**
   * Get recent audit entries (last N days)
   */
  async getRecent(days: number = 7, limit: number = 100): Promise<OverseerAuditEntry[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.query({ startDate, limit });
  }

  /**
   * Get audit entries for a specific action
   */
  async getByAction(action: string, limit: number = 50): Promise<OverseerAuditEntry[]> {
    return this.query({ action, limit });
  }

  /**
   * Get audit entries for a specific user
   */
  async getByUser(userId: string, limit: number = 50): Promise<OverseerAuditEntry[]> {
    return this.query({ userId, limit });
  }

  /**
   * Get total count of audit entries
   */
  async getCount(filters: AuditLogQuery = {}): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM overseer_audit_log ${whereClause}`,
      params
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Delete old audit entries (for retention policy)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.pool.query(
      'DELETE FROM overseer_audit_log WHERE timestamp < $1',
      [cutoffDate]
    );

    const deletedCount = result.rowCount || 0;
    
    getLogger().info({ deletedCount, days, cutoffDate }, 'Deleted old audit entries');

    return deletedCount;
  }

  /**
   * Get statistics about audit log
   */
  async getStats(): Promise<{
    totalEntries: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    actionCounts: Array<{ action: string; count: number }>;
  }> {
    const [totalResult, rangeResult, actionResult] = await Promise.all([
      this.pool.query('SELECT COUNT(*) as count FROM overseer_audit_log'),
      this.pool.query('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM overseer_audit_log'),
      this.pool.query(`
        SELECT action, COUNT(*) as count
        FROM overseer_audit_log
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `)
    ]);

    return {
      totalEntries: parseInt(totalResult.rows[0].count, 10),
      oldestEntry: rangeResult.rows[0].oldest ? new Date(rangeResult.rows[0].oldest) : null,
      newestEntry: rangeResult.rows[0].newest ? new Date(rangeResult.rows[0].newest) : null,
      actionCounts: actionResult.rows.map(row => ({
        action: row.action,
        count: parseInt(row.count, 10)
      }))
    };
  }
}
