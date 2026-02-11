/**
 * Rate Limiting Middleware
 * Implements per-IP rate limiting with configurable windows
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthorizationError, ErrorCode, AppError } from '../errors/AppError.js';
import { getLogger } from '../telemetry/logger.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in ms
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  message?: string;
}

/**
 * In-memory store for rate limit tracking
 * In production, use Redis for distributed rate limiting
 */
class RateLimitStore {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();

  track(key: string, windowMs: number): boolean {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      // New window
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    record.count++;
    return record.count <= 100; // Default max
  }

  getRemainingRequests(key: string, maxRequests: number): number {
    const record = this.requests.get(key);
    if (!record) {
      return maxRequests;
    }
    const remaining = Math.max(0, maxRequests - record.count);
    return remaining;
  }

  getResetTime(key: string): number {
    const record = this.requests.get(key);
    if (!record) {
      return Date.now();
    }
    return record.resetTime;
  }

  // Cleanup old entries every hour
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.requests.forEach((value, key) => {
      if (now > value.resetTime + 3600000) {
        toDelete.push(key);
      }
    });

    toDelete.forEach((key) => this.requests.delete(key));
    getLogger().debug({ cleaned: toDelete.length }, 'Rate limit store cleanup');
  }
}

const store = new RateLimitStore();

// Cleanup every hour; unref so it doesn't hold the event loop open in tests
const cleanupInterval = setInterval(() => store.cleanup(), 3600000);
cleanupInterval.unref();

/**
 * Get client IP address
 */
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0];
  }
  return request.ip || 'unknown';
}

/**
 * Create rate limit middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const clientIp = getClientIp(request);
    const key = `${clientIp}:${request.url}`;

    // Check rate limit
    const allowed = store.track(key, config.windowMs);

    if (!allowed) {
      const remaining = store.getRemainingRequests(key, config.maxRequests);
      const resetTime = store.getResetTime(key);
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, remaining));
      reply.header('X-RateLimit-Reset', resetTime);
      reply.header('Retry-After', retryAfter);

      getLogger().warn(
        { clientIp, key, remaining, retryAfter },
        'Rate limit exceeded'
      );

      throw new AppError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        config.message || 'Too many requests, please try again later',
        429
      );
    }

    // Set rate limit headers on success
    const remaining = store.getRemainingRequests(key, config.maxRequests);
    const resetTime = store.getResetTime(key);

    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', remaining);
    reply.header('X-RateLimit-Reset', resetTime);
  };
}

/**
 * Pre-configured rate limiters for common scenarios
 */
export const rateLimiters = {
  // Public endpoints: 100 requests per 15 minutes
  public: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests, please try again in 15 minutes'
  }),

  // Authentication endpoints: 5 requests per 15 minutes
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again in 15 minutes'
  }),

  // API endpoints: 300 requests per hour
  api: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 300,
    message: 'Rate limit exceeded, please try again later'
  }),

  // Chat endpoints: 60 requests per minute (1 req/sec on average)
  chat: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many chat requests, please slow down'
  }),

  // Strict (file uploads, heavy operations): 10 requests per hour
  strict: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    message: 'Rate limit exceeded for this operation'
  })
};

/**
 * Custom rate limiter for authenticated users (higher limits)
 */
export function createAuthenticatedRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // For authenticated users, use a different rate limit (higher)
    const clientId = (request as any).user?.id || getClientIp(request);
    const key = `user:${clientId}:${request.url}`;

    const limiter = createRateLimiter({
      windowMs: 60 * 60 * 1000,
      maxRequests: 1000, // Much higher for authenticated users
      ...config
    });

    // Temporarily set the key for the rate limiter
    (request as any).__rateLimitKey = key;

    return limiter(request, reply);
  };
}

/**
 * Bypass rate limiting for specific routes (admin, health checks, etc.)
 */
export function skipRateLimit(request: FastifyRequest, reply: FastifyReply): void {
  (request as any).__skipRateLimit = true;
}
