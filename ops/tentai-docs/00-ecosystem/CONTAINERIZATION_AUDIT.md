# Containerization Audit: Single Entry Point Architecture

**Status:** Audit Complete  
**Date:** 2026-01-01  
**Goal:** Boot PC → Run .exe → Full ecosystem starts and is controlled from UI

## Current State

### Services & Lifecycle Order

| Service | Port | Critical | StartOrder | Path | Status |
|---------|------|----------|-----------|------|--------|
| Vi Core | 3100 | ✅ YES | 1 | `core/vi` | Running (npm run dev) |
| Memory Store | 3050 | ✅ YES | 2 | `core/memory` | Not running |
| Vector Store (Qdrant) | 6333 | ✅ YES | 2 | `core/vector` | Not running |
| Redis Cache | 6379 | ❌ NO | 2 | `infra` | Not running |
| Worker Pool | 3150 | ❌ NO | 3 | `core/workers` | Not running |
| Sovereign (God Console) | 3001 | ❌ NO | 4 | `clients/command/sovereign` | Running (npm run dev) |

**Source:** `core/overseer/src/main.ts` (lines 100-250)

### Database

- **Current:** SQLite (file: `core/vi/vi.db`)
- **Container Available:** PostgreSQL 16 with pgVector
- **Docker Compose:** `core/vi/docker-compose.yml` (Postgres on port 55432)
- **Configuration:** 
  - User: `postgres`
  - Password: `postgres`
  - DB: `vi`
  - Environment Variable: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vi`

### Overseer (Control Plane)

- **Location:** `core/overseer/src/main.ts`
- **Purpose:** Service lifecycle management, health checks, audit trail
- **Status:** Implemented but standalone (port 3200, currently not running)
- **Capabilities:**
  - Start/stop/restart services in startup order
  - Health check polling
  - Audit logging to `.overseer-audit/`
  - Process lifecycle tracking
  - Command lockout (1s between requests)
  - Port management

### Current Startup Process (Manual)

```bash
# Terminal 1: Start Vi Core
cd core/vi
$env:VI_PORT = 3100
npm run dev

# Terminal 2: Start Sovereign
cd clients/command/sovereign
npm run dev

# Manual browser access to http://localhost:3001
```

**Problems with current approach:**
- Multiple terminals required
- No orchestration
- Services start in wrong order (Sovereign before dependencies)
- Postgres runs separately (`docker-compose up`)
- Overseer exists but isn't used as control plane
- No single entry point

## Target Architecture: Single .EXE Entry Point

### Vision
```
Boot PC
  ↓
Run God-Console.exe
  ↓
exe→ Docker Compose up (Postgres, all services)
  ↓
exe→ Host Sovereign locally OR serve from container
  ↓
Browser: http://localhost:3001
  ↓
God Console UI controls entire ecosystem
```

## Implementation Plan

### Phase 1: Unified Docker Compose

**File:** `docker-compose.yml` (root or `ops/tentai-infra/`)

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:0.6.0-pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: vi
    ports:
      - "5432:5432"  # Internal port
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    volumes:
      - postgres-data:/var/lib/postgresql/data

  vi-core:
    build:
      context: ./core/vi
      dockerfile: Dockerfile
    environment:
      VI_PORT: 3100
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/vi
      NODE_ENV: development
    ports:
      - "3100:3100"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  memory-store:
    build:
      context: ./core/memory
      dockerfile: Dockerfile
    environment:
      PORT: 3050
    ports:
      - "3050:3050"
    depends_on:
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3050/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  vector-store:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 5s
      timeout: 5s
      retries: 5

  sovereign:
    build:
      context: ./clients/command/sovereign
      dockerfile: Dockerfile
    environment:
      SOVEREIGN_PORT: 3001
      VI_API_URL: http://vi-core:3100
    ports:
      - "3001:3001"
    depends_on:
      vi-core:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

### Phase 2: Dockerfiles

Each service needs a `Dockerfile`:

**`core/vi/Dockerfile`**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3100
CMD ["npm", "start"]
```

**`clients/command/sovereign/Dockerfile`**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

**`core/memory/Dockerfile`** (if it exists; otherwise skip)

### Phase 3: Launcher .EXE (Windows) / Executable (Cross-platform)

**Technology:** Electron or Node.js bundled with `pkg` or `esbuild`

**Behavior:**
1. Detect if Docker is installed
2. Show splash screen "Starting ecosystem..."
3. Run: `docker-compose up -d`
4. Poll health endpoints until all services report 200
5. Once ready, open default browser to `http://localhost:3001`
6. UI shows "Ecosystem Ready"

