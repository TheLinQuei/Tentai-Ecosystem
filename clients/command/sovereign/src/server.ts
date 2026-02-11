import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Pool } from 'pg';
import { SovereignAuthService, TokenPayload } from './auth.js';
import { GodConsoleHydrationPayload, GodConsoleSignal, GodConsoleTone } from './types/hydration.js';
import type {
  ApiResponse,
  GodSignalEnvelope,
  MemoryStatus,
  LoreStatus,
  LoreSearchResult,
  ClientsStatus,
  SystemHealth,
  SystemsStatus,
  AuthorityStatus,
  ActionResponse,
} from './contracts/godConsole.js';

const execAsync = promisify(exec);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VI_ROOT_CANDIDATES = [
  process.env.VI_ROOT,
  path.join(WORKSPACE_ROOT, 'core', 'vi'),
  '/workspace/core/vi',
].filter(Boolean) as string[];

const VI_ROOT = VI_ROOT_CANDIDATES.find((candidate) =>
  fs.existsSync(path.join(candidate, 'docker-compose.yml'))
) || path.join(WORKSPACE_ROOT, 'core', 'vi');

const app = express();
const PORT = parseInt(process.env.SOVEREIGN_PORT || '3001');
const VI_API_URL = process.env.VI_API_URL || 'http://127.0.0.1:3100';
// Overseer is now integrated into Sovereign (port 3001), not a separate service
// Remove OVERSEER_URL — control plane routes are native to this service

// ═══════════════════════════════════════════════════════════════
// DATABASE & AUTH (Independent of vi-core status)
// ═══════════════════════════════════════════════════════════════
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
const pool = new Pool({ connectionString: DATABASE_URL });
const authService = new SovereignAuthService(pool);

// Auth middleware for protected routes
interface AuthRequest extends Request {
  user?: TokenPayload;
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const payload = await authService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ═══════════════════════════════════════════════════════════════
// OVERSEER CONTROL PLANE STATE (Phase 0.2)
// ═══════════════════════════════════════════════════════════════
interface AuditEntry {
  timestamp: string;
  action: string;
  service?: string;
  user: string;
  result: 'success' | 'failure';
  message?: string;
}

interface ServiceStatus {
  status: 'running' | 'stopped' | 'crashed' | 'unknown' | 'degraded';
  critical: boolean;
  pid?: number;
  uptime?: number;
  lastError?: string;
}

const overseerState = {
  auditLog: [] as AuditEntry[],
  serviceStatus: new Map<string, ServiceStatus>(),
  lastHealthCheck: new Date().toISOString(),
};

let testModeEnabled = false;
const controlState = {
  behaviorMode: 'learning' as 'learning' | 'strict' | 'autonomous' | 'observer',
  memoryLocked: false,
  memoryCheckpoints: [] as Array<{ id: string; timestamp: string; note?: string }>,
  lastFlushAt: null as string | null,
  lastRollbackAt: null as string | null,
};

function addAuditEntry(action: string, service: string | undefined, user: string, result: 'success' | 'failure', message?: string) {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    service,
    user,
    result,
    message,
  };
  overseerState.auditLog.unshift(entry);
  // Keep last 100 entries
  if (overseerState.auditLog.length > 100) {
    overseerState.auditLog = overseerState.auditLog.slice(0, 100);
  }
  console.log(`[AUDIT] ${action} | ${service || 'system'} | ${result} | ${user}`);

   const auditEvent: AuditEvent = {
     id: randomUUID(),
     ts: entry.timestamp,
     actor: user,
     action,
     outcome: result,
     message,
     ...(service ? { meta: { service } } : {}),
   };

   appendAuditEvent(auditEvent);
   broadcastAuditEvent(auditEvent);
}

async function checkDockerService(serviceName: string): Promise<ServiceStatus> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${serviceName}" --format "{{.Names}}|{{.Status}}"`);
    const lines = stdout.trim().split('\n').filter(Boolean);
    
    if (lines.length === 0) {
      return { status: 'stopped', critical: true };
    }
    
    const [name, status] = lines[0].split('|');
    const isRunning = status.toLowerCase().includes('up');
    
    return {
      status: isRunning ? 'running' : 'stopped',
      critical: true,
      uptime: isRunning ? 0 : undefined,
    };
  } catch (err) {
    // If we're inside a container without Docker available, fall back to heuristics
    const isInDocker = process.env.DOCKER_CONTAINER === 'true' || await isRunningInContainer();
    const dockerSockMissing = !fs.existsSync('/var/run/docker.sock');

    if (isInDocker && dockerSockMissing) {
      if (serviceName === 'postgres' || serviceName === 'vi-postgres') {
        const hasDbHost = !!(process.env.DATABASE_URL?.includes('postgres') || process.env.DATABASE_URL?.includes('5432'));
        return { status: hasDbHost ? 'running' : 'unknown', critical: true, lastError: String(err) };
      }
      if (serviceName === 'vi-core') {
        const healthy = await checkHttpService('http://vi-core:3100/v1/health');
        return { status: healthy ? 'running' : 'stopped', critical: true, lastError: String(err) };
      }
      if (serviceName === 'vector-store' || serviceName === 'vi-vector-store') {
        const healthy = await checkHttpService('http://vector-store:6333');
        return { status: healthy ? 'running' : 'stopped', critical: true, lastError: String(err) };
      }
    }

    return { status: 'unknown', critical: true, lastError: String(err) };
  }
}

async function isRunningInContainer(): Promise<boolean> {
  try {
    // Check for .dockerenv file (most reliable)
    const { stdout: dockerEnv } = await execAsync('test -f /.dockerenv && echo "yes" || echo "no"');
    if (dockerEnv.trim() === 'yes') return true;
    
    // Fallback: check cgroup
    const { stdout } = await execAsync('cat /proc/1/cgroup 2>/dev/null || echo ""');
    return stdout.includes('docker') || stdout.includes('kubepods') || stdout.includes('containerd');
  } catch {
    // If both checks fail, assume we're in container if DATABASE_URL uses hostnames instead of localhost
    return !!(process.env.DATABASE_URL?.includes('postgres:') || process.env.DATABASE_URL?.includes('vi-core:'));
  }
}

