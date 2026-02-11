/**
 * User Repository
 * Purpose: Database operations for user accounts
 */

import type { Pool } from 'pg';

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  isActive: boolean;
  isVerified: boolean;
}

export interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
  displayName?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  lastLoginAt?: Date;
  isActive?: boolean;
  isVerified?: boolean;
}

export class UserRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateUserInput): Promise<User> {
    const { email, username, passwordHash, displayName = null } = input;

    const result = await this.pool.query<User>(
      `INSERT INTO users (email, username, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text as id, email, username, password_hash as "passwordHash",
                 display_name as "displayName", created_at as "createdAt",
                 updated_at as "updatedAt", last_login_at as "lastLoginAt",
                 is_active as "isActive", is_verified as "isVerified"`,
      [email, username, passwordHash, displayName]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      `SELECT id::text as id, email, username, password_hash as "passwordHash",
              display_name as "displayName", created_at as "createdAt",
              updated_at as "updatedAt", last_login_at as "lastLoginAt",
              is_active as "isActive", is_verified as "isVerified"
       FROM users
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      `SELECT id::text as id, email, username, password_hash as "passwordHash",
              display_name as "displayName", created_at as "createdAt",
              updated_at as "updatedAt", last_login_at as "lastLoginAt",
              is_active as "isActive", is_verified as "isVerified"
       FROM users
       WHERE email = $1`,
      [email]
    );

    return result.rows[0] || null;
  }

  async getByUsername(username: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      `SELECT id::text as id, email, username, password_hash as "passwordHash",
              display_name as "displayName", created_at as "createdAt",
              updated_at as "updatedAt", last_login_at as "lastLoginAt",
              is_active as "isActive", is_verified as "isVerified"
       FROM users
       WHERE username = $1`,
      [username]
    );

    return result.rows[0] || null;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.displayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(input.displayName);
    }

    if (input.lastLoginAt !== undefined) {
      updates.push(`last_login_at = $${paramCount++}`);
      values.push(input.lastLoginAt);
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(input.isActive);
    }

    if (input.isVerified !== undefined) {
      updates.push(`is_verified = $${paramCount++}`);
      values.push(input.isVerified);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await this.pool.query<User>(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, email, username, password_hash as "passwordHash",
                 display_name as "displayName", created_at as "createdAt",
                 updated_at as "updatedAt", last_login_at as "lastLoginAt",
                 is_active as "isActive", is_verified as "isVerified"`,
      values
    );

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listAll(limit = 100, offset = 0): Promise<Omit<User, 'passwordHash'>[]> {
    const result = await this.pool.query<Omit<User, 'passwordHash'>>(
      `SELECT id::text as id, email, username,
              display_name as "displayName", created_at as "createdAt",
              updated_at as "updatedAt", last_login_at as "lastLoginAt",
              is_active as "isActive", is_verified as "isVerified"
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }
}
