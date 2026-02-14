// src/admin/auth.ts
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@/lib/logger';

const logger = createLogger('admin:auth');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Production safety: refuse insecure defaults
const isProd = process.env.NODE_ENV === 'production';
if (isProd && JWT_SECRET === 'CHANGE_ME_IN_PRODUCTION') {
  throw new Error('[ADMIN AUTH] CRITICAL: JWT_SECRET must be set to a secure value in production. Refusing to start.');
}

export interface JWTPayload {
  userId: string;
  username: string;
  roles: string[];
}

/**
 * Generate a JWT token for an authenticated user
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

/**
 * Express middleware to require JWT authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn({ ip: req.ip, path: req.path }, 'Missing or invalid auth header');
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    // Attach user info to request
    (req as any).user = payload;
    
    logger.debug({ userId: payload.userId, path: req.path }, 'Auth successful');
    next();
  } catch (err: any) {
    logger.warn({ err, ip: req.ip, path: req.path }, 'Auth failed');
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized: Token expired' });
    }
    
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Express middleware to require specific roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JWTPayload | undefined;
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const hasRole = roles.some(role => user.roles.includes(role));
    
    if (!hasRole) {
      logger.warn({ userId: user.userId, requiredRoles: roles, userRoles: user.roles }, 'Insufficient permissions');
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * Login endpoint handler
 * In production, verify against Discord OAuth or database
 */
export async function handleLogin(req: Request, res: Response) {
  try {
    const { userId, password } = req.body;
    
    // TODO: Implement proper authentication
    // For now, check against BOT_OWNER_ID and a simple password
    const validUserId = process.env.BOT_OWNER_ID;
    const validPassword = process.env.ADMIN_PASSWORD || 'CHANGE_ME';
    
    // Production safety: refuse insecure defaults
    if (isProd && validPassword === 'CHANGE_ME') {
      logger.error('ADMIN_PASSWORD not set in production; refusing login');
      return res.status(500).json({ error: 'Server misconfigured: ADMIN_PASSWORD must be set in production.' });
    }
    
    if (userId === validUserId && password === validPassword) {
      const token = generateToken({
        userId,
        username: 'Admin',
        roles: ['admin', 'owner'],
      });
      
      logger.info({ userId }, 'Admin login successful');
      
      return res.json({
        token,
        expiresIn: JWT_EXPIRES_IN,
        user: { userId, username: 'Admin', roles: ['admin', 'owner'] },
      });
    }
    
    logger.warn({ userId, ip: req.ip }, 'Login failed: Invalid credentials');
    return res.status(401).json({ error: 'Invalid credentials' });
    
  } catch (err) {
    logger.error({ err }, 'Login error');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