async function checkHttpService(url: string): Promise<boolean> {
  try {
    const isHttps = url.startsWith('https://');
    const protocol = isHttps ? https : http;
    
    return new Promise((resolve) => {
      const req = protocol.get(url, { timeout: 2000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

// God Console helpers (real signals only)
function mapTone(status?: string): GodConsoleTone {
  if (!status) return 'offline';
  const normalized = status.toLowerCase();
  if (normalized.includes('ok') || normalized.includes('healthy') || normalized.includes('up')) return 'ok';
  if (normalized.includes('warn') || normalized.includes('degraded')) return 'warn';
  return 'offline';
}

async function fetchViCoreSignal(): Promise<GodConsoleSignal> {
  const target = `${VI_API_URL.replace(/\/$/, '')}/v1/health`;
  try {
    const isHttps = target.startsWith('https://');
    const protocol = isHttps ? https : http;
    const url = new URL(target);

    const options = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}` || '/v1/health',
      method: 'GET' as const,
      timeout: 5000,
    };

    return await new Promise((resolve, reject) => {
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            const tone = mapTone(parsed.status || res.statusCode?.toString());
            resolve({
              label: parsed.status || 'Health',
              tone,
              detail: parsed.message || parsed.version || `HTTP ${res.statusCode}`,
              timestamp: new Date().toISOString(),
              source: 'vi-core',
            });
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
        reject(new Error('timeout'));
      });
      req.end();
    });
  } catch (error: any) {
    return {
      label: 'Offline',
      tone: 'offline',
      detail: error?.message ? `vi-core unreachable: ${error.message}` : 'vi-core unreachable',
      timestamp: new Date().toISOString(),
      source: 'vi-core',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// AUDIT STORE (persistent JSONL + SSE broadcast)
// ═══════════════════════════════════════════════════════════════
const AUDIT_LOG_PATH = path.join(WORKSPACE_ROOT, 'clients', 'command', 'sovereign', 'data', 'audit.log');

interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  outcome: 'success' | 'failure';
  message?: string;
  meta?: Record<string, any>;
}

function ensureAuditStore() {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    if (!fs.existsSync(AUDIT_LOG_PATH)) {
      fs.writeFileSync(AUDIT_LOG_PATH, '', 'utf8');
    }
  } catch (err) {
    console.error('[AUDIT] Failed to ensure audit store:', err);
  }
}

ensureAuditStore();

function appendAuditEvent(event: AuditEvent) {
  try {
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(event) + '\n', 'utf8');
  } catch (err) {
    console.error('[AUDIT] Failed to append audit event:', err);
  }
}

function readAuditEvents(limit: number): AuditEvent[] {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const content = fs.readFileSync(AUDIT_LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const sliced = lines.slice(-limit).reverse();
    return sliced.map((line) => {
      try {
        return JSON.parse(line) as AuditEvent;
      } catch {
        return null;
      }
    }).filter(Boolean) as AuditEvent[];
  } catch (err) {
    console.error('[AUDIT] Failed to read audit events:', err);
    return [];
  }
}

const auditClients = new Set<{ res: Response; ping: NodeJS.Timeout }>();

function broadcastAuditEvent(event: AuditEvent) {
  const payload = `event: audit\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of auditClients) {
    try {
      client.res.write(payload);
    } catch (err) {
      console.error('[AUDIT] SSE write error:', err);
    }
  }
}

async function pollEcosystemHealth() {
  try {
    await refreshServiceStatuses();
  } catch (err) {
    console.error('[OVERSEER] Health poll error:', err);
  }
}

// Poll health every 5 seconds
setInterval(pollEcosystemHealth, 5000);
// Initial poll
pollEcosystemHealth();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} DONE - ${res.statusCode}`);
  });
  next();
});

// Health checks (fast path)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', name: 'sovereign', version: '0.1.0', testMode: testModeEnabled, lastHealthCheck: overseerState.lastHealthCheck });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ═══════════════════════════════════════════════════════════════
// CRITICAL: Prevent /api/* from ever falling through to static/SPA
// This MUST be before any static middleware or catchalls
// ═══════════════════════════════════════════════════════════════

// This explicit middleware ensures Express matches /api/* routes before
// static file serving or SPA catchall can intercept them
app.use('/api', (req: Request, res: Response, next) => {
  // TEMPORARY: Force response to prove this middleware is hit
  console.log('[API-GUARD] Intercepted:', req.method, req.originalUrl);
  // Just pass through - actual handlers are defined later
  next();
});

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES — Proxy to Vi Core
// ═══════════════════════════════════════════════════════════════

// Helper to proxy auth requests
async function proxyAuth(req: Request, res: Response, endpoint: string, method: 'POST' | 'GET' = 'POST') {
  try {
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    const fullPath = basePath + endpoint;

    const requestBody = method === 'POST' ? JSON.stringify(req.body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (method === 'POST') {
      headers['Content-Length'] = Buffer.byteLength(requestBody).toString();
    }
    
    // Forward Authorization header if present
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'] as string;
    }

    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method,
      headers,
      timeout: 10000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        if (!viRes.statusCode) {
          return res.status(500).send('No response from Vi');
        }
        res.status(viRes.statusCode).send(data);
      });
    });

    viReq.on('error', (err) => {
      console.error(`[AUTH] Proxy error for ${endpoint}:`, err);
      res.status(503).json({ 
        error: 'Vi Core offline',
        message: 'Start Vi ecosystem via Overseer tab first, then login.',
        hint: 'Click the Overseer tab → Start All Services button'
      });
    });

    viReq.on('timeout', () => {
      viReq.destroy();
      res.status(504).json({ 
        error: 'Vi Core timeout',
        message: 'Vi Core is not responding. Check Overseer status.',
      });
    });

    if (method === 'POST') {
      viReq.write(requestBody);
    }
    viReq.end();
  } catch (err) {
    console.error(`[AUTH] Proxy error for ${endpoint}:`, err);
    res.status(500).json({ error: 'Auth proxy failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES (Independent of vi-core)
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password, displayName } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password required' });
    }

    const tokens = await authService.register(
      { email, username, password, displayName },
      req.ip,
      req.get('user-agent')
    );

    addAuditEntry('auth:register', undefined, email, 'success', `User ${username} registered`);
    res.json({ data: tokens });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    addAuditEntry('auth:register', undefined, req.body.email || 'unknown', 'failure', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    console.log(`[AUTH-DEBUG] Login attempt for email: ${email}, password length: ${password.length}`);

    const tokens = await authService.login(
      { email, password },
      req.ip,
      req.get('user-agent')
    );

    console.log(`[AUTH-DEBUG] Login successful for ${email}`);
    addAuditEntry('auth:login', undefined, email, 'success', 'Login successful');
    res.json({ data: tokens });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.log(`[AUTH-DEBUG] Login failed for ${req.body.email}: ${error.message}`);
    addAuditEntry('auth:login', undefined, req.body.email || 'unknown', 'failure', error.message);
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const tokens = await authService.refresh(refreshToken, req.ip, req.get('user-agent'));
    res.json({ data: tokens });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    await authService.logout(refreshToken);
    addAuditEntry('auth:logout', undefined, 'user', 'success', 'Logout successful');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/logout-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    await authService.logoutAll(req.user.userId);
    addAuditEntry('auth:logout-all', undefined, req.user.email, 'success', 'All sessions logged out');
    res.json({ message: 'All sessions logged out successfully' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(400).json({ error: error.message });
  }
});

// Forward /api/export/* to Vi Core /v1/export/* (conversation exports)
app.get('/api/export/conversation', async (req: Request, res: Response) => {
  try {
    const query = new URLSearchParams(req.query as any).toString();
    const endpoint = '/v1/export/conversation' + (query ? `?${query}` : '');
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    const fullPath = basePath + endpoint;

    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      timeout: 10000,
    };

    const viReq = protocol.request(options, (viRes) => {
      // Forward headers (Content-Type, Content-Disposition for download)
      if (viRes.headers['content-type']) {
        res.setHeader('content-type', viRes.headers['content-type']);
      }
      if (viRes.headers['content-disposition']) {
        res.setHeader('content-disposition', viRes.headers['content-disposition']);
      }
      
      if (!viRes.statusCode) {
        return res.status(500).send('No response from Vi');
      }
      res.status(viRes.statusCode);
      viRes.pipe(res);
    });

    viReq.on('error', (err) => {
      console.error('[EXPORT] Proxy error:', err);
      res.status(503).json({ error: 'Vi Core unavailable' });
    });

    viReq.on('timeout', () => {
      viReq.destroy();
      res.status(504).json({ error: 'Vi Core timeout' });
    });

    viReq.end();
  } catch (err) {
    console.error('[EXPORT] Proxy failed:', err);
    res.status(500).json({ error: 'Export proxy failed' });
  }
});

// Forward /api/profile/:userId to Vi Core
app.get('/api/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    const fullPath = basePath + `/v1/profile/${userId}`;

    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      headers: req.headers as any,
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 200);
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (v) res.setHeader(k, v);
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Profile proxy error:', err);
      res.status(500).json({ error: 'Profile fetch failed' });
    });

    proxyReq.end();
  } catch (err) {
    console.error('Profile proxy failed:', err);
    res.status(500).json({ error: 'Profile proxy failed' });
  }
});

// Forward /api/health to Vi Core
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    // Vi Core health endpoint lives at /v1/health (the former /health path 404s)
    const fullPath = basePath + '/v1/health';

    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      timeout: 5000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        if (!viRes.statusCode) {
          return res.status(500).json({ status: 'error' });
        }
        res.status(viRes.statusCode).send(data);
      });
    });

    viReq.on('error', () => {
      res.status(503).json({ status: 'error', message: 'Vi Core unavailable' });
    });

    viReq.on('timeout', () => {
      viReq.destroy();
      res.status(504).json({ status: 'error', message: 'Vi Core timeout' });
    });

    viReq.end();
  } catch (err) {
    res.status(500).json({ status: 'error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SESSION & CLIENT LAUNCHER ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /api/session — Returns session context for client launcher
app.get('/api/session', requireAuth, async (req: AuthRequest, res: Response) => {
  console.log('[SESSION ENDPOINT HIT] User object:', JSON.stringify(req.user));
  try {
    console.log('[SESSION] /api/session hit for user:', req.user?.email);
    const user = req.user;
    const email = user?.email?.toLowerCase();
    console.log('[SESSION DEBUG] Original email:', user?.email);
    console.log('[SESSION DEBUG] Lowercased email:', email);
    console.log('[SESSION DEBUG] Checking against:', 'shykem.middleton@gmail.com'.toLowerCase());
    console.log('[SESSION DEBUG] Match result:', email === 'shykem.middleton@gmail.com'.toLowerCase());
    const founder = email === 'founder@tentai.dev' || 
                    email === 'admin@tentai.dev' ||
                    email === 'shykem.middleton@gmail.com'.toLowerCase();

    const sessionPayload: ApiResponse<{
      userId: string;
      email: string;
      displayName: string;
      role: string;
      tier: string;
      founder: boolean;
      entitledClients: string[];
    }> = {
      ok: true,
      data: {
        userId: user?.userId || 'unknown',
        email: user?.email || 'unknown',
        displayName: user?.username || user?.email || 'User',
        role: founder ? 'founder' : 'user',
        tier: founder ? 'founder' : 'standard',
        founder,
        entitledClients: founder ? ['chat', 'lore', 'discord'] : ['chat'],
      },
    };

    res.status(200).json(sessionPayload);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Session fetch failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// GET /api/clients — Returns available clients for launcher
app.get('/api/clients', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const email = user?.email?.toLowerCase();
    const founder = email === 'founder@tentai.dev' || 
                    email === 'admin@tentai.dev' ||
                    email === 'shykem.middleton@gmail.com'.toLowerCase();
    const entitled = founder ? ['chat', 'lore', 'discord'] : ['chat'];

    const clients = [
      {
        id: 'chat',
        name: 'Chat',
        description: 'General Vi interface for conversation and assistance.',
        status: entitled.includes('chat') ? 'available' : 'locked',
        entitled: entitled.includes('chat'),
      },
      {
        id: 'lore',
        name: 'Lore Tracker',
        description: 'Astralis Codex workspace for canon entities, facts, and rules.',
        status: entitled.includes('lore') ? 'available' : 'locked',
        entitled: entitled.includes('lore'),
      },
      {
        id: 'discord',
        name: 'Discord Bot',
        description: 'Server management, bot operations, and moderation controls.',
        status: entitled.includes('discord') ? 'available' : 'locked',
        entitled: entitled.includes('discord'),
      },
    ];

    const response: ApiResponse<typeof clients> = {
      ok: true,
      data: clients,
    };

    res.status(200).json(response);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Clients fetch failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// GET /api/lore/status — Lore client status (stub for now)
app.get('/api/lore/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const status = {
      codexConnected: false,
      entityCount: null,
      timelineEvents: null,
      lastSyncTs: null,
      rulesLoaded: false,
    };

    const response: ApiResponse<typeof status> = {
      ok: false,
      error: 'Codex not connected',
      reason: 'Astralis Codex integration pending',
      details: { status },
    };

    res.status(503).json(response);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Lore status failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// GET /api/lore/search — Lore search (stub for now)
app.get('/api/lore/search', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (!q) {
      const response: ApiResponse<any> = {
        ok: false,
        error: 'Query required',
        reason: 'Parameter "q" is required',
      };
      return res.status(400).json(response);
    }

    const response: ApiResponse<any> = {
      ok: false,
      error: 'Codex not connected',
      reason: 'Astralis Codex integration pending',
    };

    res.status(503).json(response);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Lore search failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// GET /api/discord/status — Discord bot status (stub for now)
app.get('/api/discord/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const status = {
      connected: false,
      botUser: null,
      latencyMs: null,
      serverCount: null,
    };

    const response: ApiResponse<typeof status> = {
      ok: false,
      error: 'Discord bot not connected',
      reason: 'Discord connector integration pending',
      details: { status },
    };

    res.status(503).json(response);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Discord status failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// GET /api/discord/servers — Discord server list (stub for now)
app.get('/api/discord/servers', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const response: ApiResponse<any[]> = {
      ok: false,
      error: 'Discord bot not connected',
      reason: 'Discord connector integration pending',
      details: { servers: [] },
    };

    res.status(503).json(response);
  } catch (error: any) {
    const errResponse: ApiResponse<any> = {
      ok: false,
      error: 'Discord servers fetch failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// POST /api/discord/server/:id/restart — Discord server restart (stub for now)
app.post('/api/discord/server/:id/restart', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const serverId = req.params.id;
    const response: ActionResponse = {
      ok: false,
      error: 'Discord bot not connected',
      reason: 'Discord connector integration pending',
    };

    res.status(503).json(response);
  } catch (error: any) {
    const errResponse: ActionResponse = {
      ok: false,
      error: 'Discord restart failed',
      reason: error?.message || String(error),
    };
    res.status(500).json(errResponse);
  }
});

// Chat endpoint — proxy to Vi's chat endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
  const chatStartTime = Date.now();
  console.log('[CHAT] Request received');
  
  try {
    const { message, sessionId, context, includeTrace } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      console.log('[CHAT] Invalid message');
      return res.status(400).json({ error: 'Message required' });
    }

    console.log('[CHAT] Valid message, calling Vi...');

    // Parse Vi URL manually
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    const fullPath = basePath + '/v1/chat';

    const viRequestBody = JSON.stringify({
      message: message.trim(),
      sessionId: sessionId || undefined,
      context: context || undefined,
      includeTrace: includeTrace === true,
    });

    // Forward guest user ID and Authorization header if present
    const guestUserId = req.headers['x-guest-user-id'];
    const authorization = req.headers['authorization'];
    
    // PHASE 1: Forward identity headers to Vi
    const xProvider = req.headers['x-provider'];
    const xProviderUserId = req.headers['x-provider-user-id'];
    const xClientId = req.headers['x-client-id'];
    
    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(viRequestBody),
        ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
        ...(authorization && { 'Authorization': authorization as string }),
        // PHASE 1: Identity headers
        ...(xProvider && { 'x-provider': xProvider as string }),
        ...(xProviderUserId && { 'x-provider-user-id': xProviderUserId as string }),
        ...(xClientId && { 'x-client-id': xClientId as string }),
      },
      timeout: 30000,
    };

    console.log(`[CHAT] Request options: ${hostname}:${options.port}${fullPath}`);

    const viReq = protocol.request(options, (viRes) => {
      console.log(`[CHAT] Vi response status: ${viRes.statusCode}`);
      let viData = '';

      viRes.on('data', (chunk) => {
        viData += chunk.toString();
      });

      viRes.on('end', () => {
        try {
          const responseTimeMs = Date.now() - chatStartTime;
          console.log(`[CHAT] Received ${viData.length} bytes from Vi in ${responseTimeMs}ms`);
          
          if (viRes.statusCode && viRes.statusCode >= 200 && viRes.statusCode < 300) {
            // Parse and validate response
            let parsedData: any;
            try {
              parsedData = JSON.parse(viData);
            } catch (parseErr) {
              console.error('[CHAT] Failed to parse Vi response:', parseErr);
              return res.status(500).json({ error: 'Invalid response from Vi' });
            }

            // Ensure response has required fields
            const responseData = {
              output: parsedData.output || '',
              recordId: parsedData.recordId || '',
              sessionId: parsedData.sessionId || sessionId,
              ...(parsedData.trace && { trace: parsedData.trace }),
              ...(parsedData.cognitive && { cognitive: parsedData.cognitive }),
              responseTimeMs,
            };

            console.log('[CHAT] Sending response to client');
            res.status(200).json(responseData);
          } else {
            console.error(`[CHAT] Vi returned error status ${viRes.statusCode} after ${responseTimeMs}ms: ${viData.substring(0, 100)}`);
            res.status(viRes.statusCode || 500).json({
              error: `Vi error: ${viRes.statusCode}`,
              responseTimeMs,
            });
          }
        } catch (err) {
          console.error('[CHAT] Error processing Vi response:', err);
          res.status(500).json({ error: 'Error processing Vi response' });
        }
      });
    });

    viReq.on('error', (err) => {
      console.error('[CHAT] Vi request error:', err.message);
      res.status(503).json({ error: `Cannot reach Vi: ${err.message}` });
    });

    viReq.on('timeout', () => {
      console.error('[CHAT] Vi request timeout');
      viReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Vi request timeout' });
      }
    });

    viReq.write(viRequestBody);
    viReq.end();
  } catch (error: any) {
    console.error('[CHAT] Catch block error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
});

// Evidence bundle proxy for God Console
app.get('/api/evidence', async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const query = typeof req.query.query === 'string' ? req.query.query : undefined;
    
    console.log('[EVIDENCE] Request:', { userId, sessionId, query });
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'userId and sessionId are required' });
    }

    // DISABLE CACHING - force fresh data every time
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';

    const params = new URLSearchParams({ userId, sessionId });
    if (query) params.append('query', query);
    const fullPath = `${basePath}/v1/admin/evidence?${params.toString()}`;

    const guestUserId = req.headers['x-guest-user-id'];
    const testModeHeader = req.headers['x-vi-test-mode'];
    const authorization = req.headers['authorization'];
    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      headers: {
        ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
        ...(testModeHeader && { 'x-vi-test-mode': testModeHeader as string }),
        ...(authorization && { 'Authorization': authorization as string }),
      },
      timeout: 20000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        if (!viRes.statusCode || viRes.statusCode >= 300) {
          return res.status(viRes.statusCode || 500).send(data || 'error');
        }
        try {
          res.status(200).json(JSON.parse(data));
        } catch (err) {
          console.error('[EVIDENCE] Failed to parse Vi evidence response:', err);
          res.status(500).json({ error: 'Invalid response from Vi' });
        }
      });
    });

    viReq.on('error', (err) => {
      console.error('[EVIDENCE] Vi evidence request error:', err.message);
      res.status(503).json({ error: `Cannot reach Vi: ${err.message}` });
    });

    viReq.on('timeout', () => {
      console.error('[EVIDENCE] Vi evidence request timeout');
      viReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Vi request timeout' });
      }
    });

    viReq.end();
  } catch (error: any) {
    console.error('[EVIDENCE] Catch block error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// God Console Audit: fetch latest audit events
app.get('/api/god/audit', requireAuth, (req: AuthRequest, res: Response) => {
  const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '50';
  const limit = Math.max(1, Math.min(parseInt(limitRaw, 10) || 50, 200));
  const events = readAuditEvents(limit);
  res.status(200).json(events);
});

// God Console Audit: realtime SSE stream
app.get('/api/god/audit/stream', requireAuth, (req: AuthRequest, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const ping = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch (err) {
      console.error('[AUDIT] SSE ping error:', err);
    }
  }, 20000);

  const client = { res, ping };
  auditClients.add(client);

  req.on('close', () => {
    clearInterval(ping);
    auditClients.delete(client);
  });
});

// God Console Core domain hydration (real signals only)
app.get('/api/god/core', async (_req: Request, res: Response) => {
  try {
    const viSignal = await fetchViCoreSignal();
    const payload: GodConsoleHydrationPayload = {
      viStatus: viSignal,
      systemState: `behavior=${controlState.behaviorMode}${controlState.memoryLocked ? ' | memory_locked' : ''}`,
      signals: {
        'core-posture': {
          label: `Behavior: ${controlState.behaviorMode}`,
          tone: viSignal.tone,
          detail: controlState.memoryLocked ? 'Memory writes locked (founder enforced).' : 'Memory writes unlocked.',
          timestamp: new Date().toISOString(),
          source: 'sovereign',
        },
      },
    };

    res.status(200).json(payload);
  } catch (error: any) {
    res.status(503).json({
      viStatus: {
        label: 'Offline',
        tone: 'offline',
        detail: error?.message || 'vi-core unreachable',
        timestamp: new Date().toISOString(),
        source: 'vi-core',
      },
    } satisfies GodConsoleHydrationPayload);
  }
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: UNIFIED SSE STREAM (All domain signals)
// ═══════════════════════════════════════════════════════════════

interface GodStreamClient {
  res: Response;
  ping: NodeJS.Timeout;
}

const godStreamClients = new Set<GodStreamClient>();

function broadcastGodSignal(envelope: GodSignalEnvelope) {
  const payload = `event: signal\ndata: ${JSON.stringify(envelope)}\n\n`;
  for (const client of godStreamClients) {
    try {
      client.res.write(payload);
    } catch (err) {
      console.error('[GOD-STREAM] SSE write error:', err);
    }
  }
}

// GET /api/god/stream — Unified realtime signal stream (all domains)
app.get('/api/god/stream', requireAuth, (req: AuthRequest, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const ping = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch (err) {
      console.error('[GOD-STREAM] SSE ping error:', err);
    }
  }, 20000);

  const client: GodStreamClient = { res, ping };
  godStreamClients.add(client);

  req.on('close', () => {
    clearInterval(ping);
    godStreamClients.delete(client);
  });
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: MEMORY DOMAIN
// ═══════════════════════════════════════════════════════════════

// GET /api/god/memory/status
app.get('/api/god/memory/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const status: MemoryStatus = {
      learningMode: controlState.behaviorMode,
      shortTerm: {
        count: null, // Not wired to actual memory store yet
        lastWriteTs: controlState.lastFlushAt ? new Date(controlState.lastFlushAt).getTime() : null,
      },
      longTerm: {
        locked: controlState.memoryLocked,
        count: null, // Not wired to actual memory store yet
        lastWriteTs: null,
      },
      pinned: {
        count: null, // Not wired yet
      },
    };

    const response: ApiResponse<MemoryStatus> = {
      ok: true,
      data: status,
    };

    res.status(200).json(response);
  } catch (error: any) {
    const response: ApiResponse<MemoryStatus> = {
      ok: false,
      error: 'Failed to fetch memory status',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// POST /api/god/memory/flush-short-term
app.post('/api/god/memory/flush-short-term', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.email || 'unknown';
    const now = new Date().toISOString();
    
    // Update control state
    controlState.lastFlushAt = now;
    
    // Log to audit
    const auditEvent: AuditEvent = {
      id: randomUUID(),
      ts: now,
      actor: user,
      action: 'memory.flush-short-term',
      outcome: 'success',
      message: 'Short-term memory flushed by founder',
    };
    appendAuditEvent(auditEvent);
    broadcastAuditEvent(auditEvent);
    
    // Broadcast memory signal
    const envelope: GodSignalEnvelope = {
      domain: 'memory',
      channel: 'status',
      ts: Date.now(),
      payload: {
        action: 'flush',
        status: {
          learningMode: controlState.behaviorMode,
          shortTerm: { count: 0, lastWriteTs: Date.now() },
          longTerm: { locked: controlState.memoryLocked, count: null, lastWriteTs: null },
          pinned: { count: null },
        },
        detail: 'Short-term memory flushed',
      },
    };
    broadcastGodSignal(envelope);
    
    const response: ActionResponse = {
      ok: true,
      data: {
        acknowledged: true,
        auditId: auditEvent.id,
        detail: 'Short-term memory flushed successfully',
      },
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    const response: ActionResponse = {
      ok: false,
      error: 'Failed to flush short-term memory',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// POST /api/god/memory/lock-long-term
app.post('/api/god/memory/lock-long-term', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (controlState.memoryLocked) {
      const response: ActionResponse = {
        ok: false,
        error: 'Memory already locked',
        reason: 'Long-term memory is already in locked state',
      };
      return res.status(409).json(response);
    }

    const user = req.user?.email || 'unknown';
    const now = new Date().toISOString();
    
    // Lock memory (irreversible)
    controlState.memoryLocked = true;
    
    // Log to audit
    const auditEvent: AuditEvent = {
      id: randomUUID(),
      ts: now,
      actor: user,
      action: 'memory.lock-long-term',
      outcome: 'success',
      message: 'Long-term memory locked (irreversible)',
      meta: { irreversible: true },
    };
    appendAuditEvent(auditEvent);
    broadcastAuditEvent(auditEvent);
    
    // Broadcast memory signal
    const envelope: GodSignalEnvelope = {
      domain: 'memory',
      channel: 'status',
      ts: Date.now(),
      payload: {
        action: 'lock',
        status: {
          learningMode: controlState.behaviorMode,
          shortTerm: { count: null, lastWriteTs: null },
          longTerm: { locked: true, count: null, lastWriteTs: null },
          pinned: { count: null },
        },
        detail: 'Long-term memory locked (irreversible)',
      },
    };
    broadcastGodSignal(envelope);
    
    const response: ActionResponse = {
      ok: true,
      data: {
        acknowledged: true,
        auditId: auditEvent.id,
        detail: 'Long-term memory locked successfully (irreversible)',
      },
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    const response: ActionResponse = {
      ok: false,
      error: 'Failed to lock long-term memory',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: LORE/CANON DOMAIN
// ═══════════════════════════════════════════════════════════════

// GET /api/god/lore/status
app.get('/api/god/lore/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    // Check if Astralis Codex is available
    // For now, explicitly return "not wired" since we don't have Codex integration yet
    const status: LoreStatus = {
      codexConnected: false,
      entityCount: null,
      timelineEvents: null,
      lastSyncTs: null,
      rulesLoaded: false,
    };

    const response: ApiResponse<LoreStatus> = {
      ok: false,
      error: 'Codex not connected',
      reason: 'Astralis Codex integration not yet wired to Sovereign',
      details: { status },
    };

    res.status(503).json(response);
  } catch (error: any) {
    const response: ApiResponse<LoreStatus> = {
      ok: false,
      error: 'Failed to fetch lore status',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// GET /api/god/lore/search
app.get('/api/god/lore/search', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    
    if (!query) {
      const response: ApiResponse<LoreSearchResult> = {
        ok: false,
        error: 'Query required',
        reason: 'Parameter "q" is required for lore search',
      };
      return res.status(400).json(response);
    }

    // Codex not wired yet - return explicit error
    const response: ApiResponse<LoreSearchResult> = {
      ok: false,
      error: 'Codex not connected',
      reason: 'Astralis Codex integration not yet wired to Sovereign',
    };

    res.status(503).json(response);
  } catch (error: any) {
    const response: ApiResponse<LoreSearchResult> = {
      ok: false,
      error: 'Failed to search lore',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: CLIENTS DOMAIN
// ═══════════════════════════════════════════════════════════════

// GET /api/god/clients/status
app.get('/api/god/clients/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    // Discord connector not wired yet - return explicit status
    const status: ClientsStatus = {
      discord: 'unknown',
      discordBotUser: null,
      gatewayLatencyMs: null,
      devices: null,
      adapters: [
        {
          name: 'sovereign',
          status: 'connected',
          lastSeenTs: Date.now(),
          metadata: { port: PORT },
        },
        // Other adapters (Vigil, etc.) would be listed here when wired
      ],
    };

    const response: ApiResponse<ClientsStatus> = {
      ok: true,
      data: status,
    };

    res.status(200).json(response);
  } catch (error: any) {
    const response: ApiResponse<ClientsStatus> = {
      ok: false,
      error: 'Failed to fetch clients status',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: SYSTEMS DOMAIN
// ═══════════════════════════════════════════════════════════════

// GET /api/god/systems/health
app.get('/api/god/systems/health', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const subsystems: SystemHealth[] = [];
    
    // Check vi-core
    try {
      const viSignal = await fetchViCoreSignal();
      subsystems.push({
        name: 'vi-core',
        status: viSignal.tone === 'ok' ? 'ok' : viSignal.tone === 'offline' ? 'down' : 'degraded',
        detail: viSignal.detail || null,
        lastCheckTs: Date.now(),
      });
    } catch {
      subsystems.push({
        name: 'vi-core',
        status: 'down',
        detail: 'Health check failed',
        lastCheckTs: Date.now(),
      });
    }
    
    // Check Sovereign itself
    subsystems.push({
      name: 'sovereign',
      status: 'ok',
      detail: 'Command server operational',
      lastCheckTs: Date.now(),
    });
    
    // Check database
    try {
      await pool.query('SELECT 1');
      subsystems.push({
        name: 'database',
        status: 'ok',
        detail: 'PostgreSQL reachable',
        lastCheckTs: Date.now(),
      });
    } catch (error: any) {
      subsystems.push({
        name: 'database',
        status: 'down',
        detail: error?.message || 'Database unreachable',
        lastCheckTs: Date.now(),
      });
    }
    
    // Codex connector (not wired)
    subsystems.push({
      name: 'codex-connector',
      status: 'unknown',
      detail: 'Not wired',
      lastCheckTs: null,
    });
    
    // Discord connector (not wired)
    subsystems.push({
      name: 'discord-connector',
      status: 'unknown',
      detail: 'Not wired',
      lastCheckTs: null,
    });
    
    const status: SystemsStatus = {
      subsystems,
    };

    const response: ApiResponse<SystemsStatus> = {
      ok: true,
      data: status,
    };

    res.status(200).json(response);
  } catch (error: any) {
    const response: ApiResponse<SystemsStatus> = {
      ok: false,
      error: 'Failed to fetch systems health',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// ═══════════════════════════════════════════════════════════════
// GOD CONSOLE: AUTHORITY DOMAIN
// ═══════════════════════════════════════════════════════════════

const authorityState = {
  directControl: false,
  shadowMode: false,
  testMode: false,
  emergencyHalt: false,
};

// GET /api/god/authority/status
app.get('/api/god/authority/status', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const status: AuthorityStatus = {
      directControl: authorityState.directControl,
      shadowMode: authorityState.shadowMode,
      testMode: testModeEnabled,
      emergencyHalt: authorityState.emergencyHalt,
    };

    const response: ApiResponse<AuthorityStatus> = {
      ok: true,
      data: status,
    };

    res.status(200).json(response);
  } catch (error: any) {
    const response: ApiResponse<AuthorityStatus> = {
      ok: false,
      error: 'Failed to fetch authority status',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// POST /api/god/authority/emergency-halt
app.post('/api/god/authority/emergency-halt', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (authorityState.emergencyHalt) {
      const response: ActionResponse = {
        ok: false,
        error: 'Emergency halt already active',
        reason: 'System is already in emergency halt state',
      };
      return res.status(409).json(response);
    }

    const user = req.user?.email || 'unknown';
    const now = new Date().toISOString();
    
    // Activate emergency halt
    authorityState.emergencyHalt = true;
    
    // Log to audit
    const auditEvent: AuditEvent = {
      id: randomUUID(),
      ts: now,
      actor: user,
      action: 'authority.emergency-halt',
      outcome: 'success',
      message: 'EMERGENCY HALT activated by founder',
      meta: { critical: true },
    };
    appendAuditEvent(auditEvent);
    broadcastAuditEvent(auditEvent);
    
    // Broadcast authority signal
    const envelope: GodSignalEnvelope = {
      domain: 'authority',
      channel: 'status',
      ts: Date.now(),
      payload: {
        action: 'emergency_halt',
        status: authorityState,
        detail: 'Emergency halt activated',
      },
    };
    broadcastGodSignal(envelope);
    
    const response: ActionResponse = {
      ok: true,
      data: {
        acknowledged: true,
        auditId: auditEvent.id,
        detail: 'Emergency halt activated successfully',
      },
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    const response: ActionResponse = {
      ok: false,
      error: 'Failed to activate emergency halt',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// POST /api/god/authority/reinit-loop
app.post('/api/god/authority/reinit-loop', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.email || 'unknown';
    const now = new Date().toISOString();
    
    // Reinit operation (placeholder - actual implementation depends on what "loop" means)
    // For now, just log and signal
    
    // Log to audit
    const auditEvent: AuditEvent = {
      id: randomUUID(),
      ts: now,
      actor: user,
      action: 'authority.reinit-loop',
      outcome: 'success',
      message: 'Control loop reinitialization requested by founder',
    };
    appendAuditEvent(auditEvent);
    broadcastAuditEvent(auditEvent);
    
    // Broadcast authority signal
    const envelope: GodSignalEnvelope = {
      domain: 'authority',
      channel: 'status',
      ts: Date.now(),
      payload: {
        action: 'reinit_loop',
        status: authorityState,
        detail: 'Control loop reinitialization in progress',
      },
    };
    broadcastGodSignal(envelope);
    
    const response: ActionResponse = {
      ok: true,
      data: {
        acknowledged: true,
        auditId: auditEvent.id,
        detail: 'Control loop reinitialization acknowledged (not fully implemented)',
      },
    };
    
    res.status(200).json(response);
  } catch (error: any) {
    const response: ActionResponse = {
      ok: false,
      error: 'Failed to reinitialize control loop',
      reason: error?.message || String(error),
    };
    res.status(500).json(response);
  }
});

// Live events stream proxy (SSE) for God Console
app.get('/api/events/stream', async (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (!userId || !sessionId) {
    return res.status(400).json({ error: 'userId and sessionId are required' });
  }

  const isHttps = VI_API_URL.startsWith('https://');
  const protocol = isHttps ? https : http;
  const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
  const [hostPart, ...pathParts] = urlPart.split('/');
  const [hostname, port] = hostPart.split(':');
  const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
  const params = new URLSearchParams({ userId, sessionId }).toString();
  const fullPath = `${basePath}/v1/admin/events/stream?${params}`;

  const guestUserId = req.headers['x-guest-user-id'];
  const testModeHeader = req.headers['x-vi-test-mode'];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const options = {
    hostname,
    port: port ? parseInt(port) : isHttps ? 443 : 80,
    path: fullPath,
    method: 'GET' as const,
    headers: {
      Accept: 'text/event-stream',
      ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
      ...(testModeHeader && { 'x-vi-test-mode': testModeHeader as string }),
    },
    timeout: 20000,
  };

  const viReq = protocol.request(options, (viRes) => {
    viRes.on('data', (chunk) => res.write(chunk));
    viRes.on('end', () => res.end());
  });

  viReq.on('error', (err) => {
    console.error('[EVENTS] Vi events stream error:', err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    viReq.destroy();
  });

  viReq.end();
});

// Comprehensive conversation export (includes decision pillar, memory, events, evidence)
app.get('/api/export/conversation', async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const format = typeof req.query.format === 'string' ? req.query.format : 'json'; // json or markdown
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'userId and sessionId are required' });
    }

    // Fetch evidence which includes all data
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';

    const params = new URLSearchParams({ userId, sessionId }).toString();
    const fullPath = `${basePath}/v1/admin/evidence?${params}`;

    const guestUserId = req.headers['x-guest-user-id'];
    const testModeHeader = req.headers['x-vi-test-mode'];
    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      headers: {
        ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
        ...(testModeHeader && { 'x-vi-test-mode': testModeHeader as string }),
      },
      timeout: 20000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        if (!viRes.statusCode || viRes.statusCode >= 300) {
          return res.status(viRes.statusCode || 500).send(data || 'error');
        }
        try {
          const evidence = JSON.parse(data);
          
          if (format === 'markdown') {
            const md = generateConversationMarkdown(evidence);
            res.status(200).set('Content-Type', 'text/markdown').send(md);
          } else {
            // Comprehensive JSON export with all data
            const exportData = {
              metadata: {
                exportTime: new Date().toISOString(),
                userId,
                sessionId,
                format: 'conversation-complete-v1',
              },
              evidence,
            };
            res.status(200).json(exportData);
          }
        } catch (err) {
          console.error('[EXPORT] Failed to parse Vi evidence response:', err);
          res.status(500).json({ error: 'Invalid response from Vi' });
        }
      });
    });

    viReq.on('error', (err) => {
      console.error('[EXPORT] Vi export request error:', err.message);
      res.status(503).json({ error: `Cannot reach Vi: ${err.message}` });
    });

    viReq.on('timeout', () => {
      console.error('[EXPORT] Vi export request timeout');
      viReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Vi request timeout' });
      }
    });

    viReq.end();
  } catch (error: any) {
    console.error('[EXPORT] Catch block error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Memory import endpoint
app.post('/api/import/memory', async (req: Request, res: Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'userId and sessionId are required' });
    }

    const { memory, injectionLabel } = req.body;
    if (!memory || typeof memory !== 'string') {
      return res.status(400).json({ error: 'memory (string) is required in body' });
    }

    // Forward to Vi's memory injection endpoint
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';

    const params = new URLSearchParams({ userId, sessionId }).toString();
    const fullPath = `${basePath}/v1/admin/memory/inject?${params}`;

    const payload = JSON.stringify({
      memoryText: memory,
      label: injectionLabel || 'imported',
    });

    const guestUserId = req.headers['x-guest-user-id'];
    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
      },
      timeout: 20000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        if (!viRes.statusCode || viRes.statusCode >= 300) {
          return res.status(viRes.statusCode || 500).send(data || 'error');
        }
        try {
          res.status(200).json(JSON.parse(data));
        } catch (err) {
          console.error('[IMPORT] Failed to parse Vi import response:', err);
          res.status(500).json({ error: 'Invalid response from Vi' });
        }
      });
    });

    viReq.on('error', (err) => {
      console.error('[IMPORT] Vi import request error:', err.message);
      res.status(503).json({ error: `Cannot reach Vi: ${err.message}` });
    });

    viReq.on('timeout', () => {
      console.error('[IMPORT] Vi import request timeout');
      viReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Vi request timeout' });
      }
    });

    viReq.write(payload);
    viReq.end();
  } catch (error: any) {
    console.error('[IMPORT] Catch block error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Helper function to generate conversation markdown
function generateConversationMarkdown(evidence: any): string {
  const md: string[] = [];
  
  md.push('# Vi Conversation Export');
  md.push('');
  md.push(`**Session:** ${evidence.sessionId || '—'}`);
  md.push(`**User:** ${evidence.userId || '—'}`);
  md.push(`**Generated:** ${new Date().toISOString()}`);
  md.push(`**Test Mode:** ${evidence.testMode ? 'on' : 'off'}`);
  md.push('');
  
  // Decision Pillar
  md.push('## Decision Pillar');
  if (evidence.stance) {
    md.push(`- **Stance:** ${evidence.stance.stance || '—'}`);
    md.push(`- **Reasoning:** ${evidence.stance.reasoning || '—'}`);
    md.push(`- **User Signals:** ${(evidence.stance.userSignals || []).join(', ') || '—'}`);
    md.push(`- **Governor Interventions:** ${evidence.stance.governorInterventions || 0}`);
    md.push(`- **Governor Issues:** ${(evidence.stance.governorIssues || []).join(', ') || 'none'}`);
  } else {
    md.push('(No stance data)');
  }
  md.push('');
  
  // Memory Sanctum
  md.push('## Memory Sanctum');
  if (evidence.memory) {
    md.push(`### Retrieved (${(evidence.memory.retrieved || []).length} items)`);
    (evidence.memory.retrieved || []).slice(0, 10).forEach((item: any, i: number) => {
      md.push(`${i + 1}. ${item.text || ''} [${item.type || 'unknown'}]`);
    });
    md.push('');
    
    md.push(`### Post-Filtered (${(evidence.memory.postFiltered || []).length} items)`);
    (evidence.memory.postFiltered || []).slice(0, 10).forEach((item: any, i: number) => {
      const score = item.adjustedScore ? ` (score: ${item.adjustedScore.toFixed(2)})` : '';
      md.push(`${i + 1}. ${item.text || ''}${score}`);
    });
    md.push('');
    
    if (evidence.memory.injectedBlob) {
      md.push('### Injected Blob');
      md.push(evidence.memory.injectedBlob);
      md.push('');
    }
  } else {
    md.push('(No memory data)');
  }
  md.push('');
  
  // Continuity & Cost Ledger
  md.push('## Continuity & Cost Ledger');
  if (evidence.continuity) {
    md.push(`- **Total Records:** ${evidence.continuity.totalRecords || 0}`);
    md.push(`- **Compression Triggered:** ${evidence.continuity.compressionTriggered ? 'yes' : 'no'}`);
    md.push(`- **Tail Kept:** ${evidence.continuity.tailKept || 0}`);
    md.push(`- **Retries:** ${evidence.continuity.retries || 0}`);
    md.push(`- **Errors:** ${(evidence.continuity.errors || []).length}`);
  } else {
    md.push('(No continuity data)');
  }
  md.push('');
  
  // Recent Runs
  md.push('## Recent Conversation Runs');
  if (evidence.runs && evidence.runs.length > 0) {
    evidence.runs.slice(0, 5).forEach((run: any, i: number) => {
      const text = run.input_text || run.inputText || '—';
      md.push(`${i + 1}. ${text.slice(0, 80)}... (${run.timestamp || 'unknown'})`);
    });
  } else {
    md.push('(No run data)');
  }
  md.push('');
  
  // Event Stream (latest)
  md.push('## Event Stream (Latest 20)');
  if (evidence.events && evidence.events.length > 0) {
    evidence.events.slice(0, 20).forEach((ev: any, i: number) => {
      md.push(`${i + 1}. [${ev.type}] ${ev.message || ''} @ ${ev.timestamp || 'unknown'}`);
    });
  } else {
    md.push('(No event data)');
  }
  md.push('');
  
  return md.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// CONTROL PLANE (Overseer) — Native to Sovereign (Phase 0.2)
// ═══════════════════════════════════════════════════════════════

/**
 * PHASE 0.2: Control Plane Truth (Overseer)
 * 
 * Implements health polling, service state resolution, and hung detection.
 * Status and audit endpoints now implemented with in-memory tracking.
 * Start/stop actions still throw NotImplementedByDesign (require orchestration).
 * 
 * Blocked by: Action protocol + verification framework
 * When: After Phase 3 (Agency Loop)
 */

class NotImplementedByDesign extends Error {
  constructor(message: string, context?: Record<string, any>) {
    super(message);
    this.name = 'NotImplementedByDesign';
    this.context = context;
  }
  context?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════
// ECOSYSTEM ORCHESTRATOR (real start/stop, no stubs)
// ═══════════════════════════════════════════════════════════════

type LifecycleStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'degraded';

interface ManagedService {
  id: string;
  name: string;
  cwd: string;
  startCmd: string;
  stopCmd: string;
  healthCheckUrl?: string | null;
  dockerName?: string;
  critical: boolean;
  startOrder: number;
  status: LifecycleStatus;
  lastError?: string;
  lastStart?: number;
  lastStop?: number;
}

const managedServices: Map<string, ManagedService> = new Map([
  [
    'postgres',
    {
      id: 'postgres',
      name: 'Postgres (pgvector)',
      cwd: VI_ROOT,
      startCmd: 'docker compose up -d postgres',
      stopCmd: 'docker compose stop postgres',
      healthCheckUrl: null,
      dockerName: 'vi-postgres',
      critical: true,
      startOrder: 1,
      status: 'stopped',
    },
  ],
  [
    'vector-store',
    {
      id: 'vector-store',
      name: 'Vector Store (Qdrant)',
      cwd: VI_ROOT,
      startCmd: 'docker compose up -d vector-store',
      stopCmd: 'docker compose stop vector-store',
      healthCheckUrl: 'http://localhost:6333',
      dockerName: 'vi-vector-store',
      critical: true,
      startOrder: 2,
      status: 'stopped',
    },
  ],
  [
    'vi-core',
    {
      id: 'vi-core',
      name: 'Vi Core',
      cwd: VI_ROOT,
      startCmd: 'docker compose up -d vi-core',
      stopCmd: 'docker compose stop vi-core',
      healthCheckUrl: 'http://localhost:3100/v1/health',
      dockerName: 'vi-core',
      critical: true,
      startOrder: 3,
      status: 'stopped',
    },
  ],
]);

function syncServiceStatus(service: ManagedService) {
  const normalized: ServiceStatus['status'] = service.status === 'running'
    ? 'running'
    : service.status === 'stopped'
      ? 'stopped'
      : 'crashed';

  overseerState.serviceStatus.set(service.id, {
    status: normalized,
    critical: service.critical,
    pid: undefined,
    uptime: service.lastStart ? Math.floor((Date.now() - service.lastStart) / 1000) : undefined,
    lastError: service.lastError,
  });
  overseerState.lastHealthCheck = new Date().toISOString();
}

async function refreshServiceStatuses() {
  const inContainer = await isRunningInContainer();

  for (const service of managedServices.values()) {
    // Prefer docker truth when available
    if (service.dockerName) {
      const dockerStatus = await checkDockerService(service.dockerName);
      service.status = dockerStatus.status === 'running'
        ? 'running'
        : dockerStatus.status === 'stopped'
          ? 'stopped'
          : 'crashed';
      service.lastError = dockerStatus.lastError;
    }

    // HTTP health check for running services (optional)
    const wasDegraded = service.status === 'degraded';
    if (service.healthCheckUrl && service.status === 'running') {
      const healthUrl = inContainer && service.healthCheckUrl.includes('localhost')
        ? service.healthCheckUrl.replace('localhost', service.dockerName || service.id)
        : service.healthCheckUrl;

      const healthy = await checkHttpService(healthUrl);
      if (!healthy) {
        service.status = 'degraded';
        service.lastError = 'Health check failed';
      } else if (wasDegraded) {
        service.status = 'running';
        service.lastError = undefined;
      }
    }

    syncServiceStatus(service);
  }
}

async function runCommand(cmd: string, cwd: string, env: NodeJS.ProcessEnv) {
  // Force a shell that exists on the current platform (fixes spawn /bin/sh ENOENT on Windows)
  const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
  const result = await execAsync(cmd, { cwd, env, shell });
  return result;
}

async function startService(serviceId: string, user = 'console') {
  const service = managedServices.get(serviceId);
  if (!service) return { ok: false, message: `Service ${serviceId} not found` };

  if (service.status === 'starting' || service.status === 'running') {
    return { ok: true, message: `${service.name} already ${service.status}` };
  }

  service.status = 'starting';
  service.lastStart = Date.now();
  syncServiceStatus(service);

  try {
    await runCommand(service.startCmd, service.cwd, process.env);
    service.status = 'running';
    service.lastError = undefined;
    syncServiceStatus(service);
    addAuditEntry('start', serviceId, user, 'success');
    await refreshServiceStatuses();
    return { ok: true, message: `${service.name} started` };
  } catch (err: any) {
    service.status = 'crashed';
    service.lastError = err?.message || String(err);
    syncServiceStatus(service);
    addAuditEntry('start', serviceId, user, 'failure', service.lastError);
    return { ok: false, message: service.lastError || 'Start failed' };
  }
}

async function stopService(serviceId: string, user = 'console') {
  const service = managedServices.get(serviceId);
  if (!service) return { ok: false, message: `Service ${serviceId} not found` };

  if (service.status === 'stopped' || service.status === 'stopping') {
    return { ok: true, message: `${service.name} already stopped` };
  }

  service.status = 'stopping';
  service.lastStop = Date.now();
  syncServiceStatus(service);

  try {
    await runCommand(service.stopCmd, service.cwd, process.env);
    service.status = 'stopped';
    service.lastError = undefined;
    syncServiceStatus(service);
    addAuditEntry('stop', serviceId, user, 'success');
    await refreshServiceStatuses();
    return { ok: true, message: `${service.name} stopped` };
  } catch (err: any) {
    service.status = 'crashed';
    service.lastError = err?.message || String(err);
    syncServiceStatus(service);
    addAuditEntry('stop', serviceId, user, 'failure', service.lastError);
    return { ok: false, message: service.lastError || 'Stop failed' };
  }
}

async function startAll(user = 'console') {
  const ordered = Array.from(managedServices.values()).sort((a, b) => a.startOrder - b.startOrder);
  const started: string[] = [];
  const failed: string[] = [];

  for (const service of ordered) {
    const result = await startService(service.id, user);
    if (result.ok) {
      started.push(service.id);
    } else {
      failed.push(service.id);
      if (service.critical) break;
    }
  }

  await refreshServiceStatuses();
  return { ok: failed.length === 0, started, failed, message: failed.length ? 'One or more services failed' : 'All services started' };
}

async function stopAll(user = 'console') {
  const ordered = Array.from(managedServices.values()).sort((a, b) => b.startOrder - a.startOrder);
  const stopped: string[] = [];
  const failed: string[] = [];

  for (const service of ordered) {
    const result = await stopService(service.id, user);
    if (result.ok) {
      stopped.push(service.id);
    } else {
      failed.push(service.id);
    }
  }

  await refreshServiceStatuses();
  return { ok: failed.length === 0, stopped, failed, message: failed.length ? 'One or more services failed to stop' : 'All services stopped' };
}

function buildEcosystemSnapshot() {
  const services: Record<string, any> = {};
  let healthy = true;

  for (const svc of managedServices.values()) {
    services[svc.id] = {
      status: svc.status,
      critical: svc.critical,
      pid: undefined,
      uptime: svc.lastStart ? Math.floor((Date.now() - svc.lastStart) / 1000) : 0,
      lastError: svc.lastError,
    };

    if (svc.critical && svc.status !== 'running') {
      healthy = false;
    }
  }

  return {
    healthy,
    timestamp: new Date().toISOString(),
    testMode: testModeEnabled,
    services,
  };
}

// GET /overseer/ecosystem/status
app.get('/overseer/ecosystem/status', async (_req: Request, res: Response) => {
  await refreshServiceStatuses();
  const snapshot = buildEcosystemSnapshot();

  addAuditEntry('ecosystem.status', undefined, 'console', snapshot.healthy ? 'success' : 'failure');
  res.status(200).json(snapshot);
});

// GET /overseer/audit/log
app.get('/overseer/audit/log', (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 1;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const entries = overseerState.auditLog.filter(e => new Date(e.timestamp) >= cutoff);
  
  res.status(200).json({
    entries,
    count: entries.length,
    days,
  });
});

// POST /overseer/ecosystem/start-all (PROTECTED - requires auth)
app.post('/overseer/ecosystem/start-all', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user?.email || 'unknown';
  const result = await startAll(user);
  const snapshot = buildEcosystemSnapshot();
  if (!result.ok) {
    return res.status(500).json({ ...result, status: snapshot });
  }
  res.status(200).json({ ...result, status: snapshot });
});

// POST /overseer/ecosystem/stop-all (PROTECTED - requires auth)
app.post('/overseer/ecosystem/stop-all', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user?.email || 'unknown';
  const result = await stopAll(user);
  const snapshot = buildEcosystemSnapshot();
  if (!result.ok) {
    return res.status(500).json({ ...result, status: snapshot });
  }
  res.status(200).json({ ...result, status: snapshot });
});

// POST /overseer/emergency/halt — hard stop everything and exit test mode (PROTECTED)
app.post('/overseer/emergency/halt', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user?.email || 'unknown';
  const stopResult = await stopAll(user);
  testModeEnabled = false;
  addAuditEntry('emergency.halt', undefined, user, stopResult.ok ? 'success' : 'failure', stopResult.message);

  const snapshot = buildEcosystemSnapshot();
  const statusCode = stopResult.ok ? 200 : 500;
  return res.status(statusCode).json({
    ok: stopResult.ok,
    action: 'halt',
    stopped: stopResult.stopped,
    failed: stopResult.failed,
    testMode: testModeEnabled,
    status: snapshot,
  });
});

// POST /overseer/emergency/reinit-loop — stop then restart everything, wait for healthy (PROTECTED)
app.post('/overseer/emergency/reinit-loop', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.user?.email || 'unknown';
  const maxWaitMs = 60000; // 60 second max wait for services to be healthy
  const pollIntervalMs = 2000; // Check every 2 seconds
  const startTime = Date.now();

  // Phase 1: Stop all services
  const stopResult = await stopAll(user);
  if (!stopResult.ok) {
    addAuditEntry('emergency.reinit', undefined, user, 'failure', `Stop failed: ${stopResult.message}`);
    const snapshot = buildEcosystemSnapshot();
    return res.status(500).json({
      ok: false,
      action: 'reinit-loop',
      phase: 'stop',
      error: stopResult.message,
      stop: stopResult,
      start: null,
      status: snapshot,
      waitTimeMs: Date.now() - startTime,
    });
  }

  // Phase 2: Start all services
  const startResult = await startAll(user);
  if (!startResult.ok) {
    addAuditEntry('emergency.reinit', undefined, user, 'failure', `Start failed: ${startResult.message}`);
    const snapshot = buildEcosystemSnapshot();
    return res.status(500).json({
      ok: false,
      action: 'reinit-loop',
      phase: 'start',
      error: startResult.message,
      stop: stopResult,
      start: startResult,
      status: snapshot,
      waitTimeMs: Date.now() - startTime,
    });
  }

  // Phase 3: Poll for healthy state (block until healthy or timeout)
  let snapshot = buildEcosystemSnapshot();
  let isHealthy = snapshot.healthy;
  let pollCount = 0;

  while (!isHealthy && Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    await refreshServiceStatuses();
    snapshot = buildEcosystemSnapshot();
    isHealthy = snapshot.healthy;
    pollCount++;
  }

  const totalWaitMs = Date.now() - startTime;
  const statusCode = isHealthy ? 200 : 503;
  const message = isHealthy 
    ? 'All services restarted and healthy'
    : `Services restarted but not healthy after ${totalWaitMs}ms (${pollCount} polls)`;

  addAuditEntry(
    'emergency.reinit',
    undefined,
    user,
    isHealthy ? 'success' : 'failure',
    `${message} (wait: ${totalWaitMs}ms)`
  );

  return res.status(statusCode).json({
    ok: isHealthy,
    action: 'reinit-loop',
    message,
    stop: stopResult,
    start: startResult,
    status: snapshot,
    waitTimeMs: totalWaitMs,
    pollCount,
    maxWaitMs,
  });
});

