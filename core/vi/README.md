# Vi Core: Phase 1 Implementation

Sovereign AI Runtime - The Brain

## Quick Start

**Install dependencies:**
```bash
npm install
```

**Run in development:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Run CLI:**
```bash
npm run cli -- --help
```

**Run tests:**
```bash
npm test
```

## What Is Vi?

Vi is the sovereign intelligence at the center of the Tentai Ecosystem. It:
- Listens to user input (via clients like Sovereign or Vigil)
- Reasons about the request using cognition modules
- Accesses memory (both short-term and long-term)
- Executes tools safely
- Returns responses with evidence trails and citations

All other repos are **clients** that talk to Vi. Vi is the source of truth.

## Project Structure

- `src/` — Source code organized by domain (runtime, perception, intent, etc.)
- `tests/` — Unit, integration, E2E tests + fixtures
- `docs/` — Implementation docs + ADRs
- `db/` — Database pool, migrations, repositories
- `scripts/` — Utility scripts

## Milestone 1 Status

This is the **skeleton that runs** phase:

- ✅ Project structure created
- ✅ TypeScript + ESLint + Prettier configured
- ✅ Vitest configured
- ✅ Config system (env-based)
- ✅ Logger (Pino)
- ✅ Telemetry collector
- ✅ Fastify server with `/v1/health`
- ✅ CLI skeleton (`vi --help`)
- ✅ Basic infrastructure tests

### Milestone 1 Public API Guarantees (What This Milestone Promises)

1. **Server is reachable:** HTTP server starts on port 3000 (default, configurable via `VI_PORT`) and responds to requests
2. **Health endpoint exists:** GET `/v1/health` returns `{"status":"ok","version":"0.1.0","timestamp":"..."}`
3. **CLI is callable:** `node dist/cli/cli.js --version` and `--help` work; shows commands (`chat`, `ask`, `debug`, `help`)
4. **Logging is structured:** Pino logger records events to disk (telemetry path configurable via `VI_TELEMETRY_PATH`)
5. **Config is externalized:** All runtime parameters (port, host, log level, API keys) can be set via env vars with sensible defaults

### Milestone 1 Explicit Non-Promises (What This Milestone Does NOT Include)

1. **No multi-modal handling:** Audio/video/image handlers don't exist; "supports multi-modal" would be false
2. **No LLM integration:** OpenAI/Anthropic API clients not wired; CLI commands are functional but not yet connected
3. **No database:** No persistent storage; memory is in-process only; Milestone 2 adds this
4. **No authentication:** No user sessions, API keys, or permission checks; Milestone 3+ adds this
5. **No request validation:** No schema enforcement; handlers accept any JSON input; Milestone 2 adds validation

## Database Configuration

Defaults point to the bundled Docker Postgres service:
- Host: 127.0.0.1
- Port: 55432 (mapped to 5432 in the container)
- User/Password: postgres/postgres
- Database: vi

Override with:
- `DATABASE_URL` — full Postgres URL (takes precedence)
- `VI_DB_HOST`, `VI_DB_PORT`, `VI_DB_USER`, `VI_DB_PASSWORD`, `VI_DB_NAME`, `VI_DB_SSL`
- `VI_DB_POOL_SIZE`, `VI_DB_CONNECTION_TIMEOUT_MS`, `VI_DB_IDLE_TIMEOUT_MS`

## Milestone 2 (In Progress)
- Postgres integration (docker-compose + migrations via `npm run migrate`)
- Repositories for conversations and messages
- Validated endpoints: `POST /v1/conversations`, `POST /v1/conversations/:id/messages`, `GET /v1/conversations/:id/messages`

## Key Concepts (Planned for later milestones)

### Sessions

A session is a conversation with Vi. When a user starts chatting with Sovereign or sends a message to Vigil, a session is created.

