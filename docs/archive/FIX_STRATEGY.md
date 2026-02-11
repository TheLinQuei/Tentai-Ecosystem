# TENTAI ECOSYSTEM — COMPREHENSIVE FIX STRATEGY

**Status:** In Progress  
**Start Date:** January 3, 2026  
**Target Completion:** 8 weeks  
**Team Size:** Assume 1-2 developers

---

## EXECUTIVE SUMMARY

This document outlines the complete fix strategy to address all critical gaps, issues, and technical debt identified in the COMPREHENSIVE_AUDIT.md. The plan is organized into 5 phases over 8 weeks, prioritizing by impact and effort.

### High-Level Timeline
- **Week 1 (PHASE 1):** Quick Wins (validation, error handling, logging)
- **Week 2 (PHASE 2):** Operations Hardening (persistence, health checks, cleanup)
- **Weeks 3-4 (PHASE 3):** Frontend Improvements (React migration, memory viewer)
- **Week 5 (PHASE 4):** Testing & Documentation
- **Weeks 6-8 (PHASE 5):** Advanced Features (streaming, planning)

---

## PHASE 1: QUICK WINS (Week 1)

### 1.1: Standardize Error Responses ✅

**Current State:** Inconsistent - some endpoints return `{error}`, others `{message}`, others throw

**Target State:** All endpoints return standardized JSON with structure:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {"field": "error"}
  },
  "requestId": "uuid",
  "timestamp": "2026-01-03T..."
}
```

**Files to Update:**
- [ ] core/vi/src/runtime/server.ts — Create error middleware
- [ ] core/vi/src/errors/AppError.ts — New error class with codes
- [ ] All 40+ route handlers — Use error middleware

**Implementation:**
```typescript
// Create AppError class
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

// Error middleware
app.use((err, req, res, next) => {
  const error = err instanceof AppError ? err : new AppError('INTERNAL_ERROR', err.message, 500);
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details
    },
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});
```

**Effort:** 4-6 hours

---

### 1.2: Add Request Validation to All Routes ✅

**Current State:** ~60% of endpoints validate with Zod

**Target State:** 100% of endpoints use Zod schema validation

**High-Impact Routes Missing Validation:**
- `POST /api/profile/voice-setup`
- `POST /api/auth/refresh-token`
- `POST /overseer/control/behavior`
- `POST /overseer/emergency/halt`
- And ~15 more

**Implementation Pattern:**
```typescript
// Before
app.post('/api/profile/voice-setup', requireAuth, async (req, res) => {
  const { displayName, tone } = req.body;  // ← No validation!
  // ...
});

// After
const voiceSetupSchema = z.object({
  displayName: z.string().min(1).max(100),
  tone: z.enum(['direct', 'warm', 'soft']).optional()
});

app.post('/api/profile/voice-setup', requireAuth, async (req, res) => {
  const { displayName, tone } = voiceSetupSchema.parse(req.body);
  // ...
});
```

**Files to Update:**
- [ ] core/vi/src/runtime/server.ts — Add/fix 20+ schemas

**Effort:** 3-4 hours

---

### 1.3: Add Comprehensive Logging ✅

**Current State:** ~30% of functions have structured logs

**Target State:** All critical paths logged (85%+ coverage)

**Functions Missing Logs (Priority List):**
1. brain/planner.ts — plan generation
2. brain/executor.ts — step execution
3. brain/reflector.ts — reflection logic
4. tools/selector.ts — tool selection
5. brain/policy/PolicyEngineImpl.ts — policy enforcement
6. And ~25+ more

**Implementation:**
```typescript
// Before
async generatePlan(intent, context) {
  const plan = ...
  return plan;  // ← No logging
}

