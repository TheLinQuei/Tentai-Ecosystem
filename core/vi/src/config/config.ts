import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

// Load .env file
loadDotenv();

const configSchema = z.object({
  node: z.object({
    env: z.enum(['development', 'test', 'production']).default('development'),
  }),
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().default(3000),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'stub']).default('stub'),
    apiKey: z.string().optional(),
    model: z.string().default('gpt-4o'),
    maxTokens: z.coerce.number().default(4096),
    temperature: z.coerce.number().min(0).max(2).default(0.7),
  }),
  auth: z.object({
    enabled: z.boolean().default(true),
    jwtSecret: z.string().default('dev-secret-change-in-production'),
  }),
  database: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.coerce.number().default(55432),
    user: z.string().default('postgres'),
    password: z.string().default('postgres'),
    name: z.string().default('vi'),
    ssl: z.boolean().default(false),
    url: z.string().optional(),
    poolSize: z.coerce.number().default(10),
    connectionTimeoutMs: z.coerce.number().default(5000),
    idleTimeoutMs: z.coerce.number().default(10000),
  }),
  telemetry: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('./telemetry'),
  }),
  tools: z.object({
    enabled: z.boolean().default(true),
    rateLimit: z.object({
      defaultCallsPerMinute: z.coerce.number().default(5),
    }),
    costTracking: z.object({
      enabled: z.boolean().default(false),
      creditsPerExecution: z.coerce.number().default(1),
      defaultCreditsPerUser: z.coerce.number().default(100),
    }),
    sandboxing: z.object({
      timeout: z.coerce.number().default(30000),
      memory: z.coerce.number().default(256),
    }),
  }),
  debug: z.object({
    enabled: z.boolean().default(false),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const providerChoice = process.env.VI_LLM_PROVIDER
    || (hasOpenAIKey ? 'openai'
    : hasAnthropicKey ? 'anthropic'
    : 'stub');

  const raw = {
    node: {
      env: process.env.NODE_ENV || 'development',
    },
    server: {
      host: process.env.VI_HOST || '0.0.0.0',
      // Honor PORT fallback to avoid hard binding conflicts
      port: process.env.VI_PORT || process.env.PORT || 3000,
    },
    logging: {
      level: process.env.VI_LOG_LEVEL || 'info',
    },
    llm: {
      provider: providerChoice,
      apiKey:
        process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || undefined,
      model: process.env.VI_LLM_MODEL || 'gpt-4o',
      maxTokens: process.env.VI_LLM_MAX_TOKENS || 4096,
      temperature: process.env.VI_LLM_TEMPERATURE || 0.7,
    },
    auth: {
      // Disable auth in test unless explicitly enabled via VI_AUTH_ENABLED=true
      // Or if VI_AUTH_ENABLED=false is set explicitly
      enabled:
        process.env.VI_AUTH_ENABLED !== undefined
          ? process.env.VI_AUTH_ENABLED.toLowerCase() === 'true'
          : (process.env.NODE_ENV || 'development') !== 'test',
      jwtSecret: process.env.VI_JWT_SECRET || 'dev-secret-change-in-production',
    },
    database: {
      host: process.env.VI_DB_HOST || '127.0.0.1',
      port: process.env.VI_DB_PORT || 55432,
      user: process.env.VI_DB_USER || 'postgres',
      password: process.env.VI_DB_PASSWORD || 'postgres',
      name: process.env.VI_DB_NAME || 'vi',
      ssl: process.env.VI_DB_SSL === 'true',
      url: process.env.DATABASE_URL,
      poolSize: process.env.VI_DB_POOL_SIZE || 10,
      connectionTimeoutMs: process.env.VI_DB_CONNECTION_TIMEOUT_MS || 5000,
      idleTimeoutMs: process.env.VI_DB_IDLE_TIMEOUT_MS || 10000,
    },
    telemetry: {
      enabled: process.env.VI_TELEMETRY_ENABLED !== 'false',
      path: process.env.VI_TELEMETRY_PATH || './telemetry',
    },
    tools: {
      enabled: process.env.VI_TOOLS_ENABLED !== 'false',
      rateLimit: {
        defaultCallsPerMinute: process.env.VI_TOOLS_RATE_LIMIT_DEFAULT || 5,
      },
      costTracking: {
        enabled: process.env.VI_TOOLS_COST_TRACKING_ENABLED === 'true',
        creditsPerExecution: process.env.VI_TOOLS_CREDITS_PER_EXECUTION || 1,
        defaultCreditsPerUser: process.env.VI_TOOLS_DEFAULT_CREDITS || 100,
      },
      sandboxing: {
        timeout: process.env.VI_TOOLS_TIMEOUT_MS || 30000,
        memory: process.env.VI_TOOLS_MEMORY_MB || 256,
      },
    },
    debug: {
      enabled: process.env.VI_DEBUG_MODE === 'true',
    },
  };

  const parsed = configSchema.parse(raw);

  const connectionUrl =
    parsed.database.url ||
    `postgres://${encodeURIComponent(parsed.database.user)}:${encodeURIComponent(parsed.database.password)}@${parsed.database.host}:${parsed.database.port}/${parsed.database.name}`;

  return {
    ...parsed,
    database: {
      ...parsed.database,
      url: connectionUrl,
    },
  };
}