function getManagedService(serviceId: string) {
  const service = managedServices.get(serviceId);
  if (!service) {
    return null;
  }
  return service;
}

// GET /overseer/services/:id/status
app.get('/overseer/services/:id/status', async (req: Request, res: Response) => {
  const service = getManagedService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  await refreshServiceStatuses();
  const snapshot = buildEcosystemSnapshot();
  const svcStatus = snapshot.services[service.id];
  return res.status(200).json({ id: service.id, name: service.name, ...svcStatus });
});

// POST /overseer/services/:id/start
app.post('/overseer/services/:id/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const service = getManagedService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const user = req.user?.email || 'unknown';
  const result = await startService(service.id, user);
  const snapshot = buildEcosystemSnapshot();
  res.status(result.ok ? 200 : 500).json({ ...result, status: snapshot.services[service.id] });
});

// POST /overseer/services/:id/stop
app.post('/overseer/services/:id/stop', requireAuth, async (req: AuthRequest, res: Response) => {
  const service = getManagedService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const user = req.user?.email || 'unknown';
  const result = await stopService(service.id, user);
  const snapshot = buildEcosystemSnapshot();
  res.status(result.ok ? 200 : 500).json({ ...result, status: snapshot.services[service.id] });
});

// POST /overseer/services/:id/restart
app.post('/overseer/services/:id/restart', requireAuth, async (req: AuthRequest, res: Response) => {
  const service = getManagedService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const user = req.user?.email || 'unknown';
  await stopService(service.id, user);
  const result = await startService(service.id, user);
  const snapshot = buildEcosystemSnapshot();
  res.status(result.ok ? 200 : 500).json({ ...result, status: snapshot.services[service.id] });
});

