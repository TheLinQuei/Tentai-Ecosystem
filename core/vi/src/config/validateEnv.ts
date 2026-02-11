/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */

import { z } from 'zod';

/**
 * Define all environment variables with their validation schemas
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('localhost'),

  // Database
  DATABASE_URL: z.string().url('Invalid database URL').optional(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  DATABASE_TIMEOUT_MS: z.coerce.number().default(5000),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  JWT_EXPIRATION: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRATION: z.string().default('7d'),

  // LLM APIs
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),

  // Vector Database (Qdrant)
  QDRANT_URL: z.string().url('Invalid Qdrant URL').optional(),
  QDRANT_API_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Features
  ENABLE_STREAMING: z.enum(['true', 'false']).default('false'),
  ENABLE_MEMORY_CONSOLIDATION: z.enum(['true', 'false']).default('true'),
  MEMORY_CONSOLIDATION_INTERVAL_MS: z.coerce.number().default(3600000), // 1 hour

  // Security
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ENABLE_CORS: z.enum(['true', 'false']).default('true'),
  CSRF_PROTECTION_ENABLED: z.enum(['true', 'false']).default('true'),

  // Telemetry
  TELEMETRY_ENABLED: z.enum(['true', 'false']).default('false'),
  TELEMETRY_ENDPOINT: z.string().url().optional(),

  // Cache
  REDIS_URL: z.string().url('Invalid Redis URL').optional(),
  CACHE_TTL_SECONDS: z.coerce.number().default(3600)
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validated environment variables
 */
let validatedEnv: EnvConfig | null = null;

/**
 * Validate and load environment variables
 */
export function loadAndValidateEnv(): EnvConfig {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    const result = envSchema.parse(process.env);
    validatedEnv = result;

    // Don't log here - logger not initialized yet

    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `${path}: ${err.message}`;
        })
        .join('\n');

      console.error('❌ Configuration Error:');
      console.error(formattedErrors);
      console.error('\nPlease set all required environment variables.');

      process.exit(1);
    }

    console.error('❌ Unexpected error during environment validation:', error);
    process.exit(1);
  }
}

/**
 * Get validated environment configuration
 */
export function getEnv(): EnvConfig {
  if (!validatedEnv) {
    return loadAndValidateEnv();
  }
  return validatedEnv;
}

/**
 * Check if specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof EnvConfig): boolean {
  const env = getEnv();
  const value = env[feature];
  if (typeof value === 'string') {
    return value === 'true';
  }
  return Boolean(value);
}

/**
 * Get feature flag value
 */
export function getFeatureFlag(feature: keyof EnvConfig): boolean {
  const env = getEnv();
  const value = env[feature];
  if (typeof value === 'string') {
    return value === 'true';
  }
  return Boolean(value);
}

/**
 * Validate specific environment variable exists
 */
export function validateRequiredEnvVar(varName: string): string {
  const value = process.env[varName];
  if (!value) {
    const error = `Required environment variable not set: ${varName}`;
    console.error(error);
    throw new Error(error);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
export function getOptionalEnvVar(varName: string, defaultValue: string): string {
  return process.env[varName] || defaultValue;
}