// After
async generatePlan(intent, context) {
  const logger = getLogger();
  logger.info({ intent, contextKeys: Object.keys(context || {}) }, 'Generating plan');
  const startTime = Date.now();
  
  const plan = ...
  
  logger.info({
    planSteps: plan.steps.length,
    duration: Date.now() - startTime,
    planId: plan.id
  }, 'Plan generated successfully');
  
  return plan;
}
```

**Effort:** 4-5 hours

---

### 1.4: Implement Rate Limiting Middleware ✅

**Current State:** RateLimiter class exists but not enforced

**Target State:** Rate limiting active on all public endpoints

**Implementation:**
```typescript
// core/vi/src/middleware/rateLimiter.ts
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to routes
app.post('/v1/chat', limiter, chatHandler);
app.post('/api/auth/login', loginLimiter, loginHandler);
// etc.
```

**Files to Update:**
- [ ] core/vi/src/runtime/server.ts — Add rate limiting middleware

**Effort:** 2-3 hours

---

### 1.5: Validate Environment Variables at Startup ✅

**Current State:** Invalid env vars cause runtime failures

**Target State:** Config validation at bootstrap, fail fast with clear error

**Implementation:**
```typescript
// core/vi/src/config/config.ts
import { z } from 'zod';

const configSchema = z.object({
  node: z.object({
    env: z.enum(['development', 'production']).default('development'),
  }),
  server: z.object({
    port: z.coerce.number().default(3000),
    host: z.string().default('127.0.0.1'),
  }),
  database: z.object({
    url: z.string().url(),
    poolSize: z.coerce.number().default(10),
  }),
  auth: z.object({
    jwtSecret: z.string().min(32),
  }),
  openai: z.object({
    apiKey: z.string().optional(),
  }),
});

