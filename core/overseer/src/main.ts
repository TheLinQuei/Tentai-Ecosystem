/**
 * Vi Overseer - God-1 Control Plane
 * 
 * Authority:
 * - Ecosystem lifecycle (all dependencies)
 * - State machine (STOPPED/STARTING/RUNNING/CRASHED/DEGRADED)
 * - Command audit trail (immutable action log)
 * - Process lifecycle (start/stop/restart)
 * - Port management & health verification
 * - TEST_MODE enforcement (hard gate)
 * - Log streaming
 * 
 * The God Console talks ONLY to Overseer.
 * Overseer talks to OS/Node/Docker.
 * Every action is logged. Every state is verified.
 */

import Fastify from 'fastify';
import { exec, ChildProcess } from 'child_process';
import { createReadStream, appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const AUDIT_LOG_DIR = path.join(__dirname, '../../..', '.overseer-audit');
const VI_API_URL = (process.env.VI_API_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');

// Global error handlers for debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  console.error('⚠️  Uncaught Exception:', error);
  // Don't exit on uncaught exceptions during development
});

// Ensure audit directory exists
if (!existsSync(AUDIT_LOG_DIR)) {
  mkdirSync(AUDIT_LOG_DIR, { recursive: true });
}

console.log('Vi Overseer initializing...');
console.log('WORKSPACE_ROOT:', WORKSPACE_ROOT);
console.log('AUDIT_LOG_DIR:', AUDIT_LOG_DIR);
console.log('VI_API_URL:', VI_API_URL);

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════

interface AuditEntry {
  timestamp: number;
  action: string;
  service?: string;
  user: string;
  params: Record<string, unknown>;
  result: 'success' | 'failure' | 'partial';
  error?: string;
  duration: number;
}

function logAudit(entry: AuditEntry) {
  const log = JSON.stringify(entry) + '\n';
  const auditFile = path.join(AUDIT_LOG_DIR, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);
  appendFileSync(auditFile, log);
  console.log(`[AUDIT] ${entry.action}${entry.service ? ` [${entry.service}]` : ''}: ${entry.result}`);
}