```typescript
// Start a session (not yet implemented)
const session = await vi.createSession({
  userId: 'user-123',
  context: { app: 'sovereign', version: '1.0' }
});

// Run a turn (user input → response)
const response = await session.turn({
  message: 'What can you tell me about character X?'
});

// Session includes evidence
response.citations;  // Where did we get this info?
response.confidence; // How sure are we?
```

### Memory

Vi has two types of memory:

**Short-term:** What was said in this session?
```typescript
const shortTerm = await session.memory.shortTerm();
// Returns: [ { role: 'user', message: '...' }, ... ]
```

**Long-term:** What do we know from history?
```typescript
const longTerm = await vi.memory.retrieve({
  query: 'character X abilities',
  userId: 'user-123',
  limit: 10
});
// Returns: [ { source: 'astralis-codex', text: '...', confidence: 0.95 }, ... ]
```

### Tools

Vi can execute tools safely:

```typescript
const result = await vi.tools.execute({
  name: 'query-codex',
  args: { entityId: 'char-123', field: 'abilities' }
});
// Tools have retries, guardrails, and error handling
```

## Development Rules

See [AI.md](./AI.md) for build rules specific to this repo.

Also read:
- [copilot-rules.md](../copilot-rules.md) — Ecosystem-wide rules
- [STRUCTURE.md](../STRUCTURE.md) — Why this structure exists

## Phases

Vi is built in phases:

**Phase 1:** Sessions + Memory + Tools
- User sends message
- Vi stores in short-term memory
- Vi can retrieve from long-term
- Vi can call tools
- Vi returns response with citations

**Phase 2:** Reasoning + Evidence
- Cognition pipeline refines reasoning
- Better evidence trails
- Contradiction detection

**Phase 3:** Agents & Planning
- Vi can create sub-tasks
- Vi can plan multi-step solutions
- Delegation to sub-agents

Later phases unlock client unfreezes:
- Phase 1 complete → Sovereign unfreezes
- Phase 2 complete → Astralis Codex unfreezes
- Phase 3+ complete → Vigil unfreezes

## Docs

See `/docs` for:
- [Quickstart](docs/00-overview/QUICKSTART.md) — 5-minute setup
- [API Reference](docs/API.md) — Complete endpoint documentation
- [Milestone 1 Completion](docs/MILESTONE-1-COMPLETION.md) — Foundation verification
- [Milestone 2 Completion](docs/MILESTONE-2-COMPLETION.md) — Data persistence verification
- `10-architecture/` — System design
- `20-modules/` — Module docs
- `90-adr/` — Decision records

## Testing

```bash
npm test          # All tests
npm run test:unit # Unit tests only
npm run test:int  # Integration tests
npm run test:e2e  # End-to-end tests
npm run test:coverage # Coverage report
```

## Observability & Operations (Phase 8)

**Metrics:**
- Prometheus endpoint: `GET /v1/metrics`
- Metrics exported: chat requests, rate limiting, autonomy events, autonomy chimes, server uptime
- Format: Prometheus text/plain + JSON fallback

**Distributed Tracing:**
- OpenTelemetry auto-instrumentation for HTTP/Fastify
- Manual tracing for cognition pipeline (planner, executor)
- Configurable OTLP export or console output
- Environment variables: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`

**Alerting:**
- Prometheus alert rules: [ops/alerts/vi-alerts.yml](../../ops/alerts/vi-alerts.yml)
- Alert groups: availability, performance, capacity, resources, database, SLO
- Runbooks: [ops/alerts/RUNBOOKS.md](../../ops/alerts/RUNBOOKS.md)

**Load Testing:**
- k6 test harness: [ops/tests/load-test.js](../../ops/tests/load-test.js)
- Scenarios: smoke, load, stress, spike, soak
- See [ops/tests/README.md](../../ops/tests/README.md) for usage

## Status

🔥 **ACTIVE** — Phases 1-8 complete (77EZ Roadmap)

📍 **Next:** Client unfreezes (Sovereign advanced features, Astralis Codex, Vigil)

See [ROADMAP.md](../../ops/tentai-docs/00-ecosystem/ROADMAP.md) for full ecosystem timeline.
