import { z } from 'zod';

// Zod-based environment validation. We keep non-critical items as optional with warnings
// to avoid breaking existing setups, and enforce the truly critical ones.

const EnvSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  DISCORD_TOKEN: z.string().min(10, 'DISCORD_TOKEN is required and seems too short'),
  ADMIN_PORT: z.string().optional(),
  ADMIN_CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters'),

  // Services
  NATS_URL: z.string().optional(),
  MEMORY_API: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SQLITE_PATH: z.string().optional(),

  // Audio/Lavalink
  LAVALINK_HOST: z.string().optional(),
  LAVALINK_PORT: z.string().optional(),
  LAVALINK_PASSWORD: z.string().optional(),
  LAVALINK_SECURE: z.string().optional(),

  // AI / External
  OPENAI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }

  const env = parsed.data;

  // Production hardening checks
  const problems: string[] = [];
  const warnings: string[] = [];

  if (env.NODE_ENV === 'production') {
    // Disallow default Lavalink password in production
    if ((env.LAVALINK_PASSWORD || 'youshallnotpass') === 'youshallnotpass') {
      problems.push('LAVALINK_PASSWORD must be set to a secure value in production.');
    }
  }

  // Require at least one DB source
  if (!env.DATABASE_URL && !env.SQLITE_PATH) {
    warnings.push('Neither DATABASE_URL nor SQLITE_PATH is set. Prisma-backed features may be limited.');
  }

  // Soft requirements for AI/Voice stacks (warn only)
  if (!env.OPENAI_API_KEY) warnings.push('OPENAI_API_KEY not set. LLM features will be limited.');
  if (!env.ELEVENLABS_API_KEY) warnings.push('ELEVENLABS_API_KEY not set. TTS features are disabled.');
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) warnings.push('GOOGLE_APPLICATION_CREDENTIALS not set. STT features are disabled.');

  if (problems.length) {
    throw new Error('Critical environment issues:\n' + problems.map(p => `- ${p}`).join('\n'));
  }

  if (warnings.length) {
    console.warn('[ENV] Warnings:\n' + warnings.map(w => `- ${w}`).join('\n'));
  }

  return env;
}
