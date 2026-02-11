import pino, { Logger as PinoLogger } from 'pino';

let logger: PinoLogger | null = null;

export function initializeLogger(level: string): PinoLogger {
  if (logger) {
    return logger;
  }

  logger = pino({
    level,
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });

  return logger;
}

export function getLogger(): PinoLogger {
  if (!logger) {
    // In test environments, default to a silent logger to avoid crashes when initialization is skipped.
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return initializeLogger('silent');
    }
    throw new Error('Logger not initialized. Call initializeLogger first.');
  }
  return logger;
}

export type { PinoLogger as Logger };
