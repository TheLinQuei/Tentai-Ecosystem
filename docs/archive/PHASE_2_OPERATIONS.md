# Phase 2: Operations Hardening (Week 2, 12-16 hours)

## Overview
After Phase 1 stabilizes the API layer, Phase 2 focuses on making the system production-ready from an operations perspective.

## Task 2.1: Persistent Audit Log (3-4 hours)

### Current State
- Audit log stored in-memory only
- Lost on server restart
- No historical audit trail

### Solution
Create database-backed audit log storage with retention policy.

### Implementation

**1. Create audit_logs table**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  action VARCHAR(100),
  details JSONB,
  ip_address INET,
  status VARCHAR(20), -- success, failure, pending
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255)
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

**2. Create AuditLogRepository**
```typescript
export class AuditLogRepository {
  constructor(private db: Database) {}

  async log(event: {
    eventType: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    action: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    status: 'success' | 'failure' | 'pending';
    durationMs?: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs 
       (event_type, user_id, resource_type, resource_id, action, details, 
        ip_address, status, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        event.eventType,
        event.userId,
        event.resourceType,
        event.resourceId,
        event.action,
        JSON.stringify(event.details || {}),
        event.ipAddress,
        event.status,
        event.durationMs
      ]
    );
  }

  async queryLogs(filters: {
    eventType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (filters.eventType) {
      query += ` AND event_type = $${params.length + 1}`;
      params.push(filters.eventType);
    }

    if (filters.userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(filters.userId);
    }

    if (filters.startDate) {
      query += ` AND created_at >= $${params.length + 1}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND created_at <= $${params.length + 1}`;
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }

    return this.db.query(query, params);
  }

  // Retention policy: delete logs older than 90 days
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL $1 DAY',
      [retentionDays]
    );
    return result.rowCount;
  }
}
```

**3. Add audit log endpoints**
```typescript
app.get('/api/admin/audit-logs', async (request, reply) => {
  const { eventType, userId, startDate, endDate, limit = 100 } = request.query as any;
  
  const logs = await auditLogRepo.queryLogs({
    eventType,
    userId,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    limit: Math.min(limit, 1000) // Cap at 1000
  });

  reply.send({ success: true, data: logs, count: logs.length });
});
```

### Success Criteria
✅ Audit logs persisted to database  
✅ Logs survive server restarts  
✅ Historical audit trail available for 90+ days  
✅ Query endpoint working for analysis  

---

## Task 2.2: Fix Docker Health Checks (2-3 hours)

### Current State
- Health check endpoint exists but may be unreliable
- Nested Docker environment complicates checks
- No readiness/liveness separation

### Solution
Implement robust health check endpoints with dependency verification.

**1. Create health check endpoints**
```typescript
import { Router } from 'fastify';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: { status: 'ok' | 'error'; latency: number };
    cache?: { status: 'ok' | 'error'; latency: number };
    externalApi?: { status: 'ok' | 'error'; latency: number };
  };
}

app.get('/health/live', async (request, reply) => {
  // Liveness: just check if server is running
  reply.send({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health/ready', async (request, reply) => {
  const dbLatency = await checkDatabaseConnection();
  
  if (dbLatency === null) {
    // Database unavailable
    reply.status(503).send({
      status: 'not_ready',
      reason: 'Database unavailable',
      timestamp: new Date().toISOString()
    });
    return;
  }

  reply.send({
    status: 'ready',
    timestamp: new Date().toISOString(),
    database_latency_ms: dbLatency
  });
});

app.get('/health/full', async (request, reply) => {
  const checks = await runAllHealthChecks();
  
  const unhealthy = Object.values(checks).some(c => c.status === 'error');
  
  reply.status(unhealthy ? 503 : 200).send({
    status: unhealthy ? 'unhealthy' : 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks
  });
});

async function runAllHealthChecks() {
  const [dbLatency, cacheLatency] = await Promise.all([
    checkDatabaseConnection(),
    checkCacheConnection()
  ]);

  return {
    database: {
      status: dbLatency === null ? 'error' : 'ok',
      latency: dbLatency || 0
    },
    cache: {
      status: cacheLatency === null ? 'error' : 'ok',
      latency: cacheLatency || 0
    }
  };
}
```

**2. Update Dockerfile**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy app
COPY dist ./dist

# Expose port
EXPOSE 3000

# Health check - use curl or node script
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/main.js"]
```

### Success Criteria
✅ `/health/live` responds within 100ms  
✅ `/health/ready` requires database connection  
✅ `/health/full` checks all dependencies  
✅ Docker health check reliable  

---

## Task 2.3: Graceful Shutdown (2-3 hours)

### Current State
- Server doesn't handle shutdown signals
- In-flight requests may be interrupted
- Database connections not properly closed

### Solution
Implement graceful shutdown with connection draining.

```typescript
import { FastifyInstance } from 'fastify';
import { getLogger } from './middleware/logging';

const logger = getLogger();

