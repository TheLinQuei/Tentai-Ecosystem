# Vi Memory API

Neural memory service for Vi Discord Bot — provides hybrid vector + keyword search, semantic context retrieval, and graph relationships.

## 🏗️ Architecture

- **Postgres/TimescaleDB**: Episodic timeline with full-text search (tsvector)
- **Qdrant**: Vector embeddings for semantic search
- **Neo4j**: Knowledge graph with RELATED relationships
- **Redis + BullMQ**: Async embedding job queue
- **Fastify**: REST API (port 4311)

## 🚀 Quick Start (Windows)

### Prerequisites
- Docker Desktop running
- Node.js 18+ with pnpm installed

### 1. Start Infrastructure

From repository root:

```powershell
pnpm run infra:up
```

This starts:
- Postgres on `localhost:5434`
- Redis on `localhost:6380`
- Qdrant on `localhost:6333`
- Neo4j on `localhost:7687`
- NATS on `localhost:4222`

### 2. Configure Environment

Copy `.env.example` to `.env`:

```powershell
cd apps/memory
Copy-Item .env.example .env
```

**⚠️ Windows Note**: Use `localhost` (NOT `127.0.0.1`) for all service URLs to avoid WSL relay interference.

### 3. Start Memory API

From repository root:

```powershell
pnpm run memory:dev
```

Or in a separate window:

```powershell
Start-Process PowerShell -ArgumentList '-NoExit','-Command','pnpm run memory:dev'
```

### 4. Verify Health

```powershell
Invoke-RestMethod http://localhost:4311/health/postgres
Invoke-RestMethod http://localhost:4311/health/qdrant
Invoke-RestMethod http://localhost:4311/health/neo4j
```

## 📡 API Endpoints

### Health Checks
- `GET /health/postgres` - Postgres connection status
- `GET /health/qdrant` - Qdrant connection status
- `GET /health/neo4j` - Neo4j connection status

### Memory Operations
- `POST /v1/mem/upsert` - Store new memory (enqueues embedding)
- `POST /v1/mem/searchHybrid` - Hybrid vector + keyword search (weighted 0.7 vec + 0.3 kw)
- `GET /v1/mem/context` - Get recent + semantically related memories
- `POST /v1/mem/relate` - Create knowledge graph edge

### Jobs
- `GET /jobs/status` - BullMQ queue stats (waiting, active, completed)

### Documentation
- `GET /openapi.json` - OpenAPI spec

## 🧪 Testing

Run smoke tests:

```powershell
cd apps/memory
.\smoke-test.ps1
```

Seed test data:

```powershell
pnpm run seed
```

## 🐛 Troubleshooting (Windows)

### "password authentication failed for user vibot"

**Cause**: Port 5433 intercepted by WSL relay (`wslrelay.exe`)

**Fix**: 
1. Ensure `POSTGRES_URL` uses `localhost:5434` (NOT `127.0.0.1:5433`)
2. Verify `infra/docker-compose.yml` maps `5434:5432`
3. Restart: `pnpm run infra:down && pnpm run infra:up`

### "Unable to connect to the remote server"

**Check Docker containers are running**:

```powershell
docker ps
```

You should see:
- `infra-postgres-1`
- `infra-redis-1`
- `infra-qdrant-1`
- `infra-neo4j-1`

**Verify port bindings**:

```powershell
Get-NetTCPConnection -LocalPort 5434,6380,6333,7687 | Format-Table
```

### "Queue vi-embed failed"

**Check Redis connection**:

```powershell
docker exec -it infra-redis-1 redis-cli ping
```

Should return `PONG`.

### Embedding Jobs Stuck

**View BullMQ queue status**:

```powershell
Invoke-RestMethod http://localhost:4311/jobs/status
```

**Check worker logs** in the Memory API terminal for embedding errors.

## 🔧 Development

### Project Structure

```
apps/memory/
├── src/
│   ├── index.ts          # Main Fastify server
│   ├── types.ts          # Shared interfaces
│   └── lib/
│       ├── clients.ts    # DB client factories
│       ├── embed.ts      # OpenAI/fastembed pipeline
│       ├── qdrant.ts     # Vector store ops
│       └── queue.ts      # BullMQ worker
├── scripts/
│   └── seed.ts           # Data seeding
├── .env.example          # Environment template
├── package.json
└── README.md
```

### Key Files

- **clients.ts**: Connection factories for Postgres, Qdrant, Neo4j, Redis
- **embed.ts**: Embedding generation (OpenAI API → fastembed → hash fallback)
- **qdrant.ts**: Vector collection management, upsert, search
- **queue.ts**: BullMQ worker that embeds text and writes to Qdrant
- **index.ts**: REST endpoints, database migration, worker startup

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4311 | Memory API port |
| `POSTGRES_URL` | localhost:5434 | Postgres connection string |
| `QDRANT_URL` | http://localhost:6333 | Qdrant REST endpoint |
| `NEO4J_URL` | bolt://localhost:7687 | Neo4j Bolt protocol |
| `REDIS_URL` | redis://localhost:6380 | Redis for BullMQ |
| `EMBED_PROVIDER` | fastembed | `fastembed` or `openai` |
| `EMBED_MODEL` | minilm-L6-v2 | Embedding model name |
| `EMBED_DIM` | 384 | Vector dimension |
| `OPENAI_API_KEY` | (optional) | OpenAI API key for embeddings |

### Adding New Endpoints

1. Define Zod schema in `src/index.ts`
2. Add route handler
3. Update `openapi.json` descriptor
4. Test with smoke-test.ps1

## 📊 Performance

- **Target**: p95 search latency < 120ms
- **Hybrid weights**: 0.7 vector + 0.3 keyword
- **Embedding queue**: Async via BullMQ (non-blocking upsert)

## 🔒 Security Notes

- **No auth** in current implementation (internal service)
- **SSL disabled** for local development
- **Plaintext passwords** in docker-compose (change for production)

---

**Next**: Integrate with Vi bot via SDK (`packages/sdk`) for conversational memory.
