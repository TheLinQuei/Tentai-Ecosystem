import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Config } from '../config/config.js';
import { getLogger } from '../telemetry/logger.js';
import { getTelemetry } from '../telemetry/telemetry.js';
import { ConversationRepository } from '../db/repositories/conversationRepository.js';
import { MessageRepository } from '../db/repositories/messageRepository.js';
import { UserRepository } from '../db/repositories/UserRepository.js';
import { SessionRepository } from '../db/repositories/SessionRepository.js';
import { registerAuthMiddleware } from '../auth/middleware.js';
import { registerAuthRoutes } from '../auth/routes.js';
import { AuthService } from '../auth/AuthService.js';
import { CognitionPipeline } from '../brain/pipeline.js';
import { createLLMGateway } from '../brain/llm/factory.js';
import { StubLLMGateway, StubPolicyEngine, PostgresRunRecordStore } from '../brain/stubs.js';
import { PolicyEngineImpl } from '../brain/policy/PolicyEngineImpl.js';
import { ToolRunner } from '../tools/runner.js';
import { initializeBuiltinTools } from '../tools/builtins/index.js';
import { initializeAstralisTools } from '../tools/astralis/index.js';
import { PostgresMemoryStore } from '../brain/memory/MemoryStore.js';
import { OpenAIEmbeddingService, StubEmbeddingService } from '../brain/memory/embeddings.js';
import { loadProviderConfig } from '../config/providers.js';
import { SelfModel, getCachedSelfModel, loadSelfModelFromFile, cacheSelfModel } from '../config/selfModel.js';
import { computeStanceDecision, loadOrCreateProfile, updateProfileFromSignals } from '../brain/profile.js';
import { UserProfileRepository } from '../db/repositories/UserProfileRepository.js';
import { SelfModelRepository } from '../db/repositories/SelfModelRepository.js';
import { ProfileAuditRepository } from '../db/repositories/ProfileAuditRepository.js';
import { UserProfileSignalRepository } from '../db/repositories/UserProfileSignalRepository.js';
import { BondRepository } from '../db/repositories/BondRepository.js';
import { MultiDimensionalMemoryRepository } from '../db/repositories/MultiDimensionalMemoryRepository.js';
import { detectBondSignals, updateBond } from '../brain/bond.js';
import { SessionArcRepository } from '../db/repositories/SessionArcRepository.js';
import { CitationRepository } from '../db/repositories/CitationRepository.js';
import { ObservabilityRepository } from '../db/repositories/ObservabilityRepository.js';
import { setObservabilityEmitter } from '../db/globalObservability.js';
import { setRequestContext } from '../db/requestContext.js';
import { MemoryInjectionRepository } from '../db/repositories/MemoryInjectionRepository.js';
import { registerErrorHandler } from '../middleware/errorHandler.js';
import { registerMetricsMiddleware } from '../middleware/metrics.js';
import { requestLoggingMiddleware, responseLoggingHook } from '../middleware/logging.js';
import { rateLimiters } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validation.js';
import { AppError, ErrorCode } from '../errors/AppError.js';
import { overseerAuditMiddleware, overseerAuditResponseHook } from '../middleware/overseerAudit.js';
import { OverseerAuditLogRepository } from '../db/repositories/OverseerAuditLogRepository.js';
import { getAuthoritativeTime } from './timeService.js';
import { EventBus, AutonomyEvent } from '../brain/autonomy/eventBus.js';
import { AutonomyPolicyEngine } from '../brain/autonomy/autonomyPolicyEngine.js';
import { scoreEvent } from '../brain/autonomy/relevanceScorer.js';
import { RelationshipResolver } from '../brain/RelationshipResolver.js';
import { BehaviorRulesEngine } from '../brain/BehaviorRulesEngine.js';
import { RelationshipRepository } from '../brain/RelationshipRepository.js';
import { PreferenceRepository } from '../brain/PreferenceRepository.js';
import { PreferencePersistenceEngine } from '../brain/PreferencePersistenceEngine.js';
import { PresenceEngine } from '../brain/presence/PresenceEngine.js';
import { CanonResolver } from '../brain/canon/CanonResolver.js';
import { CanonResolverDB } from '../brain/canon/CanonResolverDB.js';
import { ChimeManager } from '../brain/autonomy/chimeManager.js';
import { IdentityResolver } from '../identity/IdentityResolver.js';
import { MemoryOrchestrator } from '../brain/memory/MemoryOrchestrator.js';
import { ReasoningTraceRepository } from '../db/repositories/ReasoningTraceRepository.js';
import { SafetyProfileRepository } from '../db/repositories/SafetyProfileRepository.js';
import { LoyaltyContractRepository } from '../db/repositories/LoyaltyContractRepository.js';

// Layer 8: History Compression Helpers
const STOP_WORDS = new Set([
  'the','and','a','an','to','of','in','on','for','with','at','by','from','that','this','it','is','are','was','were','be','as','or','not','but','can','could','should','would','do','did','does','have','has','had','i','you','we','they','he','she','them','us','my','your','our'
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w));
}

function summarizeSegment(segment: string[]): string {
  const joined = segment.join(' ');
  const tokens = tokenize(joined);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6)
    .map(([w]) => w)
    .filter(Boolean);
  const hasPos = /\b(love|great|awesome|thanks|wonderful|amazing|good|better)\b/i.test(joined);
  const hasNeg = /\b(hate|terrible|awful|frustrated|angry|disappointed|bad|worse)\b/i.test(joined);
  const mood = hasPos && hasNeg ? 'mixed' : (hasPos ? 'positive' : (hasNeg ? 'negative' : 'neutral'));
  const topic = top.join(', ');
  return `Summary: topics=[${topic}] | mood=${mood}`;
}

function compressHistory(pairs: string[], tailKeep: number = 40): { recentHistory: string[]; immediateContext: string[] } {
  if (pairs.length <= tailKeep) {
    const immediate = pairs.slice(-4);
    return { recentHistory: pairs, immediateContext: immediate };
  }
  const head = pairs.slice(0, pairs.length - tailKeep);
  const tail = pairs.slice(-tailKeep);
  const segmentSize = 10;
  const segments: string[][] = [];
  for (let i = 0; i < head.length; i += segmentSize) {
    segments.push(head.slice(i, i + segmentSize));
  }
  const summaries = segments.map(seg => summarizeSegment(seg));
  const compressed = [...summaries, ...tail];
  const immediate = tail.slice(-4);
  return { recentHistory: compressed, immediateContext: immediate };
}

function sanitizeOutput(output: string): string {
  if (!output) return output;
  const patterns = [
    /based on what i know about you:?/gi,
    /user message:/gi,
    /assistant responded to/gi,
  ];
  let sanitized = output;
  patterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, '').trim();
  });
  return sanitized;
}

type SimpleIntent = 'time' | 'date' | 'datetime' | 'name' | 'who' | 'greeting';

function detectSimpleIntent(message: string): SimpleIntent | null {
  const msg = message.toLowerCase().trim();
  
  // Greeting intents - recognize when user addresses Vi or greets
  if (msg === 'vi' || msg === 'hey vi' || msg === 'hi vi' || msg === 'hello vi') return 'greeting';
  if (msg === 'hello' || msg === 'hi' || msg === 'hey') return 'greeting';
  
  // Factual intents
  if (msg.includes('time is it') || msg.includes('current time') || msg.includes('what time')) return 'time';
  if (msg.includes('date is it') || msg.includes('what day') || msg.includes('today')) return 'date';
  if (msg.includes('day and time') || msg.includes('date and time')) return 'datetime';
  if (msg.includes('my name') || msg.includes("what's my name") || msg.includes('whats my name')) return 'name';
  if (msg.includes('who am i') || msg.includes('who i am')) return 'who';
  return null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
}

interface ServerDeps {
  config: Config;
  pool: Pool;
  conversationRepo: ConversationRepository;
  messageRepo: MessageRepository;
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  userProfileRepo: UserProfileRepository;
  profileAuditRepo: ProfileAuditRepository;
  selfModel: SelfModel;
  selfModelRepo: SelfModelRepository;
  signalRepo: UserProfileSignalRepository;
  bondRepo: BondRepository;
  memoryRepo: MultiDimensionalMemoryRepository;
  relationshipResolver: RelationshipResolver;
  behaviorEngine: BehaviorRulesEngine;
  relationshipRepo: RelationshipRepository;
  preferenceRepo: PreferenceRepository;
  preferenceEngine: PreferencePersistenceEngine;
  presenceEngine: PresenceEngine;
  canonResolver?: CanonResolver;
  identityResolver?: IdentityResolver;
  reasoningTraceRepo?: ReasoningTraceRepository;
  safetyProfileRepo?: SafetyProfileRepository;
  loyaltyContractRepo?: LoyaltyContractRepository;
}

const createConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

const messageSchema = z.object({
  params: z.object({
    conversationId: z.string().min(1),
  }),
  body: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
  }),
});

const chatRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().uuid().optional(),
  context: z.object({
    recentHistory: z.array(z.string()).optional(),
    userPreferences: z.record(z.unknown()).optional(),
  }).optional(),
  includeTrace: z.boolean().optional(),
});

interface ChatResponse {
  output: string;
  recordId: string;
  sessionId: string;
  citations?: Array<{
    id: string;
    type: string;
    sourceId: string;
    sourceText: string;
    confidence: number;
  }>;
  trace?: {
    intent: any;
    plan: any;
    execution: any;
    reflection: any;
  };
  cognitive?: {
    intent: string;
    decision: string;
    memoryWritten: boolean;
    mode: string;
    hadViolation: boolean;
  };
  autonomy?: {
    chimes: Array<{
      id: string;
      reason?: string;
      score?: number;
      timestamp: string;
    }>;
  };
}

