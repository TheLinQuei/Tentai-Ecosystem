/**
 * Session Repository
 * Purpose: Database operations for user sessions and refresh tokens
 */

import type { Pool } from 'pg';

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  accessTokenJti: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  refreshToken: string;
  accessTokenJti?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

export class SessionRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateSessionInput): Promise<Session> {
    const {
      userId,
      refreshToken,
      accessTokenJti = null,
      ipAddress = null,
      userAgent = null,
      expiresAt,
    } = input;

    const result = await this.pool.query<Session>(
      `INSERT INTO sessions (user_id, refresh_token, access_token_jti, ip_address, user_agent, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING id::text as id, user_id::text as "userId", refresh_token as "refreshToken",
                 access_token_jti as "accessTokenJti", ip_address as "ipAddress",
                 user_agent as "userAgent", created_at as "createdAt",
                 expires_at as "expiresAt", revoked_at as "revokedAt",
                 last_activity_at as "lastActivityAt"`,
      [userId, refreshToken, accessTokenJti, ipAddress, userAgent, expiresAt]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<Session | null> {
    const result = await this.pool.query<Session>(
      `SELECT id::text as id, user_id::text as "userId", refresh_token as "refreshToken",
              access_token_jti as "accessTokenJti", ip_address as "ipAddress",
              user_agent as "userAgent", created_at as "createdAt",
              expires_at as "expiresAt", revoked_at as "revokedAt",
              last_activity_at as "lastActivityAt"
       FROM sessions
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async getByRefreshToken(refreshToken: string): Promise<Session | null> {
    const result = await this.pool.query<Session>(
      `SELECT id::text as id, user_id::text as "userId", refresh_token as "refreshToken",
              access_token_jti as "accessTokenJti", ip_address as "ipAddress",
              user_agent as "userAgent", created_at as "createdAt",
              expires_at as "expiresAt", revoked_at as "revokedAt",
              last_activity_at as "lastActivityAt"
       FROM sessions
       WHERE refresh_token = $1`,
      [refreshToken]
    );

    return result.rows[0] || null;
  }

  async getActiveSessions(userId: string): Promise<Session[]> {
    const result = await this.pool.query<Session>(
      `SELECT id, user_id as "userId", refresh_token as "refreshToken",
              access_token_jti as "accessTokenJti", ip_address as "ipAddress",
              user_agent as "userAgent", created_at as "createdAt",
              expires_at as "expiresAt", revoked_at as "revokedAt",
              last_activity_at as "lastActivityAt"
       FROM sessions
       WHERE user_id = $1
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  async updateActivity(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions
       SET last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND revoked_at IS NULL`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async revokeByRefreshToken(refreshToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE refresh_token = $1 AND revoked_at IS NULL`,
      [refreshToken]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    return result.rowCount ?? 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM sessions
       WHERE expires_at < CURRENT_TIMESTAMP`
    );

    return result.rowCount ?? 0;
  }

  async listAllSessions(limit = 100, offset = 0): Promise<Session[]> {
    const result = await this.pool.query<Session>(
      `SELECT id::text as id, user_id::text as "userId", refresh_token as "refreshToken",
              access_token_jti as "accessTokenJti", ip_address as "ipAddress",
              user_agent as "userAgent", created_at as "createdAt",
              expires_at as "expiresAt", revoked_at as "revokedAt",
              last_activity_at as "lastActivityAt"
       FROM sessions
       WHERE revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY last_activity_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }
}
