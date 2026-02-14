// src/lib/logger.ts
import pino from 'pino';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Ensure logs directory exists
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// Multi-stream transport: console + rotating files
const transport = isDev ? {
  targets: [
    // Pretty console output in development
    {
      target: 'pino-pretty',
      level: 'debug',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
    // Rotating file output
    {
      target: 'pino/file',
      level: 'debug',
      options: {
        destination: path.join(LOG_DIR, `discord-${new Date().toISOString().split('T')[0]}.log`),
        mkdir: true,
      },
    },
  ],
} : {
  targets: [
    // JSON output to stdout in production
    {
      target: 'pino/file',
      level: 'info',
      options: { destination: 1 }, // stdout
    },
    // Rotating file output
    {
      target: 'pino/file',
      level: 'info',
      options: {
        destination: path.join(LOG_DIR, `discord-${new Date().toISOString().split('T')[0]}.log`),
        mkdir: true,
      },
    },
  ],
};

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  
  transport,

  // Silence logs in test mode
  enabled: !isTest,

  // Base context
  base: {
    env: process.env.NODE_ENV,
    pid: process.pid,
  },

  // Custom serializers
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

// Child loggers for modules
export const createLogger = (module: string) => logger.child({ module });

// Request logger for Express
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip,
    }, 'HTTP Request');
  });
  
  next();
};

// Specialized logging functions for Vi's subsystems

/** Log Discord message events */
export function logMessageEvent(data: {
  messageId: string;
  author: { id: string; username: string; };
  channel: { id: string; name?: string; };
  guild?: { id: string; name?: string; };
  content: string;
  contentLength: number;
}) {
  logger.info({
    event: 'discord.message',
    ...data,
    contentPreview: data.content.substring(0, 100),
  }, `📨 Message from ${data.author.username}`);
}

/** Log slash command executions */
export function logCommand(data: {
  command: string;
  user: { id: string; username: string; };
  guild?: { id: string; name?: string; };
  options?: Record<string, any>;
  success: boolean;
  latencyMs?: number;
  error?: string;
}) {
  const level = data.success ? 'info' : 'error';
  logger[level]({
    event: 'command',
    ...data,
  }, `⚡ /${data.command} by ${data.user.username}`);
}

/** Log Brain pipeline stages */
export function logBrainStage(data: {
  stage: 'observer' | 'retriever' | 'planner' | 'executor' | 'reflector';
  messageId: string;
  userId: string;
  latencyMs?: number;
  details?: Record<string, any>;
  error?: string;
}) {
  const emoji = { observer: '👁️', retriever: '🔍', planner: '🧠', executor: '⚡', reflector: '💭' };
  const level = data.error ? 'error' : 'debug';
  
  logger[level]({
    event: 'brain.stage',
    ...data,
  }, `${emoji[data.stage]} Brain:${data.stage}`);
}

/** Log Memory API operations */
export function logMemoryOp(data: {
  operation: 'search' | 'upsert' | 'entity.fetch' | 'entity.create' | 'reflect';
  userId?: string;
  query?: string;
  entityId?: string;
  results?: number;
  latencyMs?: number;
  error?: string;
}) {
  const level = data.error ? 'error' : 'debug';
  logger[level]({
    event: 'memory',
    ...data,
  }, `🧠 Memory:${data.operation}`);
}

/** Log feature activity */
export function logFeature(data: {
  feature: string;
  action: string;
  userId?: string;
  guildId?: string;
  success: boolean;
  details?: Record<string, any>;
  error?: string;
}) {
  const level = data.success ? 'info' : 'error';
  logger[level]({
    event: 'feature',
    ...data,
  }, `🎯 ${data.feature}:${data.action}`);
}

/** Log startup sequence */
export function logStartup(phase: string, details?: Record<string, any>) {
  logger.info({
    event: 'startup',
    phase,
    ...details,
  }, `🚀 Startup:${phase}`);
}

/** Log shutdown sequence */
export function logShutdown(phase: string, details?: Record<string, any>) {
  logger.info({
    event: 'shutdown',
    phase,
    ...details,
  }, `🛑 Shutdown:${phase}`);
}

/** Log critical errors with full stack trace */
export function logCritical(message: string, error?: Error, context?: Record<string, any>) {
  logger.error({
    event: 'critical',
    err: error,
    stack: error?.stack,
    ...context,
  }, `🔥 CRITICAL: ${message}`);
}

// Log the log directory on import
logger.info({ logDir: LOG_DIR }, '📁 Logging initialized');