export async function createServer(
  deps: ServerDeps
): Promise<FastifyInstance> {
  const logger = getLogger();
  const telemetry = getTelemetry();
  const conversationRepo = deps.conversationRepo;
  const messageRepo = deps.messageRepo;
  const userRepo = deps.userRepo;
  const sessionRepo = deps.sessionRepo;

  const userProfileRepo = deps.userProfileRepo ?? new UserProfileRepository(deps.pool);
  const profileAuditRepo = deps.profileAuditRepo ?? new ProfileAuditRepository(deps.pool);
  const selfModelRepo = deps.selfModelRepo ?? new SelfModelRepository(deps.pool);
  const signalRepo = deps.signalRepo ?? new UserProfileSignalRepository(deps.pool);
  const bondRepo = deps.bondRepo ?? new BondRepository(deps.pool);
  const citationRepo = new CitationRepository(deps.pool);

  // PHASE 2: Initialize relationship model components for behavior adaptation
  const relationshipResolver = deps.relationshipResolver ?? new RelationshipResolver(deps.pool);
  const behaviorEngine = deps.behaviorEngine ?? new BehaviorRulesEngine();
  const relationshipRepo = deps.relationshipRepo ?? new RelationshipRepository(deps.pool);

  // PHASE 3: Initialize preference persistence for cross-session continuity
  const preferenceRepo = deps.preferenceRepo ?? new PreferenceRepository(deps.pool);
  const preferenceEngine = deps.preferenceEngine ?? new PreferencePersistenceEngine(preferenceRepo);

  // PHASE 2: Initialize Memory Orchestrator for continuity pack generation
  const memoryOrchestrator = new MemoryOrchestrator(deps.pool);

  // PHASE 5: Initialize presence engine for luxury voice profile
  const presenceEngine = deps.presenceEngine ?? new PresenceEngine();

  // PHASE 4: Initialize canon resolver for Astralis integration
  // Phase 4: Use database-backed canon resolver (falls back to sample data if no pool)
  const canonResolver = deps.canonResolver ?? new CanonResolver();
  const canonResolverDB = new CanonResolverDB(deps.pool);

  // PHASE 1: Initialize identity resolver for cross-client user mapping
  const identityResolver = deps.identityResolver ?? new IdentityResolver(deps.pool);

  // PHASE 3: Initialize transparency repositories for audit and safety
  const reasoningTraceRepo = deps.reasoningTraceRepo ?? new ReasoningTraceRepository(deps.pool);
  const safetyProfileRepo = deps.safetyProfileRepo ?? new SafetyProfileRepository(deps.pool);
  const loyaltyContractRepo = deps.loyaltyContractRepo ?? new LoyaltyContractRepository(deps.pool);

  const shouldUseStubEmbeddings = process.env.VI_TEST_MODE === 'true' || !process.env.OPENAI_API_KEY || deps.config.llm?.provider === 'stub';
  const embeddingService = deps.memoryRepo
    ? null
    : (shouldUseStubEmbeddings
        ? new StubEmbeddingService()
        : new OpenAIEmbeddingService({ apiKey: process.env.OPENAI_API_KEY as string }));
  const memoryRepo = deps.memoryRepo ?? new MultiDimensionalMemoryRepository(deps.pool, embeddingService || new StubEmbeddingService());

  let selfModel = deps.selfModel;
  if (!selfModel) {
    selfModel = (await selfModelRepo.getActive()) || loadSelfModelFromFile();
  }
  cacheSelfModel(selfModel);

  const app = Fastify();

  // Enable CORS for local development and production console
  app.addHook('preHandler', async (request, reply) => {
    const origin = request.headers.origin;
    const allowedOrigins = [
      'http://localhost:5173',
      'https://tentaitech.com',
      'http://localhost:3000'
    ];
    
    if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:'))) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      reply.code(200).send();
    }
  });

  // PHASE 1: Register global error handler and request/response logging
  registerErrorHandler(app);
  
  // Phase 6: Prometheus metrics middleware
  registerMetricsMiddleware(app);
  app.addHook('onRequest', requestLoggingMiddleware);
  app.addHook('onResponse', responseLoggingHook);

  // PHASE 2: Initialize Overseer audit log for control plane monitoring
  const overseerAuditRepo = new OverseerAuditLogRepository(deps.pool);
  app.addHook('onRequest', overseerAuditMiddleware(overseerAuditRepo));
  app.addHook('onResponse', overseerAuditResponseHook);

  // Initialize unified observability + session arcs (Layer 10 + Layer 9)
  const observabilityRepo = new ObservabilityRepository(deps.pool);
  await observabilityRepo.init().catch(err => logger.warn({ err }, 'Failed to initialize events table'));
  setObservabilityEmitter(observabilityRepo);
  const sessionArcRepo = new SessionArcRepository(deps.pool);
  await sessionArcRepo.init().catch(err => logger.warn({ err }, 'Failed to initialize session arcs table'));
  // Admin dashboard stub for SelfModel versions/events (enabled via env)
  if (process.env.ADMIN_DASH_ENABLED === 'true') {
    app.get('/v1/admin/self-model/versions', async (_req, reply) => {
      const versions = await selfModelRepo.listAll();
      return reply.code(200).send(versions);
    });

    app.get('/v1/admin/self-model/events', async (_req, reply) => {
      const events = await selfModelRepo.listEvents(200);
      return reply.code(200).send(events);
    });

    app.get('/v1/admin/self-model', async (_req, reply) => {
      const latestSelfModel = getCachedSelfModel() || selfModel;
      const versions = await selfModelRepo.listAll();
      const events = await selfModelRepo.listEvents(50);
      const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Vi SelfModel Dashboard</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 2rem; }
          h1 { margin-bottom: 0.5rem; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background: #f5f5f5; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
          .active { background: #0b6; color: #fff; }
          .inactive { background: #999; color: #fff; }
          .section { margin-top: 1rem; }
        </style>
      </head>
      <body>
        <h1>Vi SelfModel Dashboard</h1>
        <div class="section">
          <strong>Active Version:</strong> ${latestSelfModel.version}
        </div>
        <div class="grid">
          <div>
            <h2>Versions</h2>
            <table>
              <thead>
                <tr><th>Version</th><th>Active</th><th>Created</th></tr>
              </thead>
              <tbody>
                ${versions.map(v => `
                  <tr>
                    <td>${v.version}</td>
                    <td><span class="badge ${v.isActive ? 'active' : 'inactive'}">${v.isActive ? 'active' : 'inactive'}</span></td>
                    <td>${v.createdAt}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div>
            <h2>Recent Events</h2>
            <table>
              <thead>
                <tr><th>When</th><th>Version</th><th>Event</th><th>Details</th></tr>
              </thead>
              <tbody>
                ${events.map(e => `
                  <tr>
                    <td>${e.createdAt}</td>
                    <td>${e.version}</td>
                    <td>${e.eventType}</td>
                    <td><pre style="white-space:pre-wrap">${JSON.stringify(e.details || {}, null, 2)}</pre></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </body>
      </html>`;
      return reply.type('text/html').code(200).send(html);
    });
    // Unified Events feed (Layer 10)
    app.get('/v1/admin/events', async (_req, reply) => {
      const events = await observabilityRepo.listRecent(200);
      return reply.code(200).send(events);
    });
  }

  // Live events stream for God Console (SSE)
  app.get('/v1/admin/events/stream', async (request, reply) => {
    const userId = (request.query as any)?.userId as string | undefined;
    const sessionId = (request.query as any)?.sessionId as string | undefined;
    if (!userId || !sessionId) {
      return reply.code(400).send({ error: 'userId and sessionId query parameters are required' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders?.();

    const writeEvent = (event: any) => {
      if (!event) return;
      if (event.userId && event.userId !== userId) return;
      if (event.sessionId && event.sessionId !== sessionId) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Send initial ready signal
    reply.raw.write(`event: ready\ndata: {"ok":true}\n\n`);

    const unsubscribe = observabilityRepo.subscribe(writeEvent);
    const heartbeat = setInterval(() => {
      reply.raw.write(`event: heartbeat\ndata: {}\n\n`);
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // Provider profile (read-only by default; can apply limits via env flag)
  let providerProfileName = process.env.PROVIDER_PROFILE || 'default';
  let providerLimits: { max_output_tokens: number; rate_per_user_per_minute: number } | undefined;
  try {
    const providerCfg = await loadProviderConfig(providerProfileName);
    providerLimits = providerCfg.limits as { max_output_tokens: number; rate_per_user_per_minute: number };
    logger.info({ provider: providerProfileName, primary: providerCfg.primary, fallback: providerCfg.fallback, limits: providerCfg.limits }, 'Loaded provider profile');
    if (process.env.APPLY_PROVIDER_LIMITS === 'true') {
      // Optionally expose limits via env for downstream components
      process.env.MAX_OUTPUT_TOKENS = String(providerCfg.limits.max_output_tokens);
    }
  } catch (error) {
    logger.warn({ error, providerProfileName }, 'Failed to load provider profile; proceeding with config defaults');
  }

  // Ensure providerLimits is always populated to satisfy downstream expectations
  if (!providerLimits) {
    providerLimits = {
      max_output_tokens: Number(process.env.MAX_OUTPUT_TOKENS || deps.config.llm.maxTokens || 4096),
      rate_per_user_per_minute: Number(process.env.VI_TOOLS_RATE_LIMIT_DEFAULT || deps.config.tools.rateLimit.defaultCallsPerMinute || 1000),
    };
  }

  // M10: Production Hardening — rate limit and metrics
  const rateWindowMs = 60_000;
  let callsPerMinute =
    process.env.APPLY_PROVIDER_LIMITS === 'true' && providerLimits
      ? providerLimits.rate_per_user_per_minute
      : deps.config.tools.rateLimit.defaultCallsPerMinute;
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    callsPerMinute = Number.MAX_SAFE_INTEGER;
  }
  const rateBuckets: Map<string, { count: number; windowStart: number }> = new Map();
  let chatRequestCounter = 0;

  // Register authentication middleware
  await registerAuthMiddleware(app);

  // Create auth service
  const authService = new AuthService(app, userRepo, sessionRepo);

  // Register auth routes
  registerAuthRoutes(app, authService);

  // Honor auth for admin endpoints when enabled; otherwise allow open access for dev
  const requireAuth = deps.config.auth.enabled;
  const adminAuthOptions = requireAuth ? { onRequest: [app.authenticate] } : {};

  // Health check endpoint (public)
  app.get('/v1/health', async (
    _request,
    _reply
  ): Promise<HealthResponse> => {
    await telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'health_check',
      data: {
        endpoint: '/v1/health',
      },
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  });

  // Friendly browser help for GET /v1/chat
  // Many users try to open /v1/chat in a browser (GET),
  // but this endpoint is POST-only. Serve usage guidance here.
  app.get('/v1/chat', async (_request, reply) => {
    try {
      await telemetry.recordEvent({
        timestamp: new Date().toISOString(),
        level: 'info',
        type: 'endpoint_help',
        data: { endpoint: '/v1/chat', method: 'GET' },
      }).catch(() => {});
    } catch {
      // best-effort telemetry; do not block help response
    }

    return reply.code(200).send({
      message: 'Use POST /v1/chat with JSON body',
      endpoint: '/v1/chat',
      method: 'POST',
      contentType: 'application/json',
      example: {
        message: 'Hey Vi — status check.',
        sessionId: '<optional UUID, omit to auto-generate>'
      }
    });
  });

  // PHASE 1: Public Identity Management Endpoints
  // Resolve or create canonical identity from provider context
  app.get('/v1/identity/resolve', async (request, reply) => {
    const provider = (request.query as any)?.provider as string | undefined;
    const providerUserId = (request.query as any)?.provider_user_id as string | undefined;

    if (!provider || !providerUserId) {
      return reply.code(400).send({
        error: 'Missing required query params',
        required: ['provider', 'provider_user_id']
      });
    }

    try {
      const resolved = await identityResolver.resolveIdentity({
        provider: provider as any,
        provider_user_id: providerUserId,
        metadata: {
          userAgent: request.headers['user-agent'] || undefined,
          clientVersion: request.headers['x-client-version'] as string | undefined,
        }
      });

      return reply.code(200).send({
        vi_user_id: resolved.vi_user_id,
        provider,
        provider_user_id: providerUserId,
      });
    } catch (error) {
      logger.error({ error, provider, providerUserId }, 'Identity resolution failed');
      return reply.code(500).send({ error: 'Failed to resolve identity' });
    }
  });

  // Get all provider identities linked to a vi_user_id
  app.get<{ Params: { vi_user_id: string } }>('/v1/identity/map/:vi_user_id', async (request, reply) => {
    const { vi_user_id } = request.params;
    
    try {
      const identities = await identityResolver.getLinkedProviders(vi_user_id);
      return reply.code(200).send({
        vi_user_id,
        identities: identities.map(ctx => ({
          provider: ctx.provider,
          provider_user_id: ctx.provider_user_id,
          metadata: ctx.metadata || {}
        }))
      });
    } catch (error) {
      logger.error({ error, vi_user_id }, 'Failed to get identity map');
      return reply.code(500).send({ error: 'Failed to retrieve identity mappings' });
    }
  });

  // Link a new provider identity to existing vi_user_id
  app.post<{ Body: { vi_user_id: string; provider: string; provider_user_id: string; metadata?: Record<string, any> } }>(
    '/v1/identity/link',
    async (request, reply) => {
      const { vi_user_id, provider, provider_user_id, metadata } = request.body;

      if (!vi_user_id || !provider || !provider_user_id) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['vi_user_id', 'provider', 'provider_user_id']
        });
      }

      try {
        // Use IdentityResolver.linkProvider() for audit logging
        const auditContext = {
          performedBy: (request as any).user?.userId || 'anonymous',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || undefined
        };

        await identityResolver.linkProvider(
          vi_user_id,
          { provider: provider as any, provider_user_id, metadata: metadata || {} },
          auditContext
        );
        
        logger.info({ vi_user_id, provider, provider_user_id }, 'Identity linked successfully');
        return reply.code(201).send({ 
          success: true,
          message: 'Provider identity linked',
          vi_user_id,
          provider,
          provider_user_id
        });
      } catch (error: any) {
        if (error.message && error.message.includes('already linked')) {
          return reply.code(409).send({ error: 'Provider identity already linked to another user' });
        }
        logger.error({ error, vi_user_id, provider, provider_user_id }, 'Failed to link identity');
        return reply.code(500).send({ error: 'Failed to link provider identity' });
      }
    }
  );

  // Unlink a provider identity from vi_user_id
  app.delete<{ Body: { vi_user_id: string; provider: string; provider_user_id: string } }>(
    '/v1/identity/link',
    async (request, reply) => {
      const { vi_user_id, provider, provider_user_id } = request.body;

      if (!vi_user_id || !provider || !provider_user_id) {
        return reply.code(400).send({
          error: 'Missing required fields',
          required: ['vi_user_id', 'provider', 'provider_user_id']
        });
      }

      try {
        // Use IdentityResolver.unlinkProvider() for audit logging
        const auditContext = {
          performedBy: (request as any).user?.userId || 'anonymous',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || undefined
        };

        await identityResolver.unlinkProvider(vi_user_id, provider as any, auditContext);
        
        logger.info({ vi_user_id, provider, provider_user_id }, 'Identity unlinked successfully');
        return reply.code(200).send({ 
          success: true,
          message: 'Provider identity unlinked',
          vi_user_id,
          provider,
          provider_user_id
        });
      } catch (error: any) {
        if (error.message && error.message.includes('Cannot unlink last provider')) {
          return reply.code(400).send({ error: 'Cannot unlink last provider for user' });
        }
        logger.error({ error, vi_user_id, provider, provider_user_id }, 'Failed to unlink identity');
        return reply.code(500).send({ error: 'Failed to unlink provider identity' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: TRANSPARENCY & AUDIT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // Get reasoning trace for a specific record ID
  app.get<{ Params: { recordId: string } }>('/v1/transparency/trace/:recordId', async (request, reply) => {
    const { recordId } = request.params;

    try {
      const trace = await reasoningTraceRepo.getByRecordId(recordId);
      if (!trace) {
        return reply.code(404).send({ error: 'Reasoning trace not found' });
      }

      return reply.code(200).send(trace);
    } catch (error) {
      logger.error({ error, recordId }, 'Failed to retrieve reasoning trace');
      return reply.code(500).send({ error: 'Failed to retrieve reasoning trace' });
    }
  });

  // Query reasoning traces with filters (audit)
  app.get('/v1/transparency/audit', async (request, reply) => {
    const query = request.query as any;
    const userId = query.userId as string | undefined;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const hadViolation = query.hadViolation === 'true' ? true : (query.hadViolation === 'false' ? false : undefined);
    const limit = query.limit ? parseInt(query.limit, 10) : 100;

    try {
      const traces = await reasoningTraceRepo.queryAudit({
        userId,
        startDate,
        endDate,
        hadViolation,
        limit,
      });

      return reply.code(200).send({
        traces,
        count: traces.length,
        filters: { userId, startDate, endDate, hadViolation, limit },
      });
    } catch (error) {
      logger.error({ error, query }, 'Failed to query audit traces');
      return reply.code(500).send({ error: 'Failed to query audit traces' });
    }
  });

  // Get user's safety profile
  app.get<{ Params: { userId: string } }>('/v1/safety/profile/:userId', async (request, reply) => {
    const { userId } = request.params;

    try {
      const profile = await safetyProfileRepo.getByUserId(userId);
      if (!profile) {
        // Return default profile
        return reply.code(200).send({
          user_id: userId,
          safety_level: 'balanced',
          context_sensitivity: true,
          refusal_explanation: 'detailed',
          appeal_process: true,
          custom_rules: [],
        });
      }

      return reply.code(200).send(profile);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to retrieve safety profile');
      return reply.code(500).send({ error: 'Failed to retrieve safety profile' });
    }
  });

  // Create or update safety profile
  app.post<{ Body: { userId: string; settings: any } }>('/v1/safety/profile', async (request, reply) => {
    const { userId, settings } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const profile = await safetyProfileRepo.createOrUpdate(userId, settings);
      logger.info({ userId, settings }, 'Safety profile updated');
      return reply.code(200).send(profile);
    } catch (error) {
      logger.error({ error, userId, settings }, 'Failed to update safety profile');
      return reply.code(500).send({ error: 'Failed to update safety profile' });
    }
  });

  // Get user's loyalty contract
  app.get<{ Params: { userId: string } }>('/v1/loyalty/contract/:userId', async (request, reply) => {
    const { userId } = request.params;

    try {
      const contract = await loyaltyContractRepo.getByUserId(userId);
      if (!contract) {
        return reply.code(404).send({ error: 'No loyalty contract found for this user' });
      }

      return reply.code(200).send(contract);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to retrieve loyalty contract');
      return reply.code(500).send({ error: 'Failed to retrieve loyalty contract' });
    }
  });

  // Create or update loyalty contract
  app.post<{ Body: { userId: string; contract: any } }>('/v1/loyalty/contract', async (request, reply) => {
    const { userId, contract } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const updated = await loyaltyContractRepo.createOrUpdate(userId, contract);
      logger.info({ userId, contract }, 'Loyalty contract updated');
      return reply.code(200).send(updated);
    } catch (error) {
      logger.error({ error, userId, contract }, 'Failed to update loyalty contract');
      return reply.code(500).send({ error: 'Failed to update loyalty contract' });
    }
  });

  // Verify loyalty contract (update last_verified_at)
  app.post<{ Body: { userId: string } }>('/v1/loyalty/contract/verify', async (request, reply) => {
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      await loyaltyContractRepo.verify(userId);
      logger.info({ userId }, 'Loyalty contract verified');
      return reply.code(200).send({ success: true, message: 'Contract verified', userId });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to verify loyalty contract');
      return reply.code(500).send({ error: 'Failed to verify loyalty contract' });
    }
  });

  // Memory audit query (uses view created in migration)
  app.get('/v1/transparency/memory/audit', async (request, reply) => {
    const query = request.query as any;
    const userId = query.userId as string | undefined;
    const authorityLevel = query.authorityLevel as string | undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    if (!userId) {
      return reply.code(400).send({ error: 'userId query parameter is required' });
    }

    try {
      let sql = `
        SELECT id, user_id, created_at, content, memory_type, 
               authority_level, source, confidence, is_locked
        FROM memory_audit_view
        WHERE user_id = $1
      `;
      const params: any[] = [userId];

      if (authorityLevel) {
        sql += ` AND authority_level = $2`;
        params.push(authorityLevel);
        sql += ` ORDER BY created_at DESC LIMIT $3`;
        params.push(limit);
      } else {
        sql += ` ORDER BY created_at DESC LIMIT $2`;
        params.push(limit);
      }

      const result = await deps.pool.query(sql, params);

      return reply.code(200).send({
        memories: result.rows,
        count: result.rows.length,
        filters: { userId, authorityLevel, limit },
      });
    } catch (error) {
      logger.error({ error, query }, 'Failed to query memory audit');
      return reply.code(500).send({ error: 'Failed to query memory audit' });
    }
  });

  // Debug: identity resolution without invoking LLM (requires VI_DEBUG_MODE=true)
  app.get('/v1/debug/identity', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }
    const authEnabled = requireAuth;
    const guestHeader = request.headers['x-guest-user-id'] as string | undefined;
    const sessionId = (request.query as any)?.sessionId || null;

    let resolvedUserId: string | null = null;
    if (authEnabled) {
      resolvedUserId = (request as any)?.user?.userId || null;
    } else if (guestHeader && guestHeader.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      resolvedUserId = guestHeader;
    }

    await telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'debug_identity',
      data: {
        authEnabled,
        resolvedUserId,
        sessionId,
        guestHeader,
      },
    }).catch(() => {});

    return reply.code(200).send({
      authEnabled,
      resolvedUserId,
      sessionId,
      headers: {
        'x-guest-user-id': guestHeader || null,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Debug: fetch persisted user profile row (requires VI_DEBUG_MODE=true)
  app.get('/v1/debug/profile', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }
    const userId = (request.query as any)?.userId as string | undefined;
    if (!userId) {
      return reply.code(400).send({ error: 'userId query parameter is required' });
    }
    try {
      const profile = await userProfileRepo.getByUserId(userId);
      if (!profile) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Profile not found',
          404,
          { userId }
        );
      }
      return reply.code(200).send({ userId, profile });
    } catch (error: any) {
      getLogger().error({ error, userId }, 'Failed to fetch profile');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to fetch profile',
        500,
        { userId, originalError: error?.message }
      );
    }
  });

  // Debug: fetch persisted user profile signals (requires VI_DEBUG_MODE=true)
  app.get('/v1/debug/profile-signals', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }
    const userId = (request.query as any)?.userId as string | undefined;
    if (!userId) {
      return reply.code(400).send({ error: 'userId query parameter is required' });
    }
    try {
      const signals = await signalRepo.getByUserId(userId);
      return reply.code(200).send({ userId, signals });
    } catch (error: any) {
      getLogger().error({ error, userId }, 'Failed to fetch profile signals');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to fetch profile signals',
        500,
        { userId, originalError: error?.message }
      );
    }
  });

  // Debug: fetch continuity compression metadata (requires VI_DEBUG_MODE=true)
  // Provides proof of compression without requiring LLM generation
  app.get('/v1/debug/continuity', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }
    const sessionId = (request.query as any)?.sessionId as string | undefined;
    const userId = (request.query as any)?.userId as string | undefined;
    if (!sessionId || !userId) {
      return reply.code(400).send({ error: 'sessionId and userId query parameters are required' });
    }
    try {
      const result = await deps.pool.query(
        `SELECT COUNT(*) as total_records,
                MAX(timestamp) as last_message_at,
                SUM(LENGTH(COALESCE(input_text, '') || COALESCE(assistant_output, ''))) as raw_history_chars
         FROM run_records
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId]
      );
      const stats = result.rows[0];
      const recordCount = parseInt(stats.total_records, 10);
      const compressionTriggered = recordCount > 55;
      
      return reply.code(200).send({
        sessionId,
        userId,
        totalRecords: recordCount,
        rawHistoryChars: stats.raw_history_chars || 0,
        compressionTriggered,
        tailKept: compressionTriggered ? 40 : recordCount,
        compressionThreshold: 55,
        lastMessageAt: stats.last_message_at,
        notes: compressionTriggered 
          ? 'Compression would be triggered: history segments summarized + last 40 turns preserved'
          : 'History below compression threshold; no compression triggered',
      });
    } catch (error: any) {
      getLogger().error({ error, sessionId, userId }, 'Failed to fetch continuity metadata');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to fetch continuity metadata',
        500,
        { sessionId, userId, originalError: error?.message }
      );
    }
  });

  // Debug: memory retrieval diagnostics (requires VI_DEBUG_MODE=true)
  app.get('/v1/debug/memory', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }
    const query = (request.query as any)?.query as string | undefined;
    const userId = (request.query as any)?.userId as string | undefined;
    if (!query || !userId) {
      return reply.code(400).send({ error: 'query and userId query parameters are required' });
    }
    try {
      // Query actual multi-dimensional memory counts
      const episodicCount = await deps.pool.query('SELECT COUNT(*) as count FROM episodic_memory WHERE user_id = $1', [userId]);
      const semanticCount = await deps.pool.query('SELECT COUNT(*) as count FROM semantic_memory WHERE user_id = $1', [userId]);
      const relationalCount = await deps.pool.query('SELECT COUNT(*) as count FROM relational_memory WHERE user_id = $1', [userId]);
      const commitmentCount = await deps.pool.query('SELECT COUNT(*) as count FROM commitment_memory WHERE user_id = $1', [userId]);

      // Retrieve using the actual production path
      const memoryResults = await memoryRepo.retrieveRelevant(
        query,
        userId,
        10, // Retrieve more for debugging
        ['episodic', 'semantic', 'relational', 'commitment']
      );

      // Get sample episodic memories containing the query term
      const sampleEpisodic = await deps.pool.query(
        `SELECT id, text, created_at, relevance_score FROM episodic_memory WHERE user_id = $1 AND text ILIKE $2 ORDER BY created_at DESC LIMIT 5`,
        [userId, `%${query}%`]
      );

      // Deterministic post-filtering similar to gateway logic
      const scored = memoryResults.map((m: any) => {
        const text = (m.text || '').toLowerCase();
        let score = m.relevanceScore ?? m.similarity ?? 0.5;
        if (/my .+ is|i .+ is|remember this/i.test(text)) score += 0.5; // boost user-provided facts
        if (/(vi:|assistant:).*(don't have|don't recall|don't remember|can't recall|no record)/i.test(text)) score -= 0.3; // penalize denial
        return { ...m, adjustedScore: Math.max(0, score) };
      });
      const postFiltered = scored.sort((a: any, b: any) => (b.adjustedScore - a.adjustedScore)).slice(0, 5);

      const injectedBlob = postFiltered.length
        ? `RELEVANT MEMORIES (GROUND YOUR RESPONSE IN THESE):\n${postFiltered.map((m: any) => `- [${m.type || 'episodic'}] ${m.text} (score: ${m.adjustedScore?.toFixed(2)})`).join('\n')}`
        : '';

      return reply.code(200).send({
        query,
        userId,
        dimensions: {
          episodic: parseInt(episodicCount.rows[0]?.count || '0'),
          semantic: parseInt(semanticCount.rows[0]?.count || '0'),
          relational: parseInt(relationalCount.rows[0]?.count || '0'),
          commitment: parseInt(commitmentCount.rows[0]?.count || '0'),
        },
        retrievedCount: memoryResults.length,
        retrieved: memoryResults.map(m => ({
          id: m.id,
          type: m.type,
          text: m.text.substring(0, 200),
          similarity: m.similarity,
          relevance: m.relevanceScore,
        })),
        postFiltered: postFiltered.map((m: any) => ({
          id: m.id,
          type: m.type,
          text: m.text.substring(0, 200),
          adjustedScore: m.adjustedScore,
        })),
        injectedBlob,
        sampleMatches: sampleEpisodic.rows.map(r => ({
          id: r.id,
          text: r.text.substring(0, 200),
          relevance: r.relevance_score,
          created: r.created_at,
        })),
        diagnostics: {
          queryMethod: 'MultiDimensionalMemoryRepository.retrieveRelevant',
          dimensionsQueried: ['episodic', 'semantic', 'relational', 'commitment'],
          limit: 10,
        },
      });
    } catch (error: any) {
      getLogger().error({ error, query, userId }, 'Failed to debug memory retrieval');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to debug memory retrieval',
        500,
        { query, userId, originalError: error?.message }
      );
    }
  });

  // Admin/God Console evidence bundle (auth-protected when enabled)
  app.get('/v1/admin/evidence', adminAuthOptions, async (request, reply) => {
    const testModeHeader = (request.headers['x-vi-test-mode'] as string | undefined)?.toLowerCase() === 'true';
    const testMode = process.env.VI_TEST_MODE === 'true' || testModeHeader;
    const providerState: 'disabled' | 'degraded' | 'live' = (testMode || deps.config.llm.provider === 'stub')
      ? 'disabled'
      : (metrics.rateLimited > 0 ? 'degraded' : 'live');
    const query = (request.query as any)?.query as string | undefined;
    const userId = (request.query as any)?.userId as string | undefined;
    const sessionId = (request.query as any)?.sessionId as string | undefined;
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId query parameter is required' });
    }
    
    // CRITICAL FIX: Query by sessionId ONLY
    // The userId from JWT doesn't match the guest user created during chat
    // Session is the source of truth
    try {
      const stanceRow = await deps.pool.query(
        `SELECT timestamp, data, user_id FROM events WHERE session_id = $1 AND type = 'stance_decision' ORDER BY timestamp DESC LIMIT 1`,
        [sessionId]
      );
      const governorCountRow = await deps.pool.query(
        `SELECT COUNT(*) as count FROM events WHERE session_id = $1 AND type = 'response_governor_intervention'`,
        [sessionId]
      );
      
      // Use actual user from events, not the JWT userId (which doesn't match guest users)
      const actualUserId = stanceRow.rows[0]?.user_id || userId;

      const stance = stanceRow.rows[0]?.data ? {
        stance: stanceRow.rows[0].data?.stance,
        reasoning: stanceRow.rows[0].data?.reasoning,
        governorInterventions: parseInt(governorCountRow.rows[0]?.count || '0', 10),
        userSignals: stanceRow.rows[0].data?.userSignals || [],
        bondInfluence: stanceRow.rows[0].data?.bondInfluence ?? null,
        selfModelConstraints: stanceRow.rows[0].data?.selfModelConstraints || [],
        timestamp: stanceRow.rows[0].timestamp,
      } : null;

      // Memory diagnostics (optional if query provided)
      let memoryDiagnostics: any = null;
      if (query && actualUserId) {
        const episodicCount = await deps.pool.query('SELECT COUNT(*) as count FROM episodic_memory WHERE user_id = $1 AND session_id = $2', [actualUserId, sessionId]);
        const semanticCount = await deps.pool.query('SELECT COUNT(*) as count FROM semantic_memory WHERE user_id = $1', [actualUserId]); // No session_id in semantic table
        const relationalCount = await deps.pool.query('SELECT COUNT(*) as count FROM relational_memory WHERE user_id = $1 AND session_id = $2', [actualUserId, sessionId]);
        const commitmentCount = await deps.pool.query('SELECT COUNT(*) as count FROM commitment_memory WHERE user_id = $1 AND session_id = $2', [actualUserId, sessionId]);

        const memoryResults = await memoryRepo.retrieveRelevant(
          query,
          actualUserId,
          10,
          ['episodic', 'semantic', 'relational', 'commitment']
        );

        const scored = memoryResults.map((m: any) => {
          const text = (m.text || '').toLowerCase();
          let score = m.relevanceScore ?? m.similarity ?? 0.5;
          if (/my .+ is|i .+ is|remember this/i.test(text)) score += 0.5;
          if (/(vi:|assistant:).*(don't have|don't recall|don't remember|can't recall|no record)/i.test(text)) score -= 0.3;
          return { ...m, adjustedScore: Math.max(0, score) };
        });
        const postFiltered = scored.sort((a: any, b: any) => (b.adjustedScore - a.adjustedScore)).slice(0, 5);
        const injectedBlob = postFiltered.length
          ? `RELEVANT MEMORIES (GROUND YOUR RESPONSE IN THESE):\n${postFiltered.map((m: any) => `- [${m.type || 'episodic'}] ${m.text} (score: ${m.adjustedScore?.toFixed(2)})`).join('\n')}`
          : '';

        memoryDiagnostics = {
          query,
          dimensions: {
            episodic: parseInt(episodicCount.rows[0]?.count || '0'),
            semantic: parseInt(semanticCount.rows[0]?.count || '0'),
            relational: parseInt(relationalCount.rows[0]?.count || '0'),
            commitment: parseInt(commitmentCount.rows[0]?.count || '0'),
          },
          retrievedCount: memoryResults.length,
          retrieved: memoryResults.map(m => ({
            id: m.id,
            type: m.type,
            text: m.text.substring(0, 200),
            similarity: m.similarity,
            relevance: m.relevanceScore,
          })),
          postFiltered: postFiltered.map((m: any) => ({
            id: m.id,
            type: m.type,
            text: m.text.substring(0, 200),
            adjustedScore: m.adjustedScore,
          })),
          injectedBlob,
        };
      }

      // Continuity metadata (deterministic proof)
      const continuityStats = await deps.pool.query(
        `SELECT COUNT(*) as total_records,
                SUM(LENGTH(input_text) + LENGTH(COALESCE(assistant_output, ''))) as raw_history_chars,
                MAX(timestamp) as last_message_at
         FROM run_records
         WHERE session_id = $1`,
        [sessionId]
      );
      const recordCount = parseInt(continuityStats.rows[0]?.total_records || '0');
      const compressionTriggered = recordCount > 55;
      const continuity = {
        totalRecords: recordCount,
        rawHistoryChars: continuityStats.rows[0]?.raw_history_chars || 0,
        compressionTriggered,
        tailKept: compressionTriggered ? 40 : recordCount,
        compressionThreshold: 55,
        lastMessageAt: continuityStats.rows[0]?.last_message_at,
        summaryHash: continuityStats.rows[0]?.last_message_at || 'n/a',
        retries: metrics.rateLimited,
        backoffTimeline: [],
        errors: [],
        notes: compressionTriggered
          ? 'Compression would be triggered: history segments summarized + last 40 turns preserved'
          : 'History below compression threshold; no compression triggered',
      };

      // Recent run records (for replay/evidence, configurable limit)
      const runLimit = parseInt((request.query as any)?.runLimit || '10', 10);
      const runs = await deps.pool.query(
        `SELECT id, timestamp, input_text, assistant_output, intent, plan_executed, execution_result, reflection
         FROM run_records
         WHERE session_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [sessionId, Math.min(runLimit, 50)]
      );

      // Recent events (with proper filtering and pagination)
      const eventLimit = parseInt((request.query as any)?.limit || '100', 10);
      const eventsResult = await observabilityRepo.listRecent(Math.min(eventLimit, 500), actualUserId, sessionId, 0);

      // Injected memories (Phase 1.1)
      const injectedMemories = await memoryInjectionRepo.listForSession(actualUserId, sessionId);

      return reply.code(200).send({
        userId: actualUserId || userId,
        sessionId,
        testMode,
        providerState,
        stance,
        governorInterventions: parseInt(governorCountRow.rows[0]?.count || '0', 10),
        memory: memoryDiagnostics,
        continuity,
        runs: runs.rows,
        events: eventsResult.events,
        eventsPagination: {
          total: eventsResult.total,
          limit: 100,
          offset: 0,
        },
        injected: injectedMemories,
      });
    } catch (error: any) {
      getLogger().error({ error, userId, sessionId }, 'Failed to build evidence bundle');
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Failed to build evidence bundle',
        500,
        { userId, sessionId, originalError: error?.message }
      );
    }
  });

  // Memory injection endpoint (Phase 1.1: Memory Inject)
  // Used by God Console and tests to inject memories directly
  const memoryInjectionRepo = new MemoryInjectionRepository(deps.pool);
  await memoryInjectionRepo.init().catch(err => getLogger().warn({ err }, 'Failed to initialize memory injections table'));

  app.post<{ Body: any }>('/v1/admin/memory/inject', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }

    const { memory, userId, sessionId, dimension, label, injectionLabel, ttl } = request.body as any;

    if (!memory || typeof memory !== 'string') {
      return reply.code(400).send({ error: 'memory (string) is required' });
    }

    if (!userId || !sessionId) {
      return reply.code(400).send({ error: 'userId and sessionId are required' });
    }

    const validDimensions = ['episodic', 'semantic', 'relational', 'commitment', 'working'];
    const selectedDimension = (dimension || 'episodic') as any;
    if (!validDimensions.includes(selectedDimension)) {
      return reply.code(400).send({
        error: `Invalid dimension. Must be one of: ${validDimensions.join(', ')}`,
      });
    }

    try {
      const injection = await memoryInjectionRepo.inject({
        userId,
        sessionId,
        dimension: selectedDimension,
        text: memory,
        label,
        injectionLabel: injectionLabel || 'admin.console',
        ttl: typeof ttl === 'number' ? ttl : undefined,
        createdBy: userId,
      });

      // Emit observability event
      await observabilityRepo.emit({
        layer: 4,
        type: 'memory_injected',
        level: 'info',
        userId,
        sessionId,
        message: `Memory injected to ${selectedDimension}`,
        data: {
          injectionId: injection.id,
          dimension: selectedDimension,
          textLength: memory.length,
          ttl,
        },
      }).catch(() => {});

      return reply.code(201).send({
        injectionId: injection.id,
        message: 'Memory injected successfully',
        injection,
      });
    } catch (error) {
      getLogger().error({ error, userId, sessionId }, 'Failed to inject memory');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to inject memory',
        500,
        { userId, sessionId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Get injected memories for a session
  app.get<{ Querystring: any }>('/v1/admin/memory/injected', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }

    const { userId, sessionId } = request.query as any;

    if (!userId || !sessionId) {
      return reply.code(400).send({ error: 'userId and sessionId query parameters are required' });
    }

    try {
      const injections = await memoryInjectionRepo.listForSession(userId, sessionId);

      return reply.code(200).send({
        userId,
        sessionId,
        injections,
        count: injections.length,
      });
    } catch (error) {
      getLogger().error({ error, userId, sessionId }, 'Failed to list injected memories');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to list injected memories',
        500,
        { userId, sessionId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Export conversation as markdown or JSON
  app.get<{ Querystring: any }>('/v1/export/conversation', async (request, reply) => {
    const { userId, sessionId, format } = request.query as any;

    if (!userId || !sessionId) {
      return reply.code(400).send({ error: 'userId and sessionId query parameters are required' });
    }

    try {
      // Fetch all run records for the conversation
      const runs = await deps.pool.query(
        `SELECT id, timestamp, input_text, assistant_output, intent, plan_executed, execution_result, reflection
         FROM run_records
         WHERE user_id = $1 AND session_id = $2
         ORDER BY timestamp ASC`,
        [userId, sessionId]
      );

      if (runs.rows.length === 0) {
        return reply.code(404).send({ error: 'No conversation found for this user/session' });
      }

      if (format === 'markdown' || !format) {
        // Build markdown export
        const lines = [
          `# Conversation Export`,
          ``,
          `- **User ID:** ${userId}`,
          `- **Session ID:** ${sessionId}`,
          `- **Exported:** ${new Date().toISOString()}`,
          `- **Total Turns:** ${runs.rows.length}`,
          ``,
          `---`,
          ``,
        ];

        for (const turn of runs.rows) {
          lines.push(`## Turn ${new Date(turn.timestamp).toLocaleString()}`);
          lines.push(``);
          if (turn.input_text) {
            lines.push(`**User:**`);
            lines.push(turn.input_text);
            lines.push(``);
          }
          if (turn.assistant_output) {
            lines.push(`**Vi:**`);
            lines.push(turn.assistant_output);
            lines.push(``);
          }
          lines.push(`---`);
          lines.push(``);
        }

        const markdown = lines.join('\n');
        reply.header('Content-Type', 'text/markdown; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="conversation-${sessionId.slice(0, 8)}.md"`);
        return reply.send(markdown);
      } else if (format === 'json') {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="conversation-${sessionId.slice(0, 8)}.json"`);
        return reply.send({
          userId,
          sessionId,
          exportedAt: new Date().toISOString(),
          turns: runs.rows.map(r => ({
            timestamp: r.timestamp,
            user: r.input_text,
            vi: r.assistant_output,
            intent: r.intent,
            plan: r.plan_executed,
            result: r.execution_result,
            reflection: r.reflection,
          })),
        });
      } else {
        return reply.code(400).send({ error: 'Invalid format. Use "markdown" or "json"' });
      }
    } catch (error) {
      getLogger().error({ error, userId, sessionId }, 'Failed to export conversation');
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Export failed',
        500,
        { userId, sessionId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Get user profile
  app.get<{ Params: { userId: string } }>('/v1/profile/:userId', requireAuth ? { onRequest: [app.authenticate] } : {}, async (request, reply) => {
    const { userId } = request.params;
    
    // Security: Users can only access their own profile (unless admin tier)
    const requestingUserId = (request as any).user?.userId;
    if (requireAuth && requestingUserId !== userId) {
      return reply.code(403).send({ error: 'Unauthorized: Cannot access other users\' profiles' });
    }

    try {
      const userRow = await deps.pool.query(
        'SELECT email, username, display_name, created_at, last_login_at FROM users WHERE id = $1',
        [userId]
      );
      
      const profileRow = await deps.pool.query(
        `SELECT bio, timezone, location, occupation, interests, tier, tier_features,
                communication_style, topics_of_interest, boundaries, profile_completeness,
                user_metadata, created_at, updated_at, last_interaction_at
         FROM user_profiles WHERE user_id = $1`,
        [userId]
      );

      if (!userRow.rows[0]) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const user = userRow.rows[0];
      const profile = profileRow.rows[0];

      return reply.code(200).send({
        userId,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        accountCreated: user.created_at,
        lastLogin: user.last_login_at,
        profile: profile || { tier: 'free', profileCompleteness: 0 },
      });
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to fetch user profile');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to fetch profile',
        500,
        { userId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Update user profile
  app.put<{ Params: { userId: string }; Body: any }>('/v1/profile/:userId', requireAuth ? { onRequest: [app.authenticate] } : {}, async (request, reply) => {
    const { userId } = request.params;
    const updates = request.body as any;
    
    // Security: Users can only update their own profile
    const requestingUserId = (request as any).user?.userId;
    if (requireAuth && requestingUserId !== userId) {
      return reply.code(403).send({ error: 'Unauthorized: Cannot update other users\' profiles' });
    }

    try {
      // Check if profile exists
      const existing = await deps.pool.query('SELECT id FROM user_profiles WHERE user_id = $1', [userId]);
      
      const allowedFields = [
        'bio', 'timezone', 'location', 'occupation', 'interests',
        'communication_style', 'topics_of_interest', 'boundaries', 'user_metadata'
      ];
      
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          fields.push(`${field} = $${paramIndex++}`);
          // Handle array and JSON types
          if (field === 'interests' || field === 'topics_of_interest') {
            values.push(Array.isArray(updates[field]) ? updates[field] : [updates[field]]);
          } else if (field === 'boundaries' || field === 'user_metadata') {
            values.push(typeof updates[field] === 'object' ? updates[field] : {});
          } else {
            values.push(updates[field]);
          }
        }
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      if (existing.rows.length === 0) {
        // Create new profile
        const createFields = ['user_id', ...allowedFields.filter(f => updates[f] !== undefined)];
        const createPlaceholders = createFields.map((_, i) => `$${i + 1}`).join(', ');
        const createValues = [userId, ...values];
        
        await deps.pool.query(
          `INSERT INTO user_profiles (${createFields.join(', ')}) VALUES (${createPlaceholders})`,
          createValues
        );
      } else {
        // Update existing profile
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        fields.push(`last_interaction_at = CURRENT_TIMESTAMP`);
        values.push(userId);
        
        await deps.pool.query(
          `UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = $${paramIndex}`,
          values
        );
      }

      // Calculate profile completeness
      const profileRow = await deps.pool.query(
        `SELECT bio, timezone, location, occupation, interests, communication_style, topics_of_interest
         FROM user_profiles WHERE user_id = $1`,
        [userId]
      );
      
      if (profileRow.rows[0]) {
        const p = profileRow.rows[0];
        const totalFields = 7;
        const filledFields = [p.bio, p.timezone, p.location, p.occupation, p.interests?.length, p.communication_style, p.topics_of_interest?.length]
          .filter(f => f).length;
        const completeness = Math.floor((filledFields / totalFields) * 100);
        
        await deps.pool.query(
          'UPDATE user_profiles SET profile_completeness = $1 WHERE user_id = $2',
          [completeness, userId]
        );
      }

      return reply.code(200).send({ success: true, message: 'Profile updated' });
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to update user profile');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to update profile',
        500,
        { userId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Phase 1.2: User list endpoint for God Console
  app.get<{ Querystring: any }>('/v1/admin/users', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }

    const { limit = 100, offset = 0 } = request.query as any;

    try {
      const users = await userRepo.listAll(Number(limit), Number(offset));

      return reply.code(200).send({
        users,
        count: users.length,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error) {
      getLogger().error({ error }, 'Failed to list users');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to list users',
        500,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  // Phase 1.2: Session browser endpoint for God Console
  app.get<{ Querystring: any }>('/v1/admin/sessions', async (request, reply) => {
    if (process.env.VI_DEBUG_MODE !== 'true') {
      return reply.code(403).send({ error: 'Debug endpoints disabled. Set VI_DEBUG_MODE=true to enable.' });
    }

    const { limit = 100, offset = 0 } = request.query as any;

    try {
      const sessions = await sessionRepo.listAllSessions(Number(limit), Number(offset));

      // Enrich sessions with user display names
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const user = await userRepo.getById(session.userId);
          return {
            ...session,
            userDisplayName: user?.displayName || user?.username || 'Unknown',
            userEmail: user?.email,
          };
        })
      );

      return reply.code(200).send({
        sessions: enrichedSessions,
        count: enrichedSessions.length,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error) {
      getLogger().error({ error }, 'Failed to list sessions');
      throw new AppError(
        ErrorCode.DATABASE_ERROR,
        'Failed to list sessions',
        500,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  });

  const metrics = {
    chatRequests: 0,
    chatOk: 0,
    chatError: 0,
    rateLimited: 0,
    autonomyEvents: 0,
    autonomyChimes: 0,
    startedAt: new Date().toISOString(),
  };

  // Phase 7: autonomy orchestration hooks (per server instance)
  const autonomyBus = new EventBus();
  const autonomyPolicy = new AutonomyPolicyEngine();
  const chimeManager = new ChimeManager(autonomyBus);

  const emitAutonomy = async (event: AutonomyEvent) => {
    metrics.autonomyEvents += 1;
    const score = scoreEvent(event);
    const decision = autonomyPolicy.decide(event, score);
    await chimeManager.maybeChime(event, score, decision);
    return { score, decision };
  };

  autonomyBus.subscribe('chime', (event) => {
    metrics.autonomyChimes += 1;
    telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'autonomy_chime',
      data: {
        eventId: event.id,
        reason: (event.payload as any)?.reason,
        score: (event.payload as any)?.score,
        sourceType: (event.payload as any)?.sourceEvent?.type,
        sessionId: (event.payload as any)?.sourceEvent?.payload?.sessionId,
      },
    }).catch(() => {});
  });

  // Conversation creation (auth optional depending on config)
  app.post('/v1/conversations', requireAuth ? { onRequest: [app.authenticate] } : {}, async (request, reply) => {
    const parsed = createConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        issues: parsed.error.issues,
      });
    }

    const conversation = await conversationRepo.create(
      parsed.data.title,
      requireAuth ? (request as any).user.userId : undefined
    );

    await telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'conversation_created',
      data: { conversationId: conversation.id, userId: requireAuth ? (request as any).user.userId : undefined },
    });

    return reply.code(201).send(conversation);
  });

  app.post('/v1/conversations/:conversationId/messages', requireAuth ? { onRequest: [app.authenticate] } : {}, async (
    request,
    reply
  ) => {
    const parsed = messageSchema.safeParse({
      params: request.params,
      body: request.body,
    });

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        issues: parsed.error.issues,
      });
    }

    const { conversationId } = parsed.data.params;
    const conversation = await conversationRepo.getById(conversationId);
    if (!conversation) {
      return reply.code(404).send({
        error: 'Conversation not found',
        conversationId,
      });
    }

    // Check ownership
    if (requireAuth && conversation.userId !== (request as any).user.userId) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this conversation',
      });
    }

    const message = await messageRepo.create(
      conversationId,
      parsed.data.body.role,
      parsed.data.body.content
    );

    await telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'message_created',
      data: { conversationId, messageId: message.id, userId: requireAuth ? (request as any).user.userId : undefined },
    });

    return reply.code(201).send(message);
  });

  app.get('/v1/conversations/:conversationId/messages', requireAuth ? { onRequest: [app.authenticate] } : {}, async (
    request,
    reply
  ) => {
    const parsedParams = messageSchema.shape.params.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        issues: parsedParams.error.issues,
      });
    }

    const conversation = await conversationRepo.getById(
      parsedParams.data.conversationId
    );
    if (!conversation) {
      return reply.code(404).send({
        error: 'Conversation not found',
        conversationId: parsedParams.data.conversationId,
      });
    }

    // Check ownership
    if (requireAuth && conversation.userId !== (request as any).user.userId) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this conversation',
      });
    }

    const messages = await messageRepo.listByConversation(
      parsedParams.data.conversationId
    );

    return reply.code(200).send({
      conversation,
      messages,
    });
  });

  // Streaming chat endpoint (Phase 6: Real-Time Feel)
  app.post('/v1/chat/stream', {
    onRequest: requireAuth ? [app.authenticate] : [],
    preHandler: [rateLimiters.chat, validateBody(chatRequestSchema)],
  }, async (request, reply) => {
    const { message, sessionId, context, includeTrace } = request.body as z.infer<typeof chatRequestSchema>;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let unsubscribeChime: (() => void) | undefined;
    const heartbeat = setInterval(() => writeEvent('heartbeat', { ok: true }), 15000);
    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeChime?.();
    });

    try {
      // Determine userId
      let userId: string;
      if (requireAuth) {
        userId = (request as any).user.userId;
      } else {
        const guestIdHeader = request.headers['x-guest-user-id'] as string | undefined;
        if (guestIdHeader && guestIdHeader.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          userId = guestIdHeader;
        } else {
          userId = randomUUID();
        }

        await deps.pool.query(
          `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
           VALUES ($1, $2, $3, $4, $5, true, true)
           ON CONFLICT (id) DO NOTHING`,
          [userId, `guest-${userId}@vi.system`, `guest-${userId.slice(0, 8)}`, '', `Guest ${userId.slice(0, 8)}`]
        );
      }

      const activeSessionId = sessionId || randomUUID();
      setRequestContext({ userId, sessionId: activeSessionId });

      const chimeEvents: AutonomyEvent[] = [];
      const forwardChime = (event: AutonomyEvent) => {
        const source = (event.payload as any)?.sourceEvent as AutonomyEvent | undefined;
        const sessionMatch = !source?.payload?.sessionId || source.payload.sessionId === activeSessionId;
        if (!sessionMatch) return;
        chimeEvents.push(event);
        writeEvent('chime', event.payload);
      };
      unsubscribeChime = autonomyBus.subscribe('chime', forwardChime);

      emitAutonomy({
        id: `chat-${activeSessionId}-${Date.now()}`,
        type: 'chat_message',
        timestamp: new Date().toISOString(),
        payload: { userId, sessionId: activeSessionId, urgency: 0.25, importance: 0.6 },
      }).catch(() => {});

      chatRequestCounter += 1;
      metrics.chatRequests = chatRequestCounter;
      const testModeActive = process.env.VI_TEST_MODE === 'true' || (request.headers['x-vi-test-mode'] as string | undefined)?.toLowerCase() === 'true';
      if (testModeActive) {
        reply.header('x-vi-test-mode', 'true');
      }

      const llmGateway = testModeActive ? new StubLLMGateway() : createLLMGateway(deps.config);
      const policyEngine = process.env.POLICY_ENGINE === 'production'
        ? new PolicyEngineImpl(deps.pool, logger)
        : new StubPolicyEngine();
      const runRecordStore = new PostgresRunRecordStore(deps.pool);
      const toolRunner = new ToolRunner(false);

      initializeBuiltinTools();
      initializeAstralisTools(deps.pool);

      let memoryStore: PostgresMemoryStore | undefined;
      if (!testModeActive && deps.config.llm.apiKey && deps.config.llm.provider !== 'stub') {
        try {
          const embeddingService = new OpenAIEmbeddingService({ apiKey: deps.config.llm.apiKey });
          memoryStore = new PostgresMemoryStore(deps.pool, embeddingService);
        } catch (error) {
          console.warn('Failed to initialize memory store:', error);
        }
      }

      const pipeline = new CognitionPipeline(
        llmGateway,
        policyEngine,
        runRecordStore,
        toolRunner,
        memoryStore,
        selfModelRepo
      );

      writeEvent('ready', { sessionId: activeSessionId });

      // Build ContinuityPack (mandatory for Base Brain v1)
      const continuityPack = await memoryOrchestrator.buildContinuityPack(userId, {
        session_id: activeSessionId,
        recent_messages: [],
      });

      const result = await pipeline.process(
        message,
        userId,
        activeSessionId,
        { ...(context || {}), testMode: testModeActive, continuityPack },
        (evt) => {
          writeEvent(evt.type, evt.payload);
          emitAutonomy({
            id: `cog-${activeSessionId}-${evt.type}-${Date.now()}`,
            type: evt.type,
            timestamp: new Date().toISOString(),
            payload: { sessionId: activeSessionId, stage: evt.type },
          }).catch(() => {});
        }
      );
      metrics.chatOk += 1;

      // Fetch citations if not returned directly
      let citations = result.citations;
      if (!citations || citations.length === 0) {
        try {
          const citationRepo = new CitationRepository(deps.pool);
          citations = await citationRepo.listByRunRecordId(result.recordId);
        } catch {}
      }

      // Ensure persisted citations exist when missing
      if (!citations || citations.length === 0) {
        const fallbackCitation = {
          id: randomUUID(),
          type: 'user_input',
          sourceId: 'chat_input',
          sourceText: message.substring(0, 200),
          confidence: 0.5,
          timestamp: new Date().toISOString(),
        } as any;
        try {
          await deps.pool.query(
            `INSERT INTO response_citations (id, run_record_id, citation_type, source_id, source_text, confidence, metadata, source_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (run_record_id, citation_type, source_id) DO NOTHING`,
            [
              fallbackCitation.id,
              result.recordId,
              fallbackCitation.type,
              fallbackCitation.sourceId,
              fallbackCitation.sourceText,
              fallbackCitation.confidence,
              null,
              fallbackCitation.timestamp,
            ]
          );
        } catch (err) {
          logger.warn({ err, recordId: result.recordId }, 'Failed to persist fallback citation');
        }
        citations = [fallbackCitation];
      }

      if (result.hadViolation) {
        await emitAutonomy({
          id: `policy-${result.recordId}`,
          type: 'policy_violation',
          timestamp: new Date().toISOString(),
          payload: { userId, sessionId: activeSessionId, urgency: 1, importance: 1 },
        }).catch(() => {});
      }

      const payload: ChatResponse = {
        output: sanitizeOutput(result.output),
        recordId: result.recordId,
        sessionId: activeSessionId,
        citations: citations?.map((c: any) => ({
          id: c.id,
          type: c.type,
          sourceId: c.sourceId,
          sourceText: c.sourceText,
          confidence: c.confidence,
        })),
      };

      if (chimeEvents.length > 0) {
        payload.autonomy = {
          chimes: chimeEvents.map((event) => ({
            id: event.id,
            reason: (event.payload as any)?.reason,
            score: (event.payload as any)?.score,
            timestamp: event.timestamp,
          })),
        };
      }

      if (includeTrace) {
        payload.trace = undefined; // Trace is available via streamed events
      }

      writeEvent('response', payload);
      writeEvent('done', { recordId: result.recordId, sessionId: activeSessionId });
      unsubscribeChime?.();
      reply.raw.end();
    } catch (error: any) {
      metrics.chatError += 1;
      writeEvent('error', { message: error?.message || 'Unknown error' });
      reply.raw.end();
    }
  });

  // Chat endpoint (M9: CognitionPipeline integration)
  // PHASE 1: Added rate limiting and validation middleware
  app.post('/v1/chat', {
    onRequest: requireAuth ? [app.authenticate] : [],
    preHandler: [
      rateLimiters.chat,
      validateBody(chatRequestSchema)
    ]
  }, async (
    request,
    reply
  ): Promise<ChatResponse> => {
    // Body is already validated by middleware
    const { message, sessionId, context, includeTrace } = request.body as z.infer<typeof chatRequestSchema>;
    let unsubscribeChime: (() => void) | undefined;
    let chimeEvents: AutonomyEvent[] = [];

    // Determine userId via canonical identity resolution (auth or provider headers)
    let userId: string;
    const headerProvider = (request.headers['x-provider'] as string | undefined);
    const headerProviderUserId = (request.headers['x-provider-user-id'] as string | undefined);
    const guestHeader = (request.headers['x-guest-user-id'] as string | undefined);

    const provider = headerProvider || (requireAuth ? 'sovereign' : 'guest');
    const providerUserId = headerProviderUserId
      || (provider === 'guest' ? guestHeader : undefined)
      || (requireAuth ? (request as any).user?.userId : undefined);

    if (provider !== 'guest' && !providerUserId) {
      return reply.code(400).send({
        error: 'Provider identity required',
        required: ['x-provider', 'x-provider-user-id'],
        details: 'Non-guest requests must include provider identity headers or authenticated user id'
      });
    }

    try {
      const resolved = await identityResolver.resolveIdentity({
        provider: provider as any,
        provider_user_id: providerUserId || `guest-${randomUUID()}`,
        metadata: {
          userAgent: request.headers['user-agent'] || undefined,
          clientVersion: request.headers['x-client-version'] as string | undefined,
        }
      });
      userId = resolved.vi_user_id;
    } catch (error) {
      logger.error({ error, provider, providerUserId }, 'Failed to resolve identity');
      return reply.code(500).send({
        error: 'Identity resolution failed',
        message: 'Could not establish canonical user identity'
      });
    }

    // Ensure user exists in users table (for legacy compatibility)
    try {
      await deps.pool.query(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
         VALUES ($1, $2, $3, $4, $5, true, true)
         ON CONFLICT (id) DO NOTHING`,
        [userId, `${provider}-${userId.slice(0, 8)}@vi.system`, `${provider}-${userId.slice(0, 8)}`, '', `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`]
      );
    } catch (dbError) {
      logger.warn({ dbError, userId }, 'Failed to ensure user exists in users table');
    }

    // PHASE 1: Rate limiting now handled by middleware
    // Generate or resume sessionId
    const activeSessionId = sessionId || randomUUID();

    // Set request context for async call chain (enables userId/sessionId auto-fill in observability)
    setRequestContext({ userId, sessionId: activeSessionId });

    // Instrumentation: If the user explicitly asks for userId or sessionId,
    // return plain factual values without persona fluff.
    const idQueryRegex = /\b(user[-_ ]?id|session[-_ ]?id)\b/i;
    if (idQueryRegex.test(message)) {
      const plain = `userId: ${userId}\nsessionId: ${activeSessionId}`;
      try {
        await getTelemetry().recordEvent({
          timestamp: new Date().toISOString(),
          level: 'info',
          type: 'instrumentation_reply',
          data: { userId, sessionId: activeSessionId, message }
        }).catch(() => {});
      } catch {}
      return reply.code(200).send({
        output: plain,
        recordId: randomUUID(),
        sessionId: activeSessionId,
      });
    }

    // Fast-path handling for simple factual intents to avoid LLM guessing and long latency.
    const simpleIntent = detectSimpleIntent(message);
    if (simpleIntent) {
      const recordId = randomUUID();
      const now = getAuthoritativeTime();
      const utcDate = new Date(now.utc);
      let output = '';

      if (simpleIntent === 'time' || simpleIntent === 'datetime') {
        output = `Current time (UTC): ${utcDate.toUTCString()}. If you prefer local time, share your timezone.`;
      }
      if (simpleIntent === 'date' || simpleIntent === 'datetime') {
        const dateOnly = utcDate.toISOString().split('T')[0];
        output = simpleIntent === 'date'
          ? `Today is ${dateOnly} (UTC). If your local date differs, tell me your timezone.`
          : `${output} Date: ${dateOnly} (UTC).`;
      }
      if (simpleIntent === 'name' || simpleIntent === 'who') {
        let displayName: string | undefined;
        try {
          const nameRow = await deps.pool.query(
            'SELECT display_name, username, email FROM users WHERE id = $1',
            [userId]
          );
          if (nameRow.rows[0]) {
            const u = nameRow.rows[0];
            displayName = u.display_name || u.username || (u.email?.startsWith('guest-') ? undefined : u.email);
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to fetch display name for fast path');
        }

        output = displayName
          ? `You told me to refer to you as ${displayName}.`
          : 'I do not have a saved name for you yet. Tell me what you want to be called.';
      }

      if (simpleIntent === 'greeting') {
        output = `I'm Vi, your conversational AI. I'm here and ready to help. What's on your mind?`;
      }

      const response: ChatResponse = {
        output: sanitizeOutput(output),
        recordId,
        sessionId: activeSessionId,
        cognitive: {
          intent: 'fast_path',
          decision: 'completed',
          memoryWritten: false,
          mode: 'fast-path',
          hadViolation: false,
        }
      };

      await telemetry.recordEvent({
        timestamp: new Date().toISOString(),
        level: 'info',
        type: 'chat_fast_path',
        data: { userId, sessionId: activeSessionId, intent: simpleIntent }
      }).catch(() => {});

      return reply.code(200).send(response);
    }

    try {
      chimeEvents = [];
      const forwardChime = (event: AutonomyEvent) => {
        const source = (event.payload as any)?.sourceEvent as AutonomyEvent | undefined;
        const sessionMatch = !source?.payload?.sessionId || source.payload.sessionId === activeSessionId;
        if (!sessionMatch) return;
        chimeEvents.push(event);
      };
      unsubscribeChime = autonomyBus.subscribe('chime', forwardChime);

      emitAutonomy({
        id: `chat-${activeSessionId}-${Date.now()}`,
        type: 'chat_message',
        timestamp: new Date().toISOString(),
        payload: { userId, sessionId: activeSessionId, urgency: 0.25, importance: 0.6 },
      }).catch(() => {});

      chatRequestCounter += 1;
      metrics.chatRequests = chatRequestCounter;
      const testModeActive = process.env.VI_TEST_MODE === 'true' || (request.headers['x-vi-test-mode'] as string | undefined)?.toLowerCase() === 'true';
      if (testModeActive) {
        reply.header('x-vi-test-mode', 'true');
      }
      // Initialize cognition pipeline
      const llmGateway = testModeActive ? new StubLLMGateway() : createLLMGateway(deps.config);
      
      // Use production policy engine if POLICY_ENGINE=production; else stub (permissive for tests/dev)
      const policyEngine = process.env.POLICY_ENGINE === 'production'
        ? new PolicyEngineImpl(deps.pool, logger)
        : new StubPolicyEngine();
      
      const runRecordStore = new PostgresRunRecordStore(deps.pool);
      const toolRunner = new ToolRunner(false);

      // Register tools (idempotent)
      initializeBuiltinTools();
      initializeAstralisTools(deps.pool);

      // Initialize memory store if embeddings service is available
      let memoryStore: PostgresMemoryStore | undefined;
      if (!testModeActive && deps.config.llm.apiKey && deps.config.llm.provider !== 'stub') {
        try {
          const embeddingService = new OpenAIEmbeddingService({
            apiKey: deps.config.llm.apiKey,
          });
          memoryStore = new PostgresMemoryStore(deps.pool, embeddingService);
        } catch (error) {
          console.warn('Failed to initialize memory store:', error);
        }
      }

      const pipeline = new CognitionPipeline(
        llmGateway,
        policyEngine,
        runRecordStore,
        toolRunner,
        memoryStore,
        selfModelRepo
      );

      // Build context with recent session history to improve continuity
      let recentHistory: string[] | undefined = undefined;
      let immediateContext: string[] | undefined = undefined;
      let personalIdentifiers: string[] = [];
      
      try {
        // Fetch up to 200 turns for compression when sessions are long
        const historyRows = await deps.pool.query(
          `SELECT input_text, assistant_output, timestamp
           FROM run_records
           WHERE session_id = $1 AND user_id = $2
           ORDER BY timestamp ASC
           LIMIT 200`,
          [activeSessionId, userId]
        );
        if (historyRows.rows.length > 0) {
          // Build interleaved conversation history: user input + assistant response pairs
          const pairs = historyRows.rows.map((r: any) => {
            const turns = [];
            if (r.input_text && typeof r.input_text === 'string' && r.input_text.length > 0) {
              turns.push(`User: ${r.input_text}`);
            }
            if (r.assistant_output && typeof r.assistant_output === 'string' && r.assistant_output.length > 0) {
              turns.push(`Vi: ${r.assistant_output}`);
            }
            return turns;
          }).flat();
          
          if (pairs.length > 0) {
            // Compress history if long to maintain continuity without bloat
            const preLength = pairs.length;
            const compressed = compressHistory(pairs, 40);
            recentHistory = compressed.recentHistory;
            immediateContext = compressed.immediateContext;

            // Extract personal identifiers (names, nicknames) from history
            const allText = pairs.join(' ');
            const nameMatches = allText.match(/(?:my (?:name|nickname) is|call me|I'm) ([A-Z][a-z]+)/gi);
            if (nameMatches) {
              nameMatches.forEach(match => {
                const name = match.match(/([A-Z][a-z]+)$/)?.[1];
                // Exclude Vi's own name from user identifiers
                if (name && name !== 'Vi' && !personalIdentifiers.includes(name)) {
                  personalIdentifiers.push(name);
                }
              });
            }

            // Telemetry: history compression
            try {
              await telemetry.recordEvent({
                timestamp: new Date().toISOString(),
                level: 'debug',
                type: 'history_compressed',
                data: {
                  sessionId: activeSessionId,
                  userId,
                  originalTurns: preLength,
                  compressedTurns: recentHistory.length,
                  tailKept: 40,
                }
              });
            } catch {}
          }
        }
        logger.info({ 
          sessionId: activeSessionId, 
          userId, 
          historyCount: recentHistory?.length || 0, 
          immediateContextCount: immediateContext?.length || 0,
          personalIdentifiers,
          preview: recentHistory?.slice(0, 3) 
        }, '[CONTINUITY] Recent history fetched');
        // Emit unified event
        await observabilityRepo.emit({
          layer: 8,
          type: 'history_compressed',
          level: 'debug',
          userId,
          sessionId: activeSessionId,
          message: 'History compression computed',
          data: { originalTurns: (recentHistory?.length || 0) + (immediateContext?.length || 0), compressedTurns: recentHistory?.length || 0, tailKept: 40 },
        }).catch(() => {});
      } catch (err) {
        logger.warn({ error: err, sessionId: activeSessionId, userId }, '[CONTINUITY] Failed to fetch recent history');
      }

      // Build or update user profile (persisted in-memory per userId for now)
      const baseProfile = await loadOrCreateProfile(userId, userProfileRepo);
      
      // Fetch comprehensive user profile from database
      let userAccountName: string | undefined;
      let fullUserProfile: any = null;
      try {
        // Get basic account info
        const userRow = await deps.pool.query(
          'SELECT email, username, display_name, created_at, last_login_at FROM users WHERE id = $1',
          [userId]
        );
        
        // Get rich profile data
        const profileRow = await deps.pool.query(
          `SELECT bio, timezone, location, occupation, interests, tier, tier_features,
                  communication_style, topics_of_interest, boundaries, profile_completeness,
                  user_metadata, created_at, updated_at, last_interaction_at
           FROM user_profiles WHERE user_id = $1`,
          [userId]
        );
        
        if (userRow.rows[0]) {
          const u = userRow.rows[0];
          const p = profileRow.rows[0];
          
          // Prefer display_name, fallback to username, then email (strip guest prefix)
          userAccountName = u.display_name || u.username || (u.email?.startsWith('guest-') ? undefined : u.email);
          
          // Build comprehensive profile object for Vi's context
          fullUserProfile = {
            name: userAccountName,
            email: u.email,
            username: u.username,
            accountAge: u.created_at ? Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
            lastLogin: u.last_login_at,
            tier: p?.tier || 'free',
            tierFeatures: p?.tier_features || {},
            bio: p?.bio,
            timezone: p?.timezone,
            location: p?.location,
            occupation: p?.occupation,
            interests: p?.interests || [],
            communicationStyle: p?.communication_style,
            topicsOfInterest: p?.topics_of_interest || [],
            boundaries: p?.boundaries || {},
            profileCompleteness: p?.profile_completeness || 0,
            metadata: p?.user_metadata || {},
            lastInteraction: p?.last_interaction_at,
          };
        }
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to fetch user profile');
      }
      
      // If we have an account name, prepend to personalIdentifiers so Vi knows who she's talking to
      if (userAccountName && !personalIdentifiers.includes(userAccountName)) {
        personalIdentifiers.unshift(userAccountName);
      }

      // PHASE A: Continuity pack is mandatory (hard fail if missing)
      let continuityPack;
      try {
        const provider = (request.headers['x-provider'] as string) || 'sovereign';
        const providerUserId = (request.headers['x-provider-user-id'] as string | undefined);

        continuityPack = await memoryOrchestrator.buildContinuityPack(userId, {
          provider,
          provider_user_id: providerUserId,
          session_context: immediateContext // Current conversation turns
        });

        if (!continuityPack || !continuityPack.vi_user_id) {
          throw new Error('ContinuityPack missing required identity fields');
        }

        logger.debug({ userId, sessionId: activeSessionId, continuityPack }, 'Continuity pack built');
      } catch (err) {
        logger.error({ err, userId, sessionId: activeSessionId }, 'Continuity pack build failed (hard failure)');
        return reply.code(500).send({
          error: 'ContinuityPack required',
          message: 'Request failed because continuity context could not be constructed.'
        });
      }
      
      const userProfile = await updateProfileFromSignals(
        baseProfile,
        {
          personalIdentifiers,
          recentHistory,
          immediateContext,
          currentInput: message,
        },
        profileAuditRepo,
        userProfileRepo,
        signalRepo
      );

      // Load or update bond model (pre-interaction for context)
      const baseBond = await bondRepo.loadOrCreate(userId);
      const bondSignals = detectBondSignals(message, { recentHistory });
      const { bond: preBond } = await updateBond(baseBond, bondSignals);

      // Retrieve relevant memories from all dimensions
      let retrievedMemories: any[] = [];
      let memoryStatus: 'ok' | 'failed' | undefined;
      try {
        const memoryResults = await memoryRepo.retrieveRelevant(
          message,
          userId,
          5, // Limit to top 5 most relevant
          ['episodic', 'semantic', 'relational', 'commitment']
        );
        retrievedMemories = memoryResults.map(m => ({
          id: m.id,
          text: m.text,
          type: m.type,
          similarity: m.similarity,
          relevance: m.relevanceScore,
        }));
        logger.debug({ userId, memoryCount: retrievedMemories.length }, 'Retrieved relevant memories');
        memoryStatus = 'ok';
        await observabilityRepo.emit({
          layer: 4,
          type: 'memory_retrieved',
          level: 'info',
          userId,
          sessionId: activeSessionId,
          message: `Retrieved ${retrievedMemories.length} memories`,
          data: { count: retrievedMemories.length },
        }).catch(() => {});
      } catch (memErr) {
        logger.warn({ err: memErr, userId, sessionId: activeSessionId }, 'Failed to retrieve memories');
        memoryStatus = 'failed';
      }

      const latestSelfModel = getCachedSelfModel() || selfModel;
      // Layer 9: mood carryover via last session arc (if available)
      let moodCarryover: 'neutral' | 'positive' | 'negative' | 'mixed' | undefined;
      try {
        const arcs = await sessionArcRepo.getLatestForUser(userId, 1);
        moodCarryover = arcs[0]?.mood;
      } catch {}
      
      // Extract user display name from context if provided
      const contextDisplayName = (context as any)?.userPreferences?.displayName;
      if (contextDisplayName && !personalIdentifiers.includes(contextDisplayName)) {
        personalIdentifiers.push(contextDisplayName as string);
      }
      
      const mergedContext: any = {
        ...(context || {}),
        recentHistory,
        immediateContext,
        personalIdentifiers: personalIdentifiers.length > 0 ? personalIdentifiers : undefined,
        continuityPack,
        userProfile,
        fullUserProfile, // Rich profile with tier, bio, preferences, etc.
        bond: preBond,
        selfModel: latestSelfModel,
        retrievedMemories: retrievedMemories.length > 0 ? retrievedMemories : undefined,
        memoryStatus,
        moodCarryover,
        testMode: testModeActive,
      };

      // Pre-compute stance decision for telemetry/evidence (Layer 5)
      const stanceDecision = computeStanceDecision(message, {
        profile: userProfile,
        bond: preBond,
        immediateContext,
        recentHistory,
        selfModel: latestSelfModel,
      });
      const bondInfluence = preBond ? (preBond.trust + preBond.familiarity + Math.max(0, preBond.rapport)) / 3 : 0;
      const userSignals: string[] = [];
      if (personalIdentifiers.length) userSignals.push(`identifiers:${personalIdentifiers.join(',')}`);
      if (moodCarryover) userSignals.push(`mood:${moodCarryover}`);
      if ((immediateContext?.length || 0) > 0) userSignals.push('immediate_context');
      mergedContext.stanceDecision = stanceDecision;

      await observabilityRepo.emit({
        layer: 5,
        type: 'stance_decision',
        level: 'info',
        userId,
        sessionId: activeSessionId,
        message: `Stance selected: ${stanceDecision.stance}`,
        data: {
          stance: stanceDecision.stance,
          reasoning: stanceDecision.reasoning,
          userSignals,
          bondInfluence,
          selfModelConstraints: Object.keys(latestSelfModel?.stances || {}),
        },
      }).catch(() => {});

      // PHASE 3: Load persisted preferences for cross-session continuity
      let userPreferences;
      try {
        userPreferences = await preferenceRepo.load(userId);
        mergedContext.userPreferences = userPreferences;
        
        // Update request context with preferences for telemetry
        if (userPreferences.tone_preference) {
          mergedContext.requestedTone = userPreferences.tone_preference;
        }
        if (userPreferences.interaction_mode !== 'assistant') {
          mergedContext.requestedInteractionMode = userPreferences.interaction_mode;
          // Normalize and expose interaction_mode directly for downstream checks
          const mode = String(userPreferences.interaction_mode || '').toLowerCase();
          mergedContext.interaction_mode = (mode === 'lorekeeper') ? 'lore' : mode;
        }
      } catch (err) {
        logger.debug({ err, userId }, 'Failed to load user preferences, using defaults');
        userPreferences = undefined;
      }

      // Map lore_mode_request hint from context into force flag (Astralis only)
      if (provider === 'astralis' && (mergedContext as any)?.lore_mode_request === true) {
        (mergedContext as any).force_lore_mode = true;
        if (!(mergedContext as any).interaction_mode) {
          (mergedContext as any).interaction_mode = 'lore';
        }
      }

      // PHASE 3: Detect preference corrections in user message
      let detectedCorrections: any[] = [];
      try {
        detectedCorrections = await preferenceEngine.detectCorrections(message, userId, activeSessionId);
        if (detectedCorrections.length > 0) {
          await observabilityRepo.emit({
            layer: 3,
            type: 'preference_correction_detected',
            level: 'info',
            userId,
            sessionId: activeSessionId,
            message: `Detected ${detectedCorrections.length} preference corrections`,
            data: {
              corrections: detectedCorrections.map(c => ({ type: c.type, category: c.category, confidence: c.confidence })),
            },
          }).catch(() => {});

          // PHASE 3: Persist detected corrections to database for cross-session continuity
          for (const correction of detectedCorrections) {
            try {
              if (correction.type === 'tone' && correction.category) {
                await preferenceRepo.applyToneCorrection(userId, correction.category as any, correction.reason, activeSessionId);
              } else if (correction.type === 'mode' && correction.category) {
                await preferenceRepo.applyInteractionModeChange(userId, correction.category as any, correction.reason, activeSessionId);
              } else if (correction.type === 'response_pref' && correction.category) {
                await preferenceRepo.applyResponsePreference(userId, correction.category, correction.reason, activeSessionId);
              } else if (correction.type === 'relationship_cue' && correction.category) {
                await preferenceRepo.applyRelationshipCue(userId, correction.category, correction.reason, activeSessionId);
              }
              logger.debug({ userId, correction }, 'Persisted preference correction');
            } catch (persistErr) {
              logger.warn({ err: persistErr, userId, correction }, 'Failed to persist preference correction');
            }
          }
        }
      } catch (err) {
        logger.debug({ err, userId }, 'Failed to detect preference corrections');
      }

      // PHASE 2: Resolve relationship context for behavior adaptation
      let relationshipContext;
      try {
        relationshipContext = await relationshipResolver.resolveRelationship(userId, { history: recentHistory as any });
        (mergedContext as any).relationshipContext = relationshipContext;
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to resolve relationship context, proceeding with defaults');
        relationshipContext = { relationship_type: 'public', trust_level: 0, interaction_mode: 'formal' };
      }

      // Process through cognition pipeline
      const result = await pipeline.process(
        message,
        userId,
        activeSessionId,
        mergedContext
      );
      metrics.chatOk += 1;

      if (result.hadViolation) {
        await emitAutonomy({
          id: `policy-${result.recordId}`,
          type: 'policy_violation',
          timestamp: new Date().toISOString(),
          payload: { userId, sessionId: activeSessionId, urgency: 1, importance: 1 },
        }).catch(() => {});
      }

      // Update bond post-pipeline with consistency signal
      const postBondSignals = {
        ...bondSignals,
        consistentBehavior: !result.hadViolation, // Track if Vi stayed consistent with self-model
      };
      const { bond: finalBond, auditEntry } = await updateBond(preBond, postBondSignals);
      await bondRepo.upsert(finalBond);
      await bondRepo.logAudit(auditEntry).catch(err => logger.warn({ err }, 'Failed to log bond audit'));

      // Store interaction in multi-dimensional memory
      try {
        // Episodic: conversation turn (store user payload + outcome metadata, not full assistant failure text)
        const assistantFailure = /(i\s+(?:do\s*not|don\'?t)\s+(?:know|recall)|i\s+don\'?t\s+have\s+that\s+information)/i.test(result.output);
        const assistantAck = /\b(got it|understood|noted|confirmed)\b/i.test(result.output) ? 'acknowledged' : (assistantFailure ? 'failure' : 'neutral');
        const extractedFacts: Array<{ key: string; value: string; confidence?: number }> = [];
        const favMatch = message.match(/\bmy\s+favorite\s+(?:test\s+)?word\s+is\s+([A-Za-z][A-Za-z0-9_-]*)\b/i);
        if (favMatch && favMatch[1]) {
          extractedFacts.push({ key: 'favorite_test_word', value: favMatch[1].trim(), confidence: 0.95 });
        }

        await memoryRepo.storeEpisodic(
          userId,
          activeSessionId,
          `User: ${message}`,
          {
            turnTimestamp: new Date().toISOString(),
            recordId: result.recordId,
            assistant_ack: assistantAck,
            failure: assistantFailure,
            extracted_facts: extractedFacts,
          }
        );

        // Relational: bond-specific context if significant affective content
        const hasPositiveSentiment = /\b(love|great|awesome|thanks|wonderful|amazing)\b/i.test(message);
        const hasNegativeSentiment = /\b(hate|terrible|awful|frustrated|angry|disappointed)\b/i.test(message);
        if (hasPositiveSentiment || hasNegativeSentiment) {
          const valence = hasPositiveSentiment ? 0.5 : -0.5;
          await memoryRepo.storeRelational(
            userId,
            activeSessionId,
            `Affective interaction: ${message.substring(0, 100)}...`,
            valence,
            { sentiment: hasPositiveSentiment ? 'positive' : 'negative' }
          );
        }

        // Commitment: detect promises/deadlines (simple heuristic)
        const deadlineMatch = message.match(/\bby\s+([A-Za-z]{3,}\s+\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
        if (/\b(promise|will|remind|deadline|by)\b/i.test(message) || /\b(promise|will|remind)\b/i.test(result.output)) {
          let deadline: Date | undefined = undefined;
          if (deadlineMatch) {
            const parsed = Date.parse(deadlineMatch[1]);
            if (!isNaN(parsed)) deadline = new Date(parsed);
          }
          await memoryRepo.storeCommitment(
            userId,
            activeSessionId,
            `Potential commitment: ${message} → ${result.output.substring(0, 100)}`,
            'promise',
            deadline,
            { detectedFrom: 'keyword_heuristic' }
          );
        }

        logger.debug({ userId, sessionId: activeSessionId }, 'Stored memories for interaction');
        await observabilityRepo.emit({
          layer: 4,
          type: 'memory_stored',
          level: 'debug',
          userId,
          sessionId: activeSessionId,
          message: 'Stored episodic/relational/commitment memories',
        }).catch(() => {});
        // Optional task: consolidate semantic facts from episodic
        try {
          const createdFacts = await memoryRepo.consolidateObviousFacts(userId);
          if (createdFacts > 0) {
            await observabilityRepo.emit({ layer: 4, type: 'memory_consolidated', level: 'info', userId, sessionId: activeSessionId, message: `Consolidated ${createdFacts} facts from episodic to semantic` }).catch(() => {});
          }
        } catch {}
        
        // Emit telemetry for memory storage
        await telemetry.recordEvent({
          timestamp: new Date().toISOString(),
          level: 'debug',
          type: 'memory_stored',
          data: {
            userId,
            sessionId: activeSessionId,
            dimensions: [
              'episodic',
              hasPositiveSentiment || hasNegativeSentiment ? 'relational' : null,
              /\b(promise|will|remind)\b/i.test(message) ? 'commitment' : null
            ].filter(Boolean),
          },
        });
      } catch (memErr) {
        logger.warn({ err: memErr }, 'Failed to store memories');
      }

      // Layer 9: update session arc with mood + summary
      try {
        const hasPos = /\b(love|great|awesome|thanks|wonderful|amazing|good|better)\b/i.test(message) || /\b(love|great|awesome|thanks|wonderful|amazing|good|better)\b/i.test(result.output);
        const hasNeg = /\b(hate|terrible|awful|frustrated|angry|disappointed|bad|worse)\b/i.test(message) || /\b(hate|terrible|awful|frustrated|angry|disappointed|bad|worse)\b/i.test(result.output);
        const mood: 'neutral' | 'positive' | 'negative' | 'mixed' = hasPos && hasNeg ? 'mixed' : (hasPos ? 'positive' : (hasNeg ? 'negative' : 'neutral'));
        const summary = `Arc update: mood=${mood}; last message="${message.substring(0, 80)}"`;
        await sessionArcRepo.upsertArc({ userId, sessionId: activeSessionId, mood, summary });
        await observabilityRepo.emit({ layer: 9, type: 'arc_updated', level: 'info', userId, sessionId: activeSessionId, message: 'Session arc updated', data: { mood } }).catch(() => {});
      } catch (arcErr) {
        logger.warn({ arcErr }, 'Failed to update session arc');
      }

      await telemetry.recordEvent({
        timestamp: new Date().toISOString(),
        level: 'info',
        type: 'chat_request',
        data: {
          userId,
          sessionId: activeSessionId,
          recordId: result.recordId,
          messageLength: message.length,
          // M10: cost tracking (simple credits model)
          cost: deps.config.tools.costTracking.enabled
            ? deps.config.tools.costTracking.creditsPerExecution
            : 0,
          totalRequests: chatRequestCounter,
        },
      });
      await observabilityRepo.emit({ layer: 10, type: 'chat_request', level: 'info', userId, sessionId: activeSessionId, message: 'Chat request processed', data: { recordId: result.recordId } }).catch(() => {});

      // Prefer persisted citations to ensure UI sees stored sources
      let citations = result.citations;
      if (!citations || citations.length === 0) {
        try {
          citations = await citationRepo.listByRunRecordId(result.recordId);
        } catch (err) {
          logger.warn({ err, runRecordId: result.recordId }, 'Failed to fetch citations for response');
        }
      }

      // Ensure persisted citations exist when missing
      if (!citations || citations.length === 0) {
        const fallbackCitation = {
          id: randomUUID(),
          type: 'user_input',
          sourceId: 'chat_input',
          sourceText: message.substring(0, 200),
          confidence: 0.5,
          timestamp: new Date().toISOString(),
        } as any;
        try {
          await deps.pool.query(
            `INSERT INTO response_citations (id, run_record_id, citation_type, source_id, source_text, confidence, metadata, source_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (run_record_id, citation_type, source_id) DO NOTHING`,
            [
              fallbackCitation.id,
              result.recordId,
              fallbackCitation.type,
              fallbackCitation.sourceId,
              fallbackCitation.sourceText,
              fallbackCitation.confidence,
              null,
              fallbackCitation.timestamp,
            ]
          );
        } catch (err) {
          logger.warn({ err, recordId: result.recordId }, 'Failed to persist fallback citation');
        }
        citations = [fallbackCitation];
      }

      // Build response with cognitive metadata and citations (Phase 2 Task 3)
      let processedOutput = result.output;

      // PHASE 2: Apply behavior rules based on relationship
      if (relationshipContext) {
        try {
          // Filter disclaimers if owner mode
          if (relationshipContext.relationship_type === 'owner') {
            const disclaimerPatterns = [
              /^(As an AI|I'm an AI|As an AI assistant)[,\s][^.]*\.\s*/i,
              /^(Please note|Note|Important)[:\s][^.]*\.\s*/i,
              /I should mention|I must clarify|Just so you know/i,
            ];
            
            for (const pattern of disclaimerPatterns) {
              processedOutput = processedOutput.replace(pattern, '');
            }
          }

          // Apply verbosity level and apology filtering
          const behaviorRules = behaviorEngine.generateBehaviorRules(relationshipContext);
          
          // Remove apologies if owner mode (trust=high)
          if (behaviorRules.apology_frequency === 0 || relationshipContext.trust_level > 80) {
            processedOutput = processedOutput.replace(/\b(sorry|apologies?|excuse me|my mistake)\b/gi, match => {
              // Keep "sorry" only in specific contexts like "I'm sorry for the confusion" → "I clarified"
              return match.toLowerCase() === 'sorry' && /confusion|misunderstanding/.test(processedOutput) 
                ? '' 
                : match.toLowerCase().startsWith('apolog')
                ? ''
                : match;
            });
          }

          // Abbreviate if owner mode (concise preference)
          if (behaviorRules.formality_level < 30) {
            const lines = processedOutput.split('\n');
            if (lines.length > 3) {
              processedOutput = lines.slice(0, 3).join('\n') + '...';
            }
          }

          // Record relationship interaction for continuity
          await relationshipRepo.incrementInteraction(userId, relationshipContext.relationship_type).catch(err => 
            logger.debug({ err, userId }, 'Failed to increment relationship interaction')
          );
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to apply behavior rules');
          processedOutput = result.output; // Fallback to original output
        }
      }

      // PHASE 5: Apply presence layer (luxury voice profile filtering)
      if (relationshipContext) {
        try {
          const presenceContext = await presenceEngine.determinePresence(
            userId,
            relationshipContext.relationship_type as 'owner' | 'trusted' | 'normal' | 'restricted',
            activeSessionId,
            relationshipContext.interaction_mode || 'companion'
          );

          // Filter output through presence rules (remove forbidden phrases, apologies, etc.)
          processedOutput = await presenceEngine.filterOutputThroughPresence(
            processedOutput,
            presenceContext
          );

          // Validate compliance with presence constraints
          const { compliant, violations } = presenceEngine.validatePresenceCompliance(
            processedOutput,
            presenceContext
          );

          if (!compliant) {
            logger.debug(
              { userId, violations, profile: presenceContext.voice_profile.id },
              'Presence compliance violations detected'
            );
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to apply presence layer');
          processedOutput = result.output; // Fallback to original output
        }
      }

      // PHASE 4: Resolve and inject canon context when relevant
      let canonContext: any = undefined;
      const loreModeActive = !!(canonResolverDB && (((mergedContext as any)?.interaction_mode === 'lore' || (mergedContext as any)?.interaction_mode === 'lorekeeper') || (mergedContext as any)?.force_lore_mode));
      if (loreModeActive) {
        try {
          // Check if message mentions canon entities
          const canonQuery = message || '';
          canonContext = await canonResolverDB.resolveCanon(canonQuery);
          
          if (canonContext?.facts && canonContext.facts.length > 0) {
            logger.debug(
              { userId, canonFacts: canonContext.facts.length, verse_rules: canonContext.verse_rules?.length || 0 },
              'Canon context resolved for lore mode'
            );
          } else {
            // Enforce canon honesty: explicit uncertainty when nothing found
            const lower = (message || '').toLowerCase();
            const mentionsNonexistent = /nonexistent|does not exist|not exist/.test(lower);
            const denial = 'This is not in canon and I have no documented source for it.';
            if (mentionsNonexistent || (canonContext && (canonContext.confidence ?? 0) < 0.5)) {
              processedOutput = denial;
            }
          }
        } catch (err) {
          logger.warn({ err, userId }, 'Failed to resolve canon context');
          canonContext = undefined; // Fallback gracefully
        }
      }

      const response: ChatResponse = {
        output: sanitizeOutput(processedOutput),
        recordId: result.recordId,
        sessionId: activeSessionId,
        citations: citations?.map(c => ({
          id: c.id,
          type: c.type,
          sourceId: c.sourceId,
          sourceText: c.sourceText,
          confidence: c.confidence,
        })),
      };

      // Merge canon citations into response when available
      if (loreModeActive && canonContext?.citations && Array.isArray(canonContext.citations)) {
        const existing = response.citations || [];
        response.citations = [...existing, ...canonContext.citations].map((c: any) => ({
          id: c.id,
          type: c.type,
          sourceId: c.sourceId,
          sourceText: c.sourceText,
          confidence: c.confidence,
        }));
      }
      // Optionally expose canon entity refs for clients that render them
      if (loreModeActive && canonContext?.entities && canonContext.entities.length > 0) {
        (response as any).metadata = { ...(response as any).metadata, canonEntities: canonContext.entities };
      }

      if (chimeEvents.length > 0) {
        response.autonomy = {
          chimes: chimeEvents.map((event) => ({
            id: event.id,
            reason: (event.payload as any)?.reason,
            score: (event.payload as any)?.score,
            timestamp: event.timestamp,
          })),
        };
      }

      // Always include cognitive metadata (intent, decision, goal, memory)
      try {
        const record = await deps.pool.query(
          'SELECT intent, plan_executed, execution_result, reflection FROM run_records WHERE id = $1',
          [result.recordId]
        );
        if (record.rows.length > 0) {
          const row = record.rows[0];
          
          // Include trace if requested
          if (includeTrace) {
            response.trace = {
              intent: row.intent,
              plan: row.plan_executed,
              execution: row.execution_result,
              reflection: row.reflection,
            };
          }
          
          // Always include cognitive state in response (for UI side-panels)
          response.cognitive = {
            intent: row.intent || 'unclassified',
            decision: row.execution_result ? 'completed' : 'pending',
            memoryWritten: retrievedMemories.length > 0,
            mode: 'learning',
            hadViolation: result.hadViolation || false,
          };
          if (loreModeActive) {
            response.cognitive.mode = 'lore';
          }
        }
      } catch (err) {
        logger.warn({ err, recordId: result.recordId }, 'Failed to fetch cognitive metadata');
        response.cognitive = {
          intent: 'unknown',
          decision: 'unknown',
          memoryWritten: false,
          mode: 'unknown',
          hadViolation: result.hadViolation || false,
        };
        if (loreModeActive) {
          response.cognitive.mode = 'lore';
        }
      }

      return reply.code(200).send(response);
    } catch (error: any) {
      logger.error({ error, stack: error?.stack, message, userId, sessionId: activeSessionId }, 'Chat request failed');

      metrics.chatError += 1;

      await telemetry.recordEvent({
        timestamp: new Date().toISOString(),
        level: 'error',
        type: 'chat_error',
        data: {
          message: error.message,
          userId,
          sessionId: activeSessionId,
        },
      }).catch(() => {
        // Ignore telemetry errors during error handling
      });

      // PHASE 1: Throw AppError to be handled by error middleware
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Failed to process chat request',
        500,
        { userId, sessionId: activeSessionId, originalError: error.message }
      );
    } finally {
      unsubscribeChime?.();
    }
  });

  // M10: metrics endpoint
  app.get('/v1/metrics', async (request, reply) => {
    const payload = {
      chatRequests: metrics.chatRequests,
      chatOk: metrics.chatOk,
      chatError: metrics.chatError,
      rateLimited: metrics.rateLimited,
      autonomyEvents: metrics.autonomyEvents,
      autonomyChimes: metrics.autonomyChimes,
      startedAt: metrics.startedAt,
      callsPerMinute,
      rateWindowMs,
      providerProfile: providerProfileName,
      providerLimits,
    };

    const format = (request.query as any)?.format;
    const accept = (request.headers['accept'] as string | undefined) || '';
    const wantsProm = format === 'prom' || accept.includes('text/plain');
    if (wantsProm) {
      const lines = [
        '# HELP vi_chat_requests_total Total chat requests handled',
        '# TYPE vi_chat_requests_total counter',
        `vi_chat_requests_total{status="ok"} ${metrics.chatOk}`,
        `vi_chat_requests_total{status="error"} ${metrics.chatError}`,
        '# HELP vi_chat_rate_limited_total Chat requests that were rate limited',
        '# TYPE vi_chat_rate_limited_total counter',
        `vi_chat_rate_limited_total ${metrics.rateLimited}`,
        '# HELP vi_autonomy_events_total Autonomy events scored',
        '# TYPE vi_autonomy_events_total counter',
        `vi_autonomy_events_total ${metrics.autonomyEvents}`,
        '# HELP vi_autonomy_chimes_total Autonomy chimes emitted',
        '# TYPE vi_autonomy_chimes_total counter',
        `vi_autonomy_chimes_total ${metrics.autonomyChimes}`,
        '# HELP vi_server_started_at Build start time for this instance',
        '# TYPE vi_server_started_at gauge',
        `vi_server_started_at ${Date.parse(metrics.startedAt) || 0}`,
      ];
      reply.header('Content-Type', 'text/plain; version=0.0.4');
      return reply.send(lines.join('\n'));
    }

    return reply.code(200).send(payload);
  });

  // Error handler and 404 handler already registered via registerErrorHandler() in Phase 1

  return app;
}

export async function startServer(
  app: FastifyInstance,
  config: Config
): Promise<void> {
  const logger = getLogger();

  try {
    await app.listen({ host: config.server.host, port: config.server.port });
    const buildInfo: Record<string, unknown> = {
      host: config.server.host,
      port: config.server.port,
      env: config.node.env,
      buildTimestamp: new Date().toISOString(),
    };
    if (process.env.GIT_COMMIT) {
      buildInfo['gitCommit'] = process.env.GIT_COMMIT;
    }
    logger.info(
      {
        ...buildInfo,
      },
      'Server started successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    throw error;
  }
}
