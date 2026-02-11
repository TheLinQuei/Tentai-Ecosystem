import { loadConfig } from './config/config.js';
import { initializeLogger } from './telemetry/logger.js';
import { initializeTelemetry } from './telemetry/telemetry.js';
import { initializeTracing } from './telemetry/tracing.js';
import { createServer, startServer } from './runtime/server.js';
import { getLogger } from './telemetry/logger.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrations.js';
import { ConversationRepository } from './db/repositories/conversationRepository.js';
import { MessageRepository } from './db/repositories/messageRepository.js';
import { UserRepository } from './db/repositories/UserRepository.js';
import { SessionRepository } from './db/repositories/SessionRepository.js';
import { UserProfileRepository } from './db/repositories/UserProfileRepository.js';
import { ProfileAuditRepository } from './db/repositories/ProfileAuditRepository.js';
import { UserProfileSignalRepository } from './db/repositories/UserProfileSignalRepository.js';
import { SelfModelRepository } from './db/repositories/SelfModelRepository.js';
import { BondRepository } from './db/repositories/BondRepository.js';
import { MultiDimensionalMemoryRepository } from './db/repositories/MultiDimensionalMemoryRepository.js';
import { OpenAIEmbeddingService, StubEmbeddingService } from './brain/memory/embeddings.js';
import { cacheSelfModel, loadSelfModelFromFile, SelfModel } from './config/selfModel.js';
import { loadAndValidateEnv } from './config/validateEnv.js';
import { IdentityResolver } from './identity/IdentityResolver.js';
import { RelationshipResolver } from './brain/RelationshipResolver.js';
import { BehaviorRulesEngine } from './brain/BehaviorRulesEngine.js';
import { RelationshipRepository } from './brain/RelationshipRepository.js';
import { PreferenceRepository } from './brain/PreferenceRepository.js';
import { PreferencePersistenceEngine } from './brain/PreferencePersistenceEngine.js';
import { PresenceEngine } from './brain/presence/PresenceEngine.js';
import { CanonResolver } from './brain/canon/CanonResolver.js';
import { ReasoningTraceRepository } from './db/repositories/ReasoningTraceRepository.js';
import { SafetyProfileRepository } from './db/repositories/SafetyProfileRepository.js';
import { LoyaltyContractRepository } from './db/repositories/LoyaltyContractRepository.js';