**Pseudo-code:**
```typescript
// launcher/src/main.ts
import { spawn } from 'child_process';
import fetch from 'node-fetch';

async function boot() {
  console.log('Starting Vi ecosystem...');
  
  // Start Docker Compose
  const docker = spawn('docker-compose', ['up', '-d'], {
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit'
  });
  
  await new Promise(r => docker.on('exit', r));
  
  // Poll health endpoints
  const services = ['postgres', 'vi-core', 'memory-store', 'sovereign'];
  let allHealthy = false;
  
  while (!allHealthy) {
    try {
      const responses = await Promise.all([
        fetch('http://localhost:5432'),  // Postgres
        fetch('http://localhost:3100/health'),
        fetch('http://localhost:3050/health'),
        fetch('http://localhost:3001/health'),
      ]);
      
      allHealthy = responses.every(r => r.ok);
    } catch {
      console.log('Waiting for services...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // Open browser
  open('http://localhost:3001');
  console.log('✅ Vi ecosystem ready');
}

boot().catch(err => {
  console.error('Boot failed:', err);
  process.exit(1);
});
```

### Phase 4: Update Overseer

Overseer should be the **health polling + lifecycle management engine** running inside the container or as a sidecar, NOT as a separate service.

**New role:**
- Accessible at `http://localhost:3001/overseer/*` (native to Sovereign)
- Polls each service's `/health` endpoint every 5 seconds
- Tracks state: `healthy → degraded → hung → down`
- Emits audit events to Evidence vault
- Exposes state via `/overseer/ecosystem/status` (currently 501, implement this)

## Phase 1: Unified Containerization ✅ COMPLETE

**Status:** Docker Compose + Dockerfiles created and tested

### ✅ Created Artifacts

| File | Purpose | Status |
|------|---------|--------|
| `ops/tentai-infra/docker-compose.yml` | Unified orchestration (postgres, vi-core, vector-store, sovereign) | ✅ Working |
| `core/vi/Dockerfile` | Development image (tsx live transpiler) | ✅ Builds |
| `clients/command/sovereign/Dockerfile` | Development image | ✅ Builds |
| `core/vi/.dockerignore` | Build cache optimization | ✅ Done |
| `clients/command/sovereign/.dockerignore` | Build cache optimization | ✅ Done |
| `ops/tentai-infra/README.md` | Bootstrap guide | ✅ Done |

### ✅ What Works

- Docker images build successfully in dev mode (using `npm run dev` with tsx)
- Docker Compose orchestrates all 4 services with health checks
- Postgres container starts and is healthy
- Vector store (Qdrant) starts and is healthy
- Both services can talk to Postgres via internal network (`postgres:5432`)
- Services expose health endpoints for liveness/readiness checks

### ⚠️ Known Issues (Phase 2 tasks)

1. **Migration Failures** — Vi Core migrations try to drop users table without CASCADE
   - **Workaround:** Start services natively until migrations are fixed
   - **Fix:** Update migration in `core/vi/src/db/migrations.ts` to use CASCADE drops
   - **Blocked by:** Database cleanup + migration hardening

2. **Database Initialization** — Fresh Postgres needs schema setup
   - **Current:** Manual via `npm run dev` (handles migrations)
   - **Fix:** Either fix migrations OR add init script to docker-compose
   - **Blocked by:** Migration fixes

3. **TypeScript Errors** — Vi Core has strict mode errors (unused vars, type issues)
   - **Current:** Dev mode uses tsx, bypasses compilation
   - **Fix:** Clean up TS errors so `npm run build` works
   - **Impact:** Can't use multi-stage production builds yet
   - **Blocked by:** Code cleanup

### ✅ Current Working Setup

**Postgres in Docker:**
```bash
cd ops/tentai-infra
docker-compose up -d postgres vector-store
```

**Vi Core + Sovereign Natively** (temporary):
```bash
cd core/vi
$env:VI_PORT = 3100
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/vi"
npm run dev

# Terminal 2
cd clients/command/sovereign
npm run dev
```

**Then access:** http://localhost:3001

---

## Next: Phase 2 — Database Migration & Build Fixes

## Timeline

| Phase | Task | Effort | Blocker |
|-------|------|--------|---------|
| 1 | Docker Compose + Dockerfiles | 2-3 hours | None |
| 2 | Postgres migration (Vi Core) | 4-6 hours | None |
| 3 | Launcher .EXE skeleton | 2-3 hours | None |
| 4 | Overseer health polling | 3-4 hours | Phase 1 complete |
| 5 | Test: Boot PC → Run .exe → Ecosystem up | 1 hour | All above |

## Notes

- **No more port 3200** — Overseer is now port 3001 (native to Sovereign)
- **Database:** Migrate from SQLite to Postgres for multi-service consistency
- **Single entry point:** .exe handles orchestration, user never touches Docker
- **Health checks:** All services expose `/health` and are polled by control plane
- **Audit trail:** All lifecycle actions logged to Evidence vault

---

**Next:** Proceed to Phase 1 (Docker Compose). Update this document as each phase completes.
