/**
 * Overseer Audit Middleware
 * Automatically logs all control plane actions to database
 * Phase 2: Operations Hardening
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { OverseerAuditLogRepository } from '../db/repositories/OverseerAuditLogRepository.js';
import { getLogger } from '../telemetry/logger.js';

/**
 * Factory function to create audit middleware with repository
 */
export function overseerAuditMiddleware(repo: OverseerAuditLogRepository) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    // Only audit /v1/admin/* endpoints (Overseer control plane)
    if (!request.url.startsWith('/v1/admin/')) {
      return;
    }

    const startTime = Date.now();
    const action = extractAction(request);
    
    // Store for response logging
    (request as any).__auditContext = {
      action,
      startTime,
      repo
    };
  };
}

/**
 * Hook to log response after completion
 */
export async function overseerAuditResponseHook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const auditContext = (request as any).__auditContext;
  
  if (!auditContext) {
    return; // Not an overseer request
  }

  const durationMs = Date.now() - auditContext.startTime;
  const repo: OverseerAuditLogRepository = auditContext.repo;

  try {
    await repo.recordAction({
      timestamp: new Date(),
      action: auditContext.action,
      endpoint: request.url,
      userId: (request as any).user?.userId,
      requestBody: request.body as Record<string, unknown>,
      responseStatus: reply.statusCode,
      responseBody: undefined, // Don't log full response to save space
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      durationMs,
      error: reply.statusCode >= 400 ? `HTTP ${reply.statusCode}` : undefined,
      metadata: {
        method: request.method,
        query: request.query
      }
    });
  } catch (error) {
    getLogger().error({ error }, 'Failed to log audit entry in response hook');
  }
}

/**
 * Extract action name from request URL
 */
function extractAction(request: FastifyRequest): string {
  const path = request.url.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  
  // Extract meaningful action name
  // /overseer/behavior -> "SET_BEHAVIOR"
  // /overseer/halt -> "HALT"
  // /overseer/status -> "GET_STATUS"
  
  if (parts.length >= 2) {
    const action = parts[parts.length - 1].toUpperCase().replace(/-/g, '_');
    const method = request.method.toUpperCase();
    
    if (method === 'GET') {
      return `GET_${action}`;
    } else if (method === 'POST') {
      return `SET_${action}`;
    } else if (method === 'DELETE') {
      return `DELETE_${action}`;
    }
    
    return action;
  }
  
  return 'UNKNOWN';
}
