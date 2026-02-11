/**
 * Sovereign Auth Service
 * Purpose: Handle authentication independently of vi-core status
 * Security: Postgres is always running, so auth always works
 */

import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const JWT_SECRET = process.env.JWT_SECRET || 'sovereign-dev-secret-change-in-production';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  sessionId?: string;
}

export class SovereignAuthService {
  constructor(private pool: Pool) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      console.log(`[AUTH-DEBUG] verifyPassword called: password="${password}", hash="${hash}"`);
      const result = await bcrypt.compare(password, hash);
      console.log(`[AUTH-DEBUG] bcrypt.compare result: ${result}`);
      return result;
    } catch (err) {
      console.error(`[AUTH-DEBUG] bcrypt.compare error:`, err);
      throw err;
    }
  }

  async register(input: RegisterInput, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    // Normalize email to lowercase for consistency with login
    const normalizedEmail = input.email.trim().toLowerCase();
    
    // Check if user already exists
    const existingEmail = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (existingEmail.rows.length > 0) {
      throw new Error('Email already registered');
    }

    const existingUsername = await this.pool.query(
      'SELECT id FROM users WHERE username = $1',
      [input.username]
    );
    if (existingUsername.rows.length > 0) {
      throw new Error('Username already taken');
    }

    // Create user
    const passwordHash = await this.hashPassword(input.password);
    const userResult = await this.pool.query(
      `INSERT INTO users (email, username, password_hash, display_name, created_at, last_login_at, is_active)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), true)
       RETURNING id, email, username`,
      [normalizedEmail, input.username, passwordHash, input.displayName || input.username]
    );

    const user = userResult.rows[0];

    // Generate tokens
    return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    try {
      // Normalize email to avoid case-sensitive misses
      const normalizedEmail = input.email.trim().toLowerCase();

      // Find user
      console.log(`[AUTH-DEBUG] Starting login for ${normalizedEmail}`);
      const userResult = await this.pool.query(
        'SELECT id, email, username, password_hash, is_active FROM users WHERE email = $1',
        [normalizedEmail]
      );

      if (userResult.rows.length === 0) {
        console.log(`[AUTH-DEBUG] User not found: ${normalizedEmail}`);
        throw new Error('Invalid email or password');
      }

      const user = userResult.rows[0];
      console.log(`[AUTH-DEBUG] User found: ${user.email}, password_hash length: ${user.password_hash.length}, is_active: ${user.is_active}`);

      // Verify password
      console.log(`[AUTH-DEBUG] Comparing password against hash`);
      const isValid = await this.verifyPassword(input.password, user.password_hash);
      console.log(`[AUTH-DEBUG] Password verification result: ${isValid}`);
      
      if (!isValid) {
        console.log(`[AUTH-DEBUG] Password mismatch for ${user.email}`);
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.is_active) {
        console.log(`[AUTH-DEBUG] Account inactive for ${user.email}`);
        throw new Error('Account is deactivated');
      }

      // Update last login
      await this.pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      // Generate tokens
      return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
    } catch (err) {
      console.error(`[AUTH-DEBUG] Login method error:`, err);
      throw err;
    }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE refresh_token = $1',
      [refreshToken]
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    // Verify refresh token exists and is valid
    const sessionResult = await this.pool.query(
      'SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token = $1',
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Invalid refresh token');
    }

    const session = sessionResult.rows[0];

    if (session.revoked_at) {
      throw new Error('Refresh token has been revoked');
    }

    if (new Date(session.expires_at) < new Date()) {
      throw new Error('Refresh token has expired');
    }

    // Get user
    const userResult = await this.pool.query(
      'SELECT id, email, username, is_active FROM users WHERE id = $1',
      [session.user_id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      throw new Error('User account is invalid or inactive');
    }

    const user = userResult.rows[0];

    // Revoke old session
    await this.pool.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);

    // Generate new tokens
    return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return payload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    username: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthTokens> {
    // Generate refresh token (random string)
    const refreshToken = this.generateRefreshToken();

    // Create session
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    const sessionResult = await this.pool.query(
      `INSERT INTO sessions (user_id, refresh_token, ip_address, user_agent, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [userId, refreshToken, ipAddress, userAgent, expiresAt]
    );

    const sessionId = sessionResult.rows[0].id;

    // Generate access token (JWT)
    const accessToken = jwt.sign(
      {
        userId,
        email,
        username,
        sessionId,
      } satisfies TokenPayload,
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private generateRefreshToken(): string {
    // Generate a secure random token
    const bytes = randomBytes(32);
    return bytes.toString('base64url');
  }
}
