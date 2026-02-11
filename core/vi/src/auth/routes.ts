/**
 * Authentication Routes
 * Purpose: Handle user registration, login, logout, and token refresh
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from './AuthService.js';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  displayName: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export function registerAuthRoutes(fastify: FastifyInstance, authService: AuthService) {
  // Register
  fastify.post('/v1/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body) as any;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      const tokens = await authService.register(body as any, ipAddress, userAgent);

      return reply.code(201).send({
        success: true,
        data: tokens,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Registration failed';
      
      // Specific error codes for common cases
      if (message.includes('Email already registered') || message.includes('Username already taken')) {
        return reply.code(409).send({
          error: message,
        });
      }

      return reply.code(500).send({
        error: message,
      });
    }
  });

  // Login
  fastify.post('/v1/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body) as any;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      const tokens = await authService.login(body as any, ipAddress, userAgent);

      return reply.code(200).send({
        success: true,
        data: tokens,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Login failed';

      // Don't distinguish between invalid credentials and inactive account for security
      if (message.includes('Invalid email or password') || message.includes('deactivated')) {
        return reply.code(401).send({
          error: 'Invalid credentials',
        });
      }

      return reply.code(500).send({
        error: message,
      });
    }
  });

  // Refresh access token
  fastify.post('/v1/auth/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      const tokens = await authService.refresh(body.refreshToken, ipAddress, userAgent);

      return reply.code(200).send({
        success: true,
        data: tokens,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Token refresh failed';

      // All token errors are 401 Unauthorized
      return reply.code(401).send({
        error: message,
      });
    }
  });

  // Logout (revoke refresh token)
  fastify.post('/v1/auth/logout', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);

      await authService.logout(body.refreshToken);

      return reply.code(200).send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.errors,
        });
      }

      return reply.code(500).send({
        error: 'Logout failed',
      });
    }
  });

  // Logout all sessions (requires authentication)
  fastify.post('/v1/auth/logout-all', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const userId = request.user.userId;

      await authService.logoutAll(userId);

      return reply.code(200).send({
        success: true,
        message: 'All sessions logged out successfully',
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Logout failed',
      });
    }
  });
}
