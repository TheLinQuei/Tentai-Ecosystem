/**
 * ProfileAuditRepository: Log and retrieve profile evolution audit trail.
 * Stored in Postgres for observability.
 */

import { Pool } from 'pg';

export interface ProfileAuditRecord {
  userId: string;
  timestamp: string;
  signalType: string;
  oldValue?: string;
  newValue: string;
  confidence: number;
  reason: string;
  version: number; // profile version at time of audit
}

export class ProfileAuditRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Log a signal update to the audit trail.
   */
  async logSignalUpdate(
    userId: string,
    signalType: string,
    oldValue: string | undefined,
    newValue: string,
    confidence: number,
    reason: string,
    version: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO profile_audit_log (user_id, timestamp, signal_type, old_value, new_value, confidence, reason, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        new Date().toISOString(),
        signalType,
        oldValue ?? null,
        newValue,
        confidence,
        reason,
        version,
      ]
    );
  }

  /**
   * Retrieve audit history for a user.
   */
  async getAuditHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ProfileAuditRecord[]> {
    const res = await this.pool.query(
      `SELECT user_id, timestamp, signal_type, old_value, new_value, confidence, reason, version
       FROM profile_audit_log
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.rows.map(row => ({
      userId: row.user_id,
      timestamp: row.timestamp,
      signalType: row.signal_type,
      oldValue: row.old_value,
      newValue: row.new_value,
      confidence: row.confidence,
      reason: row.reason,
      version: row.version,
    }));
  }

  /**
   * Get audit records for a specific signal type.
   */
  async getAuditBySIgnalType(
    userId: string,
    signalType: string,
    limit: number = 20
  ): Promise<ProfileAuditRecord[]> {
    const res = await this.pool.query(
      `SELECT user_id, timestamp, signal_type, old_value, new_value, confidence, reason, version
       FROM profile_audit_log
       WHERE user_id = $1 AND signal_type = $2
       ORDER BY timestamp DESC
       LIMIT $3`,
      [userId, signalType, limit]
    );

    return res.rows.map(row => ({
      userId: row.user_id,
      timestamp: row.timestamp,
      signalType: row.signal_type,
      oldValue: row.old_value,
      newValue: row.new_value,
      confidence: row.confidence,
      reason: row.reason,
      version: row.version,
    }));
  }

  /**
   * Get trend: most recent value for each signal type.
   */
  async getTrendSummary(userId: string): Promise<Record<string, string>> {
    const res = await this.pool.query(
      `SELECT DISTINCT ON (signal_type) signal_type, new_value
       FROM profile_audit_log
       WHERE user_id = $1
       ORDER BY signal_type, timestamp DESC`,
      [userId]
    );

    const summary: Record<string, string> = {};
    for (const row of res.rows) {
      summary[row.signal_type] = row.new_value;
    }

    return summary;
  }
}
