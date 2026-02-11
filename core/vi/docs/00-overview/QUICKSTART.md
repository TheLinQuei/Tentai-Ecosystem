# Tentai Vi — Quick Start

**Framework:** Fastify  
**Port:** 3000 (default, configurable via `VI_PORT`)  
**Health Endpoint:** GET `/v1/health`

---

## 5-Minute Setup

1. Enter repo
  ```bash
  cd core/vi
  ```

2. Install dependencies
  ```bash
  npm install
  ```

3. Start Postgres (Docker)
  ```bash
  npm run db:up
  ```
  Database URL default: `postgres://postgres:postgres@localhost:55432/vi`

4. Type-check and build
  ```bash
  npm run type-check
  npm run build
  ```

5. Run migrations (after build)
  ```bash
  npm run migrate
  ```

6. Start server
  ```bash
  npm start
  ```
  Server listens on `http://localhost:3000`

7. Test health endpoint
  ```bash
  curl http://localhost:3000/v1/health
  ```

8. Try the API
  ```bash
  # Create a conversation
  curl -X POST http://localhost:3000/v1/conversations \
    -H "Content-Type: application/json" \
    -d '{"title":"Quickstart Conversation"}'

  # Add a message
  curl -X POST http://localhost:3000/v1/conversations/<id>/messages \
    -H "Content-Type: application/json" \
    -d '{"role":"user","content":"Hello"}'

  # List messages
  curl http://localhost:3000/v1/conversations/<id>/messages
  ```

9. CLI (optional)
  ```bash
  node dist/cli/cli.js --version
  node dist/cli/cli.js help
  ```

---

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run type-check` | TypeScript validation (0 errors required) |
| `npm run build` | Compile TypeScript → JavaScript in `dist/` |
| `npm start` | Run server (prod mode) |
| `npm run dev` | Run server with tsx loader (dev mode) |
| `npm run cli -- <args>` | Execute CLI tool |

---

## Stability Verification

Run the full clean → install → type-check → build → test → health sequence and save logs:

```bash
pwsh scripts/verify-stability.ps1
```

The script writes a timestamped log to `docs/verification/` (example: `2025-12-27_134620-stability.log`).

---

## Troubleshooting

### Server won't start
- Check if port 3000 is available: `netstat -ano | findstr :3000` (Windows)
- Or change port: `VI_PORT=3001 npm start`

### Type-check fails
- Run `npm run build` to see compilation errors
- Check `src/` for TypeScript issues

### CLI not found
- Ensure `dist/` exists: `npm run build`
- Verify: `node dist/cli/cli.js --version`

---

## Milestone Status

### ✅ Milestone 1: Foundation (Complete)
- Fastify server + `/v1/health`
- CLI tool with version/help/chat/ask commands
- Structured logging with pino telemetry
- TypeScript configuration + build system
- **Verified:** 2025-12-22

See [MILESTONE-1-COMPLETION.md](../MILESTONE-1-COMPLETION.md) for full verification details.

### 🔵 Milestone 2: Data Persistence (In Progress)
- PostgreSQL integration (compose + migrations)
- Request/response validation (zod schemas)
- Repository pattern for conversations/messages
- Enhanced logging/telemetry

---

## Architecture

**Key Files:**
- `src/main.ts` — Server entry point
- `src/runtime/server.ts` — Fastify setup + routes
- `src/cli/cli.ts` — CLI entry point
- `src/config/config.ts` — Configuration (environment + zod validation)
- `src/telemetry/` — Logging and event recording

**Documentation:**
- [MILESTONE-1-COMPLETION.md](../MILESTONE-1-COMPLETION.md) — Full completion report
- [Architecture](../10-architecture/) — System design

---

## Environment Variables

Optional; all have sensible defaults:

```bash
VI_HOST=0.0.0.0          # Server bind address
VI_PORT=3000             # Server port
VI_LOG_LEVEL=info        # Log level (debug, info, warn, error)
VI_TELEMETRY_ENABLED=true # Enable telemetry events
VI_DEBUG_MODE=false      # Enable debug output
```

**Example:**
```bash
VI_PORT=8080 VI_LOG_LEVEL=debug npm start
```

---

## Next Steps

1. **Read Milestone 1 completion report:** [MILESTONE-1-COMPLETION.md](../MILESTONE-1-COMPLETION.md)
2. **Review architecture:** See `docs/10-architecture/`
3. **Understand the rules:** [copilot-rules.md](../../../ops/tentai-docs/playbooks/copilot-rules.md)
4. **For Milestone 2:** Check ecosystem roadmap