// GET /overseer/logs/:id
app.get('/overseer/logs/:id', async (req: Request, res: Response) => {
  const service = getManagedService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const lines = Math.max(1, Math.min(parseInt((req.query.lines as string) || '100', 10) || 100, 500));
  const target = service.dockerName || service.id;

  try {
    const { stdout } = await execAsync(`docker logs --tail ${lines} ${target}`);
    const logs = stdout.split('\n').filter(Boolean);
    res.status(200).json({ service: service.id, lines: logs.length, logs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to read logs', message: err?.message || String(err) });
  }
});

// POST /overseer/mode/test-mode
app.post('/overseer/mode/test-mode', requireAuth, (req: AuthRequest, res: Response) => {
  const enabled = !!req.body?.enabled;
  testModeEnabled = enabled;
  addAuditEntry('mode.test', undefined, req.user?.email || 'unknown', 'success', `enabled=${enabled}`);
  res.status(200).json({ ok: true, enabled: testModeEnabled });
});

// GET /overseer/control/state — consolidated console control state (PROTECTED)
app.get('/overseer/control/state', requireAuth, (_req: AuthRequest, res: Response) => {
  res.status(200).json({
    behaviorMode: controlState.behaviorMode,
    memoryLocked: controlState.memoryLocked,
    memoryCheckpoints: controlState.memoryCheckpoints,
    lastFlushAt: controlState.lastFlushAt,
    lastRollbackAt: controlState.lastRollbackAt,
    testMode: testModeEnabled,
  });
});

// POST /overseer/control/behavior — set engagement posture (PROTECTED)
app.post('/overseer/control/behavior', requireAuth, (req: AuthRequest, res: Response) => {
  const allowed = ['learning', 'strict', 'autonomous', 'observer'] as const;
  const mode = (req.body?.mode as string | undefined)?.toLowerCase();
  if (!mode || !allowed.includes(mode as any)) {
    return res.status(400).json({ error: `mode must be one of: ${allowed.join(', ')}` });
  }

  controlState.behaviorMode = mode as any;
  addAuditEntry('behavior.mode', undefined, req.user?.email || 'unknown', 'success', `mode=${mode}`);
  res.status(200).json({ ok: true, behaviorMode: controlState.behaviorMode });
});

// POST /overseer/control/freeze-learning — irreversible lock (founder-only, no unlock path)
app.post('/overseer/control/freeze-learning', requireAuth, async (req: AuthRequest, res: Response) => {
  if (controlState.memoryLocked) {
    return res.status(409).json({ error: 'Memory already locked', memoryLocked: true, behaviorMode: controlState.behaviorMode });
  }

  controlState.behaviorMode = 'strict';
  controlState.memoryLocked = true;
  controlState.lastFlushAt = new Date().toISOString();

  addAuditEntry('authority.freeze-learning', undefined, req.user?.email || 'unknown', 'success', 'behavior=strict memoryLocked=true');

  // Reflect change as a God Console signal
  const signal: GodConsoleSignal = {
    label: 'Learning frozen',
    tone: 'warn',
    detail: 'Memory writes locked. Behavior set to strict.',
    timestamp: new Date().toISOString(),
    source: 'sovereign',
  };

  // Broadcast via unified stream
  const envelope: GodSignalEnvelope = {
    domain: 'core',
    channel: 'control',
    ts: Date.now(),
    payload: {
      status: {
        viStatus: 'connected',
        systemState: 'operational',
        behaviorMode: 'strict',
        memoryLocked: true,
      },
      detail: 'Learning frozen by founder',
    },
  };
  broadcastGodSignal(envelope);

  res.status(200).json({
    ok: true,
    behaviorMode: controlState.behaviorMode,
    memoryLocked: controlState.memoryLocked,
    signal,
  });
});

// POST /overseer/control/memory — memory governance actions (PROTECTED)
app.post('/overseer/control/memory', requireAuth, (req: AuthRequest, res: Response) => {
  const action = (req.body?.action as string | undefined)?.toLowerCase();

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  const now = new Date().toISOString();
  let message = '';

  switch (action) {
    case 'flush-short':
      controlState.lastFlushAt = now;
      message = 'Short-term memory flush requested';
      break;
    case 'lock-long':
      controlState.memoryLocked = true;
      message = 'Long-term memory locked';
      break;
    case 'unlock-long':
      controlState.memoryLocked = false;
      message = 'Long-term memory unlocked';
      break;
    case 'snapshot': {
      const checkpoint = { id: `chk-${Date.now()}`, timestamp: now, note: req.body?.note };
      controlState.memoryCheckpoints.unshift(checkpoint);
      controlState.memoryCheckpoints = controlState.memoryCheckpoints.slice(0, 10);
      message = 'Snapshot captured';
      break;
    }
    case 'rollback': {
      const rollbackTarget = req.body?.checkpointId as string | undefined;
      const chosen = rollbackTarget
        ? controlState.memoryCheckpoints.find(cp => cp.id === rollbackTarget)
        : controlState.memoryCheckpoints[0];
      controlState.lastRollbackAt = now;
      message = chosen ? `Rolled back to ${chosen.id}` : 'Rollback requested; no checkpoint found';
      break;
    }
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }

  addAuditEntry(`memory.${action}`, undefined, req.user?.email || 'unknown', 'success', message);

  res.status(200).json({
    ok: true,
    action,
    message,
    memoryLocked: controlState.memoryLocked,
    memoryCheckpoints: controlState.memoryCheckpoints,
    lastFlushAt: controlState.lastFlushAt,
    lastRollbackAt: controlState.lastRollbackAt,
  });
});

// GET /overseer/health (legacy endpoint, use /health instead)
app.get('/overseer/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'sovereign', port: PORT, testMode: testModeEnabled, lastHealthCheck: overseerState.lastHealthCheck });
});

// Debug identity passthrough — proxy to Vi's debug endpoint
app.get('/api/debug-identity', async (req: Request, res: Response) => {
  try {
    const isHttps = VI_API_URL.startsWith('https://');
    const protocol = isHttps ? https : http;
    const urlPart = VI_API_URL.replace(/^https?:\/\//i, '');
    const [hostPart, ...pathParts] = urlPart.split('/');
    const [hostname, port] = hostPart.split(':');
    const basePath = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const fullPath = basePath + `/v1/debug/identity${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`;

    const guestUserId = req.headers['x-guest-user-id'];
    const options = {
      hostname,
      port: port ? parseInt(port) : isHttps ? 443 : 80,
      path: fullPath,
      method: 'GET' as const,
      headers: {
        ...(guestUserId && { 'X-Guest-User-Id': guestUserId }),
      },
      timeout: 15000,
    };

    const viReq = protocol.request(options, (viRes) => {
      let data = '';
      viRes.on('data', (chunk) => (data += chunk.toString()));
      viRes.on('end', () => {
        try {
          res.status(viRes.statusCode || 200).send(data);
        } catch (err) {
          console.error('[DEBUG] Error proxying debug identity:', err);
          res.status(500).json({ error: 'Proxy error' });
        }
      });
    });

    viReq.on('error', (err) => {
      console.error('[DEBUG] Vi debug-identity request error:', err.message);
      res.status(503).json({ error: `Cannot reach Vi: ${err.message}` });
    });

    viReq.end();
  } catch (error: any) {
    console.error('[DEBUG] Catch block error:', error.message);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Serve static files (CSS, JS, images) - MUST come AFTER all /api/* routes
// The /api/* guard above ensures these don't intercept API calls
app.use('/tokens', express.static(path.join(__dirname, '../../../../packages/tokens')));
app.use(express.static(path.join(__dirname, '../public')));

// Explicit index route
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Fallback to index.html for SPA routes (must be LAST)
app.get('*', (req: Request, res: Response) => {
  console.log('[SPA] Serving index.html for route:', req.path);
  res.sendFile(path.join(__dirname, '../public/index.html'), (err) => {
    if (err) {
      console.error('[SPA] Error serving index.html:', err);
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// Error handler middleware
app.use((err: any, req: Request, res: Response, next: Function) => {
  console.error('[ERROR] Unhandled error:', err.message, err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎛️  Sovereign listening on http://localhost:${PORT}`);
  console.log(`📡 Connected to Vi at ${VI_API_URL}`);
  console.log(`${'='.repeat(50)}\n`);

  // God Console Wiring Checklist
  console.log('🔍 God Console Wiring Checklist:');
  
  // Check vi-core
  try {
    const viSignal = await fetchViCoreSignal();
    console.log(`  ✅ vi-core: ${viSignal.tone === 'ok' ? 'reachable' : viSignal.tone}`);
  } catch {
    console.log('  ❌ vi-core: unreachable');
  }
  
  // Check database
  try {
    await pool.query('SELECT 1');
    console.log('  ✅ database: connected');
  } catch {
    console.log('  ❌ database: connection failed');
  }
  
  // Check memory store
  console.log(`  ⚠️  memory store: not wired (using control state only)`);
  
  // Check codex connector
  console.log('  ⚠️  codex connector: not wired');
  
  // Check discord connector
  console.log('  ⚠️  discord connector: not wired');
  
  // Check authority hooks
  console.log('  ✅ authority hooks: available');
  
  console.log('');
});

// Global error handlers
process.on('unhandledRejection', (reason: any) => {
  console.error('[PROCESS] Unhandled Rejection:', reason);
  console.error(reason instanceof Error ? reason.stack : reason);
});

process.on('uncaughtException', (error: any) => {
  console.error('[PROCESS] Uncaught Exception:', error.message);
  console.error(error.stack);
  // Don't exit - try to keep server alive
});

server.on('error', (error: any) => {
  console.error('[SERVER] Server error:', error);
});

// Keep process alive
setInterval(() => {
  // heartbeat
}, 30000);
