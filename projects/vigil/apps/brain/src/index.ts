import { config } from 'dotenv';
import { resolve } from 'path';
import Fastify from 'fastify';
import { connect, StringCodec, type NatsConnection } from 'nats';
import { Memory } from '@vi/sdk';
import { handleObservation } from './observer.js';
import { exportPrometheusMetrics } from './metrics.js';
import { SkillGraph } from './skillGraph.js';
import { ToolRegistry } from './tools/registry.js';
import { resolveGuildIntent } from './utils/guildIntentMap.js';

// Load .env from workspace root (two levels up from apps/brain/src)
config({ path: resolve(import.meta.dirname, '../../../.env') });

const server = Fastify({ logger: true });
const port = Number(process.env.BRAIN_PORT || 4312);
const memoryUrl = process.env.MEMORY_API || 'http://localhost:4311';
const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

// Initialize clients
const memory = Memory.create(memoryUrl);
let skillGraph: InstanceType<typeof import('./skillGraph').SkillGraph>;
let nc: NatsConnection;

// Message deduplication: Track processed message IDs (keep last 1000)
const processedMessages = new Set<string>();
const MAX_PROCESSED_IDS = 1000;

// Health check
server.get('/health', async () => ({ 
  ok: true, 
  memory: memoryUrl,
  nats: natsUrl
}));

// Stats endpoint

server.get('/stats', async () => {
  const stats = nc?.stats();
  return {
    nats: {
      inMsgs: stats?.inMsgs ?? 0,
      outMsgs: stats?.outMsgs ?? 0,
      inBytes: stats?.inBytes ?? 0,
      outBytes: stats?.outBytes ?? 0,
    }
  };
});

// /metrics endpoint (Prometheus format)
server.get('/metrics', async (request, reply) => {
  try {
    const body = await exportPrometheusMetrics();
    reply
      .code(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  } catch (err) {
    reply.code(500).send(`Metrics error: ${err instanceof Error ? err.message : err}`);
  }
});

// Metrics summary endpoint removed (use Prometheus /metrics)

// Bootstrap
async function bootstrap() {
  try {
    // Initialize SkillGraph (Phase 5 - Procedural Memory)
    skillGraph = new SkillGraph(memory, server.log);
    server.decorate('skillGraph', skillGraph);
    server.log.info('🧩 SkillGraph initialized');

    // Registry + Intent Map visibility
    server.log.info(`[registry] guild tools registered (${Object.keys(ToolRegistry).length} total)`);
    if (typeof resolveGuildIntent === 'function') {
      server.log.info('[planner] deterministic intent mapping loaded');
    }

    // Connect to NATS
    server.log.info(`Connecting to NATS at ${natsUrl}...`);
    nc = await connect({ servers: natsUrl });
    server.log.info('✅ Connected to NATS');

    // Subscribe to Discord message events
    const sc = StringCodec();
    const sub = nc.subscribe('discord.message');
    
    server.log.info('📡 Subscribed to discord.message');

    // Process messages asynchronously
    (async () => {
      for await (const msg of sub) {
        const data = JSON.parse(sc.decode(msg.data));
        
        // Deduplicate: Skip if already processed
        if (processedMessages.has(data.id)) {
          server.log.warn({ messageId: data.id }, '⚠️  Duplicate message detected, skipping');
          continue;
        }
        
        // Add to processed set (with size limit)
        processedMessages.add(data.id);
        if (processedMessages.size > MAX_PROCESSED_IDS) {
          const firstId = processedMessages.values().next().value as string;
          if (firstId) processedMessages.delete(firstId);
        }
        
        server.log.info({ event: data, messageId: data.id }, 'Processing observation');

        try {
          // Full pipeline: Retriever → Intent → Planner (LLM) → Executor → Reflector
          const start = Date.now();
          await handleObservation(data, memory, server.log, skillGraph);
          server.log.info({ messageId: data.id, duration: Date.now() - start }, '✅ Observation handled');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          server.log.error({ err: message, observationId: data.id }, 'Pipeline execution error');
        }
      }
    })();

    // Start HTTP server (bind to 0.0.0.0 for Docker compatibility)
    await server.listen({ port, host: '0.0.0.0' });
    server.log.info(`🧠 Vi Brain running on http://0.0.0.0:${port}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    server.log.error({ err: message }, 'Failed to bootstrap Brain service');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  server.log.info('Shutting down Brain service...');
  await nc?.drain();
  await server.close();
  process.exit(0);
});

bootstrap();
