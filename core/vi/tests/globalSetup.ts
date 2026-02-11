import { execSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { Pool } from 'pg';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import { loadConfig } from '../src/config/config.js';
import { initializeLogger } from '../src/telemetry/logger.js';
import { initializeTelemetry } from '../src/telemetry/telemetry.js';
import { runMigrations } from '../src/db/migrations.js';
import { ConversationRepository } from '../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../src/db/repositories/messageRepository.js';
import { UserRepository } from '../src/db/repositories/UserRepository.js';
import { SessionRepository } from '../src/db/repositories/SessionRepository.js';
import { RelationshipResolver } from '../src/brain/RelationshipResolver.js';
import { BehaviorRulesEngine } from '../src/brain/BehaviorRulesEngine.js';
import { RelationshipRepository } from '../src/brain/RelationshipRepository.js';
import { PreferenceRepository } from '../src/brain/PreferenceRepository.js';
import { PreferencePersistenceEngine } from '../src/brain/PreferencePersistenceEngine.js';
import { PresenceEngine } from '../src/brain/presence/PresenceEngine.js';
import { CanonResolver } from '../src/brain/canon/CanonResolver.js';
import { IdentityResolver } from '../src/identity/IdentityResolver.js';
import { createServer } from '../src/runtime/server.js';

let app: Awaited<ReturnType<typeof createServer>> | null = null;
let pool: Pool | null = null;

async function ensurePostgres(connectionString: string): Promise<void> {
  // Try to bring up postgres via docker compose if available.
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker compose up -d postgres', { stdio: 'inherit' });
  } catch {
    // Docker not available; assume postgres is already running.
  }

  const timeoutMs = 60_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const probe = new Pool({ connectionString });
      await probe.query('SELECT 1');
      await probe.end();
      return;
    } catch (err) {
      const transient = (err as Error).message || 'unreachable';
      console.warn(`[globalSetup] Waiting for postgres: ${transient}`);
      await delay(2_000);
    }
  }
  throw new Error('Postgres not reachable within timeout');
}

export default async function globalSetup() {
  const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
  process.env.TEST_DATABASE_URL = dbUrl;
  process.env.DATABASE_URL = process.env.DATABASE_URL || dbUrl;
  process.env.VI_API_URL = process.env.VI_API_URL || 'http://127.0.0.1:0';
  process.env.VI_AUTH_ENABLED = process.env.VI_AUTH_ENABLED || 'false';
  process.env.VI_TELEMETRY_ENABLED = process.env.VI_TELEMETRY_ENABLED || 'false';
  process.env.VI_TOOLS_RATE_LIMIT_DEFAULT = process.env.VI_TOOLS_RATE_LIMIT_DEFAULT || '1000';
  process.env.VI_TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  await ensurePostgres(dbUrl);

  const config = loadConfig();
  initializeLogger(process.env.VI_LOG_LEVEL || 'error');
  initializeTelemetry('./test-telemetry', false);

  pool = new Pool({ connectionString: dbUrl });
  await runMigrations(pool);

  // Sanity check: ensure critical tables exist (guards against skipped migrations)
  await pool.query(`SELECT 1 FROM users LIMIT 1`).catch(async () => {
    // If missing, rerun migrations once more
    await runMigrations(pool!);
  });

  const conversationRepo = new ConversationRepository(pool);
  const messageRepo = new MessageRepository(pool);
  const userRepo = new UserRepository(pool);
  const sessionRepo = new SessionRepository(pool);
  const relationshipRepo = new RelationshipRepository(pool);
  const preferenceRepo = new PreferenceRepository(pool);
  const relationshipResolver = new RelationshipResolver(pool);
  const preferenceEngine = new PreferencePersistenceEngine(preferenceRepo);
  const behaviorEngine = new BehaviorRulesEngine();
  const presenceEngine = new PresenceEngine();
  const canonResolver = new CanonResolver();
  const identityResolver = new IdentityResolver(pool);

  app = await createServer({
    config,
    pool,
    conversationRepo,
    messageRepo,
    userRepo,
    sessionRepo,
    relationshipResolver,
    behaviorEngine,
    relationshipRepo,
    preferenceRepo,
    preferenceEngine,
    presenceEngine,
    canonResolver,
    identityResolver,
  });

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const port = typeof address === 'string'
    ? Number(address.split(':').pop())
    : (app.server.address() as AddressInfo).port;

  process.env.VI_API_URL = `http://127.0.0.1:${port}`;

  // Expose handles for teardown
  (globalThis as any).__vi_app = app;
  (globalThis as any).__vi_pool = pool;
}

