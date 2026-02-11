/**
 * Structured Logging Utilities
 * Provides consistent logging across the application
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import pino from 'pino';

/**
 * Logger configuration
 */
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

const loggerConfig = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  })
};

// Main logger instance
const mainLogger = pino(loggerConfig);

/**
 * Get logger instance
 */
export function getLogger() {
  return mainLogger;
}

/**
 * Request logging middleware
 * Logs incoming requests and their completion
 */
export async function requestLoggingMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();
  const requestId = request.id;

  // Log request
  mainLogger.debug(
    {
      requestId,
      method: request.method,
      path: request.url,
      query: request.query,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    },
    'Incoming request'
  );

  // Store start time for response logging
  (request as any).__startTime = startTime;
}

/**
 * Response logging hook
 * Should be registered with app.addHook('onResponse', responseLoggingHook)
 */
export async function responseLoggingHook(request: FastifyRequest, reply: FastifyReply) {
  const startTime = (request as any).__startTime || Date.now();
  const duration = Date.now() - startTime;
  const requestId = request.id;

  mainLogger.info(
    {
      requestId,
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      duration,
      ip: request.ip
    },
    'Request completed'
  );
}

/**
 * Performance logger for timing operations
 */
export class PerformanceLogger {
  private marks: Map<string, number> = new Map();

  mark(label: string): void {
    this.marks.set(label, Date.now());
  }

  measure(label: string, startLabel: string): number {
    const start = this.marks.get(startLabel);
    if (!start) {
      mainLogger.warn({ startLabel }, 'Start mark not found');
      return 0;
    }
    const duration = Date.now() - start;
    mainLogger.debug({ label, duration, startLabel }, 'Performance measurement');
    return duration;
  }

  async timeAsync<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      mainLogger.debug({ label, duration }, 'Async operation completed');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      mainLogger.error({ label, duration, error }, 'Async operation failed');
      throw error;
    }
  }

  sync<T>(label: string, fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      mainLogger.debug({ label, duration }, 'Sync operation completed');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      mainLogger.error({ label, duration, error }, 'Sync operation failed');
      throw error;
    }
  }
}

/**
 * Context logger for operations with user/session context
 */
export class ContextLogger {
  constructor(private context: Record<string, unknown>) {}

  debug(message: string, data?: Record<string, unknown>): void {
    mainLogger.debug({ ...this.context, ...data }, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    mainLogger.info({ ...this.context, ...data }, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    mainLogger.warn({ ...this.context, ...data }, message);
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    if (error instanceof Error) {
      mainLogger.error({ ...this.context, error }, message);
    } else {
      mainLogger.error({ ...this.context, ...error }, message);
    }
  }
}

/**
 * Create a child logger with additional context
 */
export function createContextLogger(context: Record<string, unknown>) {
  return new ContextLogger(context);
}

/**
 * Audit logging for security events
 */
export class AuditLogger {
  constructor(private baseLogger = mainLogger) {}

  // User authentication
  authSuccess(userId: string, method: string, ip: string): void {
    this.baseLogger.info(
      { userId, method, ip, timestamp: new Date().toISOString() },
      'Authentication successful'
    );
  }

  authFailure(email: string, reason: string, ip: string): void {
    this.baseLogger.warn(
      { email, reason, ip, timestamp: new Date().toISOString() },
      'Authentication failed'
    );
  }

  // Permission changes
  permissionChanged(userId: string, action: string, details: Record<string, unknown>): void {
    this.baseLogger.info(
      { userId, action, details, timestamp: new Date().toISOString() },
      'Permission changed'
    );
  }

  // Data access
  dataAccessed(userId: string, resource: string, action: string): void {
    this.baseLogger.debug(
      { userId, resource, action, timestamp: new Date().toISOString() },
      'Data accessed'
    );
  }

  // Policy violation
  policyViolation(userId: string, policy: string, details: Record<string, unknown>): void {
    this.baseLogger.warn(
      { userId, policy, details, timestamp: new Date().toISOString() },
      'Policy violation detected'
    );
  }

  // Tool execution
  toolExecution(userId: string, toolName: string, result: 'success' | 'failure'): void {
    this.baseLogger.info(
      { userId, toolName, result, timestamp: new Date().toISOString() },
      'Tool executed'
    );
  }
}

export const auditLogger = new AuditLogger();

/**
 * Export for convenience
 */
export { pino };
