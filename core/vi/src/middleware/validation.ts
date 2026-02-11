/**
 * Request Validation Middleware
 * Validates request body, query params, and path params against Zod schemas
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError.js';
import { getLogger } from '../telemetry/logger.js';

/**
 * Validation error details
 */
interface ValidationDetails extends Record<string, unknown> {
  fields: Record<string, string[]>;
  count: number;
}

/**
 * Validator for request body
 */
export function validateBody(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.body);
      (request as any).validatedBody = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const fields: Record<string, string[]> = {};

        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!fields[path]) {
            fields[path] = [];
          }
          fields[path].push(err.message);
        });

        const details: ValidationDetails = {
          fields,
          count: error.errors.length
        };

        throw new ValidationError('Request body validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Validator for query parameters
 */
export function validateQuery(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.query);
      (request as any).validatedQuery = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const fields: Record<string, string[]> = {};

        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!fields[path]) {
            fields[path] = [];
          }
          fields[path].push(err.message);
        });

        const details: ValidationDetails = {
          fields,
          count: error.errors.length
        };

        throw new ValidationError('Query validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Validator for path parameters
 */
export function validateParams(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.params);
      (request as any).validatedParams = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const fields: Record<string, string[]> = {};

        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!fields[path]) {
            fields[path] = [];
          }
          fields[path].push(err.message);
        });

        const details: ValidationDetails = {
          fields,
          count: error.errors.length
        };

        throw new ValidationError('Path parameter validation failed', details);
      }
      throw error;
    }
  };
}

/**
 * Combined validator for multiple parts
 */
export function validateRequest(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: Record<string, ValidationDetails> = {};
    let hasErrors = false;

    if (schemas.body) {
      try {
        const validated = schemas.body.parse(request.body);
        (request as any).validatedBody = validated;
      } catch (error) {
        hasErrors = true;
        if (error instanceof ZodError) {
          const fields: Record<string, string[]> = {};
          error.errors.forEach((err) => {
            const path = err.path.join('.');
            if (!fields[path]) {
              fields[path] = [];
            }
            fields[path].push(err.message);
          });
          errors.body = { fields, count: error.errors.length };
        }
      }
    }

    if (schemas.query) {
      try {
        const validated = schemas.query.parse(request.query);
        (request as any).validatedQuery = validated;
      } catch (error) {
        hasErrors = true;
        if (error instanceof ZodError) {
          const fields: Record<string, string[]> = {};
          error.errors.forEach((err) => {
            const path = err.path.join('.');
            if (!fields[path]) {
              fields[path] = [];
            }
            fields[path].push(err.message);
          });
          errors.query = { fields, count: error.errors.length };
        }
      }
    }

    if (schemas.params) {
      try {
        const validated = schemas.params.parse(request.params);
        (request as any).validatedParams = validated;
      } catch (error) {
        hasErrors = true;
        if (error instanceof ZodError) {
          const fields: Record<string, string[]> = {};
          error.errors.forEach((err) => {
            const path = err.path.join('.');
            if (!fields[path]) {
              fields[path] = [];
            }
            fields[path].push(err.message);
          });
          errors.params = { fields, count: error.errors.length };
        }
      }
    }

    if (hasErrors) {
      throw new ValidationError('Request validation failed', errors);
    }
  };
}

/**
 * Helper to get validated data from request
 */
export function getValidated(request: FastifyRequest) {
  return {
    body: (request as any).validatedBody || request.body,
    query: (request as any).validatedQuery || request.query,
    params: (request as any).validatedParams || request.params
  };
}
