/**
 * App-wide Error Classes and Types
 * Standardizes error handling across all endpoints
 */

import { FastifyReply } from 'fastify';

/**
 * Standard error codes used throughout the application
 */
export enum ErrorCode {
  // Validation errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_UUID = 'INVALID_UUID',
  INVALID_EMAIL = 'INVALID_EMAIL',

  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Resource errors (404)
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  RESOURCE_EXISTS = 'RESOURCE_EXISTS',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',

  // Server errors (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  PROCESSING_ERROR = 'PROCESSING_ERROR',

  // Business logic errors
  BUSINESS_LOGIC_ERROR = 'BUSINESS_LOGIC_ERROR',
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_STATE = 'INVALID_STATE',
}

/**
 * Standard application error
 * All thrown errors should be instances of this or subclasses
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AppError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(ErrorCode.AUTHENTICATION_FAILED, message, 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', details?: Record<string, unknown>) {
    super(ErrorCode.FORBIDDEN, message, 403, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier ? `${resource} not found: ${identifier}` : `${resource} not found`;
    super(ErrorCode.NOT_FOUND, message, 404, { resource, identifier });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.CONFLICT, message, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}

/**
 * Helper to send standardized error response
 */
export function sendErrorResponse(
  reply: FastifyReply,
  error: Error | AppError,
  requestId: string
): FastifyReply {
  let appError: AppError;
  let statusCode = 500;

  if (error instanceof AppError) {
    appError = error;
    statusCode = error.statusCode;
  } else if (error instanceof SyntaxError) {
    appError = new ValidationError('Invalid JSON', { original: error.message });
    statusCode = 400;
  } else {
    appError = new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      error.message || 'An unexpected error occurred',
      500,
      undefined,
      error
    );
    statusCode = 500;
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details })
    },
    requestId,
    timestamp: new Date().toISOString()
  };

  // Log error for debugging
  const logger = require('./logger').getLogger();
  if (statusCode >= 500) {
    logger.error({ error: appError, statusCode }, 'Server error');
  } else if (statusCode >= 400) {
    logger.warn({ code: appError.code, message: appError.message }, 'Client error');
  }

  return reply.status(statusCode).send(response);
}