function getAuditLog(days = 1): AuditEntry[] {
  const entries: AuditEntry[] = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const files = readdirSync(AUDIT_LOG_DIR).filter(f => f.startsWith('audit-'));
  for (const file of files) {
    const content = readFileSync(path.join(AUDIT_LOG_DIR, file), 'utf-8');
    for (const line of content.trim().split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as AuditEntry;
        if (entry.timestamp >= cutoff) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

// ═══════════════════════════════════════════════════════════════
// SERVICE REGISTRY & LIFECYCLE
// ═══════════════════════════════════════════════════════════════

interface ServiceConfig {
  name: string;
  port: number;
  path: string;
  envVar?: string;
  buildCmd?: string;
  startCmd: string;
  healthCheckUrl?: string | null;
  critical: boolean; // If false, doesn't block ecosystem startup
  startOrder: number; // 1 = first, higher = later
  pid?: number;
  process?: ChildProcess;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'degraded';
  lastError?: string;
  uptime?: number;
  startTime?: number;
  crashCount: number;
  lastStartAttempt?: number;
}

const services: Map<string, ServiceConfig> = new Map([
  // Tier 1: Core Vi (must start first, critical)
  [
    'vi-core',
    {
      name: 'Vi Core',
      port: 3100,
      path: 'core/vi',
      envVar: 'VI_PORT',
      buildCmd: 'npm run build',
      startCmd: 'npm run dev',
      healthCheckUrl: 'http://localhost:3100/health',
      critical: true,
      startOrder: 1,
      status: 'stopped',
      crashCount: 0,
    },
  ],
  
  // Tier 2: Memory & Storage (critical)
  [
    'memory-store',
    {
      name: 'Memory Store',
      port: 3050,
      path: 'core/memory',
      startCmd: 'npm run dev',
      healthCheckUrl: 'http://localhost:3050/health',
      critical: true,
      startOrder: 2,
      status: 'stopped',
      crashCount: 0,
    },
  ],
  [
    'vector-store',
    {
      name: 'Vector Store (Qdrant)',
      port: 6333,
      path: 'core/vector',
      startCmd: 'docker-compose up -d qdrant', // or local if available
      healthCheckUrl: 'http://localhost:6333/health',
      critical: true,
      startOrder: 2,
      status: 'stopped',
      crashCount: 0,
    },
  ],
  [
    'redis',
    {
      name: 'Redis Cache',
      port: 6379,
      path: 'infra',
      startCmd: 'redis-server --port 6379',
      healthCheckUrl: null, // Redis has no HTTP health endpoint
      critical: false, // degraded mode works without it
      startOrder: 2,
      status: 'stopped',
      crashCount: 0,
    },
  ],

  // Tier 3: Workers & Queues (not critical)
  [
    'workers',
    {
      name: 'Worker Pool',
      port: 3150,
      path: 'core/workers',
      startCmd: 'npm run dev',
      healthCheckUrl: 'http://localhost:3150/health',
      critical: false,
      startOrder: 3,
      status: 'stopped',
      crashCount: 0,
    },
  ],

  // Tier 4: God Console (UI, runs last)
  [
    'sovereign',
    {
      name: 'Sovereign (God Console)',
      port: 3001,
      path: 'clients/command/sovereign',
      envVar: 'SOVEREIGN_PORT',
      startCmd: 'npm run dev',
      healthCheckUrl: 'http://localhost:3001/health',
      critical: false,
      startOrder: 4,
      status: 'stopped',
      crashCount: 0,
    },
  ],
]);

let testModeEnabled = process.env.VI_TEST_MODE === 'true';
let processLogs: Map<string, string[]> = new Map();
let commandLockout: Map<string, number> = new Map(); // Prevent spam clicking

const LOCKOUT_MS = 1000; // 1 second between start/stop commands
const START_TIMEOUT_MS = 30000; // 30 second timeout to mark DEGRADED
const HEALTH_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

// ═══════════════════════════════════════════════════════════════
// PROCESS LIFECYCLE
// ═══════════════════════════════════════════════════════════════

async function startService(serviceId: string, user = 'system'): Promise<{ ok: boolean; message: string }> {
  const startTime = Date.now();
  const service = services.get(serviceId);
  
  if (!service) {
    const err = `Service ${serviceId} not found`;
    logAudit({ timestamp: startTime, action: 'START', service: serviceId, user, params: {}, result: 'failure', error: err, duration: 0 });
    return { ok: false, message: err };
  }

  // Lockout: prevent spam clicking
  const lastAttempt = commandLockout.get(serviceId) || 0;
  if (Date.now() - lastAttempt < LOCKOUT_MS) {
    const err = `Service busy (lockout: ${LOCKOUT_MS}ms between commands)`;
    return { ok: false, message: err };
  }
  commandLockout.set(serviceId, Date.now());

  if (service.status === 'running') {
    const msg = `${service.name} already running (PID: ${service.pid})`;
    logAudit({ timestamp: startTime, action: 'START', service: serviceId, user, params: {}, result: 'success', duration: 0 });
    return { ok: true, message: msg };
  }

  if (service.status === 'starting') {
    return { ok: false, message: `${service.name} already starting` };
  }

  service.status = 'starting';
  service.lastStartAttempt = Date.now();
  const serviceRoot = path.join(WORKSPACE_ROOT, service.path);

  console.log(`[${serviceId}] Starting from: ${serviceRoot}`);

  // Auto-degrade if start takes too long
  const degradeTimer = setTimeout(() => {
    if (service.status === 'starting') {
      service.status = 'degraded';
      service.lastError = `Start timeout after ${START_TIMEOUT_MS}ms`;
      console.log(`[${serviceId}] Degraded: ${service.lastError}`);
    }
  }, START_TIMEOUT_MS);

  try {
    // Set environment
    const env = { ...process.env };
    if (service.envVar) {
      env[service.envVar] = service.port.toString();
    }
    if (testModeEnabled) {
      env.VI_TEST_MODE = 'true';
    }

    // For Vi Core, also set API URLs
    if (serviceId === 'sovereign') {
      env.VI_API_URL = 'http://localhost:3100';
    }

    // Spawn process using service.startCmd (respects npm/node/docker/etc.)
    const { spawnService } = await import('./health-polling.js');
    const envVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') envVars[key] = value;
    }

    processLogs.set(serviceId, []);

    const proc = spawnService(serviceId, service.startCmd, serviceRoot, envVars, (line) => {
      const logs = processLogs.get(serviceId);
      if (!logs) return;
      logs.push(line);
      if (logs.length > 1000) {
        logs.shift();
      }
    });

    service.pid = proc.pid;
    service.process = proc;
    service.status = 'running';
    service.startTime = Date.now();
    service.lastError = undefined;

    proc.on('exit', (code) => {
      clearTimeout(degradeTimer);
      service.crashCount++;
      service.status = 'crashed';
      service.pid = undefined;
      service.process = undefined;
      service.lastError = `Process exited with code ${code}`;
      console.log(`[${serviceId}] Crashed: ${service.lastError} (crashes: ${service.crashCount})`);
      
      logAudit({
        timestamp: Date.now(),
        action: 'CRASH',
        service: serviceId,
        user: 'system',
        params: { exitCode: code, crashes: service.crashCount },
        result: 'failure',
        error: service.lastError,
        duration: service.startTime ? Date.now() - service.startTime : 0,
      });
    });

    clearTimeout(degradeTimer);
    const duration = Date.now() - startTime;
    console.log(`[${serviceId}] Started (PID: ${service.pid})`);
    logAudit({ timestamp: startTime, action: 'START', service: serviceId, user, params: {}, result: 'success', duration });
    return { ok: true, message: `${service.name} started (PID: ${service.pid})` };
  } catch (err) {
    clearTimeout(degradeTimer);
    service.status = 'crashed';
    service.crashCount++;
    service.lastError = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - startTime;
    console.error(`[${serviceId}] Start failed: ${service.lastError}`);
    logAudit({ timestamp: startTime, action: 'START', service: serviceId, user, params: {}, result: 'failure', error: service.lastError, duration });
    return { ok: false, message: service.lastError };
  }
}

async function stopService(serviceId: string, user = 'system'): Promise<{ ok: boolean; message: string }> {
  const startTime = Date.now();
  const service = services.get(serviceId);
  
  if (!service) {
    const err = `Service ${serviceId} not found`;
    logAudit({ timestamp: startTime, action: 'STOP', service: serviceId, user, params: {}, result: 'failure', error: err, duration: 0 });
    return { ok: false, message: err };
  }

  // Lockout
  const lastAttempt = commandLockout.get(serviceId) || 0;
  if (Date.now() - lastAttempt < LOCKOUT_MS) {
    return { ok: false, message: `Service busy (lockout: ${LOCKOUT_MS}ms between commands)` };
  }
  commandLockout.set(serviceId, Date.now());

  if (service.status === 'stopped') {
    logAudit({ timestamp: startTime, action: 'STOP', service: serviceId, user, params: {}, result: 'success', duration: 0 });
    return { ok: true, message: `${service.name} already stopped` };
  }

  if (service.status === 'stopping') {
    return { ok: false, message: `${service.name} already stopping` };
  }

  service.status = 'stopping';

  try {
    if (service.pid) {
      if (process.platform === 'win32') {
        exec(`taskkill /PID ${service.pid} /F`);
      } else {
        process.kill(service.pid, 'SIGTERM');
      }

      // Wait for process to die
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (process.kill(service.pid, 0)) {
        if (process.platform === 'win32') {
          exec(`taskkill /PID ${service.pid} /F`);
        } else {
          process.kill(service.pid, 'SIGKILL');
        }
      }
    }

    service.status = 'stopped';
    service.pid = undefined;
    service.process = undefined;
    const duration = Date.now() - startTime;
    console.log(`[${serviceId}] Stopped`);
    logAudit({ timestamp: startTime, action: 'STOP', service: serviceId, user, params: {}, result: 'success', duration });
    return { ok: true, message: `${service.name} stopped` };
  } catch (err) {
    service.lastError = err instanceof Error ? err.message : String(err);
    service.status = 'crashed';
    const duration = Date.now() - startTime;
    console.error(`[${serviceId}] Stop failed: ${service.lastError}`);
    logAudit({ timestamp: startTime, action: 'STOP', service: serviceId, user, params: {}, result: 'failure', error: service.lastError, duration });
    return { ok: false, message: service.lastError };
  }
}

async function restartService(serviceId: string, user = 'system'): Promise<{ ok: boolean; message: string }> {
  const startTime = Date.now();
  const stop = await stopService(serviceId, user);
  if (!stop.ok) {
    logAudit({ timestamp: startTime, action: 'RESTART', service: serviceId, user, params: {}, result: 'failure', error: stop.message, duration: Date.now() - startTime });
    return stop;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  return startService(serviceId);
}

async function buildService(serviceId: string): Promise<{ ok: boolean; message: string }> {
  const service = services.get(serviceId);
  if (!service) return { ok: false, message: `Service ${serviceId} not found` };

  if (!service.buildCmd) {
    return { ok: false, message: `${service.name} has no build command` };
  }

  const serviceRoot = path.join(WORKSPACE_ROOT, service.path);

  try {
    console.log(`[${serviceId}] Building...`);
    const { stdout, stderr } = await execAsync(service.buildCmd, { cwd: serviceRoot });
    console.log(`[${serviceId}] Build complete`);
    return { ok: true, message: `${service.name} built successfully\n${stdout}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    service.lastError = message;
    console.error(`[${serviceId}] Build failed: ${message}`);
    return { ok: false, message };
  }
}

function getServiceStatus(serviceId: string) {
  const service = services.get(serviceId);
  if (!service) return null;

  return {
    id: serviceId,
    name: service.name,
    port: service.port,
    status: service.status,
    pid: service.pid,
    uptime: service.startTime ? Math.floor((Date.now() - service.startTime) / 1000) : 0,
    lastError: service.lastError,
    healthCheckUrl: service.healthCheckUrl,
  };
}

// ═══════════════════════════════════════════════════════════════
// ECOSYSTEM ORCHESTRATION
// ═══════════════════════════════════════════════════════════════

async function startAll(user = 'system'): Promise<{ ok: boolean; started: string[]; failed: string[]; message: string }> {
  const startTime = Date.now();
  const started: string[] = [];
  const failed: string[] = [];

  // Sort by startOrder
  const ordered = Array.from(services.entries())
    .sort((a, b) => a[1].startOrder - b[1].startOrder);

  for (const [serviceId, service] of ordered) {
    const result = await startService(serviceId, user);
    if (result.ok) {
      started.push(serviceId);
      // Wait a bit between starts to avoid port conflicts
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      failed.push(serviceId);
      // If critical service fails, stop here
      if (service.critical) {
        logAudit({
          timestamp: startTime,
          action: 'START_ALL',
          user,
          params: { started, failed },
          result: 'failure',
          error: `Critical service ${serviceId} failed: ${result.message}`,
          duration: Date.now() - startTime,
        });
        return { ok: false, started, failed, message: `Critical service ${serviceId} failed` };
      }
    }
  }

  logAudit({
    timestamp: startTime,
    action: 'START_ALL',
    user,
    params: { started, failed },
    result: failed.length === 0 ? 'success' : 'partial',
    duration: Date.now() - startTime,
  });

  return {
    ok: failed.length === 0,
    started,
    failed,
    message: `Started ${started.length} services${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
  };
}

async function stopAll(user = 'system'): Promise<{ ok: boolean; stopped: string[]; failed: string[]; message: string }> {
  const startTime = Date.now();
  const stopped: string[] = [];
  const failed: string[] = [];

  // Reverse order (stop in reverse start order)
  const ordered = Array.from(services.entries())
    .sort((a, b) => b[1].startOrder - a[1].startOrder);

  for (const [serviceId] of ordered) {
    const result = await stopService(serviceId, user);
    if (result.ok) {
      stopped.push(serviceId);
    } else {
      failed.push(serviceId);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logAudit({
    timestamp: startTime,
    action: 'STOP_ALL',
    user,
    params: { stopped, failed },
    result: failed.length === 0 ? 'success' : 'partial',
    duration: Date.now() - startTime,
  });

  return {
    ok: failed.length === 0,
    stopped,
    failed,
    message: `Stopped ${stopped.length} services${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
  };
}

function getEcosystemStatus() {
  const status: Record<string, unknown> = {
    healthy: true,
    timestamp: Date.now(),
    services: {},
  };

  for (const [id, service] of services.entries()) {
    const svc = {
      name: service.name,
      port: service.port,
      status: service.status,
      pid: service.pid,
      uptime: service.startTime ? Math.floor((Date.now() - service.startTime) / 1000) : 0,
      critical: service.critical,
      crashCount: service.crashCount,
      lastError: service.lastError,
    };
    
    // Mark ecosystem unhealthy if critical service is down
    if (service.critical && service.status !== 'running') {
      (status as Record<string, unknown>).healthy = false;
    }

    (status as Record<string, Record<string, unknown>>).services[id] = svc;
  }

  return status;
}

// ═══════════════════════════════════════════════════════════════
// FASTIFY SETUP
// ═══════════════════════════════════════════════════════════════

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production',
});

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE - CORS & REQUEST LOGGING
// ═══════════════════════════════════════════════════════════════

// Add CORS headers manually
fastify.addHook('preHandler', async (request, reply) => {
  reply.headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });
  
  // Handle OPTIONS requests
  if (request.method === 'OPTIONS') {
    return reply.code(200).send();
  }
});

// Log all requests globally
fastify.addHook('onRequest', async (request, reply) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ⬅️  ${request.method} ${request.url}`);
  console.log(`    Host:`, request.hostname);
});

fastify.addHook('onResponse', async (request, reply) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ➡️  ${request.method} ${request.url} → ${reply.statusCode}`);
});

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// Health check
fastify.get('/health', async () => ({
  ok: true,
  uptime: process.uptime(),
  testMode: testModeEnabled,
}));

fastify.get('/healthz', async () => ({ ok: true }));

// API compatibility: the God Console uses /overseer/health and /api/health
fastify.get('/overseer/health', async () => ({
  ok: true,
  uptime: process.uptime(),
  testMode: testModeEnabled,
  viUrl: VI_API_URL,
}));

fastify.get('/api/health', async (_request, reply) => {
  try {
    const res = await fetch(`${VI_API_URL}/v1/health`, { cache: 'no-store' });
    const text = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json';
    reply.header('content-type', contentType);
    reply.status(res.status).send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API/HEALTH] Upstream error:', message);
    reply.status(503).send({ error: 'Cannot reach Vi', message });
  }
});

// Proxy chat requests to Vi so /api/chat works when served from Overseer
fastify.post<{ Body: { message?: string; sessionId?: string; context?: unknown; includeTrace?: boolean } }>(
  '/api/chat',
  async (request, reply) => {
    const { message, sessionId, context, includeTrace } = request.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return reply.status(400).send({ error: 'Message required' });
    }

    try {
      const res = await fetch(`${VI_API_URL}/v1/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(request.headers['x-guest-user-id']
            ? { 'x-guest-user-id': String(request.headers['x-guest-user-id']) }
            : {}),
          ...(request.headers['x-vi-test-mode']
            ? { 'x-vi-test-mode': String(request.headers['x-vi-test-mode']) }
            : {}),
        },
        body: JSON.stringify({
          message: message.trim(),
          sessionId: sessionId || undefined,
          context: context ?? undefined,
          includeTrace: includeTrace === true,
        }),
      });

      const text = await res.text();
      const contentType = res.headers.get('content-type') || 'application/json';

      if (!res.ok) {
        reply.header('content-type', contentType);
        return reply.status(res.status).send(text || { error: `Vi error: ${res.status}` });
      }

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }

      return reply.send({
        output: data.output || '',
        recordId: data.recordId || '',
        sessionId: data.sessionId || sessionId,
        ...(data.trace ? { trace: data.trace } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API/CHAT] Upstream error:', message);
      return reply.status(503).send({ error: 'Cannot reach Vi', message });
    }
  }
);

// Evidence bundle passthrough for the God Console
fastify.get<{ Querystring: { userId?: string; sessionId?: string; query?: string } }>(
  '/api/evidence',
  async (request, reply) => {
    const { userId, sessionId, query } = request.query;
    if (!userId || !sessionId) {
      return reply.status(400).send({ error: 'userId and sessionId are required' });
    }

    const params = new URLSearchParams({ userId, sessionId });
    if (query) params.append('query', query);

    try {
      const res = await fetch(`${VI_API_URL}/v1/admin/evidence?${params.toString()}`, {
        headers: {
          ...(request.headers['x-guest-user-id']
            ? { 'x-guest-user-id': String(request.headers['x-guest-user-id']) }
            : {}),
          ...(request.headers['x-vi-test-mode']
            ? { 'x-vi-test-mode': String(request.headers['x-vi-test-mode']) }
            : {}),
        },
      });

      const text = await res.text();
      const contentType = res.headers.get('content-type') || 'application/json';
      reply.header('content-type', contentType);

      if (!res.ok) {
        return reply.status(res.status).send(text || { error: `Vi error: ${res.status}` });
      }

      try {
        return reply.send(text ? JSON.parse(text) : {});
      } catch (err) {
        console.error('[API/EVIDENCE] Failed to parse upstream JSON:', err);
        return reply.status(502).send({ error: 'Invalid response from Vi' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API/EVIDENCE] Upstream error:', message);
      return reply.status(503).send({ error: 'Cannot reach Vi', message });
    }
  }
);

// Live events stream proxy for SSE
fastify.get<{ Querystring: { userId?: string; sessionId?: string } }>(
  '/api/events/stream',
  async (request, reply) => {
    const { userId, sessionId } = request.query;
    if (!userId || !sessionId) {
      return reply.status(400).send({ error: 'userId and sessionId are required' });
    }

    const params = new URLSearchParams({ userId, sessionId }).toString();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    try {
      const res = await fetch(`${VI_API_URL}/v1/admin/events/stream?${params}`, {
        headers: {
          Accept: 'text/event-stream',
          ...(request.headers['x-guest-user-id']
            ? { 'x-guest-user-id': String(request.headers['x-guest-user-id']) }
            : {}),
          ...(request.headers['x-vi-test-mode']
            ? { 'x-vi-test-mode': String(request.headers['x-vi-test-mode']) }
            : {}),
        },
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!res.ok || !reader) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: `upstream ${res.status}` })}\n\n`);
        reply.raw.end();
        return reply;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          reply.raw.write(Buffer.from(value));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API/EVENTS] Upstream error:', message);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      reply.raw.end();
    }

    return reply;
  }
);

// Debug ping endpoint
fastify.post('/debug/ping', async (request, reply) => {
  console.log('[DEBUG] 🎯 JavaScript is running! Browser sent ping.');
  return { received: true, message: 'JavaScript initialized successfully' };
});

// Get all services status
fastify.get('/overseer/services/status', async () => {
  const status: Record<string, unknown> = {};
  for (const [id] of services) {
    status[id] = getServiceStatus(id);
  }
  return { services: status, testMode: testModeEnabled };
});

// Get single service status
fastify.get<{ Params: { serviceId: string } }>('/overseer/services/:serviceId/status', async (request) => {
  return getServiceStatus(request.params.serviceId);
});

// Start service
fastify.post<{ Params: { serviceId: string } }>('/overseer/services/:serviceId/start', async (request) => {
  return startService(request.params.serviceId);
});

// Stop service
fastify.post<{ Params: { serviceId: string } }>('/overseer/services/:serviceId/stop', async (request) => {
  return stopService(request.params.serviceId);
});

// Restart service
fastify.post<{ Params: { serviceId: string } }>('/overseer/services/:serviceId/restart', async (request) => {
  return restartService(request.params.serviceId);
});

// Build service
fastify.post<{ Params: { serviceId: string } }>('/overseer/build/:serviceId', async (request) => {
  return buildService(request.params.serviceId);
});

// Get service logs
fastify.get<{ Params: { serviceId: string }; Querystring: { lines?: string } }>(
  '/overseer/logs/:serviceId',
  async (request) => {
    const logs = processLogs.get(request.params.serviceId) || [];
    const lines = parseInt(request.query.lines || '100', 10);
    return {
      serviceId: request.params.serviceId,
      logs: logs.slice(-lines),
      total: logs.length,
    };
  }
);

// Toggle TEST_MODE (authority hard gate)
fastify.post<{ Body: { enabled: boolean; token?: string } }>('/overseer/mode/test-mode', async (request) => {
  // TODO: Add signature verification for production
  testModeEnabled = request.body.enabled;

  // Restart Vi Core with new mode
  const viService = services.get('vi-core');
  if (viService?.status === 'running') {
    await restartService('vi-core');
  }

  return {
    ok: true,
    testMode: testModeEnabled,
    message: `TEST_MODE ${testModeEnabled ? 'enabled' : 'disabled'}`,
  };
});

// Get TEST_MODE status
fastify.get('/overseer/mode/test-mode', async () => ({
  testMode: testModeEnabled,
}));

// ═══════════════════════════════════════════════════════════════
// ECOSYSTEM CONTROL (God-1)
// ═══════════════════════════════════════════════════════════════

// Get ecosystem status (one truth)
fastify.get('/overseer/ecosystem/status', async () => {
  return getEcosystemStatus();
});

// Start all services
fastify.post('/overseer/ecosystem/start-all', async () => {
  return startAll('console-user');
});

// Stop all services
fastify.post('/overseer/ecosystem/stop-all', async () => {
  return stopAll('console-user');
});

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════

// Get audit log (last N days)
fastify.get<{ Querystring: { days?: string } }>('/overseer/audit/log', async (request) => {
  const days = parseInt(request.query.days || '1', 10);
  const entries = getAuditLog(days);
  return {
    entries,
    count: entries.length,
    span: `${days} day(s)`,
  };
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE UI
// ═══════════════════════════════════════════════════════════════

// Serve God Console UI
fastify.get('/', async (request, reply) => {
  const consolePath = path.join(WORKSPACE_ROOT, 'clients/command/sovereign/public/index.html');
  try {
    const html = readFileSync(consolePath, 'utf-8');
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(html);
  } catch (err) {
    reply.status(500).send({ 
      error: 'God Console UI not found', 
      path: consolePath,
      message: err instanceof Error ? err.message : String(err)
    });
  }
});

// Debug: Test if JavaScript executes
fastify.get('/test-js', async (request, reply) => {
  const testPath = path.join(WORKSPACE_ROOT, 'core/overseer/test-js.html');
  try {
    const html = readFileSync(testPath, 'utf-8');
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.send(html);
  } catch (err) {
    reply.status(500).send({ error: 'Test file not found', path: testPath, details: err instanceof Error ? err.message : String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.OVERSEER_PORT || '3200', 10);

try {
  await fastify.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`✓ Vi Overseer listening on http://127.0.0.1:${PORT}`);
  console.log(`  Authority: Process Lifecycle | Builds | Logs | TEST_MODE Gate`);
  console.log(`  TEST_MODE: ${testModeEnabled}`);
  
  // Start health polling loop (Phase 0.2)
  const { startHealthPolling } = await import('./health-polling.js');
  const healthTrackers = new Map();
  
  const poller = startHealthPolling(services, healthTrackers, {
    interval: HEALTH_CHECK_INTERVAL_MS,
    consecutiveFailureThreshold: 3,
    onHealthChange: (serviceId, status) => {
      console.log(`[HEALTH] ${serviceId} → ${status}`);
      if (status === 'hung') {
        console.warn(`[ALERT] ${serviceId} is hung (failed 3+ health checks). Consider restarting.`);
        logAudit({
          timestamp: Date.now(),
          action: 'HUNG_DETECTED',
          service: serviceId,
          user: 'system',
          params: { healthStatus: status },
          result: 'failure',
          error: `Service hung: health check failed 3+ consecutive times`,
          duration: 0,
        });
      }
    },
  });
  
  console.log(`✓ Health polling started (interval: ${HEALTH_CHECK_INTERVAL_MS}ms)`);
  
  // Keep process alive
  process.stdin.resume();
} catch (err) {
  console.error(err);
  process.exit(1);
}