export function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    result.error.errors.forEach(err => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  return result.data;
}
```

**Effort:** 2 hours

---

### Phase 1 Summary
- **Total Effort:** 15-20 hours
- **Files Modified:** 8-10
- **Impact:** Massive (makes system production-ready for basic deployment)
- **Test Strategy:** Run full test suite after each fix

---

## PHASE 2: OPERATIONS HARDENING (Week 2)

### 2.1: Persist Overseer Audit Log to Database ✅

**Current State:** Audit log in memory, lost on restart

**Files to Create/Modify:**
- [ ] core/vi/src/db/repositories/AuditLogRepository.ts (NEW)
- [ ] SQL migration: `add_audit_log_table.sql` (NEW)
- [ ] clients/command/sovereign/src/server.ts — Use repository

**Schema:**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  action VARCHAR(100) NOT NULL,
  service VARCHAR(50),
  user_id VARCHAR(255),
  result VARCHAR(20) NOT NULL, -- 'success' | 'failure'
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

**Effort:** 3-4 hours

---

### 2.2: Fix Docker Health Check Detection ✅

**Current State:** Heuristics fail in nested Docker

**Root Cause:** `/var/run/docker.sock` not available in nested Docker, hardcoded service names

**Solution:**
```typescript
// Improve detection with multiple fallbacks
async function checkServiceHealth(serviceName: string): Promise<ServiceStatus> {
  // Try 1: Direct HTTP health check
  try {
    const url = `http://${serviceName}:${getPortForService(serviceName)}/health`;
    const response = await fetch(url, { timeout: 5000 });
    if (response.ok) return { status: 'running', critical: true };
  } catch (e) {
    // Fallback
  }

  // Try 2: Docker socket (if available)
  try {
    const docker = new Docker();
    const container = await docker.getContainer(serviceName).inspect();
    return {
      status: container.State.Running ? 'running' : 'stopped',
      critical: true
    };
  } catch (e) {
    // Fallback
  }

  // Try 3: Environment-based detection
  if (process.env.DOCKER_CONTAINER === 'true') {
    // Inside Docker - use service discovery
    return checkServiceHealthDns(serviceName);
  }

  return { status: 'unknown', critical: true };
}
```

**Files to Update:**
- [ ] clients/command/sovereign/src/server.ts — Improve checkDockerService function

**Effort:** 2-3 hours

---

### 2.3: Add Graceful Database Connection Shutdown ✅

**Current State:** Pool might not drain properly on shutdown

**Implementation:**
```typescript
// core/vi/src/main.ts
async function shutdown(signal: string) {
  console.log(`\n[SHUTDOWN] Received ${signal}`);
  
  logger.info('Closing database connection pool...');
  await pool.end();
  
  logger.info('Closing HTTP server...');
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  logger.info('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Effort:** 1-2 hours

---

### 2.4: Add Database Cleanup Jobs ✅

**Current State:** Old data accumulates forever

**Solution:** Implement retention policies per table

```typescript
// core/vi/src/jobs/databaseCleanup.ts
export class DatabaseCleanupJob {
  constructor(private pool: Pool) {}

  async run() {
    const logger = getLogger();
    logger.info('Running database cleanup job...');

    // Clean old telemetry (keep 90 days)
    const telemetryResult = await this.pool.query(
      `DELETE FROM telemetry_events WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    logger.info({ deleted: telemetryResult.rowCount }, 'Cleaned telemetry events');

    // Clean old sessions (keep 30 days, but keep active ones)
    const sessionResult = await this.pool.query(`
      DELETE FROM sessions 
      WHERE last_activity < NOW() - INTERVAL '30 days'
    `);
    logger.info({ deleted: sessionResult.rowCount }, 'Cleaned old sessions');

    // Deduplicate memories
    const memoryResult = await this.pool.query(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY text ORDER BY created_at DESC) AS rn
        FROM memory_vectors
      )
      DELETE FROM memory_vectors WHERE id IN (
        SELECT id FROM ranked WHERE rn > 1
      )
    `);
    logger.info({ deleted: memoryResult.rowCount }, 'Deduplicated memories');
  }
}

// Schedule in main.ts
const cleanupJob = new DatabaseCleanupJob(pool);
setInterval(() => cleanupJob.run(), 24 * 60 * 60 * 1000); // Daily
```

**Files to Create:**
- [ ] core/vi/src/jobs/databaseCleanup.ts (NEW)

**Effort:** 2-3 hours

---

### 2.5: Add Prometheus Metrics ✅

**Current State:** No metrics endpoint

**Implementation:**
```typescript
// core/vi/src/observability/metrics.ts
import promClient from 'prom-client';

export const metrics = {
  httpRequestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
  }),
  
  chatRequests: new promClient.Counter({
    name: 'chat_requests_total',
    help: 'Total chat requests',
    labelNames: ['status']
  }),
  
  toolExecutions: new promClient.Counter({
    name: 'tool_executions_total',
    help: 'Total tool executions',
    labelNames: ['tool_name', 'success']
  }),
  
  memoryOperations: new promClient.Gauge({
    name: 'memory_operations_total',
    help: 'Total memory operations',
    labelNames: ['operation_type']
  }),
};

// Add to server
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

**Files to Create:**
- [ ] core/vi/src/observability/metrics.ts (NEW)
- [ ] clients/command/sovereign/src/middleware/metricsMiddleware.ts (NEW)

**Effort:** 3 hours

---

### Phase 2 Summary
- **Total Effort:** 12-16 hours
- **Files Created:** 2
- **Files Modified:** 2
- **Impact:** System now operationally hardened

---

## PHASE 3: FRONTEND IMPROVEMENTS (Weeks 3-4)

### 3.1: React Migration (Core Structure)

**Current State:** 2,163 lines in single HTML file

**Target:** React + TypeScript with component structure

**Step 1: Scaffold React App**
```bash
cd clients/command/sovereign
npx create-react-app . --template typescript
# Or use Vite: npm create vite@latest . -- --template react-ts
```

**Step 2: Component Structure**
```
src/
├── components/
│   ├── AuthGate/
│   │   ├── AuthGate.tsx
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── styles.css
│   ├── ChatPanel/
│   │   ├── ChatPanel.tsx
│   │   ├── MessageList.tsx
│   │   ├── InputBox.tsx
│   │   └── styles.css
│   ├── MemoryViewer/
│   │   ├── MemoryViewer.tsx
│   │   └── MemorySearch.tsx
│   ├── EvidencePanel/
│   │   ├── EvidencePanel.tsx
│   │   └── CitationBadge.tsx
│   └── common/
│       ├── Button.tsx
│       ├── Panel.tsx
│       └── Modal.tsx
├── pages/
│   ├── ChatPage.tsx
│   ├── SettingsPage.tsx
│   └── DashboardPage.tsx
├── state/
│   ├── useAuth.ts
│   ├── useChat.ts
│   └── useMemory.ts
├── services/
│   ├── api.ts
│   └── ws.ts
├── types/
│   ├── index.ts
│   └── api.ts
└── App.tsx
```

**Files to Create:** ~20 new files (React components, hooks, services)

**Effort:** 12-16 hours

---

### 3.2: Create React Component Library

**Purpose:** Reusable components with proper state management

**Components to Build:**
1. Button (primary, secondary, accent)
2. Panel (with title, content, footer)
3. Modal (dialog overlay)
4. TextInput (with validation)
5. TextArea
6. Select/Dropdown
7. Tab panel
8. Spinner/Loading
9. Toast (notifications)
10. Avatar

**Location:** packages/ui/src/components/

**Effort:** 8-10 hours

---

### 3.3: Add Memory Viewer UI Panel

**Features:**
- Search memory by query
- Filter by type (episodic, semantic, relational, commitment)
- Display memory source and confidence
- Show creation time

**Component:**
```tsx
// components/MemoryViewer/MemoryViewer.tsx
export function MemoryViewer() {
  const [query, setQuery] = useState('');
  const [memories, setMemories] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const response = await api.post('/v1/memory/search', { query });
      setMemories(response.data.memories);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Panel title="Memory Viewer">
      <div className="memory-search">
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search memories..."
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      <div className="memory-results">
        {memories.map((mem) => (
          <div key={mem.id} className="memory-item">
            <p className="memory-text">{mem.text}</p>
            <div className="memory-meta">
              <span className="memory-type">{mem.type}</span>
              <span className="memory-confidence">{(mem.confidence * 100).toFixed(0)}%</span>
              <span className="memory-date">{formatDate(mem.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

**Backend API to Add:**
- `POST /v1/memory/search` — Search memories
- `GET /v1/memory/stats` — Memory statistics

**Effort:** 4-5 hours

---

### 3.4: Add Evidence/Citation Panel

**Features:**
- Show citations for each response
- Display provenance chain
- Show confidence levels
- Link to original sources

**Component:**
```tsx
// components/EvidencePanel/EvidencePanel.tsx
export function EvidencePanel({ response }) {
  return (
    <Panel title="Evidence & Citations">
      <div className="citations">
        {response.citations.map((citation, idx) => (
          <div key={idx} className="citation-item">
            <CitationBadge
              source={citation.source}
              confidence={citation.confidence}
              timestamp={citation.timestamp}
            />
            <p className="citation-text">{citation.text}</p>
            {citation.provenance && (
              <div className="provenance-chain">
                <span>Provenance:</span>
                {citation.provenance.map((step, i) => (
                  <span key={i}>{step}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

**Effort:** 3-4 hours

---

### Phase 3 Summary
- **Total Effort:** 30-40 hours
- **Components Created:** 20+
- **Impact:** UI becomes maintainable and modern

---

## PHASE 4: TESTING & DOCUMENTATION (Week 5)

### 4.1: Add Under-Tested Areas

**Focus Areas:**
1. Reflection pipeline (currently light)
2. Tool verification (verifier implementations)
3. Self-model regeneration
4. Advanced planning fallback
5. Error recovery in tool chains
6. Concurrent operations (stress test)

**Add ~20 new tests** covering these areas

**Effort:** 6-8 hours

---

### 4.2: Write Deployment Guide

**Sections:**
- Prerequisites
- Local development setup
- Docker Compose deployment
- Kubernetes deployment
- Environment variables
- Database setup
- SSL certificates
- Monitoring setup

**Effort:** 4 hours

---

### 4.3: Create OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: Vi Core API
  version: 1.0.0
paths:
  /v1/chat:
    post:
      summary: Chat with Vi
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatRequest'
      responses:
        '200':
          description: Chat response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ChatResponse'
# ... full spec
```

**Effort:** 4-6 hours

---

### 4.4: Write Troubleshooting Guide

**Sections:**
- Common startup errors
- Database connection issues
- LLM API failures
- Memory issues
- Performance problems
- Docker issues
- Tool execution failures

**Effort:** 3 hours

---

### Phase 4 Summary
- **Total Effort:** 17-21 hours
- **Docs/Tests Created:** 100+ pages

---

## PHASE 5: ADVANCED FEATURES (Weeks 6-8)

### 5.1: Streaming Responses (WebSocket)

**Current:** All responses buffered

**Target:** Stream responses as they're generated

**Implementation:**
```typescript
// Server-side
app.ws('/v1/chat-stream', requireAuth, async (ws, req) => {
  try {
    const { message, sessionId } = req.body;
    
    // Stream response chunks
    const stream = await vi.chat.stream({
      message,
      sessionId,
      onChunk: (chunk) => {
        ws.send(JSON.stringify({
          type: 'chunk',
          data: chunk
        }));
      }
    });

    ws.send(JSON.stringify({ type: 'done', recordId: stream.recordId }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
  }
});

// Client-side
const ws = new WebSocket('ws://localhost:3100/v1/chat-stream');
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'chunk') {
    appendToChat(data);
  }
};
```

**Effort:** 8-10 hours

---

### 5.2: Advanced Planning

**Current:** Basic LLM planning works, fallback incomplete

**Target:** Multi-step reasoning with constraint solving

**Implementation:** Add tree search and hypothesis evaluation

**Effort:** 12-15 hours

---

### 5.3: Python SDK

**Implement:** Full Python client matching TypeScript SDK

**Effort:** 10-12 hours

---

### Phase 5 Summary
- **Total Effort:** 30-37 hours
- **Advanced Features:** 3 major additions

---

## TOTAL PROJECT SUMMARY

```
PHASE 1 (Quick Wins):         15-20 hours
PHASE 2 (Operations):         12-16 hours
PHASE 3 (Frontend):           30-40 hours
PHASE 4 (Testing & Docs):     17-21 hours
PHASE 5 (Advanced):           30-37 hours
────────────────────────────────────────
TOTAL:                        104-134 hours

Estimated Timeline:
- 1 developer: 5-7 weeks (20 hrs/week)
- 2 developers: 2.5-3.5 weeks (working in parallel)
```

---

## SUCCESS CRITERIA

### By End of Week 1 (Phase 1)
- ✅ All endpoints return standardized error responses
- ✅ All routes validate input with Zod
- ✅ 85%+ of critical functions have structured logs
- ✅ Rate limiting active
- ✅ Env vars validated at startup

### By End of Week 2 (Phase 2)
- ✅ Overseer audit log persisted to database
- ✅ Docker health checks reliable
- ✅ Graceful shutdown working
- ✅ Database cleanup jobs running daily
- ✅ Prometheus metrics available at `/metrics`

### By End of Week 4 (Phase 3)
- ✅ React migration 80% complete
- ✅ Component library functional
- ✅ Memory viewer UI working
- ✅ Evidence panel integrated

### By End of Week 5 (Phase 4)
- ✅ 20+ new tests added (coverage >75%)
- ✅ Deployment guide written
- ✅ OpenAPI spec complete
- ✅ Troubleshooting guide available

### By End of Week 8 (Phase 5)
- ✅ WebSocket streaming working
- ✅ Advanced planning implemented
- ✅ Python SDK complete
- ✅ System production-ready

---

## ROLLBACK STRATEGY

If major issues arise:
1. **Keep git commits atomic** — each fix is one commit
2. **Tag before each phase** — `v1.0-phase-1-complete`, etc.
3. **Test after each fix** — run full test suite
4. **Revert if tests fail** — `git revert` single commit

---

## COMMUNICATION

- **Daily standup:** 15 minutes (what's done, what's next, blockers)
- **Weekly review:** Look at COMPREHENSIVE_AUDIT.md, update status
- **Keep COMPREHENSIVE_AUDIT.md current** as fixes are completed

---

**Let's Ship It! 🚀**
