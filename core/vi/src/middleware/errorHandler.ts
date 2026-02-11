/**
 * Global Error Handler Middleware for Fastify
 * Catches all errors and returns standardized responses
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from '../telemetry/logger.js';
import { AppError, ErrorCode, ValidationError } from '../errors/AppError.js';

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
 * Register global error handler middleware
 */
export function registerErrorHandler(app: FastifyInstance): void {
  // Handle validation errors from Fastify
  app.setErrorHandler(async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const logger = getLogger(); // Get logger when handler is called
    const requestId = request.id || 'unknown';

    // Extract error details
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      // Handle Fastify validation errors
      if ('validation' in error && Array.isArray((error as any).validation)) {
        const validationError = error as any;
        appError = new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Request validation failed',
          400,
          {
            validationErrors: validationError.validation.map((v: any) => ({
              path: v.dataPath,
              message: v.message,
              params: v.params
            }))
          }
        );
      }
      // Handle JSON parse errors
      else if (error instanceof SyntaxError && 'status' in error && (error as any).status === 400) {
        appError = new ValidationError('Invalid JSON in request body', {
          original: error.message
        });
      }
      // Generic error
      else {
        const statusCode = (error as any).statusCode || 500;
        appError = new AppError(
          statusCode >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.OPERATION_FAILED,
          error.message || 'An unexpected error occurred',
          statusCode
        );
      }
    } else {
      // Unknown error type
      appError = new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'An unexpected error occurred',
        500
      );
    }

    // Build standardized response
    const statusCode = appError.statusCode || 500;
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details && { details: appError.details })
      },
      requestId,
      timestamp: new Date().toISOString()
    };

    // Log appropriately based on severity
    const logContext = {
      requestId,
      code: appError.code,
      message: appError.message,
      path: request.url,
      method: request.method,
      statusCode
    };

    if (statusCode >= 500) {
      logger.error(
        { ...logContext, error: appError, stack: appError.stack },
        'Server error'
      );
    } else if (statusCode >= 400) {
      logger.debug(logContext, 'Client error');
    }

    return reply.status(statusCode).send(errorResponse);
  });

  // Handle 404s
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const logger = getLogger();
    const requestId = request.id || 'unknown';
    const appError = new AppError(
      ErrorCode.NOT_FOUND,
      `Route not found: ${request.method} ${request.url}`,
      404
    );

    logger.debug(
      {
        requestId,
        path: request.url,
        method: request.method
      },
      'Not found'
    );

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code: appError.code,
        message: appError.message
      },
      requestId,
      timestamp: new Date().toISOString()
    };

    return reply.status(404).send(errorResponse);
  });
}

/**
 * Re-export for convenience
 */
export { AppError, ErrorCode, ValidationError };