// Global error handlers — catch silent crashes
process.on('unhandledRejection', (reason: unknown) => {
  const logger = getLogger();
  logger.error({ reason }, 'UnhandledRejection — process would have crashed');
  console.error('[FATAL] UnhandledRejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  const logger = getLogger();
  logger.error({ error: err }, 'UncaughtException — process would have crashed');
  console.error('[FATAL] UncaughtException:', err);
  process.exit(1);
});

async function main(): Promise<void> {
  try {
    // PHASE 1: Validate environment variables before startup
    loadAndValidateEnv();
    
    // Load configuration
    const config = loadConfig();

    // Initialize logging
    initializeLogger(config.logging.level);
    const logger = getLogger();

    logger.info({ env: config.node.env }, 'Starting Vi runtime');

    // Initialize OpenTelemetry tracing (Phase 8)
    initializeTracing('vi-runtime');

    // Initialize telemetry
    const telemetry = initializeTelemetry(
      config.telemetry.path,
      config.telemetry.enabled
    );
    await telemetry.initialize();

    const pool = createPool(config);
    
    logger.info('Testing database connection...');
    try {
      await pool.query('SELECT 1');
      logger.info('Database connection successful');
    } catch (dbError) {
      logger.error({ error: dbError }, 'Database connection failed');
      throw dbError;
    }
    
    await runMigrations(pool);

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const userRepo = new UserRepository(pool);
    const sessionRepo = new SessionRepository(pool);
    const userProfileRepo = new UserProfileRepository(pool);
    const profileAuditRepo = new ProfileAuditRepository(pool);
    const selfModelRepo = new SelfModelRepository(pool);
    const userProfileSignalRepo = new UserProfileSignalRepository(pool);
    const bondRepo = new BondRepository(pool);

    // Initialize memory repository with embedding service
    const embeddingService = process.env.OPENAI_API_KEY
      ? new OpenAIEmbeddingService({ apiKey: process.env.OPENAI_API_KEY })
      : new StubEmbeddingService();
    const memoryRepo = new MultiDimensionalMemoryRepository(pool, embeddingService);

    // Load self model: prefer DB if present; seed from file if missing
    const fileSelfModel = loadSelfModelFromFile();
    let activeSelfModel: SelfModel | null = await selfModelRepo.getActive();
    if (!activeSelfModel) {
      await selfModelRepo.upsert(fileSelfModel);
      activeSelfModel = fileSelfModel;
    }
    cacheSelfModel(activeSelfModel);
    await selfModelRepo.logEvent({
      version: activeSelfModel.version,
      eventType: 'self_model_loaded',
      details: { source: activeSelfModel === fileSelfModel ? 'file_seed' : 'database' },
    });

    // Create and start HTTP server
        const relationshipRepo = new RelationshipRepository(pool);
    const preferenceRepo = new PreferenceRepository(pool);
    
    // PHASE 3: Initialize transparency repositories
    const reasoningTraceRepo = new ReasoningTraceRepository(pool);
    const safetyProfileRepo = new SafetyProfileRepository(pool);
    const loyaltyContractRepo = new LoyaltyContractRepository(pool);
    
    const relationshipResolver = new RelationshipResolver(pool);
    const behaviorEngine = new BehaviorRulesEngine();
    const preferenceEngine = new PreferencePersistenceEngine(preferenceRepo);
    const presenceEngine = new PresenceEngine();
    const canonResolver = new CanonResolver();

const identityResolver = new IdentityResolver(pool);
    const server = await createServer({
      config,
      pool,
      conversationRepo,
      messageRepo,
      userRepo,
      sessionRepo,
      userProfileRepo,
      profileAuditRepo,
      selfModel: activeSelfModel,
      selfModelRepo,
      signalRepo: userProfileSignalRepo,
      bondRepo,
      memoryRepo,      relationshipResolver,
      behaviorEngine,
      relationshipRepo,
      preferenceRepo,
      preferenceEngine,
      presenceEngine,
      canonResolver,

      identityResolver,
      
      // PHASE 3: Transparency repositories
      reasoningTraceRepo,
      safetyProfileRepo,
      loyaltyContractRepo,
    });
    await startServer(server, config);

    logger.info('Vi runtime is ready');

    // Optional: Scheduled decay refresh for user profile signals and bonds (daily)
    const decayMinutesEnv = Number(process.env.DECAY_REFRESH_INTERVAL_MINUTES || 0);
    const defaultMinutes = process.env.NODE_ENV === 'development' ? 60 : 1440; // hourly in dev, daily in prod
    const decayIntervalMs = (decayMinutesEnv > 0 ? decayMinutesEnv : defaultMinutes) * 60 * 1000;
    const decayTimer = setInterval(async () => {
      try {
        // Refresh signal weights
        const allSignals = await userProfileSignalRepo.getAll();
        const { calculateDecayedWeight } = await import('./brain/signalWeighting.js');
        const now = new Date();
        for (const s of allSignals) {
          const decayed = calculateDecayedWeight({
            type: s.signalType,
            value: s.value,
            weight: s.weight,
            confidence: s.confidence,
            firstObserved: s.firstObserved,
            lastObserved: s.lastObserved,
            observationCount: s.observationCount,
            decayFactor: s.decayFactor,
          }, now);
          // Persist decayed weight and reset lastObserved to now as baseline
          await userProfileSignalRepo.upsertSignal({
            userId: s.userId,
            signalType: s.signalType,
            value: s.value,
            weight: decayed,
            confidence: s.confidence,
            firstObserved: s.firstObserved,
            lastObserved: now.toISOString(),
            observationCount: s.observationCount,
            decayFactor: s.decayFactor,
          });
        }
        logger.info({ count: allSignals.length }, '[DECAY] Refreshed signal weights');

        // Optional: bulk signal merging per active user
        const activeUsersRes = await pool.query<{ user_id: string }>('SELECT DISTINCT user_id FROM sessions WHERE updated_at > now() - interval \"30 days\"');
        for (const row of activeUsersRes.rows) {
          const merged = await userProfileSignalRepo.mergeSimilarSignals(row.user_id).catch(() => 0);
          if (merged > 0) {
            logger.info({ userId: row.user_id, merged }, '[MERGE] Consolidated duplicate signals');
          }
        }

        // Refresh bond decay
        const allBonds = await bondRepo.getAll();
        const { applyBondDecay } = await import('./brain/bond.js');
        for (const b of allBonds) {
          const decayed = applyBondDecay(b, now);
          await bondRepo.upsert(decayed);
        }
        logger.info({ count: allBonds.length }, '[DECAY] Refreshed bond states');

        // Refresh memory decay (limit to active users only for performance)
        const activeUserIds = await pool.query<{ user_id: string }>(
          'SELECT DISTINCT user_id FROM sessions WHERE updated_at > now() - interval \'30 days\' LIMIT 1000'
        );
        for (const row of activeUserIds.rows) {
          const decayedCounts = await memoryRepo.applyDecay(row.user_id);
          logger.debug({ userId: row.user_id, decayedCounts }, '[DECAY] Refreshed memory relevance');
        }
        logger.info({ userCount: activeUserIds.rows.length }, '[DECAY] Refreshed memory decay');
      } catch (err) {
        logger.warn({ err }, '[DECAY] Failed to refresh decay');
      }
    }, decayIntervalMs);
    // On shutdown, clear interval
    process.on('SIGTERM', () => clearInterval(decayTimer));
    process.on('SIGINT', () => clearInterval(decayTimer));

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await server.close();
      await pool.end();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection');
      // Don't exit on unhandled rejection, just log it
    });
    
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      shutdown();
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

main();



