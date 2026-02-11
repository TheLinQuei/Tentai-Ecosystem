/**
 * Authentication Middleware
 * Purpose: JWT verification and request authentication
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import type { TokenPayload } from './AuthService.js';

// Extend JWT plugin types to use our payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

// Extend Fastify to include our authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuthMiddleware(fastify: FastifyInstance) {
  // Register JWT plugin
  const jwtSecret = process.env.VI_JWT_SECRET || 'dev-secret-change-in-production';
  
  if (jwtSecret === 'dev-secret-change-in-production' && process.env.NODE_ENV === 'production') {
    throw new Error('VI_JWT_SECRET must be set in production');
  }

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
  });

  // Define authentication decorator
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Ensure Authorization header is present
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Missing or invalid Authorization header',
        });
      }

      // Verify token and attach user
      const payload = await request.jwtVerify<TokenPayload>();
      request.user = payload;
    } catch (error) {
      return reply.code(401).send({
        error: 'Invalid or expired token',
      });
    }
  });
}