export function setupGracefulShutdown(app: FastifyInstance): void {
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown');

    // Step 1: Stop accepting new requests
    app.close();

    // Step 2: Wait for in-flight requests to complete (with timeout)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Step 3: Close database connections
      if ((global as any).db) {
        logger.debug('Closing database connections');
        await (global as any).db.end();
      }

      // Step 4: Close cache connections
      if ((global as any).cache) {
        logger.debug('Closing cache connections');
        await (global as any).cache.disconnect();
      }

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  // Handle signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });
}
```

**Usage in main.ts:**
```typescript
setupGracefulShutdown(app);
```

### Success Criteria
✅ Server waits for in-flight requests before exiting  
✅ Database connections properly closed  
✅ Graceful shutdown within 30 seconds  
✅ No data loss during shutdown  

---

## Task 2.4: Database Cleanup Jobs (2-3 hours)

### Current State
- No automatic cleanup of expired data
- Database may grow unbounded
- Old sessions/logs accumulate

### Solution
Implement scheduled cleanup jobs.

```typescript
import cron from 'node-cron';
import { getLogger } from './middleware/logging';

const logger = getLogger();

export class CleanupScheduler {
  constructor(private db: Database) {}

  start(): void {
    // Run daily at 2 AM
    cron.schedule('0 2 * * *', () => this.runCleanup());
    logger.info('Cleanup scheduler started');
  }

  private async runCleanup(): Promise<void> {
    logger.info('Starting scheduled cleanup');
    const startTime = Date.now();

    try {
      // Delete expired sessions (older than 30 days)
      const sessionResult = await this.db.query(
        'DELETE FROM sessions WHERE created_at < NOW() - INTERVAL 30 DAY'
      );
      logger.debug({ deleted: sessionResult.rowCount }, 'Expired sessions deleted');

      // Delete old audit logs (older than 90 days)
      const auditResult = await this.db.query(
        'DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL 90 DAY'
      );
      logger.debug({ deleted: auditResult.rowCount }, 'Old audit logs deleted');

      // Delete orphaned memories (not referenced by any session)
      const memoryResult = await this.db.query(
        'DELETE FROM memories WHERE session_id NOT IN (SELECT id FROM sessions)'
      );
      logger.debug({ deleted: memoryResult.rowCount }, 'Orphaned memories deleted');

      // Vacuum database (PostgreSQL specific)
      await this.db.query('VACUUM ANALYZE');

      const duration = Date.now() - startTime;
      logger.info(
        { duration },
        'Scheduled cleanup completed successfully'
      );
    } catch (error) {
      logger.error({ error }, 'Cleanup job failed');
    }
  }
}
```

### Success Criteria
✅ Cleanup runs automatically daily  
✅ Expired data removed correctly  
✅ Database performance maintained  
✅ No data loss during cleanup  

---

## Task 2.5: Prometheus Metrics (3-4 hours)

### Current State
- No metrics collection
- No visibility into performance
- Hard to diagnose production issues

### Solution
Add Prometheus metrics for key operations.

```typescript
import promClient from 'prom-client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Define metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [100, 500, 1000, 2000, 5000]
});

const databaseQueryDuration = new promClient.Histogram({
  name: 'database_query_duration_ms',
  help: 'Duration of database queries in ms',
  labelNames: ['query_type'],
  buckets: [10, 50, 100, 500, 1000]
});

const llmRequestDuration = new promClient.Histogram({
  name: 'llm_request_duration_ms',
  help: 'Duration of LLM API requests in ms',
  labelNames: ['model', 'status'],
  buckets: [500, 1000, 2000, 5000, 10000]
});

const conversationCount = new promClient.Gauge({
  name: 'conversations_total',
  help: 'Total number of conversations'
});

const activeSessionsCount = new promClient.Gauge({
  name: 'active_sessions',
  help: 'Number of active sessions'
});

const errorCount = new promClient.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'status_code']
});

// Middleware to track HTTP requests
export function metricsMiddleware() {
  return (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    reply.addHook('onResponse', (request, reply, done) => {
      const duration = Date.now() - startTime;
      const route = request.url.split('?')[0]; // Remove query params

      httpRequestDuration
        .labels(request.method, route, reply.statusCode)
        .observe(duration);

      done();
    });
  };
}

// Register metrics endpoint
export function registerMetricsEndpoint(app: FastifyInstance): void {
  app.get('/metrics', async (request, reply) => {
    const metrics = await promClient.register.metrics();
    reply.type('text/plain').send(metrics);
  });
}

export {
  httpRequestDuration,
  databaseQueryDuration,
  llmRequestDuration,
  conversationCount,
  activeSessionsCount,
  errorCount
};
```

**Usage:**
```typescript
import { metricsMiddleware, databaseQueryDuration } from './metrics';

app.addHook('preHandler', metricsMiddleware());

// Track database queries
const startTime = Date.now();
const result = await db.query(...);
databaseQueryDuration.labels('select').observe(Date.now() - startTime);
```

### Success Criteria
✅ HTTP request metrics collected  
✅ Database query performance tracked  
✅ LLM API performance visible  
✅ /metrics endpoint working  

---

## Implementation Checklist

- [ ] Create audit_logs table
- [ ] Implement AuditLogRepository
- [ ] Add audit query endpoints
- [ ] Create health check endpoints
- [ ] Update Dockerfile with HEALTHCHECK
- [ ] Implement graceful shutdown
- [ ] Create cleanup scheduler
- [ ] Set up Prometheus metrics
- [ ] Test all operations with load testing
- [ ] Document runbook for operations team

## Estimated Time: 12-16 hours

- Persistent audit log: 3-4 hours
- Health checks: 2-3 hours
- Graceful shutdown: 2-3 hours
- Database cleanup: 2-3 hours
- Prometheus metrics: 3-4 hours
- Testing & integration: 1-2 hours

## Next Steps

Phase 3: Frontend Modernization
- React migration for Sovereign
- Component library
- Memory viewer UI
- Evidence panel
