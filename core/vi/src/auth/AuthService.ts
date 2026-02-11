/**
 * Authentication Service
 * Purpose: Handle user authentication, password hashing, and JWT generation
 */

import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { UserRepository } from '../db/repositories/UserRepository.js';
import type { SessionRepository } from '../db/repositories/SessionRepository.js';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

export class AuthService {
  constructor(
    private fastify: FastifyInstance,
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async register(input: RegisterInput, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    // Check if user already exists
    const existingEmail = await this.userRepo.getByEmail(input.email);
    if (existingEmail) {
      throw new Error('Email already registered');
    }

    const existingUsername = await this.userRepo.getByUsername(input.username);
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Create user
    const passwordHash = await this.hashPassword(input.password);
    const user = await this.userRepo.create({
      email: input.email,
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    });

    // Generate tokens
    return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    // Find user
    const user = await this.userRepo.getByEmail(input.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await this.verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Update last login
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    // Generate tokens
    return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessionRepo.revokeByRefreshToken(refreshToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllUserSessions(userId);
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    // Verify refresh token exists and is valid
    const session = await this.sessionRepo.getByRefreshToken(refreshToken);
    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (session.revokedAt) {
      throw new Error('Refresh token has been revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    // Get user
    const user = await this.userRepo.getById(session.userId);
    if (!user || !user.isActive) {
      throw new Error('User account is invalid or inactive');
    }

    // Revoke old session
    await this.sessionRepo.revoke(session.id);

    // Generate new tokens
    return this.generateTokens(user.id, user.email, user.username, ipAddress, userAgent);
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.fastify.jwt.verify<TokenPayload>(token);
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
    const session = await this.sessionRepo.create({
      userId,
      refreshToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    // Generate access token (JWT)
    const accessToken = this.fastify.jwt.sign(
      {
        userId,
        email,
        username,
        sessionId: session.id,
      } satisfies TokenPayload,
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
